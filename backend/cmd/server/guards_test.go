package main

import (
	"go/ast"
	"go/parser"
	"go/token"
	"path/filepath"
	"strings"
	"testing"
)

// Guards that read the source rather than run it, because the property they
// check is about which code calls what. Each one fails — never skips — when a
// file or handler it guards is missing, so a rename cannot make it go quietly
// blind.

const internalDir = "../../internal"

// The services are what makes the business rules testable without HTTP. That
// holds only while they stay free of it: a service that imports net/http, chi
// or httpx can start reading requests and writing responses, and is a handler
// again. Return an apperr instead; the handler writes it.
func TestServicesDoNotImportHTTP(t *testing.T) {
	services := []string{"post", "ticket", "tool", "search"}
	banned := map[string]bool{
		`"net/http"`:                             true,
		`"github.com/go-chi/chi"`:                true,
		`"github.com/go-chi/chi/v5"`:             true,
		`"github.com/go-chi/jwtauth/v5"`:         true,
		`"stackhub.com/stackhub/pkg/middleware"`: true,
		`"stackhub.com/stackhub/internal/httpx"`: true,
	}
	for _, module := range services {
		file := filepath.Join(internalDir, module, "service.go")
		f, err := parser.ParseFile(token.NewFileSet(), file, nil, parser.ImportsOnly)
		if err != nil {
			t.Fatalf("%s: %v", file, err) // a renamed service must be renamed here too
		}
		for _, imp := range f.Imports {
			if banned[imp.Path.Value] {
				t.Errorf("%s imports %s — keep HTTP in the handler and return an apperr instead", file, imp.Path.Value)
			}
		}
	}
}

// CachePublic is the one mistake in this area that is a security bug rather
// than a performance one: marking a response public when it varies by who
// asked for it lets a shared cache serve one person's starred, stacked or owned
// state to the next.
//
// The rule is derived from the code, not from a list: any handler that reads
// who is calling (httpx.UserID or httpx.UserIDIfPresent, directly or through
// another method of its module's Handler) must not call httpx.CachePublic. A
// hand-kept list of "per-viewer handlers" silently missed the ones nobody
// thought to add.
func TestCachePublicIsNotAppliedToPerViewerResponses(t *testing.T) {
	handlers := scanHandlers(t)

	// The scan must see what it guards. These handlers are known to vary by
	// viewer; if the scan stops recognising them, it has gone blind.
	// (ListUserStarredPosts was on the old hand-kept list but lists one user's
	// starred PUBLISHED posts and never reads the caller.)
	for _, known := range []string{
		"tool.GetTool", "user.GetUser", "post.GetPost", "post.GetUserPost",
		"post.ListUserPosts", "search.Search", "feed.GetFeed", "feed.GetTopPosts",
		"post.GetPostContent", "user.ListFollowers", "user.ListFollowing",
	} {
		if !handlers.reads(known, "UserID", "UserIDIfPresent") {
			t.Errorf("%s is not seen reading the viewer — the scan is broken, or the handler was renamed", known)
		}
	}
	if len(handlers.calls) < 78 {
		t.Fatalf("only %d Handler methods found under %s — the scan is not seeing the modules", len(handlers.calls), internalDir)
	}

	for name := range handlers.calls {
		if handlers.reads(name, "UserID", "UserIDIfPresent") && handlers.reads(name, "CachePublic") {
			t.Errorf("%s varies by viewer but calls CachePublic — a shared cache "+
				"would serve one user's state to another", name)
		}
	}
}

// handlerScan records, for every method of a module's Handler, which httpx
// functions and which other methods of the same Handler it calls.
type handlerScan struct {
	calls map[string]map[string]bool // "post.GetPost" -> {"httpx.UserIDIfPresent", "h:post.helper"}
}

// reads reports whether name calls any of httpx.<fns>, following calls to
// other methods of the same Handler.
func (s handlerScan) reads(name string, fns ...string) bool {
	seen := map[string]bool{}
	var walk func(string) bool
	walk = func(n string) bool {
		if seen[n] {
			return false
		}
		seen[n] = true
		for call := range s.calls[n] {
			for _, fn := range fns {
				if call == "httpx."+fn {
					return true
				}
			}
			if strings.HasPrefix(call, "h:") && walk(strings.TrimPrefix(call, "h:")) {
				return true
			}
		}
		return false
	}
	return walk(name)
}

func scanHandlers(t *testing.T) handlerScan {
	t.Helper()
	paths, err := filepath.Glob(filepath.Join(internalDir, "*", "*.go"))
	if err != nil || len(paths) == 0 {
		t.Fatalf("no module sources under %s (%v)", internalDir, err)
	}
	s := handlerScan{calls: map[string]map[string]bool{}}
	for _, path := range paths {
		if strings.HasSuffix(path, "_test.go") {
			continue
		}
		module := filepath.Base(filepath.Dir(path))
		f, err := parser.ParseFile(token.NewFileSet(), path, nil, 0)
		if err != nil {
			t.Fatalf("%s: %v", path, err)
		}
		for _, decl := range f.Decls {
			fn, ok := decl.(*ast.FuncDecl)
			if !ok || fn.Recv == nil || len(fn.Recv.List) != 1 || fn.Body == nil {
				continue
			}
			star, ok := fn.Recv.List[0].Type.(*ast.StarExpr)
			if !ok {
				continue
			}
			if id, ok := star.X.(*ast.Ident); !ok || id.Name != "Handler" {
				continue
			}
			name := module + "." + fn.Name.Name
			calls := map[string]bool{}
			ast.Inspect(fn.Body, func(n ast.Node) bool {
				sel, ok := n.(*ast.SelectorExpr)
				if !ok {
					return true
				}
				if x, ok := sel.X.(*ast.Ident); ok {
					switch {
					case x.Name == "httpx":
						calls["httpx."+sel.Sel.Name] = true
					case len(fn.Recv.List[0].Names) == 1 && x.Name == fn.Recv.List[0].Names[0].Name:
						calls["h:"+module+"."+sel.Sel.Name] = true
					}
				}
				return true
			})
			s.calls[name] = calls
		}
	}
	return s
}
