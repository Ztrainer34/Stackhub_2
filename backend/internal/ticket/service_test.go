package ticket

import (
	"strings"
	"testing"

	"stackhub.com/stackhub/internal/apperr"
	"stackhub.com/stackhub/internal/apperr/apperrtest"
)

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
		apperrtest.Want(t, c.name, err, apperr.KindInvalid, c.msg)
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
		apperrtest.Want(t, "logo "+logo, err, apperr.KindInvalid, "Logo URL must be an http or https address")
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
