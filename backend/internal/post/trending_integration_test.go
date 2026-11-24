package post

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"stackhub.com/stackhub/internal/curation"
	"stackhub.com/stackhub/internal/testdb"
	"stackhub.com/stackhub/pkg/db"
)

const postStarsMigration = "20261124120000_post_star_timestamps.sql"

// trendingPost inserts a post by author. daysAgo is when it was last published;
// a draft has no publish date.
//
// The posts_with_tools view lists a post only if it has a tool, so each one is
// tagged with the given tool.
func trendingPost(t *testing.T, tx pgx.Tx, tool, author uuid.UUID, postType, name string, published bool, daysAgo int) uuid.UUID {
	t.Helper()
	id := testdb.Scalar[uuid.UUID](t, tx, `
		INSERT INTO posts (author_id, type, name, slug, description, is_published, last_publish)
		VALUES ($1, $2, $3, $4, '', $5, CASE WHEN $5::bool THEN now() - make_interval(days => $6::int) END)
		RETURNING id`, author, postType, name, "zqxtrend-"+uuid.NewString(), published, daysAgo)
	testdb.Exec(t, tx, `INSERT INTO post_tools (post_id, tool_id) VALUES ($1, $2)`, id, tool)
	return id
}

// star adds a star. at is SQL for its date: "NULL" for an undated star (made
// before the column existed) or e.g. "now()".
func star(t *testing.T, tx pgx.Tx, post, liker uuid.UUID, at string) {
	t.Helper()
	testdb.Exec(t, tx, `INSERT INTO post_stars (post_id, liker_id, created_at) VALUES ($1, $2, `+at+`)`, post, liker)
}

func TestTrendingPostsIntegration(t *testing.T) {
	ctx := context.Background()
	tx := testdb.Rollback(t)
	testdb.ApplyMigration(t, tx, postStarsMigration)
	q := db.New(tx)

	tool := testdb.NewTool(t, tx, "Zqxtrend Tool", false)
	author := testdb.NewProfile(t, tx, "zqxtrend_author")
	exAuthor := testdb.NewProfile(t, tx, "hadi2")
	l1 := testdb.NewProfile(t, tx, "zqxtrend_l1")
	l2 := testdb.NewProfile(t, tx, "zqxtrend_l2")
	l3 := testdb.NewProfile(t, tx, "zqxtrend_l3")
	exL1 := testdb.NewProfile(t, tx, "test1")
	exL2 := testdb.NewProfile(t, tx, "lfiorini")

	// Newest publish first among equals: two (1 day), fresh (2), exLiked (3),
	// old (4), expired (5).
	two := trendingPost(t, tx, tool, author, "playbook", "Zqxtrend two", true, 1)
	fresh := trendingPost(t, tx, tool, author, "comparison", "Zqxtrend fresh", true, 2)
	exLiked := trendingPost(t, tx, tool, author, "playbook", "Zqxtrend excluded likers", true, 3)
	old := trendingPost(t, tx, tool, author, "playbook", "Zqxtrend undated stars", true, 4)
	expired := trendingPost(t, tx, tool, author, "playbook", "Zqxtrend old stars", true, 5)
	byExcluded := trendingPost(t, tx, tool, exAuthor, "playbook", "Zqxtrend by excluded", true, 0)
	draft := trendingPost(t, tx, tool, author, "playbook", "Zqxtrend draft", false, 0)
	pending := trendingPost(t, tx, tool, author, "playbook", "Zqxtrend pending ticket", true, 0)
	testdb.Exec(t, tx, `INSERT INTO tool_tickets (post_id, requested_by, tool_name, status) VALUES ($1, $2, 'Zqxtrend new', 'pending')`, pending, author)

	star(t, tx, two, l1, "now()")
	star(t, tx, two, l2, "now()")
	star(t, tx, exLiked, l3, "now()")
	star(t, tx, exLiked, exL1, "now()")
	star(t, tx, exLiked, exL2, "now()")
	for _, l := range []uuid.UUID{l1, l2, l3} {
		star(t, tx, old, l, "NULL")
		star(t, tx, expired, l, "now() - interval '20 days'")
	}
	// The author's own star must not lift the last post above `old`.
	star(t, tx, expired, author, "now()")
	for _, p := range []uuid.UUID{byExcluded, draft, pending} {
		for _, l := range []uuid.UUID{l1, l2, l3} {
			star(t, tx, p, l, "now()")
		}
	}
	// A star through the real query is dated.
	if err := q.StarPost(ctx, db.StarPostParams{PostID: fresh, LikerID: l1}); err != nil {
		t.Fatal(err)
	}
	if got := testdb.Scalar[bool](t, tx, `SELECT created_at IS NOT NULL FROM post_stars WHERE post_id = $1 AND liker_id = $2`, fresh, l1); !got {
		t.Error("StarPost left the star undated")
	}

	rows, err := q.GetTrendingPosts(ctx, db.GetTrendingPostsParams{Excluded: curation.ExcludedUsernames(), Days: 14, PageLimit: 1000})
	if err != nil {
		t.Fatal(err)
	}
	mine := map[uuid.UUID]string{
		two: "two", fresh: "fresh", exLiked: "exLiked", old: "old", expired: "expired",
		byExcluded: "byExcluded", draft: "draft", pending: "pending",
	}
	var order []string
	for _, row := range rows {
		if name, ok := mine[row.ID]; ok {
			order = append(order, name)
		}
	}
	want := "two,fresh,exLiked,old,expired"
	if got := strings.Join(order, ","); got != want {
		t.Errorf("trending (mine) = %s; want %s\n"+
			"two: 2 new stars; fresh: 1 new star, newer than exLiked (1 real star, 2 excluded); "+
			"old/expired: stars undated or older than 14 days, so newest publish first; "+
			"excluded author, draft and pending ticket: absent", got, want)
	}

	t.Run("a longer window counts older stars", func(t *testing.T) {
		rows, err := q.GetTrendingPosts(ctx, db.GetTrendingPostsParams{Excluded: curation.ExcludedUsernames(), Days: 30, PageLimit: 1000})
		if err != nil {
			t.Fatal(err)
		}
		var order []string
		for _, row := range rows {
			if name, ok := mine[row.ID]; ok {
				order = append(order, name)
			}
		}
		// With 30 days the expired post has 3 stars and comes first.
		if len(order) == 0 || order[0] != "expired" {
			t.Errorf("30-day window (mine) = %v; want expired first", order)
		}
	})

	t.Run("the endpoint answers with public post fields", func(t *testing.T) {
		h := &Handler{Queries: q}
		rec := httptest.NewRecorder()
		h.GetTrendingPosts(rec, httptest.NewRequest(http.MethodGet, "/posts/trending?limit=24&days=14", nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d", rec.Code)
		}
		if cc := rec.Header().Get("Cache-Control"); !strings.Contains(cc, "public") {
			t.Errorf("Cache-Control = %q; want public", cc)
		}
		var posts []map[string]json.RawMessage
		if err := json.Unmarshal(rec.Body.Bytes(), &posts); err != nil {
			t.Fatalf("decode: %v\n%s", err, rec.Body.String())
		}
		if len(posts) == 0 || len(posts) > 24 {
			t.Fatalf("%d posts; want 1 to 24", len(posts))
		}
		for _, key := range []string{"id", "type", "name", "slug", "description", "author_username", "author_id", "tools", "is_published", "last_publish"} {
			if _, ok := posts[0][key]; !ok {
				t.Errorf("post has no %s", key)
			}
		}
		for _, key := range []string{"content", "draft_content", "embedding", "total_count"} {
			if _, ok := posts[0][key]; ok {
				t.Errorf("post has a %s field", key)
			}
		}
		if !strings.HasPrefix(strings.TrimSpace(string(posts[0]["tools"])), "[") {
			t.Errorf("tools = %s; want a JSON array", posts[0]["tools"])
		}
	})

	t.Run("bad limit or days fall back to the defaults", func(t *testing.T) {
		h := &Handler{Queries: q}
		for _, query := range []string{"?limit=abc&days=0", "?limit=0&days=91", "?limit=25&days=-3", ""} {
			rec := httptest.NewRecorder()
			h.GetTrendingPosts(rec, httptest.NewRequest(http.MethodGet, "/posts/trending"+query, nil))
			if rec.Code != http.StatusOK {
				t.Errorf("%q: status = %d", query, rec.Code)
				continue
			}
			var posts []json.RawMessage
			if err := json.Unmarshal(rec.Body.Bytes(), &posts); err != nil || len(posts) > defaultTrendingLimit {
				t.Errorf("%q: %d posts, %v; want at most %d", query, len(posts), err, defaultTrendingLimit)
			}
		}
	})
}
