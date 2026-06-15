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

func (m *Mailer) SendWelcome(ctx context.Context, to string, data WelcomeData) error {
	var buffer bytes.Buffer

	m.welcomeTemplate.Execute(&buffer, data)

	params := &resend.SendEmailRequest{
		From:    fmt.Sprintf("StackHub <welcome@%s>", m.domain),
		To:      []string{to},
		Subject: "Welcome to StackHub, your Knowledge Hub for tools",
		Html:    buffer.String(),
	}

	_, err := m.client.Emails.SendWithContext(ctx, params)

	if err != nil {
		return err
	}

	return nil
}
