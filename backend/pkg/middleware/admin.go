package middleware

import (
	"context"
	"log"
	"net/http"

	"github.com/google/uuid"
)

// AdminChecker reports whether a profile holds the admin role. main wires it to
// a database query; tests pass a stub.
type AdminChecker func(ctx context.Context, userID uuid.UUID) (bool, error)

// RequireAdmin lets a request through only when the signed-in user is an admin.
// It must run after Authenticator, which puts the user id in the context.
//
// It fails closed: a missing or malformed user id is a 401, a checker error is
// a 500, and next runs only when the checker says true. A checker that panics
// never reaches next either (the Recoverer turns the panic into a 500).
//
// The check goes to the database on every request on purpose, so revoking an
// admin takes effect on their very next request. Any future cache must have a
// TTL of 60 seconds or less, and a test that pins it.
func RequireAdmin(isAdmin AdminChecker) func(http.Handler) http.Handler {
	if isAdmin == nil {
		panic("middleware.RequireAdmin: nil AdminChecker")
	}
	return func(next http.Handler) http.Handler {
		hfn := func(w http.ResponseWriter, r *http.Request) {
			userID, ok := r.Context().Value(UserIDKey{}).(uuid.UUID)
			if !ok || userID == uuid.Nil {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}

			admin, err := isAdmin(r.Context(), userID)
			if err != nil {
				log.Println(err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
				return
			}
			if !admin {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		}
		return http.HandlerFunc(hfn)
	}
}
