package pg

import "testing"

// resolveToolID's UUID branch is reachable without a database: a well-formed
// UUID short-circuits before any query runs. The slug branch needs Postgres and
// is left to the running app.
func TestOptionalText(t *testing.T) {
	tests := []struct {
		name      string
		in        string
		wantValid bool
		wantText  string
	}{
		{"a value is stored", "Paris", true, "Paris"},
		{"surrounding whitespace is trimmed", "  Paris  ", true, "Paris"},
		{"empty becomes NULL, not an empty string", "", false, ""},
		{"whitespace-only becomes NULL", "   ", false, ""},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := OptionalText(tc.in)
			if got.Valid != tc.wantValid {
				t.Errorf("OptionalText(%q).Valid = %v, want %v", tc.in, got.Valid, tc.wantValid)
			}
			if got.Valid && got.String != tc.wantText {
				t.Errorf("OptionalText(%q).String = %q, want %q", tc.in, got.String, tc.wantText)
			}
		})
	}
}
