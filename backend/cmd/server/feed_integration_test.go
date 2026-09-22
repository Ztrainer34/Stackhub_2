package main

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"stackhub.com/stackhub/pkg/db"
)

// Integration tests for the feed, run against a REAL Postgres.
//
// Everything else in this repo's gate checks that code compiles and that pure
// functions behave. Neither can see the bugs that have actually reached
// production here: a query against a table its migration had not created, a
// UNION branch missing its viewer filter, a route in the wrong middleware
// group. Those only appear when real SQL meets a real schema.
//
// Opt-in by design. Set TEST_DB_CONNECTION to a LOCAL database:
//
//	$env:TEST_DB_CONNECTION = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
//	go test ./cmd/server/ -run Integration -v
//
// Without it these skip, so `go test ./...` stays safe to run anywhere.
//
// Every test runs inside a transaction that is always rolled back, so the local
// database is left exactly as it was found.

// testDB opens a connection, or skips. It refuses to run against anything that
// looks hosted — a service-role connection string pasted in by mistake would
// otherwise let a test write to production.
func testDB(t *testing.T) *pgx.Conn {
	t.Helper()

	dsn := os.Getenv("TEST_DB_CONNECTION")
	if dsn == "" {
		t.Skip("TEST_DB_CONNECTION not set — skipping integration test")
	}
	if strings.Contains(dsn, "supabase.co") || strings.Contains(dsn, "supabase.com") {
		t.Fatal("TEST_DB_CONNECTION points at a hosted Supabase project. " +
			"Integration tests mutate data and must only run against a local database.")
	}

	conn, err := pgx.Connect(context.Background(), dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(func() { conn.Close(context.Background()) })

	return conn
}

// beginRollback starts a transaction that is rolled back when the test ends,
// whatever happens. Nothing a test writes survives it.
func beginRollback(t *testing.T, conn *pgx.Conn) pgx.Tx {
	t.Helper()

	tx, err := conn.Begin(context.Background())
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	t.Cleanup(func() { _ = tx.Rollback(context.Background()) })

	return tx
}

// oneProfileAndTools grabs an existing profile and three tools from the seeded
// local database. Creating profiles would mean inserting into auth.users, which
// is Supabase-managed; reusing what the seed script made is simpler and closer
// to the real shape of the data.
func oneProfileAndTools(t *testing.T, tx pgx.Tx) (uuid.UUID, []uuid.UUID) {
	t.Helper()
	ctx := context.Background()

	var viewer uuid.UUID
	if err := tx.QueryRow(ctx, `SELECT id FROM profiles ORDER BY created_at LIMIT 1`).Scan(&viewer); err != nil {
		t.Skipf("no profiles in the database — seed it first (%v)", err)
	}

	rows, err := tx.Query(ctx, `
		SELECT pt.tool_id, p.id
		FROM post_tools pt
		JOIN posts p ON p.id = pt.post_id
		WHERE p.is_published AND p.last_publish IS NOT NULL AND p.author_id <> $1`, viewer)
	if err != nil {
		t.Fatalf("select tools: %v", err)
	}
	defer rows.Close()

	// Which posts each tool appears on.
	postsByTool := map[uuid.UUID]map[uuid.UUID]bool{}
	var order []uuid.UUID
	for rows.Next() {
		var tool, post uuid.UUID
		if err := rows.Scan(&tool, &post); err != nil {
			t.Fatalf("scan: %v", err)
		}
		if postsByTool[tool] == nil {
			postsByTool[tool] = map[uuid.UUID]bool{}
			order = append(order, tool)
		}
		postsByTool[tool][post] = true
	}

	// The two tools must not share a post. A post carries ONE event_key, so if
	// both tools were on it the feed would emit one deduped row at the stronger
	// tier — and a test built on that pair would fail for a reason that has
	// nothing to do with tiering.
	for i := range order {
		for j := i + 1; j < len(order); j++ {
			a, b := order[i], order[j]
			shared := false
			for post := range postsByTool[a] {
				if postsByTool[b][post] {
					shared = true
					break
				}
			}
			if !shared {
				return viewer, []uuid.UUID{a, b}
			}
		}
	}

	t.Skip("need two tools that appear on different published posts by another author")
	return uuid.Nil, nil
}

// TestFeedTiersIntegration is the test that matters: it puts one tool in the
// viewer's stack and another in the watchlist, then checks the feed ranks the
// stack tool's post above the watchlist tool's. That ordering is the whole
// feature, and it is expressible only in SQL.
func TestFeedTiersIntegration(t *testing.T) {
	conn := testDB(t)
	tx := beginRollback(t, conn)
	ctx := context.Background()

	viewer, tools := oneProfileAndTools(t, tx)
	stackTool, watchTool := tools[0], tools[1]

	// Clean slate for this viewer inside the transaction.
	for _, q := range []string{
		`DELETE FROM stack_items WHERE profile_id = $1`,
		`DELETE FROM watchlist_items WHERE profile_id = $1`,
		`DELETE FROM old_stack_items WHERE profile_id = $1`,
		`DELETE FROM tool_follows WHERE profile_id = $1`,
		`DELETE FROM user_follows WHERE follower_id = $1`,
	} {
		if _, err := tx.Exec(ctx, q, viewer); err != nil {
			t.Fatalf("reset (%s): %v", q, err)
		}
	}

	// Apply the rules the handlers apply.
	if _, err := tx.Exec(ctx,
		`INSERT INTO stack_items (profile_id, tool_id) VALUES ($1, $2)`, viewer, stackTool); err != nil {
		t.Fatalf("stack insert: %v", err)
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO watchlist_items (profile_id, tool_id) VALUES ($1, $2)`, viewer, watchTool); err != nil {
		t.Fatalf("watchlist insert: %v", err)
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO tool_follows (profile_id, tool_id) VALUES ($1, $2), ($1, $3)`,
		viewer, stackTool, watchTool); err != nil {
		t.Fatalf("follow insert: %v", err)
	}

	qtx := db.New(tx)
	feed, err := qtx.GetUserFeed(ctx, db.GetUserFeedParams{
		ViewerID: viewer, PageLimit: 50, PageOffset: 0,
	})
	if err != nil {
		// A malformed query compiles fine and fails exactly here. This is the
		// check that `go build` cannot make.
		t.Fatalf("GetUserFeed: %v", err)
	}

	var stackTier, watchTier int32 = -1, -1
	for _, item := range feed {
		if !item.ToolID.Valid {
			continue
		}
		switch uuid.UUID(item.ToolID.Bytes) {
		case stackTool:
			if stackTier == -1 {
				stackTier = item.Tier
			}
		case watchTool:
			if watchTier == -1 {
				watchTier = item.Tier
			}
		}
	}

	if stackTier == -1 {
		t.Fatal("no feed row for the stack tool — a post about a tool in your stack must appear")
	}
	if watchTier == -1 {
		t.Fatal("no feed row for the watchlist tool — a post about a watchlisted tool must appear")
	}
	if stackTier != 2 {
		t.Errorf("stack tool is tier %d, want 2", stackTier)
	}
	if watchTier != 3 {
		t.Errorf("watchlist tool is tier %d, want 3", watchTier)
	}
	if stackTier >= watchTier {
		t.Errorf("stack tier %d must rank above watchlist tier %d — that ordering is the feature",
			stackTier, watchTier)
	}
}

// TestFeedExcludesArchivedIntegration covers the other half of the rule:
// archiving unfollows, so posts about archived tools leave the feed.
func TestFeedExcludesArchivedIntegration(t *testing.T) {
	conn := testDB(t)
	tx := beginRollback(t, conn)
	ctx := context.Background()

	viewer, tools := oneProfileAndTools(t, tx)
	archived := tools[0]

	for _, q := range []string{
		`DELETE FROM stack_items WHERE profile_id = $1`,
		`DELETE FROM watchlist_items WHERE profile_id = $1`,
		`DELETE FROM old_stack_items WHERE profile_id = $1`,
		`DELETE FROM tool_follows WHERE profile_id = $1`,
	} {
		if _, err := tx.Exec(ctx, q, viewer); err != nil {
			t.Fatalf("reset: %v", err)
		}
	}

	// Archived, and — per addToOldStack — not followed.
	if _, err := tx.Exec(ctx,
		`INSERT INTO old_stack_items (profile_id, tool_id) VALUES ($1, $2)`, viewer, archived); err != nil {
		t.Fatalf("old stack insert: %v", err)
	}
	// Follow a second tool, so the viewer counts as following something and the
	// discovery-filler branch stays switched off. Without this the test could
	// pass for the wrong reason.
	if _, err := tx.Exec(ctx,
		`INSERT INTO tool_follows (profile_id, tool_id) VALUES ($1, $2)`, viewer, tools[1]); err != nil {
		t.Fatalf("follow insert: %v", err)
	}

	qtx := db.New(tx)
	feed, err := qtx.GetUserFeed(ctx, db.GetUserFeedParams{
		ViewerID: viewer, PageLimit: 50, PageOffset: 0,
	})
	if err != nil {
		t.Fatalf("GetUserFeed: %v", err)
	}

	for _, item := range feed {
		if item.ToolID.Valid && uuid.UUID(item.ToolID.Bytes) == archived {
			t.Fatalf("archived tool appeared in the feed at tier %d — archiving unfollows, "+
				"so its posts must not appear", item.Tier)
		}
	}
}

// TestFeedExcludesOwnPostsIntegration pins the rule that a feed is what other
// people did. It also exercises the viewer filter on every branch — the shape
// of bug that once put strangers' posts in everyone's feed.
func TestFeedExcludesOwnPostsIntegration(t *testing.T) {
	conn := testDB(t)
	tx := beginRollback(t, conn)
	ctx := context.Background()

	var author uuid.UUID
	err := tx.QueryRow(ctx, `
		SELECT author_id FROM posts
		WHERE is_published AND last_publish IS NOT NULL
		LIMIT 1`).Scan(&author)
	if err != nil {
		t.Skipf("no published posts to test with (%v)", err)
	}

	qtx := db.New(tx)
	feed, err := qtx.GetUserFeed(ctx, db.GetUserFeedParams{
		ViewerID: author, PageLimit: 100, PageOffset: 0,
	})
	if err != nil {
		t.Fatalf("GetUserFeed: %v", err)
	}

	for _, item := range feed {
		if item.ActorID == author {
			t.Fatalf("the viewer's own activity appeared in their feed (kind %q, tier %d)",
				item.Kind, item.Tier)
		}
	}
}
