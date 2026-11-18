// Package tool serves the tool catalogue, tool pages and their owners' edits.
package tool

import (
	"stackhub.com/stackhub/internal/pg"
	"stackhub.com/stackhub/internal/storage"
	"stackhub.com/stackhub/pkg/db"
)

// Handler serves this module's routes. main builds one at startup with the
// dependencies below; routes.go mounts its methods.
type Handler struct {
	DB      pg.TxBeginner
	Queries *db.Queries
	Bucket  *storage.Bucket
}
