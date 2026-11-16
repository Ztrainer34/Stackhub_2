package main

import (
	"context"
	"errors"
	"go/ast"
	"go/parser"
	"go/token"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/go-chi/chi"
	"github.com/go-chi/jwtauth/v5"
	"github.com/google/uuid"
)

// What follows guards the /admin role check from the outside: through the route
// table and through real requests, so it holds however the routes are mounted.
// None of it needs a database.

// adminHandlers are the handlers that must only ever run behind RequireAdmin.
var adminHandlers = []string{
	"ticket.(*Handler).ListToolTickets",
	"ticket.(*Handler).GetToolTicket",
	"ticket.(*Handler).ResolveTicketWithExisting",
	"ticket.(*Handler).ResolveTicketWithNew",
	"ticket.(*Handler).RejectTicket",
}

type walkedRoute struct {
	method, path, handler string
	chain                 []string
}

func (r walkedRoute) hasRequireAdmin() bool {
	for _, mw := range r.chain {
		if strings.Contains(mw, "RequireAdmin") {
			return true
		}
	}
	return false
}

func walkRoutes(t *testing.T, router http.Handler) []walkedRoute {
	t.Helper()
	routes, ok := router.(chi.Routes)
	if !ok {
		t.Fatalf("routes() returned %T, which chi cannot walk", router)
	}
	var out []walkedRoute
	err := chi.Walk(routes, func(method, route string, handler http.Handler, middlewares ...func(http.Handler) http.Handler) error {
		wr := walkedRoute{method: method, path: route, handler: shortFuncName(handler)}
		for _, mw := range middlewares {
			wr.chain = append(wr.chain, shortFuncName(mw))
		}
		out = append(out, wr)
		return nil
	})
	if err != nil {
		t.Fatalf("walk routes: %v", err)
	}
	return out
}

// RequireAdmin is in the chain of every /admin/ route and of nothing else, and
// the admin handlers are reachable through no other route. A route moved back
// into the private group, or an admin handler mounted a second time elsewhere,
// fails here.
func TestAdminRoutesAreBehindRequireAdmin(t *testing.T) {
	router := (&App{}).routes(jwtauth.New("HS256", []byte("admin-route-test"), nil))
	routes := walkRoutes(t, router)

	adminRoutes := 0
	for _, r := range routes {
		isAdminPath := strings.HasPrefix(r.path, "/admin/")
		if isAdminPath {
			adminRoutes++
		}
		if isAdminPath != r.hasRequireAdmin() {
			t.Errorf("%s %s: RequireAdmin in chain = %v, but the path under /admin/ = %v (chain: %s)",
				r.method, r.path, r.hasRequireAdmin(), isAdminPath, strings.Join(r.chain, " > "))
		}
		for _, h := range adminHandlers {
			if r.handler == h && !r.hasRequireAdmin() {
				t.Errorf("%s %s serves %s without RequireAdmin", r.method, r.path, h)
			}
		}
	}
	if adminRoutes < 5 {
		t.Fatalf("found %d /admin/ routes; want at least 5 (the walk is not seeing them)", adminRoutes)
	}

	// Every admin handler is mounted at least once, so the check above is not
	// passing because a handler vanished from the table.
	for _, h := range adminHandlers {
		found := false
		for _, r := range routes {
			found = found || r.handler == h
		}
		if !found {
			t.Errorf("%s is not mounted on any route", h)
		}
	}
}

// adminRequest sends one request to the router, with a validly signed and
// onboarded token for as (none for uuid.Nil), and returns the status and body.
// A panic past the Recoverer (it happens on some Windows paths) means the
// request got into a handler, which reports as reached.
func adminRequest(router http.Handler, auth *jwtauth.JWTAuth, method, path string, as uuid.UUID) (status int, body string, reached bool) {
	defer func() {
		if recover() != nil {
			status, body, reached = http.StatusInternalServerError, "", true
		}
	}()
	req := httptest.NewRequest(method, path, strings.NewReader("{}"))
	req.Header.Set("Content-Type", "application/json")
	if as != uuid.Nil {
		_, token, err := auth.Encode(map[string]interface{}{
			"sub":          as.String(),
			"app_metadata": map[string]interface{}{"onboarded": true},
		})
		if err != nil {
			panic(err)
		}
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec.Code, rec.Body.String(), false
}

// The measured check: a signed-in, onboarded user who is not an admin gets a 403
// from every /admin/ route, an anonymous caller a 401, and an admin gets past.
// It does not read the route table, so it holds whatever the mounting style.
func TestAdminRoutesRejectNonAdmins(t *testing.T) {
	restore := silenceServerOutput(t)
	defer restore()

	user := uuid.New()
	var asked []uuid.UUID
	isAdmin := false
	var checkErr error
	app := &App{isAdmin: func(_ context.Context, id uuid.UUID) (bool, error) {
		asked = append(asked, id)
		return isAdmin, checkErr
	}}
	auth := jwtauth.New("HS256", []byte("admin-route-test"), nil)
	router := app.routes(auth)

	var adminRoutes []walkedRoute
	for _, r := range walkRoutes(t, router) {
		if strings.HasPrefix(r.path, "/admin/") {
			adminRoutes = append(adminRoutes, r)
		}
	}
	if len(adminRoutes) < 5 {
		t.Fatalf("found %d /admin/ routes; want at least 5", len(adminRoutes))
	}

	for _, r := range adminRoutes {
		path := routeParam.ReplaceAllString(r.path, uuid.NewString())
		name := r.method + " " + r.path

		asked = nil
		if status, _, _ := adminRequest(router, auth, r.method, path, uuid.Nil); status != http.StatusUnauthorized {
			t.Errorf("%s anonymous: %d; want 401", name, status)
		}
		if len(asked) != 0 {
			t.Errorf("%s: the admin check ran for an anonymous caller", name)
		}

		isAdmin, checkErr, asked = false, nil, nil
		status, body, reached := adminRequest(router, auth, r.method, path, user)
		if status != http.StatusForbidden || body != "Forbidden\n" || reached {
			t.Errorf("%s as a non-admin: %d %q (reached handler: %v); want 403 %q", name, status, body, reached, "Forbidden\n")
		}
		if len(asked) != 1 || asked[0] != user {
			t.Errorf("%s: the admin check was asked about %v; want exactly [%v]", name, asked, user)
		}

		isAdmin, checkErr = true, errors.New("database is down")
		if status, _, reached := adminRequest(router, auth, r.method, path, user); status != http.StatusInternalServerError || reached {
			t.Errorf("%s when the admin check fails: %d (reached handler: %v); want 500 and not reached", name, status, reached)
		}

		// Positive control: the 403 above comes from the check, not from
		// something else in front of the route.
		isAdmin, checkErr = true, nil
		status, _, reached = adminRequest(router, auth, r.method, path, user)
		if !reached && (status == http.StatusUnauthorized || status == http.StatusForbidden) {
			t.Errorf("%s as an admin: %d; want past the role check", name, status)
		}
	}
}

// The admin role's table is the whole point: if it is ever created without row
// level security, or the revoke comes first, the Supabase REST API could read or
// write it.
func TestAdminMigrationLocksTheTableDown(t *testing.T) {
	sql := readMigration(t, "20261116120000_admin_role.sql")
	up := sql[:strings.Index(sql, "-- +goose Down")]

	create := strings.Index(up, "CREATE TABLE IF NOT EXISTS admins")
	rls := strings.Index(up, "ALTER TABLE admins ENABLE ROW LEVEL SECURITY")
	revoke := strings.Index(up, "REVOKE ALL ON TABLE admins FROM PUBLIC, anon, authenticated")
	if create < 0 || rls < 0 || revoke < 0 {
		t.Fatalf("the Up section needs CREATE TABLE (%d), ENABLE ROW LEVEL SECURITY (%d) and REVOKE ALL ... FROM PUBLIC, anon, authenticated (%d)", create, rls, revoke)
	}
	if !(create < rls && rls < revoke) {
		t.Errorf("order must be CREATE (%d) -> ENABLE RLS (%d) -> REVOKE (%d)", create, rls, revoke)
	}
	for _, line := range strings.Split(up, "\n") {
		code := strings.TrimSpace(line)
		if strings.HasPrefix(code, "--") {
			continue
		}
		if strings.Contains(strings.ToLower(code), "service_role") {
			t.Errorf("the migration must not touch service_role: %q", code)
		}
		if strings.Contains(strings.ToUpper(code), "CREATE POLICY") {
			t.Errorf("admins must have no policies: %q", code)
		}
	}
}

// The access token is signed by Supabase and carries claims the backend trusts.
// Admin status must not be one of them: it would outlive a revocation.
func TestTokenHookDoesNotKnowAboutAdmins(t *testing.T) {
	hook := regexp.MustCompile(`(?is)CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+(public\.)?custom_access_token_hook.*?\$\$.*?\$\$`)
	files, err := filepath.Glob(filepath.Join("..", "..", "db", "migrations", "*.sql"))
	if err != nil || len(files) == 0 {
		t.Fatalf("no migrations found (%v)", err)
	}
	seen := 0
	for _, file := range files {
		sql := readMigration(t, filepath.Base(file))
		for _, def := range hook.FindAllString(sql, -1) {
			seen++
			if strings.Contains(strings.ToLower(def), "admin") {
				t.Errorf("%s: custom_access_token_hook mentions admin; admin status must not be put in the token", filepath.Base(file))
			}
		}
	}
	if seen == 0 {
		t.Fatal("no definition of custom_access_token_hook found; the guard is blind")
	}
}

// readMigration returns a migration file with LF line endings (the working tree
// is CRLF on Windows).
func readMigration(t *testing.T, name string) string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "..", "db", "migrations", name))
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	return strings.ReplaceAll(string(raw), "\r\n", "\n")
}

// Admin status has exactly two readers: the check in front of /admin, and the
// viewer's own GET /me. A call from anywhere else is a way to leak it or to
// build a second, different gate.
func TestIsAdminIsCalledOnlyFromTheGateAndMe(t *testing.T) {
	allowed := map[string]bool{
		filepath.Join("cmd", "server", "main.go"):       true,
		filepath.Join("internal", "user", "handler.go"): true,
	}
	root := filepath.Join("..", "..")
	found := map[string]bool{}
	for _, dir := range []string{"cmd", "internal", "pkg"} {
		err := filepath.WalkDir(filepath.Join(root, dir), func(path string, d os.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if d.IsDir() {
				if path == filepath.Join(root, "pkg", "db") {
					return filepath.SkipDir // generated: it defines IsAdmin
				}
				return nil
			}
			if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
				return nil
			}
			f, err := parser.ParseFile(token.NewFileSet(), path, nil, 0)
			if err != nil {
				return err
			}
			rel, _ := filepath.Rel(root, path)
			ast.Inspect(f, func(n ast.Node) bool {
				if sel, ok := n.(*ast.SelectorExpr); ok && sel.Sel.Name == "IsAdmin" {
					found[rel] = true
					if !allowed[rel] {
						t.Errorf("%s calls IsAdmin; only the /admin gate (cmd/server/main.go) and GET /me may", rel)
					}
				}
				return true
			})
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	for file := range allowed {
		if !found[file] {
			t.Errorf("%s no longer calls IsAdmin; the guard is out of date or blind", file)
		}
	}
}
