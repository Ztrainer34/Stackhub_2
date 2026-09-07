package mail

import (
	"bytes"
	"context"
	"fmt"
	"html/template"

	"github.com/resend/resend-go/v2"
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
		`<tr><td style="background:#000000;padding:28px 40px;text-align:center"><h1 style="color:#ffffff;font-size:24px;margin:0">StackHub</h1></td></tr>` +
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

// ctaButton renders a call-to-action button.
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
		href, bg, color, border, template.HTMLEscapeString(label),
	)
}

// SendPlaybookStarred notifies an author that their playbook was starred.
func (m *Mailer) SendPlaybookStarred(ctx context.Context, to, actorName, actorUsername, playbookName, playbookURL string) error {
	var ctas string
	if playbookURL != "" {
		ctas += ctaButton(playbookURL, "View playbook", true)
	}
	if actorUsername != "" {
		ctas += ctaButton(siteURL+"/"+actorUsername, "View profile", false)
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

// SendNewFollower notifies a user that someone started following them.
func (m *Mailer) SendNewFollower(ctx context.Context, to, actorName, actorUsername string) error {
	ctaBlock := ""
	if actorUsername != "" {
		ctaBlock = `<div style="margin:0 0 24px">` +
			ctaButton(siteURL+"/"+actorUsername, "View profile", true) +
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
