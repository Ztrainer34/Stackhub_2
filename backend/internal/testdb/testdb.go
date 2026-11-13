// Package testdb is the shared harness for integration tests that run against
// a REAL Postgres. Only test files import it.
//
// Opt-in by design. Set TEST_DB_CONNECTION to a LOCAL database:
//
//	$env:TEST_DB_CONNECTION = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
//	go test ./... -run Integration -v
//
// Without it these tests skip, so `go test ./...` stays safe to run anywhere.
// Every test runs inside a transaction that is always rolled back, so the local
// database is left exactly as it was found.
package testdb

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Open connects to the test database, or skips. It refuses to run against
// anything that looks hosted — a service-role connection string pasted in by
// mistake would otherwise let a test write to production.
func Open(t *testing.T) *pgx.Conn {
	t.Helper()

	dsn := os.Getenv("TEST_DB_CONNECTION")
	if dsn == "" {
		t.Skip("TEST_DB_CONNECTION not set — skipping integration test")
	}
	if strings.Contains(dsn, "supabase.co") || strings.Contains(dsn, "supabase.com") {
		t.Fatal("TEST_DB_CONNECTION points at a hosted Supabase project. " +
			"Integration tests mutate data and must only run against a local database.")
	}

	conn, err := pgx.Connect(context.Background(), dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(func() { conn.Close(context.Background()) })

	return conn
}

// Begin starts a transaction that is rolled back when the test ends, whatever
// happens. Nothing a test writes survives it.
func Begin(t *testing.T, conn *pgx.Conn) pgx.Tx {
	t.Helper()

	tx, err := conn.Begin(context.Background())
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	t.Cleanup(func() { _ = tx.Rollback(context.Background()) })

	return tx
}

// Rollback is Open and Begin together, for the common case.
func Rollback(t *testing.T) pgx.Tx {
	t.Helper()
	return Begin(t, Open(t))
}

// TwoProfiles returns two distinct existing profiles, or skips. Creating
// profiles would mean inserting into auth.users, which is Supabase-managed;
// reusing what the seed script made is simpler and closer to real data.
func TwoProfiles(t *testing.T, tx pgx.Tx) (uuid.UUID, uuid.UUID) {
	t.Helper()
	profiles := IDs[uuid.UUID](t, tx, `SELECT id FROM profiles ORDER BY created_at LIMIT 2`)
	if len(profiles) < 2 {
		t.Skip("need two profiles — seed the database first")
	}
	return profiles[0], profiles[1]
}

// SomeTools returns n existing tools, or skips.
func SomeTools(t *testing.T, tx pgx.Tx, n int) []uuid.UUID {
	t.Helper()
	tools := IDs[uuid.UUID](t, tx, `SELECT id FROM tools ORDER BY id LIMIT $1`, n)
	if len(tools) < n {
		t.Skipf("need %d tools — seed the database first", n)
	}
	return tools
}

// SomeCategories returns n existing category ids, or skips.
func SomeCategories(t *testing.T, tx pgx.Tx, n int) []int32 {
	t.Helper()
	cats := IDs[int32](t, tx, `SELECT id FROM categories ORDER BY id LIMIT $1`, n)
	if len(cats) < n {
		t.Skipf("need %d categories — seed the database first", n)
	}
	return cats
}

// ActorName is the name notifications use for a profile: display name, then
// username, then "Someone".
func ActorName(t *testing.T, tx pgx.Tx, id uuid.UUID) string {
	t.Helper()
	return Scalar[string](t, tx, `SELECT COALESCE(NULLIF(display_name, ''), NULLIF(username, ''), 'Someone') FROM profiles WHERE id = $1`, id)
}

// Scalar runs a query that returns one value.
func Scalar[T any](t *testing.T, tx pgx.Tx, sql string, args ...any) T {
	t.Helper()
	var v T
	if err := tx.QueryRow(context.Background(), sql, args...).Scan(&v); err != nil {
		t.Fatalf("%s: %v", sql, err)
	}
	return v
}

// IDs runs a query that returns one column.
func IDs[T any](t *testing.T, tx pgx.Tx, sql string, args ...any) []T {
	t.Helper()
	rows, err := tx.Query(context.Background(), sql, args...)
	if err != nil {
		t.Fatalf("%s: %v", sql, err)
	}
	out, err := pgx.CollectRows(rows, pgx.RowTo[T])
	if err != nil {
		t.Fatalf("%s: %v", sql, err)
	}
	return out
}

// SortedInts prints ids in order, for comparing sets.
func SortedInts(v []int32) string {
	s := append([]int32(nil), v...)
	sort.Slice(s, func(i, j int) bool { return s[i] < s[j] })
	return fmt.Sprint(s)
}

// MigrationUp returns the Up section of a migration file, the way it is pasted
// into the Supabase SQL editor.
func MigrationUp(t *testing.T, name string) string {
	t.Helper()
	_, here, _, _ := runtime.Caller(0) // backend/internal/testdb/testdb.go
	path := filepath.Join(filepath.Dir(here), "..", "..", "db", "migrations", name)
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	sql := strings.ReplaceAll(string(raw), "\r\n", "\n")
	start := strings.Index(sql, "-- +goose Up")
	end := strings.Index(sql, "-- +goose Down")
	if start < 0 || end < start {
		t.Fatalf("%s has no goose Up/Down sections", name)
	}
	return sql[start:end]
}
