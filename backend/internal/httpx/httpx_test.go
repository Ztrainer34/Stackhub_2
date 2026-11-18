package httpx

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

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

	send(LimitJSONBody, "application/json", MaxJSONBody)
	if readErr != nil || readN != MaxJSONBody {
		t.Errorf("JSON body at the cap: read %d bytes, err %v; want all of it", readN, readErr)
	}

	send(LimitJSONBody, "application/json", MaxJSONBody+1)
	if !errors.As(readErr, &tooBig) {
		t.Errorf("JSON body one byte over the cap: err %v; want *http.MaxBytesError", readErr)
	}

	send(LimitJSONBody, "multipart/form-data; boundary=x", MaxJSONBody+1)
	if !errors.As(readErr, &tooBig) {
		t.Errorf("JSON route claiming multipart, over the JSON cap: err %v; want *http.MaxBytesError", readErr)
	}

	send(LimitUploadBody, "multipart/form-data; boundary=x", 5<<20)
	if readErr != nil {
		t.Errorf("5 MB upload: err %v; want it allowed", readErr)
	}

	send(LimitUploadBody, "multipart/form-data; boundary=x", MaxUploadBody+1)
	if !errors.As(readErr, &tooBig) {
		t.Errorf("upload over the cap: err %v; want *http.MaxBytesError", readErr)
	}
}

// TestCachePublic pins the Cache-Control directives, because each one does a
// different job and dropping any of them fails quietly rather than loudly:
// without s-maxage a CDN falls back to max-age and caches for the wrong period,
// without public a shared cache may refuse to store the response at all, and
// without stale-while-revalidate every expiry makes a visitor wait for a fresh
// origin fetch instead of being served the old copy while it refreshes.
func TestCachePublic(t *testing.T) {
	cases := []struct {
		name     string
		browser  int
		shared   int
		expected string
	}{
		{
			name:     "catalogue values",
			browser:  60,
			shared:   300,
			expected: "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
		},
		{
			name:     "slow-moving values",
			browser:  300,
			shared:   900,
			expected: "public, max-age=300, s-maxage=900, stale-while-revalidate=1800",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			CachePublic(rec, tc.browser, tc.shared)

			got := rec.Header().Get("Cache-Control")
			if got != tc.expected {
				t.Errorf("Cache-Control = %q, want %q", got, tc.expected)
			}

			// A shared cache must be told it may store this at all. "private"
			// here would mean browsers cache it and the CDN does not, which is
			// the opposite of the point.
			if !strings.Contains(got, "public") {
				t.Error("header must be marked public or a shared cache may refuse to store it")
			}
		})
	}
}
