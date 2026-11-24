package mail

import (
	"regexp"
	"bytes"
	"context"
	"errors"
	"fmt"
	"html/template"
	netmail "net/mail"
	"net"
	"net/url"
	"strings"
	"unicode"

	"github.com/resend/resend-go/v2"
	"stackhub.com/stackhub/internal/validate"
)

type Mailer struct {
	client          *resend.Client
	welcomeTemplate *template.Template
	domain          string
}

func NewMailer(client *resend.Client, domain string) (*Mailer, error) {
	mailer := new(Mailer)
	mailer.client = client
	mailer.domain = domain

	welcomeTemplate, err := template.ParseFiles("./mail/generated/welcome.html")

	if err != nil {
		return mailer, err
	}

	mailer.welcomeTemplate = welcomeTemplate

	return mailer, nil
}

type WelcomeData struct {
	FirstName string
}

// emailShell wraps body HTML in the shared StackHub layout.
func emailShell(body string) string {
	return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>` +
		`<meta name="viewport" content="width=device-width,initial-scale=1"/></head>` +
		`<body style="margin:0;background:#f6f9fc;font-family:Inter,Arial,sans-serif">` +
		`<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f6f9fc;padding:24px 0"><tr><td align="center">` +
		`<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;background:#ffffff;border:1px solid #e6ebf1;border-radius:8px;overflow:hidden">` +
		`<tr><td style="background:#000000;padding:28px 40px;text-align:center">` +
		`<a href="` + siteURL + `" style="text-decoration:none">` +
		`<img src="` + siteURL + `/email-logo.png" width="48" height="48" alt="" style="display:block;margin:0 auto 10px;border:0"/>` +
		`<h1 style="color:#ffffff;font-size:24px;margin:0">StackHub</h1></a></td></tr>` +
		`<tr><td style="padding:36px 40px;color:#000000;font-size:16px;line-height:1.6">` + body + `</td></tr>` +
		`</table></td></tr></table></body></html>`
}

// siteURL is the public site origin, used to build links inside emails.
const siteURL = "https://stackhub.me"

// nameLink renders the actor's display name as a link to their profile (falls
// back to bold text when the username is unknown).
func nameLink(name, username string) string {
	if username == "" {
		return "<strong>" + template.HTMLEscapeString(name) + "</strong>"
	}
	return fmt.Sprintf(
		`<a href="%s/%s" style="color:#3182ce;text-decoration:none;font-weight:600">%s</a>`,
		siteURL, template.HTMLEscapeString(username), template.HTMLEscapeString(name),
	)
}

// ctaButton renders a call-to-action button. href is escaped: it carries
// user-controlled parts (a username, a post slug), and unescaped, a quote in
// one closed the attribute and let a user write their own markup — a fake
// "verify your account" link — into an email sent from StackHub's domain.
func ctaButton(href, label string, primary bool) string {
	bg := "#000000"
	color := "#ffffff"
	border := "#000000"
	if !primary {
		bg = "#ffffff"
		color = "#000000"
	}
	return fmt.Sprintf(
		`<a href="%s" style="display:inline-block;background:%s;color:%s;border:1px solid %s;text-decoration:none;font-size:15px;font-weight:600;padding:11px 22px;border-radius:6px;margin:0 8px 8px 0">%s</a>`,
		template.HTMLEscapeString(href), bg, color, border, template.HTMLEscapeString(label),
	)
}

// SendPlaybookStarred notifies an author that their playbook was starred.
func (m *Mailer) SendPlaybookStarred(ctx context.Context, to, actorName, actorUsername, playbookName, playbookURL string) error {
	var ctas string
	if playbookURL != "" {
		ctas += ctaButton(playbookURL, "View playbook", true)
	}
	if actorUsername != "" {
		ctas += ctaButton(siteURL+"/"+url.PathEscape(actorUsername), "View profile", false)
	}
	ctaBlock := ""
	if ctas != "" {
		ctaBlock = `<div style="margin:0 0 24px">` + ctas + `</div>`
	}

	body := fmt.Sprintf(
		`<p style="font-size:18px;color:#2d3748;margin:0 0 16px">Good news!</p>`+
			`<p style="margin:0 0 24px">%s just starred your playbook &ldquo;%s&rdquo;.</p>`+
			`%s`+
			`<p style="margin:0">Keep building,<br/><strong style="color:#2d3748">The StackHub Team</strong></p>`,
		nameLink(actorName, actorUsername), template.HTMLEscapeString(playbookName), ctaBlock,
	)

	params := &resend.SendEmailRequest{
		From:    fmt.Sprintf("StackHub <notifications@%s>", m.domain),
		To:      []string{to},
		Subject: "⭐ Your playbook got some love!",
		Html:    emailShell(body),
	}

	_, err := m.client.Emails.SendWithContext(ctx, params)
	return err
}

// SendToolApproved notifies a user that a tool they suggested was approved.
func (m *Mailer) SendToolApproved(ctx context.Context, to, toolName string) error {
	body := fmt.Sprintf(
		`<p style="font-size:18px;color:#2d3748;margin:0 0 16px">Good news!</p>`+
			`<p style="margin:0 0 24px">The tool you suggested, <strong>%s</strong>, has been reviewed and added to StackHub. Any playbook that was waiting on it is now live.</p>`+
			`<p style="margin:0">Thanks for helping the catalog grow,<br/><strong style="color:#2d3748">The StackHub Team</strong></p>`,
		template.HTMLEscapeString(toolName),
	)

	params := &resend.SendEmailRequest{
		From:    fmt.Sprintf("StackHub <notifications@%s>", m.domain),
		To:      []string{to},
		Subject: "✅ Your suggested tool was approved",
		Html:    emailShell(body),
	}

	_, err := m.client.Emails.SendWithContext(ctx, params)
	return err
}

// Caps on the text of a rejection email, in characters. The reason is already
// capped at 500 by the ticket service; the mailer does not trust that.
const (
	maxRejectedToolNameRunes = 200
	maxRejectedReasonRunes   = 500
)

// toolRejectedSubject is constant on purpose: the subject never carries user
// text, so neither a tool name nor a reason can write the subject line.
const toolRejectedSubject = "Update on the tool you suggested"

// BuildToolRejected renders the email telling a user that a tool they suggested
// was not approved. The tool name and the reviewer's reason are free text: each
// goes through the same three steps as the admin digest (clean, neutralise
// links, HTML-escape, in that order), so nothing in them can become markup, a
// clickable link or a header. The only link is the constant button to the
// site's tool list; the reason is never part of an href.
func BuildToolRejected(toolName, reason string) (subject, html string) {
	name := digestText(toolName, maxRejectedToolNameRunes)
	why := digestText(reason, maxRejectedReasonRunes)

	var b strings.Builder
	b.WriteString(`<p style="font-size:18px;color:#2d3748;margin:0 0 16px">Thanks for your suggestion.</p>`)
	b.WriteString(`<p style="margin:0 0 16px">We reviewed the tool you suggested, <strong>` + name + `</strong>, and we were not able to add it to StackHub this time.</p>`)
	b.WriteString(`<p style="margin:0 0 8px;font-size:14px;color:#718096">The reviewer&rsquo;s reason</p>`)
	b.WriteString(`<div style="background:#f7fafc;border-left:3px solid #cbd5e0;border-radius:4px;padding:10px 14px;margin:0 0 24px;color:#2d3748">` + why + `</div>`)
	b.WriteString(`<div style="margin:0 0 24px">` + ctaButton(siteURL+"/tools", "Browse tools", true) + `</div>`)
	b.WriteString(`<p style="margin:0">Thanks for helping the catalog grow,<br/><strong style="color:#2d3748">The StackHub Team</strong></p>`)

	return toolRejectedSubject, emailShell(b.String())
}

// SendToolRejected notifies a user that a tool they suggested was not
// approved, with the reviewer's reason. The error it returns is fixed text: a
// provider error can echo the recipient's address, and the caller logs it.
func (m *Mailer) SendToolRejected(ctx context.Context, to, toolName, reason string) error {
	subject, html := BuildToolRejected(toolName, reason)

	params := &resend.SendEmailRequest{
		From:    fmt.Sprintf("StackHub <notifications@%s>", m.domain),
		To:      []string{to},
		Subject: subject,
		Html:    html,
	}

	if _, err := m.client.Emails.SendWithContext(ctx, params); err != nil {
		return errors.New("tool rejected email: provider rejected the send")
	}
	return nil
}

// SendNewFollower notifies a user that someone started following them.
func (m *Mailer) SendNewFollower(ctx context.Context, to, actorName, actorUsername string) error {
	ctaBlock := ""
	if actorUsername != "" {
		ctaBlock = `<div style="margin:0 0 24px">` +
			ctaButton(siteURL+"/"+url.PathEscape(actorUsername), "View profile", true) +
			`</div>`
	}

	body := fmt.Sprintf(
		`<p style="margin:0 0 16px">%s just followed you.</p>`+
			`<p style="margin:0 0 24px">They&rsquo;ll now be updated about your new playbooks and stack changes.</p>`+
			`%s`+
			`<p style="margin:0">Keep inspiring,<br/><strong style="color:#2d3748">The StackHub Team</strong></p>`,
		nameLink(actorName, actorUsername), ctaBlock,
	)

	params := &resend.SendEmailRequest{
		From:    fmt.Sprintf("StackHub <notifications@%s>", m.domain),
		To:      []string{to},
		Subject: "👋 You have a new follower",
		Html:    emailShell(body),
	}

	_, err := m.client.Emails.SendWithContext(ctx, params)
	return err
}

func (m *Mailer) SendWelcome(ctx context.Context, to string, data WelcomeData) error {
	var buffer bytes.Buffer

	m.welcomeTemplate.Execute(&buffer, data)

	params := &resend.SendEmailRequest{
		From:    fmt.Sprintf("StackHub <welcome@%s>", m.domain),
		To:      []string{to},
		Subject: "Welcome to StackHub, your Hub for tools",
		Html:    buffer.String(),
	}

	_, err := m.client.Emails.SendWithContext(ctx, params)

	if err != nil {
		return err
	}

	return nil
}

// NewToolItem is one suggested tool in the admin digest. Every field except
// TicketID comes from a signed-in user and is untrusted.
type NewToolItem struct {
	TicketID          string
	ToolName          string
	Website           string
	Description       string
	RequesterUsername string
	PlaybookName      string
	Categories        []string
}

// ParseRecipients reads a comma-separated list of plain email addresses (the
// ADMIN_NOTIFY_EMAILS setting). An empty list is nil, nil: the feature is off.
// Anything else wrong — an empty entry, a display name, an angle bracket, a
// quote, a control character, more than max addresses — is an error and the
// caller turns the feature off, rather than mailing half a list. The error
// never echoes the input.
func ParseRecipients(raw string, max int) ([]string, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}

	var out []string
	seen := map[string]bool{}
	for _, token := range strings.Split(raw, ",") {
		token = strings.TrimSpace(token)
		if token == "" {
			return nil, errors.New("recipient list has an empty entry")
		}
		for _, r := range token {
			if unicode.IsControl(r) || r == '"' || r == '<' || r == '>' {
				return nil, errors.New("recipient list has an unsafe character")
			}
		}
		addr, err := netmail.ParseAddress(token)
		if err != nil || addr.Name != "" || addr.Address != token {
			return nil, errors.New("recipient list has an invalid address")
		}
		key := strings.ToLower(token)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, token)
	}
	if len(out) > max {
		return nil, errors.New("recipient list is too long")
	}
	return out, nil
}

// sanitize makes user text safe to show in the admin digest: control, format
// and line/paragraph-separator characters (CR, LF, tab, right-to-left
// overrides, zero-width characters, U+2028) become spaces, runs of whitespace
// collapse, and the result is cut to maxRunes with an ellipsis. It does NOT
// escape HTML: do that last, after cutting, so an entity is never cut in half.
func sanitize(s string, maxRunes int) string {
	s = validate.CleanText(s)

	runes := []rune(s)
	if len(runes) <= maxRunes {
		return s
	}
	return strings.TrimSpace(string(runes[:maxRunes])) + "…"
}

const maxWebsiteRunes = 300

// defangURL turns a user's website into text no mail client will link or
// pre-fetch: the scheme becomes hxxp(s), no "://" survives, and "." and "@"
// are bracketed, so https://stackhub.me@evil.example cannot read as, or
// auto-link to, a StackHub address. The admin reads it and decides.
func defangURL(s string) string {
	s = sanitize(s, maxWebsiteRunes)
	switch {
	case len(s) >= 8 && strings.EqualFold(s[:8], "https://"):
		s = "hxxps://" + s[8:]
	case len(s) >= 7 && strings.EqualFold(s[:7], "http://"):
		s = "hxxp://" + s[7:]
	}
	s = strings.ReplaceAll(s, "://", "[:]//")
	s = strings.ReplaceAll(s, ".", "[.]")
	s = strings.ReplaceAll(s, "@", "[at]")
	return s
}

// linkLike matches the places a mail client starts auto-linking plain text:
// a dot inside a word (evil.example, www.x.com) and "@" (user@host). Ordinary
// sentence punctuation (a dot followed by a space or the end) is left alone.
var linkLike = regexp.MustCompile(`\.([\p{L}\p{N}])`)

// neutraliseLinks stops free text from becoming a clickable link in the admin's
// mail client. HTML-escaping alone does not: Gmail and Outlook link bare URLs
// and domains. The scheme becomes hxxp(s), "://" is broken, and in-word dots
// and "@" are bracketed. The admin can still read it; nothing is clickable.
func neutraliseLinks(s string) string {
	for _, p := range []struct{ from, to string }{{"https://", "hxxps://"}, {"http://", "hxxp://"}} {
		for {
			i := strings.Index(strings.ToLower(s), p.from)
			if i < 0 {
				break
			}
			s = s[:i] + p.to + s[i+len(p.from):]
		}
	}
	s = strings.ReplaceAll(s, "://", "[:]//")
	s = linkLike.ReplaceAllString(s, "[.]$1")
	return strings.ReplaceAll(s, "@", "[at]")
}

// hostName is what a link's host must look like to be shown as a clickable
// link: plain ASCII labels only. A non-ASCII host (a lookalike of a familiar
// domain) is left defanged instead.
var hostName = regexp.MustCompile(`^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$`)

// clickableWebsite returns the website as a safe address to link to, or false.
// The admin is about to review the site anyway, so the one field that is
// itself an address is worth a real link; everything else stays defanged.
//
// It refuses (and the caller falls back to defangURL) unless the stored text is
// exactly what we would show: nothing was cleaned or cut, it is http(s), it has
// a plain ASCII host, and it carries no user info. The last rule matters because
// the link text is the address itself: https://stackhub.me@evil.example would
// read as a StackHub address while going to evil.example.
func clickableWebsite(raw string) (string, bool) {
	s := strings.TrimSpace(raw)
	if s == "" || sanitize(s, maxWebsiteRunes) != s {
		return "", false
	}
	// url.Parse accepts these inside a path or query, but a link that carries
	// markup or quoting characters is not one to put in an admin's inbox.
	if strings.ContainsAny(s, "\"'<>`{}|\\^ ") {
		return "", false
	}
	if checked, ok := validate.WebURL(s); !ok || checked != s {
		return "", false
	}
	u, err := url.Parse(s)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.Opaque != "" {
		return "", false
	}
	if !publicLookingHost(u.Hostname()) {
		return "", false
	}
	return s, true
}

// publicLookingHost is true for an ordinary registered-looking domain name. It
// refuses what a click could use against the admin's own machine or network
// (IP literals in any spelling browsers accept, localhost), and punycode
// labels, which a browser may display as the Unicode lookalike they encode.
func publicLookingHost(host string) bool {
	if !hostName.MatchString(host) || net.ParseIP(host) != nil {
		return false
	}
	labels := strings.Split(strings.ToLower(host), ".")
	for _, l := range labels {
		if strings.HasPrefix(l, "xn--") {
			return false
		}
	}
	if last := labels[len(labels)-1]; last == "localhost" || last == "local" || last == "internal" ||
		strings.HasPrefix(last, "0x") || strings.Trim(last, "0123456789") == "" {
		// A numeric last label is an IPv4 address in decimal, octal or hex
		// form (2130706433, 0x7f.1); no real top-level domain is numeric.
		return false
	}
	return len(labels) >= 2
}

// digestText is sanitize, then neutralise links, then HTML-escape, in that
// order: truncating after escaping could cut an entity in half.
func digestText(s string, maxRunes int) string {
	return template.HTMLEscapeString(neutraliseLinks(sanitize(s, maxRunes)))
}

// BuildNewToolDigest renders the admin email for newly suggested tools. The
// subject is constant text and a count: it never contains user input, so a
// suggestion cannot write the subject line. The links per tool are the
// Review button, built from siteURL and the ticket id, and the website when it
// passes clickableWebsite; nothing else a user wrote is ever put in an href.
// Everything a user wrote is escaped and labelled unverified.
func BuildNewToolDigest(items []NewToolItem, more int, moreSubmitters int) (subject, html string) {
	total := len(items) + more
	if total == 1 {
		subject = "New tool suggestion on StackHub"
	} else {
		subject = fmt.Sprintf("New tool suggestions on StackHub (%d)", total)
	}

	var b strings.Builder
	b.WriteString(`<p style="font-size:18px;color:#2d3748;margin:0 0 16px">`)
	if total == 1 {
		b.WriteString(`A new tool was suggested.`)
	} else {
		b.WriteString(fmt.Sprintf(`%d new tools were suggested.`, total))
	}
	b.WriteString(`</p>`)

	line := func(text string) {
		b.WriteString(`<p style="margin:0 0 4px;font-size:14px;color:#2d3748">` + text + `</p>`)
	}

	for _, it := range items {
		b.WriteString(`<div style="border:1px solid #e6ebf1;border-radius:6px;padding:16px;margin:0 0 16px">`)
		b.WriteString(`<p style="margin:0 0 8px;font-size:12px;color:#718096">Unverified user input — check it before you trust it</p>`)
		b.WriteString(`<div style="background:#f7fafc;border-radius:4px;padding:10px 12px;margin:0 0 12px">`)
		if name := digestText(it.ToolName, 200); name != "" {
			b.WriteString(`<p style="margin:0 0 6px;font-size:16px;color:#000000"><strong>` + name + `</strong></p>`)
		}
		if addr, ok := clickableWebsite(it.Website); ok {
			esc := template.HTMLEscapeString(addr)
			line(`Website: <a href="` + esc + `" rel="noopener noreferrer" style="color:#2b6cb0">` + esc + `</a>`)
		} else if site := defangURL(it.Website); site != "" {
			line("Website: " + template.HTMLEscapeString(site))
		}
		if desc := digestText(it.Description, 300); desc != "" {
			line("Description: " + desc)
		}
		var cats []string
		for _, c := range it.Categories {
			if c = digestText(c, 60); c != "" {
				cats = append(cats, c)
			}
		}
		if len(cats) > 0 {
			line("Categories: " + strings.Join(cats, ", "))
		}
		if user := digestText(it.RequesterUsername, 30); user != "" {
			line("Suggested by @" + user)
		}
		if pb := digestText(it.PlaybookName, 120); pb != "" {
			line("From playbook: " + pb)
		}
		b.WriteString(`</div>`)
		b.WriteString(ctaButton(siteURL+"/admin/tool-tickets/"+url.PathEscape(it.TicketID), "Review", true))
		b.WriteString(`</div>`)
	}

	if more > 0 {
		b.WriteString(fmt.Sprintf(`<p style="margin:0 0 12px">+%d more from %d submitters not listed.</p>`, more, moreSubmitters))
		b.WriteString(`<div style="margin:0 0 16px">` + ctaButton(siteURL+"/admin/tool-tickets", "Open the ticket queue", false) + `</div>`)
	}

	b.WriteString(`<p style="margin:16px 0 0;font-size:12px;color:#718096">You get this because you are listed as a StackHub admin.</p>`)

	return subject, emailShell(b.String())
}

// SendNewToolDigest emails the admins a digest of newly suggested tools. The
// error it returns is fixed text: a provider error can echo the recipients, and
// the caller logs it.
func (m *Mailer) SendNewToolDigest(ctx context.Context, to []string, items []NewToolItem, more, moreSubmitters int) error {
	if len(to) == 0 {
		return errors.New("new tool digest: no recipients")
	}
	subject, html := BuildNewToolDigest(items, more, moreSubmitters)

	params := &resend.SendEmailRequest{
		From:    fmt.Sprintf("StackHub <notifications@%s>", m.domain),
		To:      to,
		Subject: subject,
		Html:    html,
	}

	if _, err := m.client.Emails.SendWithContext(ctx, params); err != nil {
		return errors.New("new tool digest: provider rejected the send")
	}
	return nil
}
