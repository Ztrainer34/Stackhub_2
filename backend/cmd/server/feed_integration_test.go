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

// twoPostsDistinctAuthors finds two published posts by two different authors,
// neither of them the viewer, where the first has a tool the second does not
// carry. That shape is what lets the caller drive one post to tier 3 (a followed
// tool) and the other to tier 1 (a followed author) independently.
func twoPostsDistinctAuthors(t *testing.T, tx pgx.Tx, viewer uuid.UUID) (freshPost, freshTool, stalePost, staleAuthor uuid.UUID) {
	t.Helper()
	ctx := context.Background()

	type candidate struct {
		post, author uuid.UUID
		tools        map[uuid.UUID]bool
	}

	rows, err := tx.Query(ctx, `
		SELECT p.id, p.author_id, pt.tool_id
		FROM posts p
		JOIN post_tools pt ON pt.post_id = p.id
		WHERE p.is_published AND p.last_publish IS NOT NULL AND p.author_id <> $1`, viewer)
	if err != nil {
		t.Fatalf("select candidate posts: %v", err)
	}
	defer rows.Close()

	byPost := map[uuid.UUID]*candidate{}
	var order []uuid.UUID
	for rows.Next() {
		var post, author, tool uuid.UUID
		if err := rows.Scan(&post, &author, &tool); err != nil {
			t.Fatalf("scan: %v", err)
		}
		if byPost[post] == nil {
			byPost[post] = &candidate{post: post, author: author, tools: map[uuid.UUID]bool{}}
			order = append(order, post)
		}
		byPost[post].tools[tool] = true
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate candidates: %v", err)
	}

	// Different authors, and a tool on the first that the second does not share.
	// A shared tool would give the stale post a tool reason too, and the feed
	// keeps a post's strongest reason — so the pair would stop isolating the
	// band rule from the tier rule.
	for _, a := range order {
		for _, b := range order {
			if a == b || byPost[a].author == byPost[b].author {
				continue
			}
			for tool := range byPost[a].tools {
				if !byPost[b].tools[tool] {
					return a, tool, b, byPost[b].author
				}
			}
		}
	}

	t.Skip("need two published posts by different authors with an unshared tool")
	return uuid.Nil, uuid.Nil, uuid.Nil, uuid.Nil
}

// TestFeedRecencyBandIntegration is the test for the ordering rule itself:
// events from the last 3 days band above everything older, and tier only orders
// events *within* a band.
//
// The adversarial case is the one that inverted: a FRESH tier 3 (a post about a
// tool you merely follow) must now outrank a STALE tier 1 (a post by someone you
// follow). Under the old ordering tier decided absolutely and the stale post
// came first, which is what made the feed read as weeks out of date.
func TestFeedRecencyBandIntegration(t *testing.T) {
	conn := testDB(t)
	tx := beginRollback(t, conn)
	ctx := context.Background()

	var viewer uuid.UUID
	if err := tx.QueryRow(ctx, `SELECT id FROM profiles ORDER BY created_at LIMIT 1`).Scan(&viewer); err != nil {
		t.Skipf("no profiles in the database — seed it first (%v)", err)
	}

	freshPost, freshTool, stalePost, staleAuthor := twoPostsDistinctAuthors(t, tx, viewer)

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

	// Follow the tool but do NOT stack it — that is tier 3, the weakest tier
	// that still appears for a viewer who follows things.
	if _, err := tx.Exec(ctx,
		`INSERT INTO tool_follows (profile_id, tool_id) VALUES ($1, $2)`, viewer, freshTool); err != nil {
		t.Fatalf("follow tool: %v", err)
	}
	// Follow the other post's author — that is tier 1.
	if _, err := tx.Exec(ctx,
		`INSERT INTO user_follows (follower_id, following_id) VALUES ($1, $2)`, viewer, staleAuthor); err != nil {
		t.Fatalf("follow user: %v", err)
	}

	// Drive the two posts to opposite sides of the 3-day boundary.
	if _, err := tx.Exec(ctx,
		`UPDATE posts SET last_publish = now() WHERE id = $1`, freshPost); err != nil {
		t.Fatalf("freshen post: %v", err)
	}
	if _, err := tx.Exec(ctx,
		`UPDATE posts SET last_publish = now() - interval '30 days' WHERE id = $1`, stalePost); err != nil {
		t.Fatalf("age post: %v", err)
	}

	qtx := db.New(tx)
	feed, err := qtx.GetUserFeed(ctx, db.GetUserFeedParams{
		ViewerID: viewer, PageLimit: 200, PageOffset: 0,
	})
	if err != nil {
		t.Fatalf("GetUserFeed: %v", err)
	}

	freshIdx, staleIdx := -1, -1
	var freshTier, staleTier int32 = -1, -1
	for i, item := range feed {
		if !item.PostID.Valid {
			continue
		}
		switch uuid.UUID(item.PostID.Bytes) {
		case freshPost:
			if freshIdx == -1 {
				freshIdx, freshTier = i, item.Tier
			}
		case stalePost:
			if staleIdx == -1 {
				staleIdx, staleTier = i, item.Tier
			}
		}
	}

	if freshIdx == -1 {
		t.Fatal("the fresh post about a followed tool is missing from the feed entirely")
	}
	if staleIdx == -1 {
		t.Fatal("the stale post by a followed author is missing from the feed entirely")
	}

	// Without this the test could pass for the wrong reason — two posts at the
	// same tier would order by recency alone and prove nothing about banding.
	if freshTier <= staleTier {
		t.Fatalf("setup did not produce the adversarial case: fresh post is tier %d and stale post is tier %d. "+
			"The fresh post must sit at a WEAKER (higher) tier for this test to say anything",
			freshTier, staleTier)
	}

	if freshIdx > staleIdx {
		t.Errorf("a %d-day-old tier %d event outranked a fresh tier %d one (positions %d and %d). "+
			"Recency bands above tier: anything from the last 3 days must come before everything older, "+
			"whatever its tier",
			30, staleTier, freshTier, staleIdx, freshIdx)
	}
}
