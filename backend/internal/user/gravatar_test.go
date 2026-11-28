package user

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi"
)

// pngBytes sniffs as image/png: the signature, then padding.
var pngBytes = append([]byte("\x89PNG\r\n\x1a\n"), make([]byte, 64)...)

func TestGravatarSize(t *testing.T) {
	cases := map[string]int{"48": 48, "80": 80, "128": 128, "256": 256,
		"": 80, "81": 80, "4096": 80, "-1": 80, "abc": 80, "80&d=mp": 80}
	for in, want := range cases {
		if got := gravatarSize(in); got != want {
			t.Errorf("gravatarSize(%q) = %d; want %d", in, got, want)
		}
	}
}

// fetchGravatar re-serves bytes from someone else's server under our API's
// origin. It must pass through only the image types we would accept as an
// upload, and nothing oversized.
func TestFetchGravatar(t *testing.T) {
	var status int
	var contentType string
	var body []byte
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.RawQuery, "d=404") {
			t.Errorf("upstream asked without d=404 (%s); Gravatar would answer with its default image", r.URL.RawQuery)
		}
		if contentType != "" {
			w.Header().Set("Content-Type", contentType)
		} else {
			// Otherwise net/http sniffs the body and fills one in.
			w.Header()["Content-Type"] = nil
		}
		w.WriteHeader(status)
		w.Write(body)
	}))
	defer upstream.Close()

	prevBase := gravatarBase
	gravatarBase = upstream.URL + "/avatar/"
	defer func() { gravatarBase = prevBase }()

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	cases := []struct {
		name        string
		status      int
		contentType string
		body        []byte
		wantStatus  int
	}{
		{"png", 200, "image/png", pngBytes, 200},
		{"jpeg with params", 200, "image/jpeg; charset=binary", []byte("\xff\xd8\xff"), 200},
		{"no gravatar", 404, "", nil, 404},
		{"upstream error", 500, "", nil, 502},
		{"html", 200, "text/html", []byte("<script>alert(1)</script>"), 502},
		{"svg", 200, "image/svg+xml", []byte("<svg><script>alert(1)</script></svg>"), 502},
		{"no content type", 200, "", pngBytes, 502},
		{"oversized", 200, "image/png", bytes.Repeat([]byte("x"), maxGravatarBytes+1), 502},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			status, contentType, body = c.status, c.contentType, c.body
			got, gotType, gotStatus := fetchGravatar(req, strings.Repeat("a", 64), 80)
			if gotStatus != c.wantStatus {
				t.Fatalf("status %d; want %d", gotStatus, c.wantStatus)
			}
			if c.wantStatus == 200 && (!bytes.Equal(got, c.body) || !strings.HasPrefix(c.contentType, gotType) || gotType == "") {
				t.Errorf("served %d bytes as %q; want the upstream %d bytes as %q", len(got), gotType, len(c.body), c.contentType)
			}
			if c.wantStatus != 200 && got != nil {
				t.Errorf("returned %d bytes on a %d", len(got), gotStatus)
			}
		})
	}
}

// A username that cannot exist is answered without touching the database —
// the Handler has no queries here, so reaching one would panic.
func TestGetGravatarRejectsImpossibleUsernames(t *testing.T) {
	h := &Handler{}
	for _, name := range []string{"ab", "<script>", "..%2Fpost"} {
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("slug", name)
		req := httptest.NewRequest(http.MethodGet, "/user/x/gravatar", nil)
		req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
		rec := httptest.NewRecorder()

		h.GetGravatar(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Errorf("username %q: status %d; want 404", name, rec.Code)
		}
	}
}
