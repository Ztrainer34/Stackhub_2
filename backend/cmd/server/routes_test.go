package main

import (
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"testing"

	"github.com/go-chi/chi"
	"github.com/go-chi/jwtauth/v5"
)

var updateRoutes = flag.Bool("update-routes", false, "rewrite testdata/routes.golden from the current router")

// TestRouteTable pins every route: its method, path, the handler it calls, and
// the middleware chain in front of it.
//
// The middleware column is the point. A route registered in the wrong group
// still compiles and still answers — it just runs with the wrong authentication.
// That has reached production here before: /user/{slug} sat in the public group,
// so the viewer was never known and the Follow button always read "Follow".
// Moving handlers between files and packages is exactly when that happens, so
// this fails on any route that changes group, handler or path.
//
// Two columns describe protection, because neither is enough alone:
//
//   - The middleware chain is what chi.Walk reports. It distinguishes optional
//     from public routes, but it UNDER-REPORTS for sub-routers mounted with
//     r.Route(...): the enclosing group's auth is baked into the mount handler,
//     so /admin/* lists no auth middleware even though it has it.
//   - "anon" is measured, not read: an anonymous request is sent through the real
//     router, and a 401 means the route refuses it. That is ground truth for
//     whether a route requires a signed-in user, mounted or not.
//
// After an intentional route change, regenerate the snapshot and review the diff:
//
//	go test ./cmd/server/ -run TestRouteTable -update-routes
func TestRouteTable(t *testing.T) {
	app := &App{}
	router := app.routes(jwtauth.New("HS256", []byte("route-table-test"), nil))

	routes, ok := router.(chi.Routes)
	if !ok {
		t.Fatalf("routes() returned %T, which chi cannot walk", router)
	}

	// Handlers run below with no database, so most of them panic and the
	// Recoverer turns that into a 500. That is expected; silence the stack traces
	// and request logs so a real failure stays readable.
	restore := silenceServerOutput(t)
	defer restore()

	var lines []string
	err := chi.Walk(routes, func(method, route string, handler http.Handler, middlewares ...func(http.Handler) http.Handler) error {
		chain := make([]string, len(middlewares))
		for i, mw := range middlewares {
			chain[i] = shortFuncName(mw)
		}
		lines = append(lines, fmt.Sprintf("%-6s %-44s %-34s anon:%-6s %s",
			method, route, shortFuncName(handler), anonymousAccess(router, method, route),
			strings.Join(chain, " > ")))
		return nil
	})
	if err != nil {
		t.Fatalf("walk routes: %v", err)
	}
	sort.Strings(lines)
	got := strings.Join(lines, "\n") + "\n"

	const golden = "testdata/routes.golden"
	if *updateRoutes {
		if err := os.MkdirAll("testdata", 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(golden, []byte(got), 0o644); err != nil {
			t.Fatal(err)
		}
		t.Logf("wrote %d routes to %s", len(lines), golden)
		return
	}

	raw, err := os.ReadFile(golden)
	if err != nil {
		t.Fatalf("read %s (run with -update-routes to create it): %v", golden, err)
	}
	// Normalised: core.autocrlf=true checks the golden file out with CRLF on
	// Windows, which would fail this on every line while nothing has changed.
	want := strings.ReplaceAll(string(raw), "\r\n", "\n")

	if got != want {
		t.Errorf("route table changed. Review, then regenerate with -update-routes if intended.\n%s",
			lineDiff(want, got))
	}
}

// shortFuncName turns a func value into something readable in a snapshot:
// "stackhub.com/stackhub/cmd/server.(*App).getTool-fm" becomes "(*App).getTool".
func shortFuncName(fn any) string {
	name := runtime.FuncForPC(reflect.ValueOf(fn).Pointer()).Name()
	if i := strings.LastIndex(name, "/"); i >= 0 {
		name = name[i+1:]
	}
	name = strings.TrimSuffix(name, "-fm")
	if i := strings.Index(name, "."); i >= 0 && strings.HasPrefix(name, "server.") {
		name = name[i+1:]
	}
	return name
}

// lineDiff lists lines present in only one of two snapshots, so a failure says
// which routes moved rather than dumping both tables.
func lineDiff(want, got string) string {
	inWant := map[string]bool{}
	for _, l := range strings.Split(want, "\n") {
		inWant[l] = true
	}
	inGot := map[string]bool{}
	for _, l := range strings.Split(got, "\n") {
		inGot[l] = true
	}
	var b strings.Builder
	for _, l := range strings.Split(want, "\n") {
		if l != "" && !inGot[l] {
			b.WriteString("  - " + l + "\n")
		}
	}
	for _, l := range strings.Split(got, "\n") {
		if l != "" && !inWant[l] {
			b.WriteString("  + " + l + "\n")
		}
	}
	return b.String()
}

// anonymousAccess sends a request with no credentials through the full router
// and reports "401" if it is refused, or "open" if it reaches past auth. Path
// parameters are filled with a placeholder; nothing here touches a database.
func anonymousAccess(router http.Handler, method, route string) (access string) {
	// A handler with no database panics. If chi's Recoverer then crashes while
	// pretty-printing the stack — it does, on some Windows paths — the panic
	// escapes the router. Either way the request reached a handler, which means
	// it got past authentication: auth refuses before any handler runs.
	defer func() {
		if recover() != nil {
			access = "open"
		}
	}()

	path := routeParam.ReplaceAllString(route, "x")
	path = strings.ReplaceAll(path, "*", "x")

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(method, path, nil))

	if rec.Code == http.StatusUnauthorized {
		return "401"
	}
	return "open"
}

var routeParam = regexp.MustCompile(`\{[^}]*\}`)

// silenceServerOutput mutes the request logger and the Recoverer's stack traces
// for the duration of a test, and returns a func that restores both.
func silenceServerOutput(t *testing.T) func() {
	t.Helper()
	devNull, err := os.Open(os.DevNull)
	if err != nil {
		t.Fatalf("open %s: %v", os.DevNull, err)
	}
	prevStderr, prevLog := os.Stderr, log.Writer()
	os.Stderr = devNull
	log.SetOutput(io.Discard)
	return func() {
		os.Stderr = prevStderr
		log.SetOutput(prevLog)
		devNull.Close()
	}
}
