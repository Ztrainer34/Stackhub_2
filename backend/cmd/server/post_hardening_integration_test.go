package main

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"stackhub.com/stackhub/pkg/db"
)

// Integration tests for the October 2026 security fixes that live in SQL, where
// unit tests cannot reach. Same rules as feed_integration_test.go: opt-in via
// TEST_DB_CONNECTION, local databases only, every write rolled back.

// IsPostAuthor is the whole of the ownership check in uploadImage. If it ever
// answered true for a stranger, any signed-in user could upload to any post.
func TestIsPostAuthorIntegration(t *testing.T) {
	conn := testDB(t)
	tx := beginRollback(t, conn)
	ctx := context.Background()
	q := db.New(tx)

	var postID, authorID uuid.UUID
	if err := tx.QueryRow(ctx, `SELECT id, author_id FROM posts LIMIT 1`).Scan(&postID, &authorID); err != nil {
		t.Skipf("no posts in the database — seed it first (%v)", err)
	}

	cases := []struct {
		name         string
		post, caller uuid.UUID
		want         bool
	}{
		{"the author", postID, authorID, true},
		{"a stranger", postID, uuid.New(), false},
		{"the author, on a post that does not exist", uuid.New(), authorID, false},
	}
	for _, c := range cases {
		got, err := q.IsPostAuthor(ctx, db.IsPostAuthorParams{PostID: c.post, AuthorID: c.caller})
		if err != nil {
			t.Fatalf("%s: %v", c.name, err)
		}
		if got != c.want {
			t.Errorf("%s: IsPostAuthor = %v; want %v", c.name, got, c.want)
		}
	}
}

// migrationUp returns the Up section of a migration file, the way it is pasted
// into the Supabase SQL editor.
func migrationUp(t *testing.T, name string) string {
	t.Helper()
	raw, err := os.ReadFile("../../db/migrations/" + name)
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	sql := strings.ReplaceAll(string(raw), "\r\n", "\n")
	start := strings.Index(sql, "-- +goose Up")
	end := strings.Index(sql, "-- +goose Down")
	if start < 0 || end < start {
		t.Fatalf("%s has no goose Up/Down sections", name)
	}
	return sql[start:end]
}

// The backfill has to be right the first time: it runs once, by hand, against
// production. This applies the real migration file to a Tiptap post and checks
// the three things it promises — every word lands in content_text exactly once,
// the search vector picks it up, and nothing else about the post moves.
func TestBackfillPostContentTextIntegration(t *testing.T) {
	conn := testDB(t)
	tx := beginRollback(t, conn)
	ctx := context.Background()

	rows, err := tx.Query(ctx, `SELECT id FROM posts ORDER BY created_at LIMIT 2`)
	if err != nil {
		t.Fatal(err)
	}
	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, id)
	}
	rows.Close()
	if len(ids) < 2 {
		t.Skip("need two posts — seed the database first")
	}
	tiptapPost, legacyPost := ids[0], ids[1]

	// Nested on purpose: a list inside the doc, a bold mark, a heading. Lax
	// jsonpath would return the list's text nodes more than once.
	doc := `{"type":"doc","content":[
		{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Zebrafish onboarding"}]},
		{"type":"paragraph","content":[
			{"type":"text","text":"Plain words then "},
			{"type":"text","marks":[{"type":"bold"}],"text":"quokka emphasis"}]},
		{"type":"bulletList","content":[{"type":"listItem","content":[
			{"type":"paragraph","content":[{"type":"text","text":"nested axolotl item"}]}]}]}
	]}`

	var before time.Time
	err = tx.QueryRow(ctx, `
		UPDATE posts SET content = $2::jsonb, draft_content = $2::jsonb, content_text = '', draft_content_text = ''
		WHERE id = $1 RETURNING updated_at`, tiptapPost, doc).Scan(&before)
	if err != nil {
		t.Fatal(err)
	}

	// A row not in Tiptap shape must keep whatever text it already had.
	_, err = tx.Exec(ctx, `
		UPDATE posts SET content = '{"blocks":[{"data":{"text":"old editor"}}]}'::jsonb, content_text = 'kept as is'
		WHERE id = $1`, legacyPost)
	if err != nil {
		t.Fatal(err)
	}

	if _, err := tx.Exec(ctx, migrationUp(t, "20261016120000_backfill_post_content_text.sql")); err != nil {
		t.Fatalf("migration failed: %v", err)
	}

	var contentText, draftText string
	var after time.Time
	var searchable bool
	err = tx.QueryRow(ctx, `
		SELECT content_text, draft_content_text, updated_at,
		       content_vector @@ websearch_to_tsquery('english', 'axolotl')
		FROM posts WHERE id = $1`, tiptapPost).Scan(&contentText, &draftText, &after, &searchable)
	if err != nil {
		t.Fatal(err)
	}

	for _, word := range []string{"Zebrafish", "onboarding", "quokka", "emphasis", "axolotl"} {
		if n := strings.Count(contentText, word); n != 1 {
			t.Errorf("content_text has %q %d times; want exactly once. Got: %q", word, n, contentText)
		}
		if n := strings.Count(draftText, word); n != 1 {
			t.Errorf("draft_content_text has %q %d times; want exactly once. Got: %q", word, n, draftText)
		}
	}
	if !searchable {
		t.Error("content_vector does not match a word from the body — search would still miss it")
	}
	if !after.Equal(before) {
		t.Errorf("updated_at moved from %v to %v — the backfill would reorder the feed", before, after)
	}

	var legacyText string
	if err := tx.QueryRow(ctx, `SELECT content_text FROM posts WHERE id = $1`, legacyPost).Scan(&legacyText); err != nil {
		t.Fatal(err)
	}
	if legacyText != "kept as is" {
		t.Errorf("a non-Tiptap row's content_text became %q; want it left alone", legacyText)
	}
}
