// Package search serves full-text search over posts, tools and profiles.
package search

import "stackhub.com/stackhub/pkg/db"

// Handler serves this module's routes. main builds one at startup with the
// dependencies below; routes.go mounts its methods.
type Handler struct {
	Queries *db.Queries
}
