package tool

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"stackhub.com/stackhub/internal/testdb"
	"stackhub.com/stackhub/pkg/db"
)

// categoryTree is one parent with two subcategories, one retired category that
// was replaced by the second subcategory, and one that went nowhere.
type categoryTree struct {
	parent, subA, subB, replaced, gone int32
}

const treePrefix = "Zqxtree"

func slugOf(name string) string { return "zqxtree-" + name }

func seedCategoryTree(t *testing.T, tx pgx.Tx) categoryTree {
	t.Helper()
	insert := func(name string, parent, replacedBy any, retired bool) int32 {
		return testdb.Scalar[int32](t, tx,
			`INSERT INTO categories (name, slug, parent_id, replaced_by, retired_at)
			 VALUES ($1, $2, $3, $4, CASE WHEN $5::bool THEN now() END) RETURNING id`,
			treePrefix+" "+name, slugOf(name), parent, replacedBy, retired)
	}
	var c categoryTree
	c.parent = insert("parent", nil, nil, false)
	// subB gets the lower id, so ordering by id would put it first.
	c.subB = insert("subb", c.parent, nil, false)
	c.subA = insert("suba", c.parent, nil, false)
	c.replaced = insert("replaced", nil, c.subB, true)
	c.gone = insert("gone", nil, nil, true)
	return c
}

func seedTreeTool(t *testing.T, tx pgx.Tx, name string) uuid.UUID {
	t.Helper()
	return testdb.Scalar[uuid.UUID](t, tx, `INSERT INTO tools (name, logo_url) VALUES ($1, 'https://example.com/l.png') RETURNING id`, name)
}

func toolCategoryIDs(t *testing.T, tx pgx.Tx, tool uuid.UUID) string {
	t.Helper()
	return fmt.Sprint(testdb.IDs[int32](t, tx, `SELECT category_id FROM tool_categories WHERE tool_id = $1 ORDER BY position, category_id`, tool))
}

func TestCategoryStructureIntegration(t *testing.T) {
	ctx := context.Background()
	tx := testdb.Begin(t, testdb.Open(t))
	q := db.New(tx)
	c := seedCategoryTree(t, tx)
	tool := seedTreeTool(t, tx, "Zqxtree Tool")

	if err := q.AddToolCategories(ctx, db.AddToolCategoriesParams{ToolID: tool, CategoryIds: []int32{c.subA, c.subB}}); err != nil {
		t.Fatal(err)
	}

	t.Run("main category first, with its slug and parent", func(t *testing.T) {
		row, err := q.ListTools(ctx, db.ListToolsParams{Limit: 5, CategorySlug: slugOf("suba"), Sort: "name"})
		if err != nil || len(row) != 1 {
			t.Fatalf("ListTools: %d rows, %v", len(row), err)
		}
		var cats []struct {
			ID           int32
			Slug, Parent string
		}
		raw, err := json.Marshal(row[0].Categories)
		if err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal(raw, &cats); err != nil {
			t.Fatal(err)
		}
		if len(cats) != 2 || cats[0].ID != c.subA || cats[1].ID != c.subB {
			t.Fatalf("categories = %+v; want subA then subB", cats)
		}
		if cats[0].Slug != slugOf("suba") || cats[0].Parent != treePrefix+" parent" {
			t.Errorf("first category = %+v", cats[0])
		}
	})

	t.Run("a tool is listed under its subcategories, their parent and the category they replaced", func(t *testing.T) {
		for slug, want := range map[string]int{"suba": 1, "subb": 1, "parent": 1, "replaced": 1, "gone": 0} {
			rows, err := q.ListTools(ctx, db.ListToolsParams{Limit: 5, CategorySlug: slugOf(slug), Sort: "name"})
			if err != nil {
				t.Fatal(err)
			}
			if len(rows) != want {
				t.Errorf("ListTools %s: %d rows; want %d", slug, len(rows), want)
			}
		}
		for slug, want := range map[string]int{"suba": 1, "parent": 1, "gone": 0} {
			rows, err := q.GetToolsByCategory(ctx, db.GetToolsByCategoryParams{Slug: slugOf(slug), Limit: 5})
			if err != nil {
				t.Fatal(err)
			}
			if len(rows) != want {
				t.Errorf("GetToolsByCategory %s: %d rows; want %d", slug, len(rows), want)
			}
		}
	})

	t.Run("a hidden tool stays out of the parent listing", func(t *testing.T) {
		hidden := seedTreeTool(t, tx, "Zqxtree Hidden")
		if err := q.AddToolCategories(ctx, db.AddToolCategoriesParams{ToolID: hidden, CategoryIds: []int32{c.subA}}); err != nil {
			t.Fatal(err)
		}
		if _, err := tx.Exec(ctx, `UPDATE tools SET hidden_at = now() WHERE id = $1`, hidden); err != nil {
			t.Fatal(err)
		}
		rows, err := q.ListTools(ctx, db.ListToolsParams{Limit: 5, CategorySlug: slugOf("parent"), Sort: "name"})
		if err != nil || len(rows) != 1 {
			t.Errorf("ListTools parent: %d rows, %v; want 1", len(rows), err)
		}
		byCat, err := q.GetToolsByCategory(ctx, db.GetToolsByCategoryParams{Slug: slugOf("parent"), Limit: 5})
		if err != nil || len(byCat) != 1 {
			t.Errorf("GetToolsByCategory parent: %d rows, %v; want 1", len(byCat), err)
		}
	})

	t.Run("category page details", func(t *testing.T) {
		sub, err := q.GetCategoryBySlug(ctx, slugOf("suba"))
		if err != nil || sub.IsRetired || sub.ParentSlug != slugOf("parent") || sub.ReplacedBySlug != "" {
			t.Errorf("sub = %+v, %v", sub, err)
		}
		old, err := q.GetCategoryBySlug(ctx, slugOf("replaced"))
		if err != nil || !old.IsRetired || old.ReplacedBySlug != slugOf("subb") {
			t.Errorf("replaced = %+v, %v", old, err)
		}
		gone, err := q.GetCategoryBySlug(ctx, slugOf("gone"))
		if err != nil || !gone.IsRetired || gone.ReplacedBySlug != "" {
			t.Errorf("gone = %+v, %v", gone, err)
		}
	})

	t.Run("only current subcategories can be picked", func(t *testing.T) {
		rows, err := q.AutocompleteCategory(ctx, db.AutocompleteCategoryParams{Similarity: treePrefix, Limit: 50})
		if err != nil {
			t.Fatal(err)
		}
		got := map[int32]bool{}
		for _, r := range rows {
			got[r.ID] = true
		}
		if !got[c.subA] || !got[c.subB] || got[c.parent] || got[c.replaced] || got[c.gone] {
			t.Errorf("autocomplete = %v", got)
		}
	})

	t.Run("the sidebar list has no retired category", func(t *testing.T) {
		other := seedTreeTool(t, tx, "Zqxtree Old")
		if _, err := tx.Exec(ctx, `INSERT INTO tool_categories (tool_id, category_id) VALUES ($1, $2)`, other, c.gone); err != nil {
			t.Fatal(err)
		}
		rows, err := q.GetTopCategories(ctx, 100000)
		if err != nil {
			t.Fatal(err)
		}
		var subA *db.GetTopCategoriesRow
		for i, r := range rows {
			if r.ID == c.gone || r.ID == c.replaced {
				t.Errorf("retired category listed: %+v", r)
			}
			if r.ID == c.subA {
				subA = &rows[i]
			}
		}
		if subA == nil || subA.ToolCount != 1 || subA.ParentSlug != slugOf("parent") {
			t.Errorf("subA = %+v", subA)
		}
	})

	t.Run("an owner's edit keeps its order and swaps retired categories", func(t *testing.T) {
		edited := seedTreeTool(t, tx, "Zqxtree Edited")
		err := q.AddToolCategories(ctx, db.AddToolCategoriesParams{ToolID: edited, CategoryIds: []int32{c.replaced, c.gone, c.subA}})
		if err != nil {
			t.Fatal(err)
		}
		if got, want := toolCategoryIDs(t, tx, edited), fmt.Sprint([]int32{c.subB, c.subA}); got != want {
			t.Errorf("categories = %s; want %s", got, want)
		}
		// Two ids that end up the same category are one link.
		twice := seedTreeTool(t, tx, "Zqxtree Twice")
		if err := q.AddToolCategories(ctx, db.AddToolCategoriesParams{ToolID: twice, CategoryIds: []int32{c.replaced, c.subB}}); err != nil {
			t.Fatal(err)
		}
		if got, want := toolCategoryIDs(t, tx, twice), fmt.Sprint([]int32{c.subB}); got != want {
			t.Errorf("categories = %s; want %s", got, want)
		}
	})

	t.Run("an approved suggestion swaps retired categories", func(t *testing.T) {
		approved := seedTreeTool(t, tx, "Zqxtree Approved")
		for _, id := range []int32{c.gone, c.subA, c.replaced, c.subA} {
			if err := q.AssignCategoryToTool(ctx, db.AssignCategoryToToolParams{ToolID: approved, CategoryID: id}); err != nil {
				t.Fatal(err)
			}
		}
		if got, want := toolCategoryIDs(t, tx, approved), fmt.Sprint([]int32{c.subA, c.subB}); got != want {
			t.Errorf("categories = %s; want %s", got, want)
		}
	})
}
