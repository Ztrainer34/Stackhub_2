// Package notification serves a user's notifications, and names the actor
// in notifications and emails other modules send.
package notification

import "stackhub.com/stackhub/pkg/db"

// Handler serves this module's routes. main builds one at startup with the
// dependencies below; routes.go mounts its methods.
type Handler struct {
	Queries *db.Queries
}
