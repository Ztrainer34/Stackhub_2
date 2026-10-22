package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"

	"github.com/go-chi/jwtauth/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"stackhub.com/stackhub/pkg/db"
)

// Characterisation tests for the five handlers whose logic moved into services
// (refactor step 3): createPost, starPost, the two ticket resolutions,
// updateToolPage and search.
//
// They pin what a CLIENT sees — status, body, and what lands in the database —
// through the real router and middleware. They were written and run green
// against the handlers BEFORE the logic moved, so passing afterwards is the
// evidence that the move changed nothing observable.
//
// Same rules as feed_integration_test.go: opt-in via TEST_DB_CONNECTION, local
// databases only, every write rolled back. The handlers' own transactions
// become savepoints inside the test's transaction (App.db is a txBeginner).

// testAPI serves the real routing table against a test transaction.
type testAPI struct {
	t    *testing.T
	h    http.Handler
	auth *jwtauth.JWTAuth
}

func newTestAPI(t *testing.T, tx pgx.Tx) *testAPI {
	t.Helper()
	secret := []byte("characterisation-tests-only")
	auth := jwtauth.New("HS256", secret, secret)
	app := &App{db: tx, queries: db.New(tx)} // no mailer: emails are skipped
	return &testAPI{t: t, h: app.routes(auth), auth: auth}
}

// call sends one request as the given user (uuid.Nil = anonymous) and returns
// the status and body.
func (a *testAPI) call(method, path string, as uuid.UUID, body string) (int, string) {
	a.t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if as != uuid.Nil {
		_, token, err := a.auth.Encode(map[string]interface{}{
			"sub":          as.String(),
			"app_metadata": map[string]interface{}{"onboarded": true},
		})
		if err != nil {
			a.t.Fatal(err)
		}
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	a.h.ServeHTTP(rec, req)
	return rec.Code, rec.Body.String()
}

// expect checks a plain-text error answer exactly, as http.Error writes it.
func (a *testAPI) expect(name, method, path string, as uuid.UUID, body string, wantStatus int, wantMsg string) {
	a.t.Helper()
	status, got := a.call(method, path, as, body)
	if status != wantStatus || got != wantMsg+"\n" {
		a.t.Errorf("%s: got %d %q; want %d %q", name, status, got, wantStatus, wantMsg+"\n")
	}
}

func scalar[T any](t *testing.T, tx pgx.Tx, sql string, args ...any) T {
	t.Helper()
	var v T
	if err := tx.QueryRow(context.Background(), sql, args...).Scan(&v); err != nil {
		t.Fatalf("%s: %v", sql, err)
	}
	return v
}

func ids[T any](t *testing.T, tx pgx.Tx, sql string, args ...any) []T {
	t.Helper()
	rows, err := tx.Query(context.Background(), sql, args...)
	if err != nil {
		t.Fatalf("%s: %v", sql, err)
	}
	out, err := pgx.CollectRows(rows, pgx.RowTo[T])
	if err != nil {
		t.Fatalf("%s: %v", sql, err)
	}
	return out
}

func sortedInts(v []int32) string {
	s := append([]int32(nil), v...)
	sort.Slice(s, func(i, j int) bool { return s[i] < s[j] })
	return fmt.Sprint(s)
}

func someTools(t *testing.T, tx pgx.Tx, n int) []uuid.UUID {
	t.Helper()
	tools := ids[uuid.UUID](t, tx, `SELECT id FROM tools ORDER BY id LIMIT $1`, n)
	if len(tools) < n {
		t.Skipf("need %d tools — seed the database first", n)
	}
	return tools
}

func someCategories(t *testing.T, tx pgx.Tx, n int) []int32 {
	t.Helper()
	cats := ids[int32](t, tx, `SELECT id FROM categories ORDER BY id LIMIT $1`, n)
	if len(cats) < n {
		t.Skipf("need %d categories — seed the database first", n)
	}
	return cats
}

func actorName(t *testing.T, tx pgx.Tx, id uuid.UUID) string {
	return scalar[string](t, tx, `SELECT COALESCE(NULLIF(display_name, ''), NULLIF(username, ''), 'Someone') FROM profiles WHERE id = $1`, id)
}

func TestCreatePostCharacterisationIntegration(t *testing.T) {
	conn := testDB(t)
	tx := beginRollback(t, conn)
	api := newTestAPI(t, tx)
	author, _ := twoProfiles(t, tx)
	tools := someTools(t, tx, 2)
	cats := someCategories(t, tx, 2)
	t1, t2 := tools[0].String(), tools[1].String()

	elevenTools := make([]string, 11)
	for i := range elevenTools {
		elevenTools[i] = `"` + uuid.NewString() + `"`
	}
	eleven := strings.Join(elevenTools, ",")

	rejections := []struct{ name, body, msg string }{
		{"blank name", `{"type":"playbook","name":"   ","tools":["` + t1 + `"]}`, "Post name cannot be empty"},
		{"blank name wins over missing tools", `{"type":"playbook","name":""}`, "Post name cannot be empty"},
		{"long name", `{"type":"playbook","name":"` + strings.Repeat("a", 201) + `","tools":["` + t1 + `"]}`, "Post name must be at most 200 characters"},
		{"long goal", `{"type":"playbook","name":"x","description":"` + strings.Repeat("a", 1001) + `","tools":["` + t1 + `"]}`, "Goal must be at most 1000 characters"},
		{"suggestion without name", `{"type":"playbook","name":"x","suggested_tools":[{"name":"  "}]}`, "Tool name is required"},
		{"suggestion with script url", `{"type":"playbook","name":"x","suggested_tools":[{"name":"T","website":"javascript:alert(1)"}]}`, "Tool website must be an http or https address"},
		{"no tools", `{"type":"playbook","name":"x"}`, "Missing tools"},
		{"comparison of one", `{"type":"comparison","name":"x","tools":["` + t1 + `"]}`, "Comparisons require at least two tools or tool suggestions"},
		{"playbook of eleven", `{"type":"playbook","name":"x","tools":[` + eleven + `]}`, "Too many tools (maximum 10)"},
		{"comparison of eleven", `{"type":"comparison","name":"x","tools":[` + eleven + `]}`, "Too many tools (maximum 10)"},
		{"combo is gone", `{"type":"combo","name":"x","tools":["` + t1 + `"]}`, "Unknown post type"},
		{"bad experience level", `{"type":"playbook","name":"x","tools":["` + t1 + `"],"experience_level":"expert"}`, "Unknown experience level"},
		{"malformed json", `{"type":`, "Failed to read request body"},
	}
	for _, c := range rejections {
		api.expect(c.name, "POST", "/post/create", author, c.body, http.StatusBadRequest, c.msg)
	}

	body := fmt.Sprintf(`{"type":"comparison","name":"  Characterisation Post  ","description":"the goal",
		"tools":["%s"],
		"suggested_tools":[{"name":" Brand New Tool ","description":"what it does","website":" example.com ","categories":[%d,%d]}],
		"experience_level":" Advanced "}`, t1, cats[0], cats[1])
	status, got := api.call("POST", "/post/create", author, body)
	if status != http.StatusOK {
		t.Fatalf("create: %d %q", status, got)
	}
	var created struct {
		ID   uuid.UUID `json:"id"`
		Slug string    `json:"slug"`
	}
	if err := json.Unmarshal([]byte(got), &created); err != nil || created.Slug != "characterisation-post" {
		t.Fatalf("create response %q (err %v); want id and slug characterisation-post", got, err)
	}

	var name, typ, desc, level string
	var authorID uuid.UUID
	if err := tx.QueryRow(context.Background(),
		`SELECT name, type, description, experience_level, author_id FROM posts WHERE id = $1`, created.ID).
		Scan(&name, &typ, &desc, &level, &authorID); err != nil {
		t.Fatal(err)
	}
	if name != "Characterisation Post" || typ != "comparison" || desc != "the goal" || level != "advanced" || authorID != author {
		t.Errorf("stored post = %q %q %q %q %v", name, typ, desc, level, authorID)
	}
	if linked := ids[uuid.UUID](t, tx, `SELECT tool_id FROM post_tools WHERE post_id = $1`, created.ID); len(linked) != 1 || linked[0] != tools[0] {
		t.Errorf("post_tools = %v; want [%s]", linked, t1)
	}

	var ticketID, requester uuid.UUID
	var tName, tDesc, tSite, tStatus string
	if err := tx.QueryRow(context.Background(),
		`SELECT id, tool_name, tool_description, tool_website, status, requested_by FROM tool_tickets WHERE post_id = $1`, created.ID).
		Scan(&ticketID, &tName, &tDesc, &tSite, &tStatus, &requester); err != nil {
		t.Fatalf("ticket: %v", err)
	}
	if tName != "Brand New Tool" || tDesc != "what it does" || tSite != "https://example.com" || tStatus != "pending" || requester != author {
		t.Errorf("ticket = %q %q %q %q %v", tName, tDesc, tSite, tStatus, requester)
	}
	if got := sortedInts(ids[int32](t, tx, `SELECT category_id FROM tool_ticket_categories WHERE ticket_id = $1`, ticketID)); got != sortedInts(cats) {
		t.Errorf("ticket categories = %s; want %s", got, sortedInts(cats))
	}

	api.expect("same title again", "POST", "/post/create", author,
		`{"type":"playbook","name":"Characterisation Post","tools":["`+t2+`"]}`,
		http.StatusConflict, "You already have a post with this slug. Please choose a different title.")

	// A tool that does not exist fails the link step; the post must not survive.
	api.expect("unknown tool", "POST", "/post/create", author,
		`{"type":"playbook","name":"Ghost Tools Post","tools":["`+uuid.NewString()+`"]}`,
		http.StatusBadRequest, "Failed to create post")
	if n := scalar[int64](t, tx, `SELECT count(*) FROM posts WHERE author_id = $1 AND slug = 'ghost-tools-post'`, author); n != 0 {
		t.Errorf("post with an unknown tool was kept (%d rows); the transaction should roll it back", n)
	}

	// The same rollback when a suggestion's category does not exist.
	api.expect("unknown category", "POST", "/post/create", author,
		`{"type":"playbook","name":"Ghost Category Post","suggested_tools":[{"name":"T","categories":[2147483000]}]}`,
		http.StatusBadRequest, "Failed to add suggested tool categories")
	if n := scalar[int64](t, tx, `SELECT count(*) FROM posts WHERE author_id = $1 AND slug = 'ghost-category-post'`, author); n != 0 {
		t.Errorf("post with an unknown suggestion category was kept (%d rows)", n)
	}
}

func TestStarPostCharacterisationIntegration(t *testing.T) {
	conn := testDB(t)
	tx := beginRollback(t, conn)
	api := newTestAPI(t, tx)
	ctx := context.Background()

	var postID, author uuid.UUID
	var postName string
	if err := tx.QueryRow(ctx, `SELECT id, author_id, name FROM posts WHERE is_published LIMIT 1`).Scan(&postID, &author, &postName); err != nil {
		t.Skipf("no published posts (%v)", err)
	}
	liker := scalar[uuid.UUID](t, tx, `SELECT id FROM profiles WHERE id <> $1 ORDER BY created_at LIMIT 1`, author)
	if _, err := tx.Exec(ctx, `DELETE FROM post_stars WHERE post_id = $1`, postID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM notifications WHERE entity_id = $1`, postID); err != nil {
		t.Fatal(err)
	}
	starNotes := func(actor uuid.UUID) int64 {
		return scalar[int64](t, tx, `SELECT count(*) FROM notifications
			WHERE recipient_id = $1 AND actor_id = $2 AND type = 'post_star' AND entity_id = $3`, author, actor, postID)
	}
	path := "/post/" + postID.String() + "/star"

	api.expect("malformed id", "PUT", "/post/not-a-uuid/star", liker, "", http.StatusBadRequest, "Malformed id")
	api.expect("unknown post", "PUT", "/post/"+uuid.NewString()+"/star", liker, "", http.StatusNotFound, "Post not found")

	if status, body := api.call("PUT", path, liker, ""); status != http.StatusOK || body != "" {
		t.Fatalf("star: %d %q", status, body)
	}
	if n := scalar[int64](t, tx, `SELECT count(*) FROM post_stars WHERE post_id = $1 AND liker_id = $2`, postID, liker); n != 1 {
		t.Errorf("star rows = %d; want 1", n)
	}
	if n := starNotes(liker); n != 1 {
		t.Errorf("notifications after first star = %d; want 1", n)
	}
	wantMsg := fmt.Sprintf("%s starred “%s”", actorName(t, tx, liker), postName)
	if msg := scalar[string](t, tx, `SELECT message FROM notifications WHERE actor_id = $1 AND entity_id = $2`, liker, postID); msg != wantMsg {
		t.Errorf("notification message %q; want %q", msg, wantMsg)
	}

	// Starring again is accepted and does not notify twice.
	if status, _ := api.call("PUT", path, liker, ""); status != http.StatusOK {
		t.Errorf("second star: %d; want 200", status)
	}
	if n := starNotes(liker); n != 1 {
		t.Errorf("notifications after second star = %d; want still 1", n)
	}

	// Starring your own post never notifies you.
	if status, _ := api.call("PUT", path, author, ""); status != http.StatusOK {
		t.Errorf("own star: %d; want 200", status)
	}
	if n := starNotes(author); n != 0 {
		t.Errorf("author notified about their own star (%d)", n)
	}

	// A draft is invisible to everyone but its author.
	if _, err := tx.Exec(ctx, `UPDATE posts SET is_published = false WHERE id = $1`, postID); err != nil {
		t.Fatal(err)
	}
	api.expect("someone else's draft", "PUT", path, liker, "", http.StatusNotFound, "Post not found")
	if status, _ := api.call("PUT", path, author, ""); status != http.StatusOK {
		t.Errorf("author starring own draft: %d; want 200", status)
	}
}

func TestResolveTicketCharacterisationIntegration(t *testing.T) {
	conn := testDB(t)
	tx := beginRollback(t, conn)
	api := newTestAPI(t, tx)
	ctx := context.Background()
	q := db.New(tx)
	requester, resolver := twoProfiles(t, tx)
	cats := someCategories(t, tx, 2)

	// Each subtest gets its own post, so neither depends on the other's
	// notifications. (Approvals on one post are covered by
	// TestEveryApprovedToolNotifiesIntegration.)
	posts := ids[uuid.UUID](t, tx, `SELECT id FROM posts ORDER BY id LIMIT 2`)
	if len(posts) < 2 {
		t.Skip("need two posts — seed the database first")
	}
	postID := posts[0]
	existing := scalar[uuid.UUID](t, tx, `SELECT id FROM tools WHERE id NOT IN (SELECT tool_id FROM post_tools WHERE post_id = $1) LIMIT 1`, postID)

	newTicket := func(name string, onPost bool) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		var err error
		if onPost {
			id, err = q.CreateToolTicket(ctx, db.CreateToolTicketParams{PostID: ToPgUUID(postID), RequestedBy: requester, ToolName: name})
		} else {
			id, err = q.CreateStandaloneToolTicket(ctx, db.CreateStandaloneToolTicketParams{RequestedBy: requester, ToolName: name})
		}
		if err != nil {
			t.Fatal(err)
		}
		return id
	}
	approvals := func(ticketName string) int64 {
		return scalar[int64](t, tx, `SELECT count(*) FROM notifications WHERE recipient_id = $1 AND type = 'tool_approved' AND message = $2`,
			requester, fmt.Sprintf("Your suggested tool “%s” was approved and added to StackHub.", ticketName))
	}
	ticketState := func(id uuid.UUID) (string, uuid.UUID) {
		var status string
		var tool uuid.UUID
		if err := tx.QueryRow(ctx, `SELECT status, COALESCE(resolved_tool_id, '00000000-0000-0000-0000-000000000000') FROM tool_tickets WHERE id = $1`, id).Scan(&status, &tool); err != nil {
			t.Fatal(err)
		}
		return status, tool
	}
	onPost := func(tool uuid.UUID) bool {
		return scalar[bool](t, tx, `SELECT EXISTS (SELECT 1 FROM post_tools WHERE post_id = $1 AND tool_id = $2)`, postID, tool)
	}

	t.Run("with an existing tool", func(t *testing.T) {
		body := `{"tool_id":"` + existing.String() + `"}`
		api.expect("bad ticket id", "POST", "/admin/tool-tickets/nope/resolve-existing", resolver, body, http.StatusBadRequest, "Invalid ticket ID")
		api.expect("malformed body", "POST", "/admin/tool-tickets/"+uuid.NewString()+"/resolve-existing", resolver, `{`, http.StatusBadRequest, "Invalid request body")
		api.expect("unknown ticket", "POST", "/admin/tool-tickets/"+uuid.NewString()+"/resolve-existing", resolver, body, http.StatusNotFound, "Tool ticket not found")

		ticket := newTicket("Existing Characterisation Tool", true)
		path := "/admin/tool-tickets/" + ticket.String() + "/resolve-existing"
		if status, got := api.call("POST", path, resolver, body); status != http.StatusNoContent || got != "" {
			t.Fatalf("resolve: %d %q", status, got)
		}
		if status, tool := ticketState(ticket); status != "resolved" || tool != existing {
			t.Errorf("ticket = %s / %v; want resolved / %v", status, tool, existing)
		}
		if !onPost(existing) {
			t.Error("resolved tool not added to the ticket's post")
		}
		if n := approvals("Existing Characterisation Tool"); n != 1 {
			t.Errorf("approval notifications = %d; want 1", n)
		}
		api.expect("resolve twice", "POST", path, resolver, body, http.StatusConflict, "This ticket has already been resolved")
		if n := approvals("Existing Characterisation Tool"); n != 1 {
			t.Errorf("approval notifications after a repeat = %d; want still 1", n)
		}

		// A tool that does not exist is refused, and the ticket stays as it
		// was. The ticket checks still come first.
		ghostTool := `{"tool_id":"` + uuid.NewString() + `"}`
		api.expect("unknown ticket and unknown tool", "POST", "/admin/tool-tickets/"+uuid.NewString()+"/resolve-existing", resolver, ghostTool, http.StatusNotFound, "Tool ticket not found")
		api.expect("resolved ticket and unknown tool", "POST", path, resolver, ghostTool, http.StatusConflict, "This ticket has already been resolved")
		ghost := newTicket("Ghost Tool Ticket", false)
		api.expect("unknown tool", "POST", "/admin/tool-tickets/"+ghost.String()+"/resolve-existing", resolver, ghostTool, http.StatusNotFound, "Tool not found")
		if status, _ := ticketState(ghost); status != "pending" {
			t.Errorf("ticket status %q after an unknown tool; want pending", status)
		}

		// Resolving your own suggestion does not notify you; a standalone
		// suggestion has no post to add the tool to.
		own := newTicket("Self Resolved Tool", false)
		if status, got := api.call("POST", "/admin/tool-tickets/"+own.String()+"/resolve-existing", requester, body); status != http.StatusNoContent {
			t.Fatalf("self resolve standalone: %d %q", status, got)
		}
		if n := approvals("Self Resolved Tool"); n != 0 {
			t.Errorf("requester notified about resolving their own ticket (%d)", n)
		}
	})

	t.Run("with a new tool", func(t *testing.T) {
		good := fmt.Sprintf(`{"name":"Characterisation Brand New","description":"made by a test","logo_url":" logo.example.com/x.png ","categories":[%d,%d]}`, cats[0], cats[1])
		api.expect("bad ticket id", "POST", "/admin/tool-tickets/nope/resolve-new", resolver, good, http.StatusBadRequest, "Invalid ticket ID")
		api.expect("malformed body", "POST", "/admin/tool-tickets/"+uuid.NewString()+"/resolve-new", resolver, `{`, http.StatusBadRequest, "Invalid request body")
		// The new tool is checked before the ticket is looked up.
		api.expect("blank name", "POST", "/admin/tool-tickets/"+uuid.NewString()+"/resolve-new", resolver,
			`{"name":"  ","logo_url":"https://x.example/l.png"}`, http.StatusBadRequest, "Tool name is required")
		api.expect("script logo", "POST", "/admin/tool-tickets/"+uuid.NewString()+"/resolve-new", resolver,
			`{"name":"x","logo_url":"javascript:alert(1)"}`, http.StatusBadRequest, "Logo URL must be an http or https address")
		api.expect("unknown ticket", "POST", "/admin/tool-tickets/"+uuid.NewString()+"/resolve-new", resolver, good, http.StatusNotFound, "Tool ticket not found")

		postID = posts[1]
		ticket := newTicket("New Characterisation Tool", true)
		path := "/admin/tool-tickets/" + ticket.String() + "/resolve-new"
		status, got := api.call("POST", path, resolver, good)
		if status != http.StatusOK {
			t.Fatalf("resolve new: %d %q", status, got)
		}
		var tool struct {
			ID          uuid.UUID `json:"id"`
			Name        string    `json:"name"`
			Description *string   `json:"description"`
			LogoURL     *string   `json:"logo_url"`
		}
		if err := json.Unmarshal([]byte(got), &tool); err != nil {
			t.Fatalf("response %q: %v", got, err)
		}
		if tool.Name != "Characterisation Brand New" || tool.Description == nil || *tool.Description != "made by a test" ||
			tool.LogoURL == nil || *tool.LogoURL != "https://logo.example.com/x.png" {
			t.Errorf("created tool = %q", got)
		}
		if got := sortedInts(ids[int32](t, tx, `SELECT category_id FROM tool_categories WHERE tool_id = $1`, tool.ID)); got != sortedInts(cats) {
			t.Errorf("tool categories = %s; want %s", got, sortedInts(cats))
		}
		if status, resolved := ticketState(ticket); status != "resolved" || resolved != tool.ID {
			t.Errorf("ticket = %s / %v; want resolved / %v", status, resolved, tool.ID)
		}
		if !onPost(tool.ID) {
			t.Error("new tool not added to the ticket's post")
		}
		if n := approvals("New Characterisation Tool"); n != 1 {
			t.Errorf("approval notifications = %d; want 1", n)
		}
		before := scalar[int64](t, tx, `SELECT count(*) FROM tools`)
		api.expect("resolve twice", "POST", path, resolver, good, http.StatusConflict, "This ticket has already been resolved")
		if after := scalar[int64](t, tx, `SELECT count(*) FROM tools`); after != before {
			t.Errorf("a refused second resolve still created a tool (%d -> %d)", before, after)
		}
	})

	t.Run("reject", func(t *testing.T) {
		api.expect("bad ticket id", "POST", "/admin/tool-tickets/nope/reject", resolver, "", http.StatusBadRequest, "Invalid ticket ID")
		ticket := newTicket("Rejected Characterisation Tool", false)
		path := "/admin/tool-tickets/" + ticket.String() + "/reject"
		if status, got := api.call("POST", path, resolver, ""); status != http.StatusNoContent || got != "" {
			t.Fatalf("reject: %d %q", status, got)
		}
		if status, _ := ticketState(ticket); status != "rejected" {
			t.Errorf("ticket status %s; want rejected", status)
		}

		// The admin list filters by status and pages.
		listed := func(query string) []string {
			t.Helper()
			status, got := api.call("GET", "/admin/tool-tickets"+query, resolver, "")
			if status != http.StatusOK {
				t.Fatalf("list %s: %d %q", query, status, got)
			}
			var res struct {
				Tickets []struct {
					ID     string `json:"id"`
					Status string `json:"status"`
				} `json:"tickets"`
				Limit int `json:"limit"`
			}
			if err := json.Unmarshal([]byte(got), &res); err != nil {
				t.Fatal(err)
			}
			var out []string
			for _, tk := range res.Tickets {
				if query == "?status=rejected&limit=100" && tk.Status != "rejected" {
					t.Errorf("status filter let through a %s ticket", tk.Status)
				}
				out = append(out, tk.ID)
			}
			return out
		}
		found := false
		for _, id := range listed("?status=rejected&limit=100") {
			found = found || id == ticket.String()
		}
		if !found {
			t.Error("rejected ticket missing from ?status=rejected")
		}
		for _, id := range listed("?status=pending&limit=100") {
			if id == ticket.String() {
				t.Error("rejected ticket listed under ?status=pending")
			}
		}
		if n := len(listed("?limit=1")); n > 1 {
			t.Errorf("?limit=1 returned %d tickets", n)
		}
		// Rejected is not final; resolved is.
		if status, _ := api.call("POST", "/admin/tool-tickets/"+ticket.String()+"/resolve-existing", resolver, `{"tool_id":"`+existing.String()+`"}`); status != http.StatusNoContent {
			t.Fatalf("resolve a rejected ticket: %d", status)
		}
		api.expect("reject a resolved ticket", "POST", path, resolver, "", http.StatusConflict, "This ticket has already been resolved")
	})
}

func TestUpdateToolPageCharacterisationIntegration(t *testing.T) {
	conn := testDB(t)
	tx := beginRollback(t, conn)
	api := newTestAPI(t, tx)
	ctx := context.Background()
	owner, other := twoProfiles(t, tx)
	tools := someTools(t, tx, 2)
	toolA, toolB := tools[0], tools[1]
	cats := someCategories(t, tx, 2)

	if _, err := tx.Exec(ctx, `INSERT INTO tool_owners (tool_id, profile_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, toolA, owner); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM tool_owners WHERE tool_id = $1 AND profile_id = $2`, toolA, other); err != nil {
		t.Fatal(err)
	}
	path := "/tool/" + toolA.String() + "/page"

	api.expect("not the owner", "PUT", path, other, `{}`, http.StatusForbidden, "You do not have edit rights on this tool's page")
	api.expect("unknown tool", "PUT", "/tool/no-such-tool-characterisation/page", owner, `{}`, http.StatusNotFound, "Tool not found")
	api.expect("malformed body", "PUT", path, owner, `{`, http.StatusBadRequest, "Malformed request")
	api.expect("thirteen categories", "PUT", path, owner, `{"category_ids":[1,2,3,4,5,6,7,8,9,10,11,12,13]}`, http.StatusBadRequest, "A tool can have at most 12 categories")
	api.expect("script logo", "PUT", path, owner, `{"logo_url":"javascript:alert(1)"}`, http.StatusBadRequest, "Logo URL must be an http or https address")
	api.expect("script website", "PUT", path, owner, `{"vendor":{"website":"javascript:alert(1)"}}`, http.StatusBadRequest, "Website must be an http or https address")
	api.expect("script linkedin", "PUT", path, owner, `{"vendor":{"linkedin_profile":"data:text/html,x"}}`, http.StatusBadRequest, "LinkedIn profile must be an http or https address")

	toolText := func(col string) *string {
		var s *string
		if err := tx.QueryRow(ctx, `SELECT `+col+` FROM tools WHERE id = $1`, toolA).Scan(&s); err != nil {
			t.Fatal(err)
		}
		return s
	}
	put := func(name, body string) string {
		t.Helper()
		status, got := api.call("PUT", path, owner, body)
		if status != http.StatusOK {
			t.Fatalf("%s: %d %q", name, status, got)
		}
		var tool struct {
			ID uuid.UUID `json:"id"`
		}
		if err := json.Unmarshal([]byte(got), &tool); err != nil || tool.ID != toolA {
			t.Errorf("%s: response %q is not the tool (err %v)", name, got, err)
		}
		return got
	}

	// Description only: the plain-text projection follows, the logo is untouched.
	logoBefore := toolText("logo_url")
	put("description", `{"description_rich":"{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Hello page\"}]}]}"}`)
	if d := toolText("description"); d == nil || *d != "Hello page" {
		t.Errorf("description = %v; want plain text of the rich description", d)
	}
	if l := toolText("logo_url"); fmt.Sprint(l) != fmt.Sprint(logoBefore) && (l == nil || logoBefore == nil || *l != *logoBefore) {
		t.Errorf("logo changed by a description-only edit: %v -> %v", logoBefore, l)
	}

	put("logo", `{"logo_url":"  example.com/logo.png "}`)
	if l := toolText("logo_url"); l == nil || *l != "https://example.com/logo.png" {
		t.Errorf("logo = %v; want https://example.com/logo.png", l)
	}

	// A vendor row shared with another tool is copied, not edited.
	shared := scalar[uuid.UUID](t, tx, `INSERT INTO vendors (name, website) VALUES ('Shared Characterisation Vendor', 'https://shared.example') RETURNING id`)
	if _, err := tx.Exec(ctx, `UPDATE tools SET vendor_id = $1 WHERE id = ANY($2)`, shared, []uuid.UUID{toolA, toolB}); err != nil {
		t.Fatal(err)
	}
	put("vendor on a shared row", `{"vendor":{"website":"acme.example","x_profile":" acme ","linkedin_profile":"","head_office":"Paris","year_of_foundation":2020}}`)
	vendorA := scalar[uuid.UUID](t, tx, `SELECT vendor_id FROM tools WHERE id = $1`, toolA)
	if vendorA == shared {
		t.Fatal("shared vendor row edited in place — another tool's vendor card would change")
	}
	if vb := scalar[uuid.UUID](t, tx, `SELECT vendor_id FROM tools WHERE id = $1`, toolB); vb != shared {
		t.Errorf("the other tool's vendor moved to %v", vb)
	}
	if site := scalar[string](t, tx, `SELECT website FROM vendors WHERE id = $1`, shared); site != "https://shared.example" {
		t.Errorf("shared vendor's website changed to %q", site)
	}
	var site, xp, office string
	var linkedin *string
	var year int32
	if err := tx.QueryRow(ctx, `SELECT website, x_profile, linkedin_profile, head_office, year_of_foundation FROM vendors WHERE id = $1`, vendorA).
		Scan(&site, &xp, &linkedin, &office, &year); err != nil {
		t.Fatal(err)
	}
	if site != "https://acme.example" || xp != "acme" || linkedin != nil || office != "Paris" || year != 2020 {
		t.Errorf("own vendor = %q %q %v %q %d", site, xp, linkedin, office, year)
	}

	// Now the row is this tool's alone, so it is edited in place.
	put("vendor on an own row", `{"vendor":{"website":"https://acme2.example"}}`)
	if again := scalar[uuid.UUID](t, tx, `SELECT vendor_id FROM tools WHERE id = $1`, toolA); again != vendorA {
		t.Errorf("unshared vendor row replaced (%v -> %v); want edited in place", vendorA, again)
	}
	if site := scalar[string](t, tx, `SELECT website FROM vendors WHERE id = $1`, vendorA); site != "https://acme2.example" {
		t.Errorf("vendor website = %q", site)
	}
	if n := scalar[int64](t, tx, `SELECT count(*) FROM vendors WHERE id = $1 AND x_profile IS NULL AND year_of_foundation IS NULL`, vendorA); n != 1 {
		t.Error("vendor card is sent whole: fields left out should be cleared")
	}

	// Categories are replaced as a set.
	put("categories", fmt.Sprintf(`{"category_ids":[%d,%d]}`, cats[0], cats[1]))
	if got := sortedInts(ids[int32](t, tx, `SELECT category_id FROM tool_categories WHERE tool_id = $1`, toolA)); got != sortedInts(cats) {
		t.Errorf("categories = %s; want %s", got, sortedInts(cats))
	}
	put("no categories", `{"category_ids":[]}`)
	if n := scalar[int64](t, tx, `SELECT count(*) FROM tool_categories WHERE tool_id = $1`, toolA); n != 0 {
		t.Errorf("categories left after clearing: %d", n)
	}
}

func TestSearchCharacterisationIntegration(t *testing.T) {
	conn := testDB(t)
	tx := beginRollback(t, conn)
	api := newTestAPI(t, tx)
	viewer, _ := twoProfiles(t, tx)

	api.expect("bad page", "GET", "/search?t=tool&q=x&p=abc", uuid.Nil, "", http.StatusBadRequest, "Invalid page number")
	api.expect("page zero", "GET", "/search?t=tool&q=x&p=0", uuid.Nil, "", http.StatusBadRequest, "Page number must be >= 1")
	api.expect("unknown kind", "GET", "/search?t=nope&q=x", uuid.Nil, "", http.StatusBadRequest, "Unknown category")
	api.expect("page checked before kind", "GET", "/search?t=nope&q=x&p=abc", uuid.Nil, "", http.StatusBadRequest, "Invalid page number")
	// Was a 500: the offset 10*(p-1) wrapped negative and Postgres refused it.
	api.expect("page past int32 offset", "GET", "/search?t=tool&q=x&p=2147483647", uuid.Nil, "", http.StatusBadRequest, "Page number is too large")
	// The largest page that is allowed must also work against the database.
	if status, got := api.call("GET", "/search?t=post&q=x&p=214748365", uuid.Nil, ""); status != http.StatusOK || !strings.Contains(got, `"data":[]`) {
		t.Errorf("last allowed page: %d %q; want 200 and no results", status, got)
	}

	for _, kind := range []string{"post", "tool", "profile"} {
		for _, as := range []uuid.UUID{uuid.Nil, viewer} {
			status, got := api.call("GET", "/search?t="+kind+"&q=zzqqxxnomatchqqzz&p=3", as, "")
			want := `{"current_page":3,"data":[],"total_count":0,"total_pages":1,"type":"` + kind + `"}` + "\n"
			if status != http.StatusOK || got != want {
				t.Errorf("empty %s search (viewer %v): %d %q; want %q", kind, as, status, got, want)
			}
		}
	}

	// A real hit: counts and page arithmetic.
	name := scalar[string](t, tx, `SELECT name FROM tools ORDER BY id LIMIT 1`)
	status, got := api.call("GET", "/search?t=tool&q="+strings.ReplaceAll(name, " ", "+"), uuid.Nil, "")
	if status != http.StatusOK {
		t.Fatalf("tool search: %d %q", status, got)
	}
	var res struct {
		Type        string            `json:"type"`
		Data        []json.RawMessage `json:"data"`
		TotalCount  int64             `json:"total_count"`
		TotalPages  int32             `json:"total_pages"`
		CurrentPage int32             `json:"current_page"`
	}
	if err := json.Unmarshal([]byte(got), &res); err != nil {
		t.Fatal(err)
	}
	if res.TotalCount < 1 || len(res.Data) < 1 || len(res.Data) > 10 || res.CurrentPage != 1 || res.Type != "tool" {
		t.Errorf("search for %q = %d results, %d rows, page %d", name, res.TotalCount, len(res.Data), res.CurrentPage)
	}
	if want := int32((res.TotalCount + 9) / 10); res.TotalPages != want {
		t.Errorf("total_pages = %d for %d results; want %d", res.TotalPages, res.TotalCount, want)
	}
}
