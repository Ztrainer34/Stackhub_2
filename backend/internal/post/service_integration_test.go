package post

import (
	"context"
	"fmt"
	"testing"

	"github.com/google/uuid"
	"stackhub.com/stackhub/internal/testdb"
)

func TestStarEmailDecisionIntegration(t *testing.T) {
	conn := testdb.Open(t)
	tx := testdb.Begin(t, conn)
	ctx := context.Background()
	posts := postService{db: tx}

	var postID, author uuid.UUID
	var name, slug, authorUsername string
	err := tx.QueryRow(ctx, `
		SELECT p.id, p.author_id, p.name, p.slug, pr.username
		FROM posts p JOIN profiles pr ON pr.id = p.author_id
		WHERE p.is_published LIMIT 1`).Scan(&postID, &author, &name, &slug, &authorUsername)
	if err != nil {
		t.Skipf("no published posts (%v)", err)
	}
	liker := testdb.Scalar[uuid.UUID](t, tx, `SELECT id FROM profiles WHERE id <> $1 ORDER BY created_at LIMIT 1`, author)
	if _, err := tx.Exec(ctx, `DELETE FROM notifications WHERE entity_id = $1`, postID); err != nil {
		t.Fatal(err)
	}

	email, err := posts.star(ctx, liker, postID)
	if err != nil {
		t.Fatal(err)
	}
	if email == nil {
		t.Fatal("first star by someone else: no email; want one to the author")
	}
	want := starEmail{
		recipientID:   author,
		actorName:     testdb.ActorName(t, tx, liker),
		actorUsername: testdb.Scalar[string](t, tx, `SELECT username FROM profiles WHERE id = $1`, liker),
		postName:      name,
		postURL:       fmt.Sprintf("%s/%s/%s", siteURL, authorUsername, slug),
	}
	if *email != want {
		t.Errorf("email = %+v; want %+v", *email, want)
	}

	if again, err := posts.star(ctx, liker, postID); err != nil || again != nil {
		t.Errorf("repeat star: email %+v, err %v; want no email", again, err)
	}
	if own, err := posts.star(ctx, author, postID); err != nil || own != nil {
		t.Errorf("author starring own post: email %+v, err %v; want no email", own, err)
	}
}
