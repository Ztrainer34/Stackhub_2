package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"testing"

	"github.com/google/uuid"
	"stackhub.com/stackhub/internal/testdb"
)

const affiliateMigration = "20261125120000_affiliate_link_requests.sql"

// The blocks of a tool page: the active stack count, "Stacks with {tool}",
// "Playbooks with {tool}" and the affiliate link request. Through the real
// router, so the auth groups are part of what is tested.
func TestToolPageBlocksIntegration(t *testing.T) {
	tx := testdb.Rollback(t)
	testdb.ApplyMigration(t, tx, affiliateMigration)
	api := newTestAPI(t, tx)

	tool := testdb.NewTool(t, tx, "Zqxpage Tool", false)
	hidden := testdb.NewTool(t, tx, "Zqxpage Hidden", true)
	author := testdb.NewProfile(t, tx, "zqxpage_author") // small stack, wrote a post
	big := testdb.NewProfile(t, tx, "zqxpage_big")       // 9 visible tools and a hidden one
	small := testdb.NewProfile(t, tx, "zqxpage_small")
	old := testdb.NewProfile(t, tx, "zqxpage_old")     // had it, old stack only
	saver := testdb.NewProfile(t, tx, "zqxpage_saver") // saved it for later only
	excluded := testdb.NewProfile(t, tx, "max_cz")     // a test account, would come first

	stack := func(p, tl uuid.UUID) {
		testdb.Exec(t, tx, `INSERT INTO stack_items (profile_id, tool_id) VALUES ($1, $2)`, p, tl)
	}
	for _, p := range []uuid.UUID{author, big, small, excluded} {
		stack(p, tool)
	}
	for i := 0; i < 8; i++ {
		stack(big, testdb.NewTool(t, tx, fmt.Sprintf("Zqxpage Other %d", i), false))
	}
	stack(big, hidden)
	testdb.Exec(t, tx, `INSERT INTO old_stack_items (profile_id, tool_id) VALUES ($1, $2)`, old, tool)
	testdb.Exec(t, tx, `INSERT INTO watchlist_items (profile_id, tool_id) VALUES ($1, $2)`, saver, tool)

	post := func(by uuid.UUID, name, postType string, published bool) uuid.UUID {
		id := testdb.Scalar[uuid.UUID](t, tx, `
			INSERT INTO posts (author_id, type, name, slug, description, is_published, last_publish)
			VALUES ($1, $2, $3, $4, '', $5, now()) RETURNING id`, by, postType, name, "zqxpage-"+uuid.NewString(), published)
		testdb.Exec(t, tx, `INSERT INTO post_tools (post_id, tool_id) VALUES ($1, $2)`, id, tool)
		return id
	}
	post(author, "Zqxpage playbook", "playbook", true)
	post(author, "Zqxpage comparison", "comparison", true)
	post(excluded, "Zqxpage test account", "playbook", true)
	post(small, "Zqxpage draft", "playbook", false) // must not lift small above big
	pending := post(small, "Zqxpage pending", "playbook", true)
	testdb.Exec(t, tx, `INSERT INTO tool_tickets (post_id, requested_by, tool_name, status) VALUES ($1, $2, 'Zqxpage new', 'pending')`, pending, small)

	get := func(path string, as uuid.UUID, into any) {
		t.Helper()
		status, body := api.call("GET", path, as, "")
		if status != http.StatusOK {
			t.Fatalf("GET %s: %d %s", path, status, body)
		}
		if err := json.Unmarshal([]byte(body), into); err != nil {
			t.Fatalf("GET %s: %v\n%s", path, err, body)
		}
	}
	type person struct {
		Username  string                      `json:"username"`
		ToolCount int                         `json:"tool_count"`
		Tools     []struct{ ID, Name string } `json:"tools"`
	}
	type stacks struct {
		Stacks     []person `json:"stacks"`
		TotalCount int      `json:"total_count"`
	}

	t.Run("stacks: authors first, then the biggest; test accounts, old stacks and saves out", func(t *testing.T) {
		var got stacks
		get("/tool/"+tool.String()+"/stacks", uuid.Nil, &got)
		var names []string
		for _, p := range got.Stacks {
			names = append(names, p.Username)
		}
		if want := "zqxpage_author,zqxpage_big,zqxpage_small"; strings.Join(names, ",") != want || got.TotalCount != 3 {
			t.Fatalf("stacks = %v, total %d; want %s, 3", names, got.TotalCount, want)
		}
		b := got.Stacks[1]
		if b.ToolCount != 9 || len(b.Tools) != 6 {
			t.Errorf("big stack: count %d, %d tools sent; want 9 (hidden one left out), 6", b.ToolCount, len(b.Tools))
		}
		if b.Tools[0].ID != tool.String() {
			t.Errorf("first tool = %+v; want the page's tool", b.Tools[0])
		}
		for _, tl := range b.Tools {
			if tl.ID == hidden.String() {
				t.Error("a hidden tool is shown in a stack")
			}
		}
	})

	t.Run("stacks: the limit cuts the rows, not the total", func(t *testing.T) {
		var got stacks
		get("/tool/"+tool.String()+"/stacks?limit=1", uuid.Nil, &got)
		if len(got.Stacks) != 1 || got.TotalCount != 3 {
			t.Fatalf("limit=1: %d rows, total %d; want 1, 3", len(got.Stacks), got.TotalCount)
		}
		if got.Stacks[0].Username != "zqxpage_author" {
			t.Errorf("limit=1 keeps %s; want the author, although others have bigger stacks", got.Stacks[0].Username)
		}
		for _, bad := range []string{"0", "-1", "25", "abc"} {
			get("/tool/"+tool.String()+"/stacks?limit="+bad, uuid.Nil, &got)
			if len(got.Stacks) != 3 {
				t.Errorf("limit=%s: %d rows; want the default", bad, len(got.Stacks))
			}
		}
	})

	t.Run("stacks: only public fields, by slug too, 404 for an unknown tool", func(t *testing.T) {
		var got struct {
			Stacks []map[string]any `json:"stacks"`
		}
		get("/tool/zqxpage-tool/stacks", uuid.Nil, &got)
		if len(got.Stacks) == 0 {
			t.Fatal("no stacks by slug")
		}
		var keys []string
		for k := range got.Stacks[0] {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		if want := "avatar_url,bio,display_name,id,tool_count,tools,total_count,username"; strings.Join(keys, ",") != want {
			t.Errorf("fields = %v; want %s", keys, want)
		}
		api.expect("unknown tool", "GET", "/tool/zqxpage-no-such-tool/stacks", uuid.Nil, "", http.StatusNotFound, "Tool not found")
	})

	t.Run("the count matches the stacks, signed in or not, and after an owner's edit", func(t *testing.T) {
		var got struct {
			ActiveStackCount int `json:"active_stack_count"`
		}
		for _, as := range []uuid.UUID{uuid.Nil, saver} {
			get("/tool/"+tool.String(), as, &got)
			if got.ActiveStackCount != 3 {
				t.Errorf("active_stack_count (signed in: %v) = %d; want 3", as != uuid.Nil, got.ActiveStackCount)
			}
		}
		testdb.Exec(t, tx, `INSERT INTO tool_owners (tool_id, profile_id) VALUES ($1, $2)`, tool, saver)
		status, body := api.call("PUT", "/tool/"+tool.String()+"/page", saver, `{"logo_url":"https://example.com/new.png"}`)
		if status != http.StatusOK {
			t.Fatalf("owner edit: %d %s", status, body)
		}
		got.ActiveStackCount = -1
		if err := json.Unmarshal([]byte(body), &got); err != nil || got.ActiveStackCount != 3 {
			t.Errorf("after an owner's edit: active_stack_count = %d (%v); want 3", got.ActiveStackCount, err)
		}
	})

	t.Run("playbooks: showcase leaves the test accounts out of the list and the counts", func(t *testing.T) {
		type listing struct {
			Posts []struct {
				Author string `json:"author_username"`
			} `json:"posts"`
			Counts struct {
				All        int `json:"all_count"`
				Playbook   int `json:"playbook_count"`
				Comparison int `json:"comparison_count"`
			} `json:"counts"`
		}
		var curated, plain listing
		get("/posts?tool="+tool.String()+"&showcase=1", uuid.Nil, &curated)
		get("/posts?tool="+tool.String(), uuid.Nil, &plain)
		if len(curated.Posts) != 2 || curated.Counts.All != 2 || curated.Counts.Playbook != 1 || curated.Counts.Comparison != 1 {
			t.Errorf("showcase: %d posts, counts %+v; want 2, {2 1 1}", len(curated.Posts), curated.Counts)
		}
		for _, p := range curated.Posts {
			if p.Author == "max_cz" {
				t.Error("a test account's post is in the showcase")
			}
		}
		if len(plain.Posts) != 3 || plain.Counts.All != 3 {
			t.Errorf("/playbooks listing: %d posts, counts %+v; want 3, 3 (unchanged, test accounts included)", len(plain.Posts), plain.Counts)
		}
		// Without a tool filter the counts still cover every post.
		var every listing
		get("/posts", uuid.Nil, &every)
		if every.Counts.All < 3 || len(every.Posts) == 0 {
			t.Errorf("unfiltered listing: %d posts, counts %+v", len(every.Posts), every.Counts)
		}
	})

	t.Run("affiliate: sign-in needed, one row per person, own row only", func(t *testing.T) {
		path := "/user/affiliate-requests/" + tool.String()
		rows := func() int {
			return testdb.Scalar[int](t, tx, `SELECT count(*)::int FROM affiliate_link_requests WHERE tool_id = $1`, tool)
		}
		requested := func(as uuid.UUID) bool {
			var got struct {
				Requested bool `json:"is_affiliate_requested"`
			}
			get("/tool/"+tool.String(), as, &got)
			return got.Requested
		}
		for _, method := range []string{"PUT", "DELETE"} {
			if status, _ := api.call(method, path, uuid.Nil, ""); status != http.StatusUnauthorized {
				t.Errorf("anonymous %s: %d; want 401", method, status)
			}
		}
		for i := 0; i < 2; i++ {
			if status, body := api.call("PUT", path, small, ""); status != http.StatusOK {
				t.Fatalf("ask: %d %s", status, body)
			}
		}
		if rows() != 1 || !requested(small) || requested(big) {
			t.Errorf("after asking twice: %d rows, asked %v, someone else %v; want 1, true, false", rows(), requested(small), requested(big))
		}
		// Someone else cancelling must not touch it.
		if status, _ := api.call("DELETE", path, big, ""); status != http.StatusOK || rows() != 1 {
			t.Errorf("another person's cancel: %d, %d rows; want 200, 1", status, rows())
		}
		if status, _ := api.call("DELETE", path, small, ""); status != http.StatusOK || rows() != 0 || requested(small) {
			t.Errorf("cancel: %d, %d rows; want 200, 0", status, rows())
		}
		api.expect("malformed id", "PUT", "/user/affiliate-requests/nope", small, "", http.StatusBadRequest, "Malformed id")
	})
}

// Last in a transaction of its own: the failed insert aborts it.
func TestAffiliateRequestUnknownToolIntegration(t *testing.T) {
	tx := testdb.Rollback(t)
	testdb.ApplyMigration(t, tx, affiliateMigration)
	api := newTestAPI(t, tx)
	p := testdb.NewProfile(t, tx, "zqxpage_nobody")
	api.expect("unknown tool", "PUT", "/user/affiliate-requests/"+uuid.NewString(), p, "", http.StatusNotFound, "Tool not found")
}
