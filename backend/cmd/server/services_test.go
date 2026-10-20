package main

import (
	"errors"
	"go/parser"
	"go/token"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/google/uuid"
	"stackhub.com/stackhub/pkg/post"
)

// Unit tests for the rules that moved out of the handlers into the services.
// No database and no HTTP: that they can be tested this way is the point of
// the move. The database side runs in characterisation_integration_test.go and
// services_integration_test.go.

// wantServiceError checks err is a serviceError with this status and text.
func wantServiceError(t *testing.T, name string, err error, status int, msg string) {
	t.Helper()
	var se *serviceError
	if !errors.As(err, &se) {
		t.Errorf("%s: err = %v; want a %d %q", name, err, status, msg)
		return
	}
	if se.status != status || se.msg != msg {
		t.Errorf("%s: got %d %q; want %d %q", name, se.status, se.msg, status, msg)
	}
}

func TestValidateNewPost(t *testing.T) {
	tool := uuid.New()
	tools := func(n int) []uuid.UUID {
		out := make([]uuid.UUID, n)
		for i := range out {
			out[i] = uuid.New()
		}
		return out
	}
	suggest := func(n int) []post.CreateSuggestedToolForm {
		out := make([]post.CreateSuggestedToolForm, n)
		for i := range out {
			out[i] = post.CreateSuggestedToolForm{Name: "Tool " + strconv.Itoa(i)}
		}
		return out
	}
	type form = post.CreatePostWithSuggestedToolsForm

	rejected := []struct {
		name string
		form form
		msg  string
	}{
		{"blank name", form{Type: "playbook", Name: " \t ", Tools: []uuid.UUID{tool}}, "Post name cannot be empty"},
		{"blank name is reported before missing tools", form{Type: "nope", Name: ""}, "Post name cannot be empty"},
		{"201-character name", form{Type: "playbook", Name: strings.Repeat("é", 201), Tools: []uuid.UUID{tool}}, "Post name must be at most 200 characters"},
		{"1001-character goal", form{Type: "playbook", Name: "x", Description: strings.Repeat("a", 1001), Tools: []uuid.UUID{tool}}, "Goal must be at most 1000 characters"},
		{"nameless suggestion", form{Type: "playbook", Name: "x", SuggestedTools: []post.CreateSuggestedToolForm{{Name: " "}}}, "Tool name is required"},
		{"javascript suggestion website", form{Type: "playbook", Name: "x", SuggestedTools: []post.CreateSuggestedToolForm{{Name: "T", Website: "javascript:alert(1)"}}}, "Tool website must be an http or https address"},
		{"bad suggestion is reported before a bad type", form{Type: "nope", Name: "x", SuggestedTools: []post.CreateSuggestedToolForm{{Name: ""}}}, "Tool name is required"},
		{"no tools at all", form{Type: "playbook", Name: "x"}, "Missing tools"},
		{"missing tools is reported before a bad type", form{Type: "nope", Name: "x"}, "Missing tools"},
		{"comparison of one tool", form{Type: "comparison", Name: "x", Tools: []uuid.UUID{tool}}, "Comparisons require at least two tools or tool suggestions"},
		{"comparison of one suggestion", form{Type: "comparison", Name: "x", SuggestedTools: suggest(1)}, "Comparisons require at least two tools or tool suggestions"},
		{"playbook of eleven", form{Type: "playbook", Name: "x", Tools: tools(11)}, "Too many tools (maximum 10)"},
		{"eleven counting suggestions", form{Type: "playbook", Name: "x", Tools: tools(6), SuggestedTools: suggest(5)}, "Too many tools (maximum 10)"},
		{"comparison of eleven", form{Type: "comparison", Name: "x", Tools: tools(11)}, "Too many tools (maximum 10)"},
		{"combo", form{Type: "combo", Name: "x", Tools: []uuid.UUID{tool}}, "Unknown post type"},
		{"type is case-sensitive", form{Type: "Playbook", Name: "x", Tools: []uuid.UUID{tool}}, "Unknown post type"},
		{"unknown experience level", form{Type: "playbook", Name: "x", Tools: []uuid.UUID{tool}, ExperienceLevel: "expert"}, "Unknown experience level"},
	}
	for _, c := range rejected {
		_, err := validateNewPost(c.form)
		wantServiceError(t, c.name, err, http.StatusBadRequest, c.msg)
	}

	accepted := []struct {
		name string
		form form
	}{
		{"playbook of one", form{Type: "playbook", Name: "x", Tools: []uuid.UUID{tool}}},
		{"playbook of ten", form{Type: "playbook", Name: "x", Tools: tools(10)}},
		{"playbook of one suggestion only", form{Type: "playbook", Name: "x", SuggestedTools: suggest(1)}},
		{"comparison of a tool and a suggestion", form{Type: "comparison", Name: "x", Tools: []uuid.UUID{tool}, SuggestedTools: suggest(1)}},
		{"comparison of ten", form{Type: "comparison", Name: "x", Tools: tools(4), SuggestedTools: suggest(6)}},
		{"200-character name", form{Type: "playbook", Name: strings.Repeat("é", 200), Tools: []uuid.UUID{tool}}},
		{"1000-character goal", form{Type: "playbook", Name: "x", Description: strings.Repeat("a", 1000), Tools: []uuid.UUID{tool}}},
	}
	for _, c := range accepted {
		if _, err := validateNewPost(c.form); err != nil {
			t.Errorf("%s: rejected with %v", c.name, err)
		}
	}

	t.Run("normalises without touching the caller's form", func(t *testing.T) {
		in := form{
			Type: "comparison", Name: "  My Post  ", Tools: []uuid.UUID{tool},
			SuggestedTools:  []post.CreateSuggestedToolForm{{Name: "  New Tool ", Website: " example.com ", Categories: []int{3}}},
			ExperienceLevel: " BEGINNER ",
		}
		got, err := validateNewPost(in)
		if err != nil {
			t.Fatal(err)
		}
		if got.form.Name != "My Post" {
			t.Errorf("name %q; want trimmed", got.form.Name)
		}
		s := got.form.SuggestedTools[0]
		if s.Name != "New Tool" || s.Website != "https://example.com" || len(s.Categories) != 1 {
			t.Errorf("suggestion = %+v; want trimmed name, https website, categories kept", s)
		}
		if !got.experienceLevel.Valid || got.experienceLevel.String != "beginner" {
			t.Errorf("experience level = %+v; want beginner", got.experienceLevel)
		}
		if in.Name != "  My Post  " || in.SuggestedTools[0].Name != "  New Tool " || in.SuggestedTools[0].Website != " example.com " {
			t.Errorf("caller's form was modified: %+v", in)
		}
	})

	t.Run("no experience level stores NULL", func(t *testing.T) {
		got, err := validateNewPost(form{Type: "playbook", Name: "x", Tools: []uuid.UUID{tool}, ExperienceLevel: "   "})
		if err != nil || got.experienceLevel.Valid {
			t.Errorf("blank level = %+v, %v; want NULL", got.experienceLevel, err)
		}
	})
}

func TestValidateNewTool(t *testing.T) {
	rejected := []struct {
		name string
		req  ResolveTicketWithNewRequest
		msg  string
	}{
		{"no name", ResolveTicketWithNewRequest{}, "Tool name is required"},
		{"blank name", ResolveTicketWithNewRequest{Name: " \t "}, "Tool name is required"},
		{"201-character name", ResolveTicketWithNewRequest{Name: strings.Repeat("é", 201)}, "Tool name must be at most 200 characters"},
		{"1001-character description", ResolveTicketWithNewRequest{Name: "T", Description: strings.Repeat("a", 1001)}, "Tool description must be at most 1000 characters"},
		{"name is checked before the logo", ResolveTicketWithNewRequest{Name: "", LogoURL: "javascript:x"}, "Tool name is required"},
	}
	for _, c := range rejected {
		_, err := validateNewTool(c.req)
		wantServiceError(t, c.name, err, http.StatusBadRequest, c.msg)
	}

	got, err := validateNewTool(ResolveTicketWithNewRequest{Name: "  Notion  ", Description: strings.Repeat("a", 1000)})
	if err != nil || got.Name != "Notion" {
		t.Errorf("name %q, err %v; want trimmed and a 1000-character description accepted", got.Name, err)
	}
	if _, err := validateNewTool(ResolveTicketWithNewRequest{Name: strings.Repeat("é", 200)}); err != nil {
		t.Errorf("200-character name rejected: %v", err)
	}

	for _, logo := range []string{"javascript:alert(1)", "data:image/png;base64,AAAA", "ftp://example.com/x.png", "https://"} {
		_, err := validateNewTool(ResolveTicketWithNewRequest{Name: "T", LogoURL: logo})
		wantServiceError(t, "logo "+logo, err, http.StatusBadRequest, "Logo URL must be an http or https address")
	}
	for in, want := range map[string]string{
		"":                             "",
		"  cdn.example.com/x.png ":     "https://cdn.example.com/x.png",
		"http://cdn.example.com/x.png": "http://cdn.example.com/x.png",
	} {
		got, err := validateNewTool(ResolveTicketWithNewRequest{Name: "T", LogoURL: in})
		if err != nil || got.LogoURL != want {
			t.Errorf("logo %q -> %q, %v; want %q", in, got.LogoURL, err, want)
		}
	}
}

func TestValidateToolPageUpdate(t *testing.T) {
	ptr := func(s string) *string { return &s }
	cats := func(n int) *[]int32 {
		c := make([]int32, n)
		return &c
	}

	rejected := []struct {
		name string
		form UpdateToolPageRequest
		msg  string
	}{
		{"thirteen categories", UpdateToolPageRequest{CategoryIDs: cats(13)}, "A tool can have at most 12 categories"},
		{"script logo", UpdateToolPageRequest{LogoURL: ptr("javascript:alert(1)")}, "Logo URL must be an http or https address"},
		{"script website", UpdateToolPageRequest{Vendor: &ToolVendorInput{Website: "javascript:alert(1)"}}, "Website must be an http or https address"},
		{"script linkedin", UpdateToolPageRequest{Vendor: &ToolVendorInput{LinkedinProfile: "data:text/html,x"}}, "LinkedIn profile must be an http or https address"},
		{"categories are checked first", UpdateToolPageRequest{CategoryIDs: cats(13), LogoURL: ptr("javascript:x")}, "A tool can have at most 12 categories"},
	}
	for _, c := range rejected {
		_, err := validateToolPageUpdate(c.form)
		wantServiceError(t, c.name, err, http.StatusBadRequest, c.msg)
	}

	if _, err := validateToolPageUpdate(UpdateToolPageRequest{CategoryIDs: cats(12)}); err != nil {
		t.Errorf("twelve categories rejected: %v", err)
	}
	if _, err := validateToolPageUpdate(UpdateToolPageRequest{}); err != nil {
		t.Errorf("an empty edit rejected: %v", err)
	}

	t.Run("x_profile is a handle, not a URL", func(t *testing.T) {
		got, err := validateToolPageUpdate(UpdateToolPageRequest{Vendor: &ToolVendorInput{XProfile: "@acme"}})
		if err != nil || got.Vendor.XProfile != "@acme" {
			t.Errorf("x_profile = %+v, %v; want kept as written", got.Vendor, err)
		}
	})

	t.Run("normalises without touching the caller's form", func(t *testing.T) {
		in := UpdateToolPageRequest{
			LogoURL: ptr(" example.com/logo.png "),
			Vendor:  &ToolVendorInput{Website: "acme.example", LinkedinProfile: "linkedin.com/company/acme"},
		}
		got, err := validateToolPageUpdate(in)
		if err != nil {
			t.Fatal(err)
		}
		if *got.LogoURL != "https://example.com/logo.png" || got.Vendor.Website != "https://acme.example" ||
			got.Vendor.LinkedinProfile != "https://linkedin.com/company/acme" {
			t.Errorf("normalised = logo %q, vendor %+v", *got.LogoURL, got.Vendor)
		}
		if *in.LogoURL != " example.com/logo.png " || in.Vendor.Website != "acme.example" {
			t.Errorf("caller's form was modified: logo %q, vendor %+v", *in.LogoURL, in.Vendor)
		}
	})
}

func TestParseSearchPage(t *testing.T) {
	// 214748365 is the last page whose offset, 10*(page-1), fits an int32.
	for in, want := range map[string]int32{"": 1, "1": 1, "7": 7, "214748365": 214748365} {
		if got, err := parseSearchPage(in); err != nil || got != want {
			t.Errorf("parseSearchPage(%q) = %d, %v; want %d", in, got, err, want)
		}
	}
	for in, msg := range map[string]string{
		"abc":        "Invalid page number",
		"1.5":        "Invalid page number",
		" 2":         "Invalid page number",
		"2147483648": "Invalid page number", // past int32
		"0":          "Page number must be >= 1",
		"-3":         "Page number must be >= 1",
		"214748366":  "Page number is too large", // offset would wrap negative
		"2147483647": "Page number is too large",
	} {
		_, err := parseSearchPage(in)
		wantServiceError(t, "page "+strconv.Quote(in), err, http.StatusBadRequest, msg)
	}
}

func TestSearchPageCount(t *testing.T) {
	for count, want := range map[int64]int32{0: 1, 1: 1, 9: 1, 10: 1, 11: 2, 20: 2, 21: 3, 1000: 100} {
		if got := searchPageCount(count); got != want {
			t.Errorf("searchPageCount(%d) = %d; want %d", count, got, want)
		}
	}
}

func TestWriteServiceError(t *testing.T) {
	t.Run("a service error answers with its own status and text, never its cause", func(t *testing.T) {
		rec := httptest.NewRecorder()
		writeServiceError(rec, internal("Could not search", errors.New("pq: secret table detail")))
		if rec.Code != http.StatusInternalServerError || rec.Body.String() != "Could not search\n" {
			t.Errorf("got %d %q", rec.Code, rec.Body.String())
		}
	})
	t.Run("any other error is a bare 500", func(t *testing.T) {
		rec := httptest.NewRecorder()
		writeServiceError(rec, errors.New("connection refused to 10.0.0.5"))
		if rec.Code != http.StatusInternalServerError || rec.Body.String() != "Internal server error\n" {
			t.Errorf("got %d %q", rec.Code, rec.Body.String())
		}
	})
	t.Run("a wrapped service error is still found", func(t *testing.T) {
		rec := httptest.NewRecorder()
		writeServiceError(rec, errors.Join(errors.New("context"), conflict(ticketResolvedMsg)))
		if rec.Code != http.StatusConflict || rec.Body.String() != ticketResolvedMsg+"\n" {
			t.Errorf("got %d %q", rec.Code, rec.Body.String())
		}
	})
}

// The services are what makes this logic testable without HTTP. That holds
// only while they stay free of it: a service that imports net/http or chi can
// start reading requests and writing responses, and is a handler again.
func TestServicesDoNotImportHTTP(t *testing.T) {
	services := []string{"post_service.go", "ticket_service.go", "tool_service.go", "search_service.go"}
	banned := map[string]bool{
		`"net/http"`:                             true,
		`"github.com/go-chi/chi"`:                true,
		`"github.com/go-chi/chi/v5"`:             true,
		`"github.com/go-chi/jwtauth/v5"`:         true,
		`"stackhub.com/stackhub/pkg/middleware"`: true,
	}
	for _, file := range services {
		f, err := parser.ParseFile(token.NewFileSet(), file, nil, parser.ImportsOnly)
		if err != nil {
			t.Fatalf("%s: %v", file, err) // a renamed service must be renamed here too
		}
		for _, imp := range f.Imports {
			if banned[imp.Path.Value] {
				t.Errorf("%s imports %s — keep HTTP in the handler and return a serviceError instead", file, imp.Path.Value)
			}
		}
	}
}
