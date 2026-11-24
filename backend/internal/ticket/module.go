// Package ticket handles tool suggestions (tool tickets) and their resolution.
//
// /admin requires the admin role (admins table, RequireAdmin in routes.go).
// Suggesting a tool needs only a signed-in user. Nothing here may grant more
// than a ticket resolution.
package ticket

import (
	"stackhub.com/stackhub/internal/pg"
	"stackhub.com/stackhub/pkg/db"
	"stackhub.com/stackhub/pkg/mail"
)

// Handler serves this module's routes. main builds one at startup with the
// dependencies below; routes.go mounts its methods.
type Handler struct {
	DB      pg.TxBeginner
	Queries *db.Queries
	Mailer  *mail.Mailer // nil in tests: emails are skipped
	Alerter *Alerter     // nil when ADMIN_NOTIFY_EMAILS is unset, and in tests
}
