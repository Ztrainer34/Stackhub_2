// Package stack serves a user's stack, watchlist and old stack.
package stack

import (
	"stackhub.com/stackhub/internal/pg"
	"stackhub.com/stackhub/pkg/db"
)

// Handler serves this module's routes. main builds one at startup with the
// dependencies below; routes.go mounts its methods.
type Handler struct {
	DB      pg.TxBeginner
	Queries *db.Queries
}
