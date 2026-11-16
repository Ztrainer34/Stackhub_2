package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/jwtauth/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"stackhub.com/stackhub/internal/testdb"
	"stackhub.com/stackhub/pkg/db"
)

// Integration tests for the admin role, against a REAL local Postgres (same
// rules as characterisation_integration_test.go: opt-in via TEST_DB_CONNECTION,
// local only, every write rolled back).
//
// admin_routes_test.go proves RequireAdmin sits in front of every /admin route
// with a stub checker. These prove the real thing: the admins table, the query
// behind the check, and what the clients can and cannot see of it.

// adminRoutePaths lists every /admin/ route of the real router, with a random
// uuid where the path has a parameter.
func adminRoutePaths(t *testing.T, api *testAPI) []walkedRoute {
	t.Helper()
	var out []walkedRoute
	for _, r := range walkRoutes(t, api.h) {
		if strings.HasPrefix(r.path, "/admin/") {
			r.path = routeParam.ReplaceAllString(r.path, uuid.NewString())
			out = append(out, r)
		}
	}
	if len(out) < 5 {
		t.Fatalf("found %d /admin/ routes; want at least 5", len(out))
	}
	return out
}

func bodyFor(method string) string {
	if method == http.MethodPost {
		return `{}`
	}
	return ""
}

func TestAdminRoutesCheckTheAdminsTableIntegration(t *testing.T) {
	conn := testdb.Open(t)
	tx := testdb.Begin(t, conn)
	api := newTestAPI(t, tx)
	admin, other := testdb.TwoProfiles(t, tx)
	testdb.MakeAdmin(t, tx, admin)
	testdb.NotAdmin(t, tx, other)

	for _, r := range adminRoutePaths(t, api) {
		name := r.method + " " + r.path
		if status, body := api.call(r.method, r.path, uuid.Nil, bodyFor(r.method)); status != http.StatusUnauthorized {
			t.Errorf("%s anonymous: %d %q; want 401", name, status, body)
		}
		if status, body := api.call(r.method, r.path, other, bodyFor(r.method)); status != http.StatusForbidden {
			t.Errorf("%s as a non-admin: %d %q; want 403", name, status, body)
		}
		if status, body := api.call(r.method, r.path, admin, bodyFor(r.method)); status == http.StatusUnauthorized || status == http.StatusForbidden {
			t.Errorf("%s as an admin: %d %q; want past the role check", name, status, body)
		}
	}
}

func TestNonAdminCannotRejectATicketIntegration(t *testing.T) {
	conn := testdb.Open(t)
	tx := testdb.Begin(t, conn)
	api := newTestAPI(t, tx)
	ctx := context.Background()
	q := db.New(tx)
	admin, other := testdb.TwoProfiles(t, tx)
	testdb.MakeAdmin(t, tx, admin)
	testdb.NotAdmin(t, tx, other)

	ticket, err := q.CreateStandaloneToolTicket(ctx, db.CreateStandaloneToolTicketParams{RequestedBy: other, ToolName: "Admin Role Test Tool"})
	if err != nil {
		t.Fatal(err)
	}
	path := "/admin/tool-tickets/" + ticket.String() + "/reject"
	state := func() (status string, resolvedBy *uuid.UUID) {
		if err := tx.QueryRow(ctx, `SELECT status, resolved_by FROM tool_tickets WHERE id = $1`, ticket).Scan(&status, &resolvedBy); err != nil {
			t.Fatal(err)
		}
		return status, resolvedBy
	}

	api.expect("non-admin rejects", "POST", path, other, "", http.StatusForbidden, "Forbidden")
	if status, by := state(); status != "pending" || by != nil {
		t.Errorf("after a refused reject the ticket is %q resolved_by %v; want pending and NULL", status, by)
	}

	if status, body := api.call("POST", path, admin, ""); status != http.StatusNoContent {
		t.Fatalf("admin rejects: %d %q; want 204", status, body)
	}
	if status, by := state(); status != "rejected" || by == nil || *by != admin {
		t.Errorf("after the admin's reject the ticket is %q resolved_by %v; want rejected by %v", status, by, admin)
	}
}

func TestMeReportsOnlyTheViewersOwnAdminStatusIntegration(t *testing.T) {
	conn := testdb.Open(t)
	tx := testdb.Begin(t, conn)
	api := newTestAPI(t, tx)
	admin, other := testdb.TwoProfiles(t, tx)
	testdb.MakeAdmin(t, tx, admin)
	testdb.NotAdmin(t, tx, other)

	me := func(as uuid.UUID) map[string]json.RawMessage {
		t.Helper()
		status, body := api.call("GET", "/me", as, "")
		if status != http.StatusOK {
			t.Fatalf("GET /me: %d %q", status, body)
		}
		var fields map[string]json.RawMessage
		if err := json.Unmarshal([]byte(body), &fields); err != nil {
			t.Fatalf("GET /me body %q: %v", body, err)
		}
		return fields
	}
	for _, c := range []struct {
		name string
		id   uuid.UUID
		want string
	}{{"non-admin", other, "false"}, {"admin", admin, "true"}} {
		fields := me(c.id)
		if got := string(fields["is_admin"]); got != c.want {
			t.Errorf("%s: is_admin = %q; want %q", c.name, got, c.want)
		}
		// The profile fields stay at the top level next to it.
		for _, key := range []string{"id", "username", "display_name"} {
			if _, ok := fields[key]; !ok {
				t.Errorf("%s: GET /me lost the top-level %q field", c.name, key)
			}
		}
	}

	// Nobody else ever learns it: not from the public profile, anonymous or not.
	slug := testdb.Scalar[string](t, tx, `SELECT username FROM profiles WHERE id = $1`, admin)
	for _, viewer := range []uuid.UUID{uuid.Nil, other, admin} {
		status, body := api.call("GET", "/user/"+slug, viewer, "")
		if status != http.StatusOK {
			t.Fatalf("GET /user/%s as %v: %d %q", slug, viewer, status, body)
		}
		if strings.Contains(body, "is_admin") {
			t.Errorf("GET /user/%s as %v exposes admin status: %q", slug, viewer, body)
		}
	}
}

// Revoking takes effect on the very next request: the role is read from the
// database every time and never cached.
func TestRevokedAdminIsRefusedOnTheNextRequestIntegration(t *testing.T) {
	conn := testdb.Open(t)
	tx := testdb.Begin(t, conn)
	api := newTestAPI(t, tx)
	admin, _ := testdb.TwoProfiles(t, tx)
	testdb.MakeAdmin(t, tx, admin)

	if status, body := api.call("GET", "/admin/tool-tickets", admin, ""); status != http.StatusOK {
		t.Fatalf("admin list: %d %q; want 200", status, body)
	}
	testdb.NotAdmin(t, tx, admin)
	if status, body := api.call("GET", "/admin/tool-tickets", admin, ""); status != http.StatusForbidden {
		t.Errorf("the request right after revoking: %d %q; want 403", status, body)
	}
}

func TestIsAdminQueryIntegration(t *testing.T) {
	conn := testdb.Open(t)
	tx := testdb.Begin(t, conn)
	ctx := context.Background()
	q := db.New(tx)
	admin, _ := testdb.TwoProfiles(t, tx)

	testdb.NotAdmin(t, tx, admin)
	for name, c := range map[string]struct {
		id   uuid.UUID
		want bool
	}{"no row": {admin, false}, "a random uuid": {uuid.New(), false}} {
		if got, err := q.IsAdmin(ctx, c.id); err != nil || got != c.want {
			t.Errorf("IsAdmin(%s) = %v, %v; want %v", name, got, err, c.want)
		}
	}
	testdb.MakeAdmin(t, tx, admin)
	if got, err := q.IsAdmin(ctx, admin); err != nil || !got {
		t.Errorf("IsAdmin after MakeAdmin = %v, %v; want true", got, err)
	}

	// A row for a profile that does not exist is refused by the foreign key.
	sp, err := tx.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer sp.Rollback(ctx)
	_, err = sp.Exec(ctx, `INSERT INTO admins (profile_id) VALUES ($1)`, uuid.New())
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "23503" {
		t.Errorf("admin row for a missing profile: %v; want a foreign key violation (23503)", err)
	}
}

// The Supabase REST API connects as anon / authenticated. Neither may touch the
// admins table: RLS is on with no policy, and the grants are revoked.
func TestAdminsTableIsClosedToTheSupabaseRolesIntegration(t *testing.T) {
	conn := testdb.Open(t)
	tx := testdb.Begin(t, conn)
	ctx := context.Background()
	admin, _ := testdb.TwoProfiles(t, tx)
	testdb.NotAdmin(t, tx, admin) // applies the migration inside the transaction

	if !testdb.Scalar[bool](t, tx, `SELECT relrowsecurity FROM pg_class WHERE oid = 'public.admins'::regclass`) {
		t.Error("row level security is off on admins")
	}
	if n := testdb.Scalar[int64](t, tx, `SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'admins'`); n != 0 {
		t.Errorf("admins has %d policies; want none", n)
	}

	tested := 0
	for _, role := range []string{"anon", "authenticated"} {
		if !testdb.Scalar[bool](t, tx, `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1)`, role) {
			t.Logf("role %s does not exist in this database; skipping it", role)
			continue
		}
		if testdb.Scalar[bool](t, tx, `SELECT has_table_privilege($1, 'public.admins', 'select,insert,update,delete')`, role) {
			t.Errorf("%s has a privilege on admins", role)
		}

		// Each attempt runs in its own savepoint, so a refusal does not poison
		// the next one and SET LOCAL ROLE is undone with it.
		attempt := func(sql string, args ...any) (denied bool, rows int64, err error) {
			sp, err := tx.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer sp.Rollback(ctx)
			if _, err := sp.Exec(ctx, "SET LOCAL ROLE "+role); err != nil {
				t.Skipf("cannot SET ROLE %s from this connection (%v)", role, err)
			}
			qerr := sp.QueryRow(ctx, sql, args...).Scan(&rows)
			var pgErr *pgconn.PgError
			return errors.As(qerr, &pgErr) && pgErr.Code == "42501", rows, qerr
		}
		tested++

		if denied, rows, err := attempt(`SELECT count(*) FROM admins`); !denied && (err != nil || rows != 0) {
			t.Errorf("%s SELECT on admins: rows %d, err %v; want permission denied (42501) or zero rows", role, rows, err)
		}
		if denied, _, err := attempt(`INSERT INTO admins (profile_id) VALUES ($1) RETURNING 1`, admin); !denied {
			t.Errorf("%s INSERT into admins: %v; want permission denied (42501)", role, err)
		}
	}
	if tested == 0 {
		t.Skip("neither the anon nor the authenticated role exists here (not a Supabase database)")
	}
}

// The same question asked over the wire: the local Supabase REST and GraphQL
// endpoints, as anon and as an authenticated user. Opt-in on top of the database
// opt-in, because it needs the local stack's keys, which this repo never stores:
//
//	TEST_SUPABASE_URL         default http://127.0.0.1:54321 (local only)
//	TEST_SUPABASE_ANON_KEY    the local anon key
//	TEST_SUPABASE_JWT_SECRET  the local JWT secret (for the authenticated probes)
func TestAdminsTableIsNotReachableOverSupabaseRESTIntegration(t *testing.T) {
	testdb.Open(t) // same local-database guard as every integration test

	base := os.Getenv("TEST_SUPABASE_URL")
	if base == "" {
		base = "http://127.0.0.1:54321"
	}
	u, err := url.Parse(base)
	if err != nil || (u.Hostname() != "127.0.0.1" && u.Hostname() != "localhost") {
		t.Fatalf("TEST_SUPABASE_URL must point at the local stack, got %q", base)
	}
	anonKey := os.Getenv("TEST_SUPABASE_ANON_KEY")
	if anonKey == "" {
		t.Skip("TEST_SUPABASE_ANON_KEY not set — skipping the REST and GraphQL probes")
	}
	client := &http.Client{Timeout: 5 * time.Second}
	if resp, err := client.Get(base + "/rest/v1/"); err != nil {
		t.Skipf("local Supabase REST endpoint not reachable (%v) — skipping", err)
	} else {
		resp.Body.Close()
	}

	keys := map[string]string{"anon": anonKey}
	if secret := os.Getenv("TEST_SUPABASE_JWT_SECRET"); secret != "" {
		claims := map[string]interface{}{"sub": uuid.NewString(), "role": "authenticated", "aud": "authenticated"}
		jwtauth.SetExpiryIn(claims, time.Hour)
		_, token, err := jwtauth.New("HS256", []byte(secret), []byte(secret)).Encode(claims)
		if err != nil {
			t.Fatal(err)
		}
		keys["authenticated"] = token
	} else {
		t.Log("TEST_SUPABASE_JWT_SECRET not set — probing as anon only")
	}

	send := func(method, path, key, body string) (int, string) {
		req, err := http.NewRequest(method, base+path, bytes.NewBufferString(body))
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("apikey", anonKey)
		req.Header.Set("Authorization", "Bearer "+key)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Prefer", "return=representation")
		resp, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		raw, _ := io.ReadAll(resp.Body)
		return resp.StatusCode, string(raw)
	}

	// The profile id is random, so even a write that got through would hit the
	// foreign key and leave nothing behind.
	ghost := uuid.NewString()
	for role, key := range keys {
		if status, body := send("GET", "/rest/v1/admins?select=*", key, ""); status == http.StatusOK && strings.TrimSpace(body) != "[]" {
			t.Errorf("%s GET /rest/v1/admins: %d %q; want a refusal or an empty list", role, status, body)
		}
		status, body := send("POST", "/rest/v1/admins", key, `{"profile_id":"`+ghost+`"}`)
		if status != http.StatusUnauthorized && status != http.StatusForbidden && status != http.StatusNotFound {
			t.Errorf("%s POST /rest/v1/admins: %d %q; want 401, 403 or 404", role, status, body)
		}

		if status, body := send("POST", "/graphql/v1", key, `{"query":"{ adminsCollection { edges { node { profile_id } } } }"}`); status == http.StatusOK && strings.Contains(body, `"edges":[{`) {
			t.Errorf("%s GraphQL read of admins returned rows: %q", role, body)
		}
		if status, body := send("POST", "/graphql/v1", key, `{"query":"mutation { insertIntoadminsCollection(objects: [{profile_id: \"`+ghost+`\"}]) { affectedCount } }"}`); status == http.StatusOK && strings.Contains(body, `"affectedCount":1`) {
			t.Errorf("%s GraphQL write to admins succeeded: %q", role, body)
		}
	}
}

// A tool-approved notification names nobody: its actor is NULL, the admin's
// username and id appear nowhere in what the requester receives, and it still
// shows in both the notifications list and the feed.
func TestToolApprovedNotificationHasNoActorIntegration(t *testing.T) {
	conn := testdb.Open(t)
	tx := testdb.Begin(t, conn)
	api := newTestAPI(t, tx)
	ctx := context.Background()
	q := db.New(tx)
	requester, admin := testdb.TwoProfiles(t, tx)
	testdb.MakeAdmin(t, tx, admin)
	tool := testdb.SomeTools(t, tx, 1)[0]
	adminName := testdb.Scalar[string](t, tx, `SELECT username FROM profiles WHERE id = $1`, admin)

	// A clean slate: nothing else unread for the requester, no earlier approval
	// of this tool inside the dedupe window.
	if _, err := tx.Exec(ctx, `DELETE FROM notifications WHERE recipient_id = $1 AND type = 'tool_approved'`, requester); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `UPDATE notifications SET is_read = true WHERE recipient_id = $1`, requester); err != nil {
		t.Fatal(err)
	}

	newTicket := func(name string) uuid.UUID {
		t.Helper()
		id, err := q.CreateStandaloneToolTicket(ctx, db.CreateStandaloneToolTicketParams{RequestedBy: requester, ToolName: name})
		if err != nil {
			t.Fatal(err)
		}
		return id
	}
	resolve := func(ticket uuid.UUID) {
		t.Helper()
		status, body := api.call("POST", "/admin/tool-tickets/"+ticket.String()+"/resolve-existing", admin, `{"tool_id":"`+tool.String()+`"}`)
		if status != http.StatusNoContent {
			t.Fatalf("resolve: %d %q", status, body)
		}
	}
	approvals := func() int64 {
		return testdb.Scalar[int64](t, tx, `SELECT count(*) FROM notifications WHERE recipient_id = $1 AND type = 'tool_approved'`, requester)
	}

	resolve(newTicket("No Actor Tool"))

	if n := testdb.Scalar[int64](t, tx, `SELECT count(*) FROM notifications WHERE recipient_id = $1 AND type = 'tool_approved' AND actor_id IS NULL`, requester); n != 1 {
		t.Fatalf("approvals with a NULL actor = %d; want 1", n)
	}

	// The notifications list.
	status, body := api.call("GET", "/notifications?limit=50", requester, "")
	if status != http.StatusOK {
		t.Fatalf("GET /notifications: %d %q", status, body)
	}
	var list struct {
		Notifications []map[string]json.RawMessage `json:"notifications"`
	}
	if err := json.Unmarshal([]byte(body), &list); err != nil {
		t.Fatalf("notifications body %q: %v", body, err)
	}
	var found map[string]json.RawMessage
	for _, n := range list.Notifications {
		if string(n["type"]) == `"tool_approved"` {
			found = n
		}
	}
	if found == nil {
		t.Fatalf("the approval is missing from GET /notifications: %q", body)
	}
	if string(found["actor_id"]) != "null" || string(found["actor_username"]) != "null" || string(found["actor_display_name"]) != "null" {
		t.Errorf("approval actor fields = %s %s %s; want all null", found["actor_id"], found["actor_username"], found["actor_display_name"])
	}
	raw, _ := json.Marshal(found)
	if strings.Contains(string(raw), adminName) || strings.Contains(string(raw), admin.String()) {
		t.Errorf("the approval names its resolver: %s", raw)
	}

	// The feed keeps the row, with no actor either.
	status, body = api.call("GET", "/feed?limit=50", requester, "")
	if status != http.StatusOK {
		t.Fatalf("GET /feed: %d %q", status, body)
	}
	var feed struct {
		Items []map[string]json.RawMessage `json:"items"`
	}
	if err := json.Unmarshal([]byte(body), &feed); err != nil {
		t.Fatalf("feed body %q: %v", body, err)
	}
	var item map[string]json.RawMessage
	for _, it := range feed.Items {
		if string(it["reason"]) == `"tool_approved"` {
			item = it
		}
	}
	if item == nil {
		t.Fatalf("the approval is missing from GET /feed: %q", body)
	}
	if string(item["actor_id"]) != "null" || string(item["actor_username"]) != "null" {
		t.Errorf("feed approval actor fields = %s %s; want null", item["actor_id"], item["actor_username"])
	}
	raw, _ = json.Marshal(item)
	if strings.Contains(string(raw), adminName) || strings.Contains(string(raw), admin.String()) {
		t.Errorf("the feed approval names its resolver: %s", raw)
	}

	// The one-hour dedupe still works with a NULL actor: approving the same
	// tool again for the same person does not notify twice.
	resolve(newTicket("No Actor Tool Again"))
	if n := approvals(); n != 1 {
		t.Errorf("approvals after a second approval of the same tool = %d; want 1", n)
	}
}

// What a resolver may and may not do stays exactly as it was: even an admin
// cannot un-hide a tool, take over a hidden tool's page, or plant a script URL.
func TestAdminResolutionLimitsIntegration(t *testing.T) {
	conn := testdb.Open(t)
	tx := testdb.Begin(t, conn)
	api := newTestAPI(t, tx)
	ctx := context.Background()
	q := db.New(tx)
	requester, admin := testdb.TwoProfiles(t, tx)
	testdb.MakeAdmin(t, tx, admin)

	newTicket := func(name string) uuid.UUID {
		t.Helper()
		id, err := q.CreateStandaloneToolTicket(ctx, db.CreateStandaloneToolTicketParams{RequestedBy: requester, ToolName: name})
		if err != nil {
			t.Fatal(err)
		}
		return id
	}

	hidden := testdb.Scalar[uuid.UUID](t, tx, `INSERT INTO tools (name, hidden_at, hidden_batch) VALUES ('Zqx Admin Limits Hidden', now(), 'admin-test') RETURNING id`)

	// Resolving with a hidden tool links it but leaves it hidden.
	ticket := newTicket("Hidden Link Request")
	if status, body := api.call("POST", "/admin/tool-tickets/"+ticket.String()+"/resolve-existing", admin, `{"tool_id":"`+hidden.String()+`"}`); status != http.StatusNoContent {
		t.Fatalf("resolve with a hidden tool: %d %q", status, body)
	}
	if n := testdb.Scalar[int64](t, tx, `SELECT count(*) FROM tools WHERE id = $1 AND hidden_at IS NOT NULL AND hidden_batch = 'admin-test'`, hidden); n != 1 {
		t.Error("approving a ticket with a hidden tool un-hid it")
	}

	// A new tool whose name is the hidden tool's slug is refused.
	ticket = newTicket("Hidden Name Request")
	api.expect("name of a hidden tool", "POST", "/admin/tool-tickets/"+ticket.String()+"/resolve-new", admin,
		`{"name":"Zqx Admin Limits Hidden","logo_url":"https://x.example/l.png"}`,
		http.StatusConflict, "A tool with this name already exists. Resolve the suggestion with the existing tool instead.")

	// Script URLs are refused as logos.
	for _, logo := range []string{"javascript:alert(1)", "data:text/html,x"} {
		api.expect("logo "+logo, "POST", "/admin/tool-tickets/"+ticket.String()+"/resolve-new", admin,
			`{"name":"Zqx Admin Limits New","logo_url":"`+logo+`"}`,
			http.StatusBadRequest, "Logo URL must be an http or https address")
	}
	if status := testdb.Scalar[string](t, tx, `SELECT status FROM tool_tickets WHERE id = $1`, ticket); status != "pending" {
		t.Errorf("ticket status %q after refused resolutions; want pending", status)
	}
}
