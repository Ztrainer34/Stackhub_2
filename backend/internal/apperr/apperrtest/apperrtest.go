// Package apperrtest checks service errors in tests. Only test files import it.
package apperrtest

import (
	"errors"
	"testing"

	"stackhub.com/stackhub/internal/apperr"
)

// Want checks that err is an apperr.Error of this kind with exactly this
// message — the text the client will see.
func Want(t *testing.T, name string, err error, kind apperr.Kind, msg string) {
	t.Helper()
	var ae *apperr.Error
	if !errors.As(err, &ae) {
		t.Errorf("%s: err = %v; want kind %d %q", name, err, kind, msg)
		return
	}
	if ae.Kind != kind || ae.Message != msg {
		t.Errorf("%s: got kind %d %q; want kind %d %q", name, ae.Kind, ae.Message, kind, msg)
	}
}
