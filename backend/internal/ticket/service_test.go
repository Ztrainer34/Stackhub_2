package ticket

import (
	"strings"
	"testing"

	"stackhub.com/stackhub/internal/apperr"
	"stackhub.com/stackhub/internal/apperr/apperrtest"
)

func TestValidateRejectReason(t *testing.T) {
	tooShort := "Reason must be at least 10 characters"
	tooLong := "Reason must be at most 500 characters"

	rejected := []struct {
		name string
		in   string
		msg  string
	}{
		{"empty", "", "A reason is required"},
		{"whitespace only", " \t\r\n  ", "A reason is required"},
		{"only invisible characters", "​‮ ", "A reason is required"},
		{"9 characters", "123456789", tooShort},
		{"9 characters padded with whitespace", "   123456789   ", tooShort},
		{"9 emoji", strings.Repeat("🚫", 9), tooShort},
		{"501 characters", strings.Repeat("a", 501), tooLong},
		{"501 emoji", strings.Repeat("🚫", 501), tooLong},
		{"invalid UTF-8", "valid start \xff\xfe and an invalid end", "Reason must be valid text"},
		// What invalid bytes become once encoding/json decodes the HTTP body.
		{"replacement character", "valid start � and the rest of it", "Reason must be valid text"},
	}
	for _, c := range rejected {
		got, err := validateRejectReason(c.in)
		apperrtest.Want(t, c.name, err, apperr.KindInvalid, c.msg)
		if got != "" {
			t.Errorf("%s: returned %q alongside an error", c.name, got)
		}
	}

	accepted := []struct{ name, in, want string }{
		{"exactly 10 characters", "1234567890", "1234567890"},
		{"exactly 10 multibyte characters", strings.Repeat("é", 10), strings.Repeat("é", 10)},
		{"exactly 10 emoji", strings.Repeat("🚫", 10), strings.Repeat("🚫", 10)},
		{"exactly 500 characters", strings.Repeat("a", 500), strings.Repeat("a", 500)},
		{"exactly 500 emoji", strings.Repeat("🚫", 500), strings.Repeat("🚫", 500)},
		{"length counts the cleaned text", "  " + strings.Repeat("a", 500) + "  ", strings.Repeat("a", 500)},
		{"line breaks and tabs become spaces", "Too similar\r\nto\tAirtable", "Too similar to Airtable"},
		{"bidi override and isolate, zero-width, line separator", "Not‮ a⁦ fit​ for  us", "Not a fit for us"},
		{"runs collapse and ends are trimmed", "  \n Duplicate    of an existing   tool \t", "Duplicate of an existing tool"},
		// Returned as typed, not escaped: each place that shows it escapes it.
		{"markup is kept as text", `Use <b>Notion</b> & "Coda" instead`, `Use <b>Notion</b> & "Coda" instead`},
	}
	for _, c := range accepted {
		got, err := validateRejectReason(c.in)
		if err != nil || got != c.want {
			t.Errorf("%s: validateRejectReason = %q, %v; want %q", c.name, got, err, c.want)
		}
	}
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
