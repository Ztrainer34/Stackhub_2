package curation

import (
	"strings"
	"testing"

	"stackhub.com/stackhub/internal/validate"
)

func TestExcludedUsernames(t *testing.T) {
	got := ExcludedUsernames()
	if len(got) == 0 {
		t.Fatal("the excluded list must not be empty: nil becomes NULL in SQL and filters every row out")
	}
	seen := map[string]bool{}
	for _, u := range got {
		if u != strings.ToLower(u) {
			t.Errorf("%q is not lowercase; usernames are stored lowercase", u)
		}
		if msg := validate.UsernameProblem(u); msg != "" {
			t.Errorf("%q is not a valid username: %s", u, msg)
		}
		if seen[u] {
			t.Errorf("%q is listed twice", u)
		}
		seen[u] = true
	}
}

func TestExcludedUsernamesReturnsACopy(t *testing.T) {
	first := ExcludedUsernames()
	first[0] = "changed"
	if ExcludedUsernames()[0] == "changed" {
		t.Error("a caller changed the shared list")
	}
}
