package stack

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

func stackOf(t *testing.T, tx pgx.Tx, profile uuid.UUID, tools ...uuid.UUID) {
	t.Helper()
	for _, tool := range tools {
		testdb.Exec(t, tx, `INSERT INTO stack_items (profile_id, tool_id) VALUES ($1, $2)`, profile, tool)
	}
}

func TestFeaturedStacksIntegration(t *testing.T) {
	ctx := context.Background()
	tx := testdb.Rollback(t)
	q := db.New(tx)
	const minTools = 4

	tl := map[string]uuid.UUID{}
	for _, n := range []string{"T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11"} {
		tl[n] = testdb.NewTool(t, tx, "Zqxfeat "+n, false)
	}
	hidden := testdb.NewTool(t, tx, "Zqxfeat Hidden", true)

	withPost := testdb.NewProfile(t, tx, "zqxfeat_post")
	claimed := testdb.NewProfile(t, tx, "zqxfeat_claimed")
	plain := testdb.NewProfile(t, tx, "zqxfeat_plain")
	small := testdb.NewProfile(t, tx, "zqxfeat_small")
	ex1 := testdb.NewProfile(t, tx, "zia")
	ex2 := testdb.NewProfile(t, tx, "test1")

	// withPost: 8 visible tools and one hidden. T1 is held by 4 real stacks, T2
	// by 2, the rest by 1 — except T8, which two excluded stacks also hold.
	stackOf(t, tx, withPost, tl["T1"], tl["T2"], tl["T3"], tl["T4"], tl["T5"], tl["T6"], tl["T7"], tl["T8"], hidden)
	stackOf(t, tx, claimed, tl["T1"], tl["T2"], tl["T9"], tl["T10"])
	stackOf(t, tx, plain, tl["T1"], tl["T9"], tl["T10"], tl["T11"])
	stackOf(t, tx, small, tl["T1"], tl["T9"], tl["T10"]) // 3 tools: below the minimum
	stackOf(t, tx, ex1, tl["T1"], tl["T8"], tl["T9"], tl["T10"], tl["T11"])
	stackOf(t, tx, ex2, tl["T8"], tl["T9"], tl["T10"], tl["T11"])

	testdb.Exec(t, tx,
		`INSERT INTO posts (author_id, type, name, slug, description, is_published, last_publish)
		 VALUES ($1, 'playbook', 'Zqxfeat', $2, '', true, now())`, withPost, "zqxfeat-"+uuid.NewString())
	// A draft by a profile with no other post does not count as a post.
	testdb.Exec(t, tx, `INSERT INTO posts (author_id, type, name, slug, description, is_published) VALUES ($1, 'playbook', 'Zqxfeat draft', $2, '', false)`, plain, "zqxfeat-"+uuid.NewString())
	testdb.Exec(t, tx, `INSERT INTO account_claims (token, user_id, claimed_at) VALUES ($1, $2, now())`, uuid.NewString(), claimed)

	rows, err := q.GetFeaturedStacks(ctx, db.GetFeaturedStacksParams{Excluded: curation.ExcludedUsernames(), MinTools: minTools, PageLimit: 1000})
	if err != nil {
		t.Fatal(err)
	}
	var mine []db.GetFeaturedStacksRow
	var order []string
	for _, row := range rows {
		if strings.HasPrefix(row.Username, "zqxfeat_") {
			mine = append(mine, row)
			order = append(order, row.Username)
		}
		if row.Username == "zia" || row.Username == "test1" {
			t.Errorf("excluded account %s is featured", row.Username)
		}
	}

	t.Run("min_tools, then post, claimed and the rest", func(t *testing.T) {
		want := "zqxfeat_post,zqxfeat_claimed,zqxfeat_plain"
		if got := strings.Join(order, ","); got != want {
			t.Errorf("featured (mine) = %s; want %s (small has 3 tools; a draft is not a post)", got, want)
		}
	})

	t.Run("counts", func(t *testing.T) {
		if len(mine) == 0 {
			t.Fatal("none featured")
		}
		if mine[0].ToolCount != 8 || mine[0].PostCount != 1 {
			t.Errorf("withPost tool_count/post_count = %d/%d; want 8/1 (the hidden tool is not counted)", mine[0].ToolCount, mine[0].PostCount)
		}
		if mine[2].PostCount != 0 {
			t.Errorf("plain post_count = %d; want 0", mine[2].PostCount)
		}
	})

	t.Run("the tools shown are the six most held, excluded stacks not counted", func(t *testing.T) {
		var tools []struct {
			ID      uuid.UUID `json:"id"`
			Name    string    `json:"name"`
			LogoURL string    `json:"logo_url"`
		}
		if err := json.Unmarshal(mine[0].Tools, &tools); err != nil {
			t.Fatal(err)
		}
		var names []string
		for _, tool := range tools {
			names = append(names, strings.TrimPrefix(tool.Name, "Zqxfeat "))
		}
		// T1: 4 real stacks, T2: 2, the rest 1 each (T8 has 3 only because of
		// the excluded stacks), so by name: T3 T4 T5 T6.
		want := "T1,T2,T3,T4,T5,T6"
		if got := strings.Join(names, ","); got != want {
			t.Errorf("tools = %s; want %s", got, want)
		}
	})

	t.Run("the endpoint's JSON has only the listed fields", func(t *testing.T) {
		h := &Handler{Queries: q}
		rec := httptest.NewRecorder()
		h.GetFeaturedStacks(rec, httptest.NewRequest(http.MethodGet, "/stacks/featured?limit=24&min_tools=4", nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d", rec.Code)
		}
		if cc := rec.Header().Get("Cache-Control"); !strings.Contains(cc, "public") {
			t.Errorf("Cache-Control = %q; want public", cc)
		}
		var cards []map[string]json.RawMessage
		if err := json.Unmarshal(rec.Body.Bytes(), &cards); err != nil {
			t.Fatalf("decode: %v\n%s", err, rec.Body.String())
		}
		if len(cards) == 0 {
			t.Fatal("no cards")
		}
		want := "avatar_url bio display_name id post_count tool_count tools username"
		for _, card := range cards {
			var keys []string
			for k := range card {
				keys = append(keys, k)
			}
			if got := sortedJoin(keys); got != want {
				t.Errorf("card fields = %s; want %s", got, want)
			}
		}
	})

	t.Run("limit and min_tools fall back when invalid", func(t *testing.T) {
		h := &Handler{Queries: q}
		for _, query := range []string{"?limit=0&min_tools=0", "?limit=99&min_tools=101", "?limit=x&min_tools=y", ""} {
			rec := httptest.NewRecorder()
			h.GetFeaturedStacks(rec, httptest.NewRequest(http.MethodGet, "/stacks/featured"+query, nil))
			if rec.Code != http.StatusOK {
				t.Errorf("%q: status = %d", query, rec.Code)
				continue
			}
			var cards []json.RawMessage
			if err := json.Unmarshal(rec.Body.Bytes(), &cards); err != nil || len(cards) > defaultFeaturedLimit {
				t.Errorf("%q: %d cards, %v; want an array of at most %d", query, len(cards), err, defaultFeaturedLimit)
			}
			// min_tools falls back to 15, far above our fixtures.
			for _, c := range cards {
				if strings.Contains(string(c), "zqxfeat_") {
					t.Errorf("%q: a 4-tool fixture was featured under the default minimum", query)
				}
			}
		}
	})

	t.Run("no match is an empty array, not null", func(t *testing.T) {
		h := &Handler{Queries: q}
		rec := httptest.NewRecorder()
		// Bigger than any stack: a request can only ask for up to 100.
		testdb.Exec(t, tx, `DELETE FROM stack_items`)
		h.GetFeaturedStacks(rec, httptest.NewRequest(http.MethodGet, "/stacks/featured?min_tools=100", nil))
		if got := strings.TrimSpace(rec.Body.String()); got != "[]" {
			t.Errorf("body = %s; want []", got)
		}
	})
}

func sortedJoin(keys []string) string {
	for i := range keys {
		for j := i + 1; j < len(keys); j++ {
			if keys[j] < keys[i] {
				keys[i], keys[j] = keys[j], keys[i]
			}
		}
	}
	return strings.Join(keys, " ")
}
