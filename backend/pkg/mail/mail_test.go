package mail

import (
	"regexp"
	"strings"
	"testing"
	"unicode"
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

func TestParseRecipients(t *testing.T) {
	t.Run("empty is off", func(t *testing.T) {
		got, err := ParseRecipients("", 10)
		if got != nil || err != nil {
			t.Errorf("got %v, %v; want nil, nil", got, err)
		}
	})

	t.Run("trims", func(t *testing.T) {
		got, err := ParseRecipients("a@x.com, b@y.com", 10)
		if err != nil || len(got) != 2 || got[0] != "a@x.com" || got[1] != "b@y.com" {
			t.Errorf("got %v, %v; want the two trimmed addresses", got, err)
		}
	})

	t.Run("dedupes ignoring case", func(t *testing.T) {
		got, err := ParseRecipients("a@x.com,A@X.com", 10)
		if err != nil || len(got) != 1 || got[0] != "a@x.com" {
			t.Errorf("got %v, %v; want one address", got, err)
		}
	})

	bad := map[string]string{
		"empty entry":          "a@x.com,,b@y.com",
		"trailing comma":       "a@x.com,",
		"header injection":     "a@x.com\r\nBcc: z@evil.example",
		"display name":         "Name <a@x.com>",
		"angle brackets":       "<a@x.com>",
		"quoted local part":    `"x,y"@b.co`,
		"not an address":       "not-an-email",
		"trailing comment":     "a@x.com (boss)",
		"one bad among good":   "a@x.com, nope, b@y.com",
		"newline in the token": "a@x.com\nb@y.com",
	}
	for name, raw := range bad {
		t.Run(name, func(t *testing.T) {
			got, err := ParseRecipients(raw, 10)
			if err == nil || got != nil {
				t.Errorf("ParseRecipients(%q) = %v, %v; want an error and no partial list", raw, got, err)
			}
			if err != nil && strings.Contains(err.Error(), "@") {
				t.Errorf("the error echoes an address: %v", err)
			}
		})
	}

	t.Run("over the limit", func(t *testing.T) {
		var parts []string
		for _, c := range "abcdefghijk" { // 11
			parts = append(parts, string(c)+"@x.com")
		}
		if got, err := ParseRecipients(strings.Join(parts, ","), 10); err == nil || got != nil {
			t.Errorf("11 addresses with max 10: got %v, %v; want an error", got, err)
		}
		if got, err := ParseRecipients(strings.Join(parts[:10], ","), 10); err != nil || len(got) != 10 {
			t.Errorf("10 addresses with max 10: got %d, %v; want all 10", len(got), err)
		}
	})
}

func TestSanitize(t *testing.T) {
	cases := []struct{ name, in, want string }{
		{"plain", "hello", "hello"},
		{"CR LF TAB become one space", "a\r\n\tb", "a b"},
		{"repeated spaces collapse", "  a    b  ", "a b"},
		{"right-to-left override", "a‮b", "a b"},
		{"zero width", "a​b‏c", "a b c"},
		{"isolates", "a⁦b⁩c", "a b c"},
		{"line and paragraph separators", "a b c", "a b c"},
		{"NUL", "a\x00b", "a b"},
		{"invalid utf8", "a\xffb", "a b"},
	}
	for _, c := range cases {
		if got := sanitize(c.in, 100); got != c.want {
			t.Errorf("%s: sanitize(%q) = %q; want %q", c.name, c.in, got, c.want)
		}
	}

	if got := sanitize(strings.Repeat("é", 10), 4); got != "éééé…" {
		t.Errorf("truncation counts runes, not bytes: got %q", got)
	}
	if got := sanitize("exactly", 7); got != "exactly" {
		t.Errorf("at the limit nothing is cut: got %q", got)
	}
	// Truncation happens before escaping, so an entity is never cut in half.
	if got := sanitize(strings.Repeat("&", 50), 5); got != "&&&&&…" {
		t.Errorf("sanitize must not escape: got %q", got)
	}
}

func TestDefangURL(t *testing.T) {
	cases := []struct{ in, want string }{
		{"https://example.com/a", "hxxps[:]//example[.]com/a"},
		{"http://example.com", "hxxp[:]//example[.]com"},
		{"HTTPS://Example.com", "hxxps[:]//Example[.]com"},
		{"https://stackhub.me@evil.example", "hxxps[:]//stackhub[.]me[at]evil[.]example"},
		{"javascript://x", "javascript[:]//x"},
		{"", ""},
	}
	for _, c := range cases {
		got := defangURL(c.in)
		if got != c.want {
			t.Errorf("defangURL(%q) = %q; want %q", c.in, got, c.want)
		}
		if strings.Contains(got, "://") {
			t.Errorf("defangURL(%q) = %q still contains ://", c.in, got)
		}
	}
	if got := defangURL("https://a.example/\r\nBcc: x"); strings.ContainsAny(got, "\r\n") {
		t.Errorf("defangURL kept a line break: %q", got)
	}
}

const testTicketID = "11111111-2222-3333-4444-555555555555"

func item(name string) NewToolItem {
	return NewToolItem{TicketID: testTicketID, ToolName: name, RequesterUsername: "alice"}
}

func TestBuildNewToolDigestSubject(t *testing.T) {
	subject, _ := digestWithoutHeader(t, []NewToolItem{item("One")}, 0, 0)
	if subject != "New tool suggestion on StackHub" {
		t.Errorf("one item: subject = %q", subject)
	}
	subject, _ = digestWithoutHeader(t, []NewToolItem{item("One"), item("Two")}, 1, 1)
	if subject != "New tool suggestions on StackHub (3)" {
		t.Errorf("two items and one more: subject = %q", subject)
	}

	hostile := "X\r\nBcc: a@b"
	subject, _ = digestWithoutHeader(t, []NewToolItem{item(hostile)}, 0, 0)
	if strings.Contains(subject, "X") && strings.Contains(subject, "Bcc") || strings.ContainsAny(subject, "\r\n") {
		t.Errorf("the subject carries user text: %q", subject)
	}
	if subject != "New tool suggestion on StackHub" {
		t.Errorf("subject = %q; want the constant", subject)
	}
}

func TestBuildNewToolDigestEscapesUserText(t *testing.T) {
	it := item("<script>alert(1)</script>")
	it.Description = `"><a href="https://evil.example">`
	_, html := digestWithoutHeader(t, []NewToolItem{it}, 0, 0)

	if strings.Contains(html, "<script") {
		t.Errorf("script tag survived:\n%s", html)
	}
	if strings.Contains(html, `href="https://evil.example`) {
		t.Errorf("user text became a link:\n%s", html)
	}
	if strings.Count(html, "<a ") != 1 {
		t.Errorf("want only the Review link, got %d links", strings.Count(html, "<a "))
	}
}

func TestBuildNewToolDigestHostileName(t *testing.T) {
	name := "<a href=x>\"><img src=y>\r\nBcc: z‮  end"
	_, html := digestWithoutHeader(t, []NewToolItem{item(name)}, 0, 0)

	if strings.Count(html, "<a ") != 1 {
		t.Errorf("an extra link got through:\n%s", html)
	}
	if strings.Contains(html, "<img") {
		t.Errorf("an image tag got through:\n%s", html)
	}
	for _, r := range html {
		if unicode.In(r, unicode.Cf, unicode.Zl, unicode.Zp) {
			t.Errorf("format or separator character %U in the email", r)
		}
	}
}

func TestBuildNewToolDigestWebsiteIsInertText(t *testing.T) {
	it := item("Tool")
	it.Website = "https://stackhub.me@evil.example"
	_, html := digestWithoutHeader(t, []NewToolItem{it}, 0, 0)

	if strings.Contains(html, "evil.example") || strings.Contains(html, "@evil") {
		t.Errorf("the website is readable as a real address:\n%s", html)
	}
	// The one "://" is the Review link's own.
	if strings.Count(html, "://") != 1 {
		t.Errorf("want one ://, the Review link's; got %d", strings.Count(html, "://"))
	}
	if strings.Count(html, `href="`) != 1 {
		t.Errorf("the website landed in an href:\n%s", html)
	}
	if !strings.Contains(html, "hxxps[:]//stackhub[.]me[at]evil[.]example") {
		t.Errorf("the defanged website is missing:\n%s", html)
	}
}

func TestBuildNewToolDigestReviewLink(t *testing.T) {
	_, html := digestWithoutHeader(t, []NewToolItem{item("Tool")}, 0, 0)
	want := `href="` + siteURL + `/admin/tool-tickets/` + testTicketID + `"`
	if !strings.Contains(html, want) {
		t.Errorf("missing %s in:\n%s", want, html)
	}
	if !strings.Contains(html, "Unverified user input") {
		t.Error("the user text block is not labelled")
	}
	if strings.Contains(html, "Reply-To") {
		t.Error("never set a reply address from submitter data")
	}
}

func TestBuildNewToolDigestLinksPerItem(t *testing.T) {
	items := []NewToolItem{item("A"), item("B"), item("C")}
	_, html := digestWithoutHeader(t, items, 0, 0)
	if got := strings.Count(html, "<a "); got != 3 {
		t.Errorf("3 items, no more: %d links; want 3", got)
	}
	if strings.Contains(html, "not listed") {
		t.Error("more=0 must not mention unlisted tools")
	}

	_, html = digestWithoutHeader(t, items, 4, 2)
	if got := strings.Count(html, "<a "); got != 4 {
		t.Errorf("3 items and more: %d links; want 3 plus the queue link", got)
	}
	if !strings.Contains(html, "+4 more from 2 submitters not listed") {
		t.Errorf("missing the more line:\n%s", html)
	}
	if !strings.Contains(html, `href="`+siteURL+`/admin/tool-tickets"`) {
		t.Error("missing the ticket queue link")
	}
}

func TestBuildNewToolDigestCutsLongText(t *testing.T) {
	it := item("Tool")
	it.Description = strings.Repeat("a", 1000)
	_, html := digestWithoutHeader(t, []NewToolItem{it}, 0, 0)
	if !strings.Contains(html, strings.Repeat("a", 300)+"…") {
		t.Error("a long description is not cut to 300 characters and an ellipsis")
	}
	if strings.Contains(html, strings.Repeat("a", 301)) {
		t.Error("the description kept more than 300 characters")
	}
}

func TestBuildNewToolDigestNeverCutsAnEntity(t *testing.T) {
	it := item("Tool")
	it.Description = strings.Repeat("&<", 500)
	_, html := digestWithoutHeader(t, []NewToolItem{it}, 0, 0)

	left := regexp.MustCompile(`&amp;|&lt;|&gt;|&#34;|&#39;`).ReplaceAllString(html, "")
	if strings.Contains(left, "&") {
		t.Errorf("a partial entity is left in the email")
	}
}

func TestBuildNewToolDigestFlattensWhitespace(t *testing.T) {
	it := item("a\r\n\tb")
	it.RequesterUsername = "x\ty"
	it.Categories = []string{"c\nd", "e"}
	_, html := digestWithoutHeader(t, []NewToolItem{it}, 0, 0)

	for _, want := range []string{"<strong>a b</strong>", "Suggested by @x y", "Categories: c d, e"} {
		if !strings.Contains(html, want) {
			t.Errorf("missing %q in:\n%s", want, html)
		}
	}
	if strings.ContainsAny(html, "\r\n\t") {
		t.Error("a line break or tab from user text reached the email")
	}
}

func TestBuildNewToolDigestOmitsEmptyFields(t *testing.T) {
	_, html := digestWithoutHeader(t, []NewToolItem{item("Tool")}, 0, 0)
	for _, label := range []string{"Website:", "Description:", "Categories:", "From playbook:"} {
		if strings.Contains(html, label) {
			t.Errorf("%q rendered for an empty field", label)
		}
	}

	it := item("Tool")
	it.PlaybookName = "My playbook"
	it.Website = "https://example.com"
	it.Description = "Does things"
	it.Categories = []string{"CRM"}
	_, html = digestWithoutHeader(t, []NewToolItem{it}, 0, 0)
	for _, label := range []string{"Website:", "Description:", "Categories:", "From playbook: My playbook"} {
		if !strings.Contains(html, label) {
			t.Errorf("%q missing for a filled field", label)
		}
	}
}

// Escaping stops markup, not links: Gmail and Outlook turn a bare URL or domain
// in HTML mail into a clickable link. Every free-text field has to be inert.
// The reason is typed by an admin but lands in an email sent from StackHub's
// own domain: it must be inert text, whatever it contains.
func TestBuildToolRejectedReasonIsInertText(t *testing.T) {
	reason := `<a href="https://evil.example/x">go</a> & visit www.evil.example or a@b.co`
	subject, html := rejectedWithoutHeader(t, "Notion", reason)

	for _, leaked := range []string{`href="https://evil`, "https://evil.example", "www.evil.example", "a@b.co", "evil.example/x"} {
		if strings.Contains(html, leaked) {
			t.Errorf("%q survives as markup or a linkable string:\n%s", leaked, html)
		}
	}
	for _, want := range []string{"&lt;a", "hxxps", "[.]", "[at]"} {
		if !strings.Contains(html, want) {
			t.Errorf("%q missing from the email:\n%s", want, html)
		}
	}
	// The only link is the constant button to the tool list.
	if got := strings.Count(html, "<a "); got != 1 {
		t.Errorf("want exactly one link element (the button), got %d:\n%s", got, html)
	}
	if !strings.Contains(html, `<a href="https://stackhub.me/tools"`) {
		t.Errorf("the button does not point at the site's tool list:\n%s", html)
	}
	if strings.Contains(subject, "evil") || strings.Contains(subject, "Notion") {
		t.Errorf("subject %q carries user text", subject)
	}
	if !strings.Contains(html, "The StackHub Team") || strings.Contains(html, "<script") {
		t.Errorf("footer missing or script present:\n%s", html)
	}
}

func TestBuildToolRejectedKeepsEntitiesIntact(t *testing.T) {
	_, html := rejectedWithoutHeader(t, "Notion", "Too similar to Airtable &")
	if !strings.Contains(html, "Airtable &amp;</div>") {
		t.Errorf("a trailing & must come out as an intact &amp;:\n%s", html)
	}
	if strings.Contains(html, "&amp;amp;") {
		t.Errorf("an entity was escaped twice:\n%s", html)
	}
}

func TestBuildToolRejectedSubjectIsConstant(t *testing.T) {
	want, _ := rejectedWithoutHeader(t, "Notion", "Duplicate")
	for _, name := range []string{"Notion\r\nBcc: attacker@evil.example", "Subject: pwned", strings.Repeat("x", 5000)} {
		subject, html := rejectedWithoutHeader(t, name, "Duplicate")
		if subject != want {
			t.Errorf("tool name %q changed the subject to %q", name, subject)
		}
		if strings.ContainsAny(subject, "\r\n") {
			t.Errorf("subject has a line break: %q", subject)
		}
		if strings.Contains(html, "\r\nBcc:") || strings.Contains(html, "attacker@evil.example") {
			t.Errorf("the tool name's header text reached the body unchanged:\n%s", html)
		}
	}
}

func TestBuildToolRejectedDropsInvisibleCharacters(t *testing.T) {
	_, html := rejectedWithoutHeader(t, "No\u202Etion\u200B", "bad\u202Ereason\u200Bwith\u2028breaks\r\nand\ttabs")
	for _, r := range []rune{'\u202E', '\u200B', '\u2028'} {
		if strings.ContainsRune(html, r) {
			t.Errorf("U+%04X reached the email", r)
		}
	}
	if !strings.Contains(html, "bad reason with breaks and tabs") {
		t.Errorf("the reason was not flattened to one line:\n%s", html)
	}
}

func TestBuildToolRejectedEscapesToolName(t *testing.T) {
	_, html := rejectedWithoutHeader(t, `<img src=x onerror=alert(1)> evil.example`, "Duplicate")
	for _, bad := range []string{"<img", "evil.example"} {
		if strings.Contains(html, bad) {
			t.Errorf("%q in the tool name reached the email as is:\n%s", bad, html)
		}
	}
}

func TestNeutraliseLinks(t *testing.T) {
	for _, in := range []string{
		"re-verify at stackhub-admin-verify.com/login",
		"see https://evil.example/login",
		"HTTPS://EVIL.COM/x and http://a.b",
		"www.example.com",
		"mail me: someone@evil.example",
	} {
		out := neutraliseLinks(in)
		if strings.Contains(out, "://") || strings.Contains(out, "@") {
			t.Errorf("%q still has a link scheme or @: %q", in, out)
		}
		if regexp.MustCompile(`[A-Za-z0-9]\.[A-Za-z0-9]`).MatchString(out) {
			t.Errorf("%q still has an in-word dot a client would link: %q", in, out)
		}
	}
}

func TestNeutraliseLinksLeavesProseAlone(t *testing.T) {
	for _, in := range []string{
		"Brief description.",
		"Tracks email. Fast and simple.",
		"No dots at all",
		"Wait... what?",
	} {
		if out := neutraliseLinks(in); out != in {
			t.Errorf("prose changed: %q -> %q", in, out)
		}
	}
}

func TestBuildNewToolDigestFreeTextFieldsAreInert(t *testing.T) {
	it := NewToolItem{
		TicketID:          testTicketID,
		ToolName:          "visit evil-name.example now",
		Description:       "Admin action required: re-verify at stackhub-admin-verify.com/login",
		PlaybookName:      "see https://evil-playbook.example",
		Categories:        []string{"cat.evil-category.example"},
		RequesterUsername: "alice",
	}
	_, html := digestWithoutHeader(t, []NewToolItem{it}, 0, 0)

	for _, leaked := range []string{
		"evil-name.example", "stackhub-admin-verify.com", "evil-playbook.example",
		"evil-category.example", "https://evil", "http://evil",
	} {
		if strings.Contains(html, leaked) {
			t.Errorf("%q is plain, linkable text in the email:\n%s", leaked, html)
		}
	}
	// The Review button is still the one real link, pointing at the site.
	if got := strings.Count(html, "<a "); got != 1 {
		t.Errorf("want exactly one link (Review), got %d", got)
	}
	if !strings.Contains(html, "https://stackhub.me/admin/tool-tickets/"+testTicketID) {
		t.Errorf("Review link missing or altered:\n%s", html)
	}
}

// A plain website is shown as a real, readable link (the reported bug was the
// hxxps[:]// form). Everything that could make that link misleading stays
// defanged instead.
func TestBuildNewToolDigestWebsiteIsClickable(t *testing.T) {
	it := item("Tool")
	it.Website = "https://aixecute.be/3"
	_, html := digestWithoutHeader(t, []NewToolItem{it}, 0, 0)

	want := `<a href="https://aixecute.be/3" rel="noopener noreferrer"`
	if !strings.Contains(html, want) {
		t.Errorf("the website is not a link:\n%s", html)
	}
	if !strings.Contains(html, ">https://aixecute.be/3</a>") {
		t.Errorf("the link text must be the address itself:\n%s", html)
	}
	if strings.Contains(html, "hxxps") || strings.Contains(html, "[.]") {
		t.Errorf("a plain website must not be defanged:\n%s", html)
	}
	// The Review button and the website: exactly two links.
	if got := strings.Count(html, "<a "); got != 2 {
		t.Errorf("want the Review link and the website link, got %d", got)
	}
}

func TestBuildNewToolDigestRiskyWebsitesStayDefanged(t *testing.T) {
	for name, site := range map[string]string{
		"user info that fakes a StackHub address": "https://stackhub.me@evil.example",
		"non-ASCII lookalike host":                "https://stаckhub.me/login", // Cyrillic а
		"a javascript scheme":                     "javascript:alert(1)",
		"a data scheme":                           "data:text/html,<b>x</b>",
		"markup in the address":                   `https://a.example/"><img src=x>`,
		"a control character":                     "https://a.example/\u202Epath",
	} {
		it := item("Tool")
		it.Website = site
		_, html := digestWithoutHeader(t, []NewToolItem{it}, 0, 0)

		if got := strings.Count(html, "<a "); got != 1 {
			t.Errorf("%s: %d links; only the Review link is allowed:\n%s", name, got, html)
		}
		if strings.Contains(html, `href="`+site) || strings.Contains(html, `href="javascript`) {
			t.Errorf("%s: the website landed in an href", name)
		}
		if strings.Contains(html, "<img") {
			t.Errorf("%s: markup got through", name)
		}
	}
}

func TestClickableWebsiteRefusesAnythingCleaned(t *testing.T) {
	long := "https://a.example/" + strings.Repeat("x", 400)
	for name, in := range map[string]string{
		"empty":                 "",
		"spaces only":           "   ",
		"cut because too long":  long,
		"has an invisible char": "https://a.example/​x",
		"ftp scheme":            "ftp://a.example/x",
		"no host":               "https:///path",
	} {
		if got, ok := clickableWebsite(in); ok {
			t.Errorf("%s: %q was accepted as %q", name, in, got)
		}
	}
	if got, ok := clickableWebsite("  https://Example.com/a?b=1&c=2  "); !ok || got != "https://Example.com/a?b=1&c=2" {
		t.Errorf("a normal address was refused or altered: %q %v", got, ok)
	}
}

func TestBuildNewToolDigestWebsiteLinkIsEscaped(t *testing.T) {
	it := item("Tool")
	it.Website = "https://a.example/?x=1&y=2"
	_, html := digestWithoutHeader(t, []NewToolItem{it}, 0, 0)
	if !strings.Contains(html, `href="https://a.example/?x=1&amp;y=2"`) {
		t.Errorf("the & in the address must be escaped inside the attribute:\n%s", html)
	}
}

// What a click could aim at the admin's own network, or a lookalike a browser
// may redisplay as Unicode, is never linked.
func TestClickableWebsiteRefusesHostsAClickCouldAbuse(t *testing.T) {
	for name, in := range map[string]string{
		"IPv4":                 "http://192.168.1.1/cgi-bin/reboot",
		"loopback":             "http://127.0.0.1:8080/x",
		"cloud metadata":       "http://169.254.169.254/latest",
		"decimal IPv4":         "http://2130706433/",
		"hex IPv4":             "http://0x7f.1/",
		"hex last label":       "http://127.0.0.0x1/",
		"octal IPv4":           "http://0177.0.0.1/",
		"IPv6":                 "http://[::1]/",
		"localhost":            "http://localhost:3000/x",
		"a localhost subdomain": "http://app.localhost/x",
		"internal name":        "http://router.internal/x",
		"single label":         "http://intranet/x",
		"punycode":             "https://xn--stckhub-4wa.example/login",
		"uppercase punycode":   "https://XN--stckhub-4wa.example/",
		"trailing dot":         "https://a.example./x",
		"backslash":            "https://a.example\\@evil.example/",
		"apostrophe":           "https://a.example/it's",
		"backtick":             "https://a.example/\x60x",
		"curly brace":          "https://a.example/{x}",
	} {
		if got, ok := clickableWebsite(in); ok {
			t.Errorf("%s: %q was linked as %q", name, in, got)
		}
		// And in the email it must fall back to the defanged text.
		it := item("Tool")
		it.Website = in
		_, html := digestWithoutHeader(t, []NewToolItem{it}, 0, 0)
		if got := strings.Count(html, "<a "); got != 1 {
			t.Errorf("%s: %d links in the email; only the Review link is allowed", name, got)
		}
	}
	for _, ok := range []string{
		"https://example.com", "http://sub.example.co.uk/a/b?c=d#e", "https://a-b.example.io/x_y",
		"https://example.com:8443/x", "https://3d.example.com/",
	} {
		if _, linked := clickableWebsite(ok); !linked {
			t.Errorf("%q is an ordinary address and should be a link", ok)
		}
	}
}

// The header's logo link is in every email. These tests are about what the rest
// of the email links to, so they set aside exactly that fixed text: anything
// else that gets in, in the header's place or out of it, is still counted.
func withoutHeader(t *testing.T, html string) string {
	t.Helper()
	if n := strings.Count(html, emailHeader); n != 1 {
		t.Fatalf("want the fixed email header exactly once, got %d:\n%s", n, html)
	}
	return strings.Replace(html, emailHeader, "", 1)
}

func digestWithoutHeader(t *testing.T, items []NewToolItem, more, moreSubmitters int) (string, string) {
	t.Helper()
	subject, html := BuildNewToolDigest(items, more, moreSubmitters)
	return subject, withoutHeader(t, html)
}

func rejectedWithoutHeader(t *testing.T, toolName, reason string) (string, string) {
	t.Helper()
	subject, html := BuildToolRejected(toolName, reason)
	return subject, withoutHeader(t, html)
}

func TestEmailHeaderLinksOnlyToTheSite(t *testing.T) {
	if got := strings.Count(emailHeader, "<a "); got != 1 {
		t.Fatalf("want one link in the header, got %d", got)
	}
	if !strings.Contains(emailHeader, `<a href="https://stackhub.me" `) {
		t.Errorf("the header link must go to the site:\n%s", emailHeader)
	}
	if !strings.Contains(emailHeader, `<img src="https://stackhub.me/email-logo.png" `) {
		t.Errorf("the logo must load from the site:\n%s", emailHeader)
	}
	if got := strings.Count(emailHeader, "://"); got != 2 {
		t.Errorf("want two URLs in the header, got %d", got)
	}
}
