package main

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
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
		got, ok := normalizeWebURL(c.in)
		if !ok || got != c.want {
			t.Errorf("normalizeWebURL(%q) = %q, %v; want %q, true", c.in, got, ok, c.want)
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
		"https://" + strings.Repeat("a", maxURLLen) + ".com",
	}
	for _, in := range reject {
		if got, ok := normalizeWebURL(in); ok {
			t.Errorf("normalizeWebURL(%q) accepted it as %q; want rejected", in, got)
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
		if got := tooLong(c.s, c.max); got != c.want {
			t.Errorf("tooLong(%q, %d) = %v; want %v", c.s, c.max, got, c.want)
		}
	}
}

// Each body limit must stop a handler reading past its cap. The JSON cap must
// hold whatever Content-Type the client claims: when the cap was chosen from
// that header, a JSON route could be sent 10 MB just by labelling it multipart.
func TestBodyLimits(t *testing.T) {
	var readErr error
	var readN int
	reader := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, err := io.ReadAll(r.Body)
		readN, readErr = len(b), err
	})

	send := func(mw func(http.Handler) http.Handler, contentType string, size int) {
		readErr, readN = nil, 0
		req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(strings.Repeat("x", size)))
		req.Header.Set("Content-Type", contentType)
		mw(reader).ServeHTTP(httptest.NewRecorder(), req)
	}

	var tooBig *http.MaxBytesError

	send(limitJSONBody, "application/json", maxJSONBody)
	if readErr != nil || readN != maxJSONBody {
		t.Errorf("JSON body at the cap: read %d bytes, err %v; want all of it", readN, readErr)
	}

	send(limitJSONBody, "application/json", maxJSONBody+1)
	if !errors.As(readErr, &tooBig) {
		t.Errorf("JSON body one byte over the cap: err %v; want *http.MaxBytesError", readErr)
	}

	send(limitJSONBody, "multipart/form-data; boundary=x", maxJSONBody+1)
	if !errors.As(readErr, &tooBig) {
		t.Errorf("JSON route claiming multipart, over the JSON cap: err %v; want *http.MaxBytesError", readErr)
	}

	send(limitUploadBody, "multipart/form-data; boundary=x", 5<<20)
	if readErr != nil {
		t.Errorf("5 MB upload: err %v; want it allowed", readErr)
	}

	send(limitUploadBody, "multipart/form-data; boundary=x", maxUploadBody+1)
	if !errors.As(readErr, &tooBig) {
		t.Errorf("upload over the cap: err %v; want *http.MaxBytesError", readErr)
	}
}

func TestIsJSONObject(t *testing.T) {
	cases := map[string]bool{
		`{}`:                          true,
		`{"type":"doc","content":[]}`: true,
		`[]`:                          false,
		`"a string"`:                  false,
		`123`:                         false,
		`null`:                        false,
		`{`:                           false,
		``:                            false,
	}
	for in, want := range cases {
		if got := isJSONObject(in); got != want {
			t.Errorf("isJSONObject(%q) = %v; want %v", in, got, want)
		}
	}
}
