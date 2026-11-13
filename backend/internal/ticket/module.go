// Package ticket handles tool suggestions (tool tickets) and their resolution.
//
// /admin has no role check (see CLAUDE.md), so everything here is reachable by
// any signed-in user. Nothing here may grant more than a ticket resolution.
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
}
