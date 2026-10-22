package main

import "testing"

// allowedOrigin decides which websites a browser lets call the API. These pin
// the list exactly, so loosening it — a missing anchor, a scheme left out — is
// a test failure rather than a silent widening.
func TestAllowedOrigin(t *testing.T) {
	allowed := []string{
		"https://stackhub.me",
		"https://www.stackhub.me",
		"https://stackhub-2-kzmw-one.vercel.app",
		"https://stackhub-2-kzmw-git-local-team.vercel.app",
		"http://localhost:3000",
		"http://127.0.0.1:8080",
	}
	for _, o := range allowed {
		if !allowedOrigin(o) {
			t.Errorf("allowedOrigin(%q) = false; want true", o)
		}
	}

	refused := []string{
		"",
		"null",
		"http://stackhub.me",                   // not https
		"https://stackhub.me.evil.com",         // suffix
		"https://evil.com/https://stackhub.me", // embedded
		"https://evil.vercel.app",              // another Vercel project
		"https://stackhub-2-kzmw.vercel.app.evil.com",
		"http://stackhub-2-kzmw-one.vercel.app", // not https
		"http://localhost",                      // no port
		"https://localhost:3000",                // local dev is http
		"http://localhost:3000.evil.com",
		"http://192.168.1.5:3000",
	}
	for _, o := range refused {
		if allowedOrigin(o) {
			t.Errorf("allowedOrigin(%q) = true; want false", o)
		}
	}
}
