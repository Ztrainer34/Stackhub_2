// Package validate holds the input rules shared by several modules: length
// caps, URLs a user can make the site render as a link, and usernames.
package validate

import (
	"net/url"
	"regexp"
	"strings"
	"unicode/utf8"
)

// MaxURLLen caps any URL a user submits.
const MaxURLLen = 2048

// usernamePattern is the only shape a username may take. Usernames go into
// URLs and into links inside notification emails, so any character beyond
// these was a way to put markup into a real StackHub email. The same rule is
// the profiles_username_format constraint and frontend/lib/username.ts.
var usernamePattern = regexp.MustCompile(`^[a-z0-9_-]{3,30}$`)

// MaxDisplayNameLen caps a profile's display name, in characters.
const MaxDisplayNameLen = 100

// UsernameProblem returns why a username is not allowed, or "" if it is. The
// caller lowercases and trims first.
func UsernameProblem(username string) string {
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

// TooLong reports whether s is longer than max characters. It counts runes,
// not bytes, so text in non-Latin scripts gets the same allowance.
//
// Each module's caps are at or above what the frontend form allows, so a user
// of the UI never meets them — they bound direct API calls.
func TooLong(s string, max int) bool {
	return utf8.RuneCountInString(s) > max
}

// WebURL accepts an http(s) URL and returns it trimmed. A bare domain
// ("notion.so") is read as https. Anything else — javascript:, data:, a
// relative path, a URL with no host — is rejected, because these values are
// rendered as links on public tool pages and in the admin ticket list.
//
// An empty string is valid and stays empty: the fields this guards are
// optional, and blank means "not given".
func WebURL(raw string) (string, bool) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", true
	}
	if len(s) > MaxURLLen {
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
