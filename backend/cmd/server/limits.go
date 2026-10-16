package main

import (
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"unicode/utf8"
)

// Request body ceilings. Every route gets exactly one of the two middlewares
// below, chosen by the route in routes.go — never by the request's
// Content-Type, which the client controls: keyed on the header, a JSON route
// could be handed a 10 MB body just by claiming to be multipart.
//
// maxJSONBody has to fit a whole post: publish sends the full Tiptap document.
// Images are URLs inside it, not bytes, so 2 MB is far above any real post.
//
// maxUploadBody is the largest upload any route accepts (post images, 10 MB)
// plus the multipart envelope. Each upload handler tightens it further through
// receiveImage — avatars and logos to 5 MB. It can only tighten: a
// MaxBytesReader cannot raise a cap an outer one already set, which is why the
// upload routes must not sit behind limitJSONBody at all.
const (
	maxJSONBody   = 2 << 20
	maxUploadBody = 10<<20 + multipartOverhead
)

// limitJSONBody caps the body of every non-upload route. Without it a single
// request could stream an unbounded body into json.Decode and on into a TEXT
// or JSONB column.
func limitJSONBody(next http.Handler) http.Handler {
	return limitBodyTo(maxJSONBody, next)
}

// limitUploadBody is limitJSONBody for the four image upload routes.
func limitUploadBody(next http.Handler) http.Handler {
	return limitBodyTo(maxUploadBody, next)
}

func limitBodyTo(limit int64, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, limit)
		next.ServeHTTP(w, r)
	})
}

// Field length caps, in characters. Each is at or above what the frontend form
// allows, so a user of the UI never meets them — they bound direct API calls.
const (
	maxPostNameLen        = 200
	maxPostDescriptionLen = 1000
	maxCommentLen         = 10000
	maxToolNameLen        = 200
	maxToolDescriptionLen = 1000
	maxURLLen             = 2048
)

// usernamePattern is the only shape a username may take. Usernames go into
// URLs and into links inside notification emails, so any character beyond
// these was a way to put markup into a real StackHub email. The same rule is
// the profiles_username_format constraint and frontend/lib/username.ts.
var usernamePattern = regexp.MustCompile(`^[a-z0-9_-]{3,30}$`)

const maxDisplayNameLen = 100

// usernameProblem returns why a username is not allowed, or "" if it is. The
// caller lowercases and trims first.
func usernameProblem(username string) string {
	switch {
	case utf8.RuneCountInString(username) < 3:
		return "Username must be at least 3 characters long"
	case utf8.RuneCountInString(username) > 30:
		return "Username must be at most 30 characters long"
	case !usernamePattern.MatchString(username):
		return "Username can only contain lowercase letters, numbers, hyphens and underscores"
	}
	return ""
}

// tooLong reports whether s is longer than max characters. It counts runes,
// not bytes, so text in non-Latin scripts gets the same allowance.
func tooLong(s string, max int) bool {
	return utf8.RuneCountInString(s) > max
}

// normalizeWebURL accepts an http(s) URL and returns it trimmed. A bare domain
// ("notion.so") is read as https. Anything else — javascript:, data:, a
// relative path, a URL with no host — is rejected, because these values are
// rendered as links on public tool pages and in the admin ticket list.
//
// An empty string is valid and stays empty: the fields this guards are
// optional, and blank means "not given".
func normalizeWebURL(raw string) (string, bool) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", true
	}
	if len(s) > maxURLLen {
		return "", false
	}
	// No scheme given: read it as https. This is also what defuses
	// "javascript:alert(1)" — prefixed, it becomes a host with an invalid port
	// and fails to parse.
	if !strings.Contains(s, "://") {
		s = "https://" + s
	}

	u, err := url.Parse(s)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return "", false
	}
	return s, true
}
