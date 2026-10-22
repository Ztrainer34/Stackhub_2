// Package category serves category lookups and autocomplete.
package category

import "stackhub.com/stackhub/pkg/db"

// Handler serves this module's routes. main builds one at startup with the
// dependencies below; routes.go mounts its methods.
type Handler struct {
	Queries *db.Queries
}
