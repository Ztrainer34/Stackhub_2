package validate

import (
	"strings"
	"testing"
)

// normalizeWebURL guards every URL a user can make the site render as a link
// or an image source. The cases that matter most are the rejections: each one
// is a way to put script, or a link that is not a web page, in front of other
// users.
func TestNormalizeWebURL(t *testing.T) {
	accept := []struct{ in, want string }{
		{"", ""},
		{"   ", ""},
		{"https://notion.so", "https://notion.so"},
		{"http://example.com/pricing?plan=pro#top", "http://example.com/pricing?plan=pro#top"},
		{"  https://example.com  ", "https://example.com"},
		{"notion.so", "https://notion.so"},
		{"www.example.com/path", "https://www.example.com/path"},
		{"HTTPS://Example.com", "HTTPS://Example.com"},
		{"example.com:8080", "https://example.com:8080"},
		{"notion.so/?a=b:c", "https://notion.so/?a=b:c"},
	}
	for _, c := range accept {
		got, ok := WebURL(c.in)
		if !ok || got != c.want {
			t.Errorf("WebURL(%q) = %q, %v; want %q, true", c.in, got, ok, c.want)
		}
	}

	reject := []string{
		"javascript:alert(1)",
		"JavaScript:alert(document.cookie)",
		" javascript:alert(1)",
		"data:text/html,<script>alert(1)</script>",
		"vbscript:msgbox(1)",
		"ftp://example.com/file",
		"https://",
		"//evil.example",
		"/relative/path",
		"https://" + strings.Repeat("a", MaxURLLen) + ".com",
	}
	for _, in := range reject {
		if got, ok := WebURL(in); ok {
			t.Errorf("WebURL(%q) accepted it as %q; want rejected", in, got)
		}
	}
}

func TestTooLong(t *testing.T) {
	cases := []struct {
		s    string
		max  int
		want bool
	}{
		{"", 0, false},
		{"abcde", 5, false},
		{"abcdef", 5, true},
		// Counted in characters, not bytes: "é" is two bytes in UTF-8, and
		// "日本語" is nine. Neither should be penalised for its script.
		{"héllo", 5, false},
		{"日本語", 3, false},
		{"日本語!", 3, true},
	}
	for _, c := range cases {
		if got := TooLong(c.s, c.max); got != c.want {
			t.Errorf("TooLong(%q, %d) = %v; want %v", c.s, c.max, got, c.want)
		}
	}
}

// Usernames go into URLs and into links inside notification emails. The
// rejections below are the ones that matter: each was a way to write markup or
// a second URL path into a StackHub email.
func TestUsernameProblem(t *testing.T) {
	for _, ok := range []string{"abc", "max", "jane_doe", "growth-team", "user123", strings.Repeat("a", 30)} {
		if p := UsernameProblem(ok); p != "" {
			t.Errorf("UsernameProblem(%q) = %q; want allowed", ok, p)
		}
	}
	for _, bad := range []string{
		"",
		"ab",
		strings.Repeat("a", 31),
		`x" style="display:none`,
		"<script>",
		"a b",
		"../post",
		"name.with.dots",
		"Upper", // callers lowercase first; uppercase here means they did not
		"emoji😀",
		"tab\tname",
	} {
		if UsernameProblem(bad) == "" {
			t.Errorf("UsernameProblem(%q) allowed it; want rejected", bad)
		}
	}
}
