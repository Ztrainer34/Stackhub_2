// Package post serves playbooks and comparisons: reading, editing, stars and comments.
package post

import (
	"stackhub.com/stackhub/internal/pg"
	"stackhub.com/stackhub/internal/storage"
	"stackhub.com/stackhub/pkg/db"
	"stackhub.com/stackhub/pkg/mail"
)

// Handler serves this module's routes. main builds one at startup with the
// dependencies below; routes.go mounts its methods.
type Handler struct {
	DB      pg.TxBeginner
	Queries *db.Queries
	Mailer  *mail.Mailer // nil in tests: emails are skipped
	Bucket  *storage.Bucket
}
