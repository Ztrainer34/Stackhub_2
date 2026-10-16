package main

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"stackhub.com/stackhub/pkg/db"
)

// Integration tests for the October 2026 audit fixes that live in SQL. Same
// rules as feed_integration_test.go: opt-in via TEST_DB_CONNECTION, local
// databases only, every write rolled back.

// twoProfiles returns two distinct existing profiles, or skips.
func twoProfiles(t *testing.T, tx pgx.Tx) (uuid.UUID, uuid.UUID) {
	t.Helper()
	rows, err := tx.Query(context.Background(), `SELECT id FROM profiles ORDER BY created_at LIMIT 2`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, id)
	}
	if len(ids) < 2 {
		t.Skip("need two profiles — seed the database first")
	}
	return ids[0], ids[1]
}

// An unpublished post must be invisible by id to everyone but its author —
// through GetPost, GetPostContent and IsPostVisible alike. Unpublishing leaves
// `content` in place, so before the fix its text stayed readable.
func TestUnpublishedPostVisibilityIntegration(t *testing.T) {
	conn := testDB(t)
	tx := beginRollback(t, conn)
	ctx := context.Background()
	q := db.New(tx)

	var postID, author uuid.UUID
	if err := tx.QueryRow(ctx, `SELECT id, author_id FROM posts LIMIT 1`).Scan(&postID, &author); err != nil {
		t.Skipf("no posts — seed the database first (%v)", err)
	}
	if _, err := tx.Exec(ctx, `UPDATE posts SET is_published = false, content = '{"type":"doc"}' WHERE id = $1`, postID); err != nil {
		t.Fatal(err)
	}

	viewers := []struct {
		name    string
		viewer  uuid.UUID
		visible bool
	}{
		{"anonymous", uuid.Nil, false},
		{"a stranger", uuid.New(), false},
		{"the author", author, true},
	}
	for _, v := range viewers {
		_, err := q.GetPost(ctx, db.GetPostParams{ID: postID, ViewerID: v.viewer})
		if got := err == nil; got != v.visible {
			t.Errorf("GetPost for %s: visible=%v (err %v); want %v", v.name, got, err, v.visible)
		}
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			t.Errorf("GetPost for %s: unexpected error %v", v.name, err)
		}

		_, err = q.GetPostContent(ctx, db.GetPostContentParams{ID: postID, ViewerID: v.viewer})
		if got := err == nil; got != v.visible {
			t.Errorf("GetPostContent for %s: visible=%v (err %v); want %v", v.name, got, err, v.visible)
		}

		ok, err := q.IsPostVisible(ctx, db.IsPostVisibleParams{PostID: postID, ViewerID: v.viewer})
		if err != nil || ok != v.visible {
			t.Errorf("IsPostVisible for %s = %v (err %v); want %v", v.name, ok, err, v.visible)
		}
	}

	// Published again: visible to everyone.
	if _, err := tx.Exec(ctx, `UPDATE posts SET is_published = true WHERE id = $1`, postID); err != nil {
		t.Fatal(err)
	}
	if _, err := q.GetPost(ctx, db.GetPostParams{ID: postID, ViewerID: uuid.Nil}); err != nil {
		t.Errorf("published post hidden from anonymous viewer: %v", err)
	}
}

// Follows and standalone tool approvals notify with entity_id NULL, and the
// old `entity_id = $4` dedup never matched NULL — every repeat inserted again
// and sent another email.
func TestNotificationDedupWithNullEntityIntegration(t *testing.T) {
	conn := testDB(t)
	tx := beginRollback(t, conn)
	ctx := context.Background()
	q := db.New(tx)
	recipient, actor := twoProfiles(t, tx)

	params := db.CreateNotificationParams{
		RecipientID: recipient,
		ActorID:     ToPgUUID(actor),
		Type:        "follow",
		EntityID:    pgtype.UUID{Valid: false},
		EntityType:  pgtype.Text{Valid: false},
		Title:       "New follower",
		Message:     "test",
	}
	for i, want := range []int64{1, 0, 0} {
		rows, err := q.CreateNotification(ctx, params)
		if err != nil {
			t.Fatal(err)
		}
		if rows != want {
			t.Errorf("call %d inserted %d rows; want %d", i+1, rows, want)
		}
	}

	// A different entity is a different notification.
	params.Type = "post_star"
	params.EntityID = ToPgUUID(uuid.New())
	if rows, _ := q.CreateNotification(ctx, params); rows != 1 {
		t.Errorf("notification for a different entity inserted %d rows; want 1", rows)
	}
}

// FollowUser reports 0 when already following, which is what stops a repeated
// follow request from notifying (and emailing) the followee again.
func TestFollowUserCountsOnlyNewFollowsIntegration(t *testing.T) {
	conn := testDB(t)
	tx := beginRollback(t, conn)
	ctx := context.Background()
	q := db.New(tx)
	followee, follower := twoProfiles(t, tx)

	if _, err := tx.Exec(ctx, `DELETE FROM user_follows WHERE follower_id = $1 AND followee_id = $2`, follower, followee); err != nil {
		t.Fatal(err)
	}
	for i, want := range []int64{1, 0} {
		n, err := q.FollowUser(ctx, db.FollowUserParams{FollowerID: follower, FolloweeID: followee})
		if err != nil {
			t.Fatal(err)
		}
		if n != want {
			t.Errorf("follow %d reported %d new rows; want %d", i+1, n, want)
		}
	}
}

// A rename attempted by someone who does not own the post must touch nothing,
// including the post's slug-history rows.
func TestRenameByNonAuthorChangesNothingIntegration(t *testing.T) {
	conn := testDB(t)
	tx := beginRollback(t, conn)
	ctx := context.Background()
	q := db.New(tx)

	var postID, author uuid.UUID
	var name, slug string
	if err := tx.QueryRow(ctx, `SELECT id, author_id, name, slug FROM posts LIMIT 1`).Scan(&postID, &author, &name, &slug); err != nil {
		t.Skipf("no posts — seed the database first (%v)", err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO post_slug_history (post_id, old_slug, current_slug) VALUES ($1, 'older-slug', $2)`, postID, slug); err != nil {
		t.Fatal(err)
	}

	err := q.RenamePostWithSlugHistory(ctx, db.RenamePostWithSlugHistoryParams{
		PostID:      postID,
		AuthorID:    uuid.New(), // not the author
		Name:        "Hijacked",
		CurrentSlug: "hijacked",
		Description: "x",
	})
	if err != nil {
		t.Fatal(err)
	}

	var gotName, gotHistory string
	if err := tx.QueryRow(ctx, `SELECT name FROM posts WHERE id = $1`, postID).Scan(&gotName); err != nil {
		t.Fatal(err)
	}
	if err := tx.QueryRow(ctx, `SELECT current_slug FROM post_slug_history WHERE post_id = $1 AND old_slug = 'older-slug'`, postID).Scan(&gotHistory); err != nil {
		t.Fatal(err)
	}
	if gotName != name {
		t.Errorf("post renamed to %q by a non-author", gotName)
	}
	if gotHistory != slug {
		t.Errorf("slug history rewritten to %q by a non-author; want %q", gotHistory, slug)
	}
}

// The migration runs by hand in production, so it is applied here exactly as
// written — twice, to prove it is safe to re-run.
func TestSecurityHardeningMigrationIntegration(t *testing.T) {
	conn := testDB(t)
	ctx := context.Background()
	up := migrationUp(t, "20261016130000_security_hardening.sql")

	t.Run("clean usernames get the constraint", func(t *testing.T) {
		tx := beginRollback(t, conn)
		var bad int
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM profiles WHERE username !~ '^[a-z0-9_-]{3,30}$'`).Scan(&bad); err != nil {
			t.Fatal(err)
		}
		if bad > 0 {
			t.Skipf("%d local usernames do not match the rule; the constraint is correctly skipped", bad)
		}

		for i := 1; i <= 2; i++ {
			if _, err := tx.Exec(ctx, up); err != nil {
				t.Fatalf("run %d: %v", i, err)
			}
		}

		var exists bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_username_format')`).Scan(&exists); err != nil || !exists {
			t.Fatalf("constraint not added (err %v)", err)
		}

		// The constraint must reject the exact payload from the audit. (Last
		// statement in this transaction: the error aborts it, and it is rolled
		// back regardless.)
		_, err := tx.Exec(ctx, `UPDATE profiles SET username = $1 WHERE id = (SELECT id FROM profiles LIMIT 1)`,
			`x" style="display:none`)
		var pgErr *pgconn.PgError
		if !errors.As(err, &pgErr) || pgErr.Code != "23514" {
			t.Errorf("markup username was not rejected by the constraint (err %v)", err)
		}
	})

	t.Run("a non-conforming username skips the constraint instead of failing", func(t *testing.T) {
		tx := beginRollback(t, conn)
		if _, err := tx.Exec(ctx, `UPDATE profiles SET username = 'has.dot' WHERE id = (SELECT id FROM profiles LIMIT 1)`); err != nil {
			t.Fatal(err)
		}
		if _, err := tx.Exec(ctx, up); err != nil {
			t.Fatalf("migration failed instead of skipping: %v", err)
		}
		var exists bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_username_format')`).Scan(&exists); err != nil {
			t.Fatal(err)
		}
		if exists {
			t.Error("constraint added although an existing username violates it — that user could no longer save their profile")
		}
	})

	t.Run("token hook is callable only by Supabase Auth", func(t *testing.T) {
		tx := beginRollback(t, conn)
		if _, err := tx.Exec(ctx, up); err != nil {
			t.Fatal(err)
		}
		for role, want := range map[string]bool{"anon": false, "authenticated": false, "supabase_auth_admin": true} {
			var can bool
			err := tx.QueryRow(ctx, `SELECT has_function_privilege($1, 'public.custom_access_token_hook(jsonb)', 'execute')`, role).Scan(&can)
			if err != nil {
				t.Fatal(err)
			}
			if can != want {
				t.Errorf("%s can execute the hook: %v; want %v", role, can, want)
			}
		}
		// It must still work for the role that calls it.
		var onboarded bool
		err := tx.QueryRow(ctx, `
			SELECT (public.custom_access_token_hook(jsonb_build_object(
				'user_id', (SELECT id FROM profiles LIMIT 1)::text, 'claims', '{}'::jsonb
			)) -> 'claims' -> 'app_metadata' ->> 'onboarded')::boolean`).Scan(&onboarded)
		if err != nil || !onboarded {
			t.Errorf("hook broken after search_path change: onboarded=%v err=%v", onboarded, err)
		}
	})

	t.Run("account_claims gets claimant_nonce and RLS", func(t *testing.T) {
		tx := beginRollback(t, conn)
		if _, err := tx.Exec(ctx, up); err != nil {
			t.Fatal(err)
		}
		var hasNonce, rls bool
		err := tx.QueryRow(ctx, `
			SELECT EXISTS (SELECT 1 FROM information_schema.columns
			                WHERE table_name = 'account_claims' AND column_name = 'claimant_nonce'),
			       (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.account_claims'::regclass)`).Scan(&hasNonce, &rls)
		if err != nil {
			t.Fatal(err)
		}
		if !hasNonce || !rls {
			t.Errorf("account_claims: claimant_nonce=%v rls=%v; want both true", hasNonce, rls)
		}
	})
}

// The avatar proxy's lookup returns the hash only for an exact username, and
// the vendor-sharing count is what decides copy-on-write.
func TestAvatarAndVendorQueriesIntegration(t *testing.T) {
	conn := testDB(t)
	tx := beginRollback(t, conn)
	ctx := context.Background()
	q := db.New(tx)

	var username string
	if err := tx.QueryRow(ctx, `SELECT username FROM profiles WHERE email_hash IS NOT NULL LIMIT 1`).Scan(&username); err != nil {
		t.Skipf("no profile with an email hash (%v)", err)
	}
	hash, err := q.GetEmailHashByUsername(ctx, username)
	if err != nil || !hash.Valid || !hexHash.MatchString(hash.String) {
		t.Errorf("GetEmailHashByUsername(%q) = %v, %v; want a hex hash", username, hash, err)
	}
	if _, err := q.GetEmailHashByUsername(ctx, username+"-nobody"); !errors.Is(err, pgx.ErrNoRows) {
		t.Errorf("unknown username: err %v; want no rows", err)
	}

	var toolA, toolB uuid.UUID
	if err := tx.QueryRow(ctx, `SELECT id FROM tools ORDER BY id LIMIT 1`).Scan(&toolA); err != nil {
		t.Skip("no tools")
	}
	if err := tx.QueryRow(ctx, `SELECT id FROM tools WHERE id <> $1 ORDER BY id LIMIT 1`, toolA).Scan(&toolB); err != nil {
		t.Skip("need two tools")
	}
	var vendor uuid.UUID
	if err := tx.QueryRow(ctx, `INSERT INTO vendors (name) VALUES ('shared test vendor') RETURNING id`).Scan(&vendor); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `UPDATE tools SET vendor_id = $1 WHERE id = $2`, vendor, toolA); err != nil {
		t.Fatal(err)
	}
	if n, _ := q.CountToolsUsingVendor(ctx, ToPgUUID(vendor)); n != 1 {
		t.Errorf("one tool on the vendor: count %d; want 1", n)
	}
	if _, err := tx.Exec(ctx, `UPDATE tools SET vendor_id = $1 WHERE id = $2`, vendor, toolB); err != nil {
		t.Fatal(err)
	}
	if n, _ := q.CountToolsUsingVendor(ctx, ToPgUUID(vendor)); n != 2 {
		t.Errorf("two tools on the vendor: count %d; want 2", n)
	}
}

// "resolved" is final: no update may touch a resolved ticket. Before, reject
// then resolve could be repeated, re-sending the "tool approved" email.
func TestResolvedTicketIsFinalIntegration(t *testing.T) {
	conn := testDB(t)
	tx := beginRollback(t, conn)
	ctx := context.Background()
	q := db.New(tx)
	requester, resolver := twoProfiles(t, tx)

	var toolID uuid.UUID
	if err := tx.QueryRow(ctx, `SELECT id FROM tools LIMIT 1`).Scan(&toolID); err != nil {
		t.Skip("no tools")
	}
	ticket, err := q.CreateStandaloneToolTicket(ctx, db.CreateStandaloneToolTicketParams{
		RequestedBy: requester,
		ToolName:    "Audit test tool",
	})
	if err != nil {
		t.Fatal(err)
	}

	resolve := func() int64 {
		n, err := q.ResolveToolTicketWithExisting(ctx, db.ResolveToolTicketWithExistingParams{
			ID: ticket, ResolvedToolID: ToPgUUID(toolID), ResolvedBy: ToPgUUID(resolver),
		})
		if err != nil {
			t.Fatal(err)
		}
		return n
	}
	reject := func() int64 {
		n, err := q.RejectToolTicket(ctx, db.RejectToolTicketParams{ID: ticket, ResolvedBy: ToPgUUID(resolver)})
		if err != nil {
			t.Fatal(err)
		}
		return n
	}

	// pending -> rejected -> resolved is allowed (a reviewer can change their mind)...
	if n := reject(); n != 1 {
		t.Errorf("reject a pending ticket: %d rows; want 1", n)
	}
	if n := resolve(); n != 1 {
		t.Errorf("resolve a rejected ticket: %d rows; want 1", n)
	}
	// ...but nothing moves a resolved ticket.
	if n := reject(); n != 0 {
		t.Errorf("reject a resolved ticket: %d rows; want 0", n)
	}
	if n := resolve(); n != 0 {
		t.Errorf("resolve a resolved ticket again: %d rows; want 0", n)
	}
}
