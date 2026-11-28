package httpx

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"stackhub.com/stackhub/internal/apperr"
)

func TestWriteError(t *testing.T) {
	t.Run("a service error answers with its own status and text, never its cause", func(t *testing.T) {
		rec := httptest.NewRecorder()
		WriteError(rec, apperr.Internal("Could not search", errors.New("pq: secret table detail")))
		if rec.Code != http.StatusInternalServerError || rec.Body.String() != "Could not search\n" {
			t.Errorf("got %d %q", rec.Code, rec.Body.String())
		}
	})
	t.Run("any other error is a bare 500", func(t *testing.T) {
		rec := httptest.NewRecorder()
		WriteError(rec, errors.New("connection refused to 10.0.0.5"))
		if rec.Code != http.StatusInternalServerError || rec.Body.String() != "Internal server error\n" {
			t.Errorf("got %d %q", rec.Code, rec.Body.String())
		}
	})
	t.Run("a wrapped service error is still found", func(t *testing.T) {
		rec := httptest.NewRecorder()
		WriteError(rec, errors.Join(errors.New("context"), apperr.Conflict("This ticket has already been resolved")))
		if rec.Code != http.StatusConflict || rec.Body.String() != "This ticket has already been resolved\n" {
			t.Errorf("got %d %q", rec.Code, rec.Body.String())
		}
	})
	t.Run("every kind maps to its status", func(t *testing.T) {
		for kind, want := range map[apperr.Kind]int{
			apperr.KindInvalid:      http.StatusBadRequest,
			apperr.KindUnauthorized: http.StatusUnauthorized,
			apperr.KindForbidden:    http.StatusForbidden,
			apperr.KindNotFound:     http.StatusNotFound,
			apperr.KindConflict:     http.StatusConflict,
			apperr.KindInternal:     http.StatusInternalServerError,
		} {
			rec := httptest.NewRecorder()
			WriteError(rec, &apperr.Error{Kind: kind, Message: "m"})
			if rec.Code != want {
				t.Errorf("kind %d answered %d; want %d", kind, rec.Code, want)
			}
		}
	})
}
