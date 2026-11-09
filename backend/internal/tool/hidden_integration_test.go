package tool

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"stackhub.com/stackhub/internal/testdb"
	"stackhub.com/stackhub/pkg/db"
)

// hiddenFixture creates a visible and a hidden tool that share a made-up word
// (so search finds both), a logo, and a category of their own, plus a second
// category holding only the hidden tool.
type hiddenFixture struct {
	visible, hidden uuid.UUID
	sharedSlug      string // category with both tools
	hiddenOnlySlug  string // category with only the hidden tool
	hiddenOnlyCatID int32
	word            string
	visibleName     string
	hiddenName      string
}

func newHiddenFixture(t *testing.T, tx pgx.Tx) hiddenFixture {
	t.Helper()
	ctx := context.Background()
	f := hiddenFixture{
		word:           "zqxhidetest",
		visibleName:    "Zqxhidetest Visible Tool",
		hiddenName:     "Zqxhidetest Hidden Tool",
		sharedSlug:     "zqxhidetest-shared",
		hiddenOnlySlug: "zqxhidetest-hidden-only",
	}
	insertTool := func(name string, hidden bool) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		err := tx.QueryRow(ctx,
			`INSERT INTO tools (name, description, logo_url, hidden_at, hidden_batch)
			 VALUES ($1, 'zqxhidetest description', 'https://example.com/logo.png',
			         CASE WHEN $2 THEN now() END, CASE WHEN $2 THEN 'test-batch' END)
			 RETURNING id`, name, hidden).Scan(&id)
		if err != nil {
			t.Fatal(err)
		}
		return id
	}
	insertCategory := func(name, slug string) int32 {
		t.Helper()
		var id int32
		if err := tx.QueryRow(ctx, `INSERT INTO categories (name, slug) VALUES ($1, $2) RETURNING id`, name, slug).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	link := func(tool uuid.UUID, cat int32) {
		t.Helper()
		if _, err := tx.Exec(ctx, `INSERT INTO tool_categories (tool_id, category_id) VALUES ($1, $2)`, tool, cat); err != nil {
			t.Fatal(err)
		}
	}

	f.visible = insertTool(f.visibleName, false)
	f.hidden = insertTool(f.hiddenName, true)
	shared := insertCategory("Zqxhidetest Shared", f.sharedSlug)
	f.hiddenOnlyCatID = insertCategory("Zqxhidetest Hidden Only", f.hiddenOnlySlug)
	link(f.visible, shared)
	link(f.hidden, shared)
	link(f.hidden, f.hiddenOnlyCatID)
	return f
}

func has[T any](rows []T, id uuid.UUID, idOf func(T) uuid.UUID) bool {
	for _, r := range rows {
		if idOf(r) == id {
			return true
		}
	}
	return false
}

// Every public way of browsing the catalogue leaves hidden tools out, and the
// visible tool beside it stays in — so each check proves the filter, not just
// an empty result.
func TestHiddenToolsLeftOutOfListingsIntegration(t *testing.T) {
	tx := testdb.Rollback(t)
	ctx := context.Background()
	q := db.New(tx)
	f := newHiddenFixture(t, tx)

	check := func(what string, sawVisible, sawHidden bool) {
		t.Helper()
		if !sawVisible {
			t.Errorf("%s: visible tool missing", what)
		}
		if sawHidden {
			t.Errorf("%s: hidden tool listed", what)
		}
	}

	auto, err := q.AutocompleteTool(ctx, db.AutocompleteToolParams{Query: f.word, PageLimit: 50})
	if err != nil {
		t.Fatal(err)
	}
	idA := func(r db.AutocompleteToolRow) uuid.UUID { return r.ID }
	check("autocomplete", has(auto, f.visible, idA), has(auto, f.hidden, idA))

	search, err := q.SearchTool(ctx, db.SearchToolParams{WebsearchToTsquery: f.word, Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	check("search", has(search, f.visible, func(r db.SearchToolRow) uuid.UUID { return r.ID }),
		has(search, f.hidden, func(r db.SearchToolRow) uuid.UUID { return r.ID }))

	facets, err := q.GetFacetCounts(ctx, f.word)
	if err != nil {
		t.Fatal(err)
	}
	if facets.ToolCount != 1 {
		t.Errorf("search facet tool_count = %d; want 1 (the visible tool only)", facets.ToolCount)
	}

	list, err := q.ListTools(ctx, db.ListToolsParams{Limit: 50, Search: f.word, Sort: "name"})
	if err != nil {
		t.Fatal(err)
	}
	idL := func(r db.ListToolsRow) uuid.UUID { return r.ID }
	check("/tools listing", has(list, f.visible, idL), has(list, f.hidden, idL))

	byCat, err := q.GetToolsByCategory(ctx, db.GetToolsByCategoryParams{Slug: f.sharedSlug, Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	idC := func(r db.GetToolsByCategoryRow) uuid.UUID { return r.ID }
	check("category page", has(byCat, f.visible, idC), has(byCat, f.hidden, idC))

	popular, err := q.GetPopularTools(ctx, 10000)
	if err != nil {
		t.Fatal(err)
	}
	idP := func(r db.GetPopularToolsRow) uuid.UUID { return r.ID }
	check("popular tools", has(popular, f.visible, idP), has(popular, f.hidden, idP))

	named, err := q.GetToolsByNames(ctx, []string{"zqxhidetest visible tool", "zqxhidetest hidden tool"})
	if err != nil {
		t.Fatal(err)
	}
	idN := func(r db.GetToolsByNamesRow) uuid.UUID { return r.ID }
	check("onboarding grid", has(named, f.visible, idN), has(named, f.hidden, idN))

	kw, err := q.GetToolsByCategoryKeywords(ctx, db.GetToolsByCategoryKeywordsParams{Patterns: []string{"Zqxhidetest%"}, Lim: 50})
	if err != nil {
		t.Fatal(err)
	}
	idK := func(r db.GetToolsByCategoryKeywordsRow) uuid.UUID { return r.ID }
	check("onboarding by focus area", has(kw, f.visible, idK), has(kw, f.hidden, idK))

	cats, err := q.GetTopCategories(ctx, 100000)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range cats {
		switch c.Slug {
		case f.sharedSlug:
			if c.ToolCount != 1 {
				t.Errorf("shared category tool_count = %d; want 1 (hidden tool not counted)", c.ToolCount)
			}
		case f.hiddenOnlySlug:
			t.Errorf("category holding only a hidden tool is listed (tool_count %d)", c.ToolCount)
		}
	}
}

// The admin queue asks for hidden tools, and is told which ones they are.
func TestAutocompleteIncludeHiddenIntegration(t *testing.T) {
	tx := testdb.Rollback(t)
	q := db.New(tx)
	f := newHiddenFixture(t, tx)

	rows, err := q.AutocompleteTool(context.Background(), db.AutocompleteToolParams{Query: f.word, IncludeHidden: true, PageLimit: 50})
	if err != nil {
		t.Fatal(err)
	}
	found := map[uuid.UUID]bool{}
	for _, r := range rows {
		found[r.ID] = true
		if want := r.ID == f.hidden; (r.ID == f.hidden || r.ID == f.visible) && r.IsHidden != want {
			t.Errorf("%s: is_hidden = %v; want %v", r.Name, r.IsHidden, want)
		}
	}
	if !found[f.hidden] || !found[f.visible] {
		t.Errorf("include_hidden: got visible %v, hidden %v; want both", found[f.visible], found[f.hidden])
	}
}

// A hidden tool's page still loads, flagged so it can ask not to be indexed;
// and when a hidden and a visible tool share a slug, the slug opens the
// visible one.
func TestHiddenToolPageIntegration(t *testing.T) {
	tx := testdb.Rollback(t)
	ctx := context.Background()
	q := db.New(tx)
	f := newHiddenFixture(t, tx)

	hidden, err := q.GetTool(ctx, f.hidden)
	if err != nil {
		t.Fatalf("hidden tool page: %v; want it to load", err)
	}
	if !hidden.IsHidden {
		t.Error("hidden tool page: is_hidden = false")
	}
	visible, err := q.GetTool(ctx, f.visible)
	if err != nil || visible.IsHidden {
		t.Errorf("visible tool page: is_hidden %v, err %v; want false, nil", visible.IsHidden, err)
	}
	profile, _ := testdb.TwoProfiles(t, tx)
	authed, err := q.GetToolAuthenticated(ctx, db.GetToolAuthenticatedParams{ID: f.hidden, ProfileID: profile})
	if err != nil || !authed.IsHidden {
		t.Errorf("signed-in hidden tool page: is_hidden %v, err %v; want true, nil", authed.IsHidden, err)
	}

	// Two tools whose names give the same slug: the hidden one is created
	// FIRST, so without the ordering it would usually be the one returned.
	var twinHidden, twinVisible uuid.UUID
	for _, s := range []struct {
		name   string
		hidden bool
		dst    *uuid.UUID
	}{{"Zqx Twin!", true, &twinHidden}, {"zqx twin", false, &twinVisible}} {
		if err := tx.QueryRow(ctx,
			`INSERT INTO tools (name, hidden_at) VALUES ($1, CASE WHEN $2 THEN now() END) RETURNING id`,
			s.name, s.hidden).Scan(s.dst); err != nil {
			t.Fatal(err)
		}
	}
	got, err := q.GetToolIDBySlug(ctx, "zqx-twin")
	if err != nil {
		t.Fatal(err)
	}
	if got != twinVisible {
		t.Errorf("slug shared by a hidden and a visible tool opened %v; want the visible one %v", got, twinVisible)
	}
	only, err := q.GetToolIDBySlug(ctx, "zqxhidetest-hidden-tool")
	if err != nil || only != f.hidden {
		t.Errorf("slug of a hidden tool: %v, %v; want the hidden tool (old links keep working)", only, err)
	}
}
