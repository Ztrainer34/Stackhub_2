package tool

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"stackhub.com/stackhub/internal/testdb"
	"stackhub.com/stackhub/pkg/db"
	shmiddleware "stackhub.com/stackhub/pkg/middleware"
)

const postStarsMigration = "20261124120000_post_star_timestamps.sql"

// rankFixture is one parent with two subcategories and a retired subcategory,
// real and test (excluded) people, and a few tools stacked in different ways.
type rankFixture struct {
	parentSlug, subASlug, subBSlug, retiredSlug string

	p1, p2, p3, p4 uuid.UUID // real people
	excluded       uuid.UUID // a test account (max_cz)

	counted uuid.UUID // stacked by p1..p4 and the excluded one
	onlyEx  uuid.UUID // stacked only by the excluded one
	hidden  uuid.UUID // stacked by p1, but hidden
}

func newRankFixture(t *testing.T, tx pgx.Tx) rankFixture {
	t.Helper()
	f := rankFixture{
		parentSlug:  "zqxrank-parent",
		subASlug:    "zqxrank-sub-a",
		subBSlug:    "zqxrank-sub-b",
		retiredSlug: "zqxrank-retired",
	}
	cat := func(name, slug string, parent any, retired bool) int32 {
		return testdb.Scalar[int32](t, tx,
			`INSERT INTO categories (name, slug, parent_id, retired_at)
			 VALUES ($1, $2, $3, CASE WHEN $4::bool THEN now() END) RETURNING id`, name, slug, parent, retired)
	}
	parent := cat("Zqxrank Parent", f.parentSlug, nil, false)
	subA := cat("Zqxrank Sub A", f.subASlug, parent, false)
	subB := cat("Zqxrank Sub B", f.subBSlug, parent, false)
	retired := cat("Zqxrank Retired", f.retiredSlug, parent, true)

	f.p1 = testdb.NewProfile(t, tx, "zqxrank_p1")
	f.p2 = testdb.NewProfile(t, tx, "zqxrank_p2")
	f.p3 = testdb.NewProfile(t, tx, "zqxrank_p3")
	f.p4 = testdb.NewProfile(t, tx, "zqxrank_p4")
	f.excluded = testdb.NewProfile(t, tx, "max_cz")

	f.counted = testdb.NewTool(t, tx, "Zqxrank Counted", false)
	f.onlyEx = testdb.NewTool(t, tx, "Zqxrank Only Excluded", false)
	f.hidden = testdb.NewTool(t, tx, "Zqxrank Hidden", true)

	// The retired category sits between the two real ones: it must not show,
	// and the order of the others must follow the position.
	testdb.Exec(t, tx, `INSERT INTO tool_categories (tool_id, category_id, position) VALUES ($1, $2, 0), ($1, $3, 1), ($1, $4, 2)`,
		f.counted, subB, retired, subA)
	testdb.Exec(t, tx, `INSERT INTO tool_categories (tool_id, category_id, position) VALUES ($1, $2, 0)`, f.onlyEx, subA)
	testdb.Exec(t, tx, `INSERT INTO tool_categories (tool_id, category_id, position) VALUES ($1, $2, 0)`, f.hidden, subA)

	for _, p := range []uuid.UUID{f.p1, f.p2, f.p3, f.p4, f.excluded} {
		testdb.Exec(t, tx, `INSERT INTO stack_items (profile_id, tool_id) VALUES ($1, $2)`, p, f.counted)
	}
	testdb.Exec(t, tx, `INSERT INTO stack_items (profile_id, tool_id) VALUES ($1, $2)`, f.excluded, f.onlyEx)
	testdb.Exec(t, tx, `INSERT INTO stack_items (profile_id, tool_id) VALUES ($1, $2)`, f.p1, f.hidden)

	// Saved: one real person and one excluded one.
	testdb.Exec(t, tx, `INSERT INTO watchlist_items (profile_id, tool_id) VALUES ($1, $2), ($3, $2)`, f.p2, f.counted, f.excluded)

	// Playbooks: one published (counts), a draft, a published post whose tool
	// ticket is still pending, and a published post by the excluded account.
	post := func(author uuid.UUID, published bool, name string) uuid.UUID {
		id := testdb.Scalar[uuid.UUID](t, tx,
			`INSERT INTO posts (author_id, type, name, slug, description, is_published, last_publish)
			 VALUES ($1, 'playbook', $2, $3, '', $4, CASE WHEN $4::bool THEN now() END) RETURNING id`,
			author, name, "zqxrank-"+uuid.NewString(), published)
		testdb.Exec(t, tx, `INSERT INTO post_tools (post_id, tool_id) VALUES ($1, $2)`, id, f.counted)
		return id
	}
	post(f.p1, true, "Zqxrank published")
	post(f.p1, false, "Zqxrank draft")
	pending := post(f.p2, true, "Zqxrank pending")
	testdb.Exec(t, tx, `INSERT INTO tool_tickets (post_id, requested_by, tool_name, status) VALUES ($1, $2, 'Zqxrank new', 'pending')`, pending, f.p2)
	post(f.excluded, true, "Zqxrank by excluded")
	return f
}

func rankingHandler(tx pgx.Tx) *Handler { return &Handler{Queries: db.New(tx)} }

type rankingToolsBody struct {
	Tools []struct {
		ID         uuid.UUID `json:"id"`
		Name       string    `json:"name"`
		LogoURL    string    `json:"logo_url"`
		Stacks     int       `json:"stacks"`
		Playbooks  int       `json:"playbooks"`
		Saved      int       `json:"saved"`
		Categories []struct {
			Name       string `json:"name"`
			Slug       string `json:"slug"`
			ParentName string `json:"parent_name"`
			ParentSlug string `json:"parent_slug"`
		} `json:"categories"`
	} `json:"tools"`
	StackCounts map[string]int `json:"stack_counts"`
}

func getRankingTools(t *testing.T, tx pgx.Tx) (rankingToolsBody, *httptest.ResponseRecorder) {
	t.Helper()
	rec := httptest.NewRecorder()
	rankingHandler(tx).GetRankingTools(rec, httptest.NewRequest(http.MethodGet, "/rankings/tools", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	var body rankingToolsBody
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v\n%s", err, rec.Body.String())
	}
	return body, rec
}

func TestRankingToolsIntegration(t *testing.T) {
	tx := testdb.Rollback(t)
	before, _ := getRankingTools(t, tx)
	f := newRankFixture(t, tx)
	body, rec := getRankingTools(t, tx)

	if cc := rec.Header().Get("Cache-Control"); !strings.Contains(cc, "public") {
		t.Errorf("Cache-Control = %q; the rankings are public", cc)
	}

	byID := map[uuid.UUID]int{}
	for i, tl := range body.Tools {
		byID[tl.ID] = i
	}

	t.Run("counts leave out excluded accounts, drafts and pending posts", func(t *testing.T) {
		i, ok := byID[f.counted]
		if !ok {
			t.Fatal("the counted tool is not ranked")
		}
		tl := body.Tools[i]
		if tl.Stacks != 4 || tl.Playbooks != 1 || tl.Saved != 1 {
			t.Errorf("stacks/playbooks/saved = %d/%d/%d; want 4/1/1", tl.Stacks, tl.Playbooks, tl.Saved)
		}
		if tl.LogoURL == "" || tl.Name != "Zqxrank Counted" {
			t.Errorf("tool = %+v", tl)
		}
	})

	t.Run("a tool only an excluded account stacked is not listed", func(t *testing.T) {
		if _, ok := byID[f.onlyEx]; ok {
			t.Error("a tool held only by an excluded account is ranked")
		}
	})

	t.Run("a hidden tool is not ranked", func(t *testing.T) {
		if _, ok := byID[f.hidden]; ok {
			t.Error("a hidden tool is ranked")
		}
	})

	t.Run("categories: current subcategories only, main first, as JSON", func(t *testing.T) {
		cats := body.Tools[byID[f.counted]].Categories
		if len(cats) != 2 {
			t.Fatalf("categories = %+v; want 2 (the retired one is left out)", cats)
		}
		if cats[0].Slug != f.subBSlug || cats[1].Slug != f.subASlug {
			t.Errorf("order = %s, %s; want %s, %s", cats[0].Slug, cats[1].Slug, f.subBSlug, f.subASlug)
		}
		if cats[0].ParentSlug != f.parentSlug || cats[0].ParentName != "Zqxrank Parent" || cats[0].Name != "Zqxrank Sub B" {
			t.Errorf("first category = %+v", cats[0])
		}
	})

	t.Run("ordered by stacks, highest first", func(t *testing.T) {
		for i := 1; i < len(body.Tools); i++ {
			if body.Tools[i-1].Stacks < body.Tools[i].Stacks {
				t.Fatalf("tools %d and %d are out of order: %d then %d stacks", i-1, i, body.Tools[i-1].Stacks, body.Tools[i].Stacks)
			}
		}
	})

	t.Run("stack counts per scope", func(t *testing.T) {
		for slug, want := range map[string]int{f.subASlug: 4, f.subBSlug: 4, f.parentSlug: 4} {
			if got := body.StackCounts[slug]; got != want {
				t.Errorf("stack_counts[%s] = %d; want %d", slug, got, want)
			}
		}
		if _, ok := body.StackCounts[f.retiredSlug]; ok {
			t.Error("a retired category has a stack count")
		}
		if got, want := body.StackCounts[""], before.StackCounts[""]+4; got != want {
			t.Errorf("stack_counts[\"\"] = %d; want %d (4 new real people; the excluded one and the hidden tool add none)", got, want)
		}
	})
}

type usedByBody map[string][]map[string]any

func getUsedBy(t *testing.T, tx pgx.Tx, query string, viewer uuid.UUID) (usedByBody, *httptest.ResponseRecorder) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/rankings/used-by"+query, nil)
	if viewer != uuid.Nil {
		req = req.WithContext(context.WithValue(req.Context(), shmiddleware.UserIDKey{}, viewer))
	}
	rec := httptest.NewRecorder()
	rankingHandler(tx).GetRankingUsedBy(rec, req)
	var body usedByBody
	if rec.Code == http.StatusOK {
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatalf("decode: %v\n%s", err, rec.Body.String())
		}
	}
	return body, rec
}

func usernames(people []map[string]any) []string {
	var out []string
	for _, p := range people {
		out = append(out, p["username"].(string))
	}
	return out
}

func TestRankingUsedByIntegration(t *testing.T) {
	tx := testdb.Rollback(t)
	testdb.ApplyMigration(t, tx, postStarsMigration)

	tool := testdb.NewTool(t, tx, "Zqxused Tool", false)
	hiddenTool := testdb.NewTool(t, tx, "Zqxused Hidden", true)
	post := testdb.NewProfile(t, tx, "zqxused_post")       // wrote a published playbook with the tool
	claimed := testdb.NewProfile(t, tx, "zqxused_claimed") // claimed account
	popular := testdb.NewProfile(t, tx, "zqxused_popular") // two followers
	plain1 := testdb.NewProfile(t, tx, "zqxused_a")
	plain2 := testdb.NewProfile(t, tx, "zqxused_b")
	excluded := testdb.NewProfile(t, tx, "shtest") // would rank first on every other rule
	viewer := testdb.NewProfile(t, tx, "zqxused_viewer")
	fan1 := testdb.NewProfile(t, tx, "zqxused_fan1")
	fan2 := testdb.NewProfile(t, tx, "zqxused_fan2")

	for _, p := range []uuid.UUID{post, claimed, popular, plain1, plain2, excluded} {
		testdb.Exec(t, tx, `INSERT INTO stack_items (profile_id, tool_id) VALUES ($1, $2)`, p, tool)
	}
	testdb.Exec(t, tx, `INSERT INTO stack_items (profile_id, tool_id) VALUES ($1, $2)`, post, hiddenTool)
	for _, author := range []uuid.UUID{post, excluded} {
		id := testdb.Scalar[uuid.UUID](t, tx,
			`INSERT INTO posts (author_id, type, name, slug, description, is_published, last_publish)
			 VALUES ($1, 'playbook', 'Zqxused', $2, '', true, now()) RETURNING id`, author, "zqxused-"+uuid.NewString())
		testdb.Exec(t, tx, `INSERT INTO post_tools (post_id, tool_id) VALUES ($1, $2)`, id, tool)
	}
	for _, p := range []uuid.UUID{claimed, excluded} {
		testdb.Exec(t, tx, `INSERT INTO account_claims (token, user_id, claimed_at) VALUES ($1, $2, now())`, uuid.NewString(), p)
	}
	for _, fan := range []uuid.UUID{fan1, fan2} {
		testdb.Exec(t, tx, `INSERT INTO user_follows (follower_id, followee_id) VALUES ($1, $2)`, fan, popular)
	}
	testdb.Exec(t, tx, `INSERT INTO user_follows (follower_id, followee_id) VALUES ($1, $2)`, fan1, excluded)

	t.Run("at most 3, by post, claimed account, followers; excluded left out", func(t *testing.T) {
		body, rec := getUsedBy(t, tx, "?ids="+tool.String(), uuid.Nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d", rec.Code)
		}
		got := usernames(body[tool.String()])
		want := []string{"zqxused_post", "zqxused_claimed", "zqxused_popular"}
		if strings.Join(got, ",") != strings.Join(want, ",") {
			t.Errorf("used by = %v; want %v", got, want)
		}
		if cc := rec.Header().Get("Cache-Control"); cc != "private, no-store" {
			t.Errorf("anonymous Cache-Control = %q; want private, no-store", cc)
		}
		if v := rec.Header().Get("Vary"); !strings.Contains(v, "Authorization") {
			t.Errorf("Vary = %q; want Authorization", v)
		}
	})

	t.Run("a signed-in viewer sees the people they follow first, privately", func(t *testing.T) {
		testdb.Exec(t, tx, `INSERT INTO user_follows (follower_id, followee_id) VALUES ($1, $2)`, viewer, plain2)
		body, rec := getUsedBy(t, tx, "?ids="+tool.String(), viewer)
		got := usernames(body[tool.String()])
		want := []string{"zqxused_b", "zqxused_post", "zqxused_claimed"}
		if strings.Join(got, ",") != strings.Join(want, ",") {
			t.Errorf("used by = %v; want %v", got, want)
		}
		if cc := rec.Header().Get("Cache-Control"); cc != "private, no-store" {
			t.Errorf("Cache-Control = %q; want private, no-store", cc)
		}
	})

	t.Run("only username, display_name and avatar_url leave the server", func(t *testing.T) {
		body, _ := getUsedBy(t, tx, "?ids="+tool.String(), uuid.Nil)
		for _, person := range body[tool.String()] {
			if len(person) != 3 {
				t.Errorf("person has fields %v; want exactly username, display_name, avatar_url", person)
			}
			for _, key := range []string{"username", "display_name", "avatar_url"} {
				if _, ok := person[key]; !ok {
					t.Errorf("person has no %s: %v", key, person)
				}
			}
		}
	})

	t.Run("a hidden tool and duplicate ids", func(t *testing.T) {
		body, rec := getUsedBy(t, tx, "?ids="+hiddenTool.String()+","+tool.String()+","+tool.String(), uuid.Nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d", rec.Code)
		}
		if len(body[hiddenTool.String()]) != 0 {
			t.Error("a hidden tool has used-by people")
		}
		if len(body[tool.String()]) != 3 {
			t.Errorf("the tool has %d people; want 3", len(body[tool.String()]))
		}
	})

	t.Run("bad ids are a 400", func(t *testing.T) {
		many := make([]string, 26)
		for i := range many {
			many[i] = uuid.NewString()
		}
		cases := map[string]string{
			"none":      "",
			"empty":     "?ids=",
			"malformed": "?ids=not-a-uuid",
			"one bad":   "?ids=" + tool.String() + ",nope",
			"blank one": "?ids=" + tool.String() + ",",
			"too many":  "?ids=" + strings.Join(many, ","),
		}
		for name, query := range cases {
			if _, rec := getUsedBy(t, tx, query, uuid.Nil); rec.Code != http.StatusBadRequest {
				t.Errorf("%s: status = %d; want 400", name, rec.Code)
			}
		}
		if _, rec := getUsedBy(t, tx, "?ids="+strings.Join(many[:25], ","), uuid.Nil); rec.Code != http.StatusOK {
			t.Errorf("25 ids: status = %d; want 200", rec.Code)
		}
	})
}
