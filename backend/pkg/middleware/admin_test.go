package middleware

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
)

// serve runs one request through RequireAdmin and reports the recorded answer
// plus whether the checker and the next handler ran.
func serve(t *testing.T, checker AdminChecker, ctx context.Context) (rec *httptest.ResponseRecorder, nextRan bool) {
	t.Helper()
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextRan = true
		w.WriteHeader(http.StatusOK)
	})
	req := httptest.NewRequest(http.MethodGet, "/admin/x", nil).WithContext(ctx)
	rec = httptest.NewRecorder()
	RequireAdmin(checker)(next).ServeHTTP(rec, req)
	return rec, nextRan
}

func withUser(id any) context.Context {
	return context.WithValue(context.Background(), UserIDKey{}, id)
}

func TestRequireAdminAllowsAnAdmin(t *testing.T) {
	id := uuid.New()
	var got uuid.UUID
	rec, nextRan := serve(t, func(_ context.Context, userID uuid.UUID) (bool, error) {
		got = userID
		return true, nil
	}, withUser(id))

	if rec.Code != http.StatusOK || !nextRan {
		t.Errorf("admin: status %d, next ran %v; want 200 and true", rec.Code, nextRan)
	}
	if got != id {
		t.Errorf("checker saw %v; want the context's user id %v", got, id)
	}
}

func TestRequireAdminRefusesANonAdmin(t *testing.T) {
	rec, nextRan := serve(t, func(context.Context, uuid.UUID) (bool, error) { return false, nil }, withUser(uuid.New()))

	if rec.Code != http.StatusForbidden || rec.Body.String() != "Forbidden\n" {
		t.Errorf("non-admin: %d %q; want 403 %q", rec.Code, rec.Body.String(), "Forbidden\n")
	}
	if nextRan {
		t.Error("next ran for a non-admin")
	}
}

func TestRequireAdminRefusesWhenNoUserIsKnown(t *testing.T) {
	cases := []struct {
		name string
		ctx  context.Context
	}{
		{"no user id in the context", context.Background()},
		{"nil uuid", withUser(uuid.Nil)},
		{"wrong type", withUser(uuid.NewString())},
		{"nil value", withUser(nil)},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			checked := false
			rec, nextRan := serve(t, func(context.Context, uuid.UUID) (bool, error) {
				checked = true
				return true, nil
			}, c.ctx)

			if rec.Code != http.StatusUnauthorized || rec.Body.String() != "Unauthorized\n" {
				t.Errorf("%d %q; want 401 %q", rec.Code, rec.Body.String(), "Unauthorized\n")
			}
			if checked {
				t.Error("checker was called without a valid user id")
			}
			if nextRan {
				t.Error("next ran without a valid user id")
			}
		})
	}
}

func TestRequireAdminFailsClosedOnACheckerError(t *testing.T) {
	rec, nextRan := serve(t, func(context.Context, uuid.UUID) (bool, error) {
		// Returning true alongside an error must still not let anyone in.
		return true, errors.New("database is down")
	}, withUser(uuid.New()))

	if rec.Code != http.StatusInternalServerError || rec.Body.String() != "Internal server error\n" {
		t.Errorf("checker error: %d %q; want 500 %q", rec.Code, rec.Body.String(), "Internal server error\n")
	}
	if nextRan {
		t.Error("next ran after a checker error")
	}
}

func TestRequireAdminPanicsOnANilChecker(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Error("RequireAdmin(nil) did not panic")
		}
	}()
	RequireAdmin(nil)
}

func TestRequireAdminNeverRunsNextWhenTheCheckerPanics(t *testing.T) {
	nextRan := false
	next := http.HandlerFunc(func(http.ResponseWriter, *http.Request) { nextRan = true })
	h := RequireAdmin(func(context.Context, uuid.UUID) (bool, error) { panic("boom") })(next)
	req := httptest.NewRequest(http.MethodGet, "/admin/x", nil).WithContext(withUser(uuid.New()))

	func() {
		defer func() { _ = recover() }() // chi's Recoverer does this in the real router
		h.ServeHTTP(httptest.NewRecorder(), req)
	}()

	if nextRan {
		t.Error("next ran although the checker panicked")
	}
}

// Revocation must apply on the very next request: nothing may cache the answer.
func TestRequireAdminAsksTheCheckerOnEveryRequest(t *testing.T) {
	admin := true
	calls := 0
	checker := func(context.Context, uuid.UUID) (bool, error) {
		calls++
		return admin, nil
	}
	ctx := withUser(uuid.New())

	if rec, _ := serve(t, checker, ctx); rec.Code != http.StatusOK {
		t.Fatalf("first request: %d; want 200", rec.Code)
	}
	admin = false
	if rec, _ := serve(t, checker, ctx); rec.Code != http.StatusForbidden {
		t.Errorf("request after revoking: %d; want 403", rec.Code)
	}
	if calls != 2 {
		t.Errorf("checker called %d times for 2 requests", calls)
	}
}
