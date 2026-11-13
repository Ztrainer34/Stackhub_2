// Package pg holds the small helpers every module needs to talk to Postgres
// through pgx and the sqlc-generated queries in pkg/db.
package pg

import (
	"context"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// TxBeginner is all the handlers and services need from the pool: a way to
// start a transaction. A pgx.Tx satisfies it too (its Begin opens a
// savepoint), which is how the integration tests run real handlers inside a
// transaction they roll back.
type TxBeginner interface {
	Begin(ctx context.Context) (pgx.Tx, error)
}

// Text wraps an optional string; nil is SQL NULL.
func Text(s *string) pgtype.Text {
	if s == nil {
		return pgtype.Text{Valid: false}
	}
	return pgtype.Text{
		String: *s,
		Valid:  true,
	}
}

// UUID wraps a uuid that is always present.
func UUID(u uuid.UUID) pgtype.UUID {
	return pgtype.UUID{Bytes: u, Valid: true}
}

// OptionalText stores a blank field as NULL rather than an empty string, so the
// page's "does this vendor have a website?" checks stay a single test.
func OptionalText(s string) pgtype.Text {
	trimmed := strings.TrimSpace(s)
	if trimmed == "" {
		return pgtype.Text{Valid: false}
	}
	return pgtype.Text{String: trimmed, Valid: true}
}
