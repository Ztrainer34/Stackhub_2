package mail

import (
	"strings"
	"testing"
)

// Usernames reach ctaButton's href. Before the audit fix a quote in one closed
// the attribute, and the rest of the "username" became markup in an email sent
// from StackHub's own domain.
func TestCtaButtonEscapesHref(t *testing.T) {
	attack := `https://stackhub.me/x" style="display:none"></a><a href="https://evil.example/verify">verify your account</a><a x="`

	html := ctaButton(attack, "View profile", false)

	if strings.Contains(html, `<a href="https://evil.example`) {
		t.Fatalf("the href broke out into a second link:\n%s", html)
	}
	if strings.Count(html, "<a ") != 1 || strings.Count(html, "</a>") != 1 {
		t.Errorf("want exactly one link element, got:\n%s", html)
	}
	if !strings.Contains(html, "&#34;") {
		t.Errorf("quotes in href were not escaped:\n%s", html)
	}
}

func TestCtaButtonEscapesLabel(t *testing.T) {
	html := ctaButton("https://stackhub.me", "<b>x</b>", true)
	if strings.Contains(html, "<b>") {
		t.Errorf("label markup was not escaped:\n%s", html)
	}
}
