package search

import (
	"strconv"
	"testing"

	"stackhub.com/stackhub/internal/apperr"
	"stackhub.com/stackhub/internal/apperr/apperrtest"
)

func TestParseSearchPage(t *testing.T) {
	// 214748365 is the last page whose offset, 10*(page-1), fits an int32.
	for in, want := range map[string]int32{"": 1, "1": 1, "7": 7, "214748365": 214748365} {
		if got, err := parseSearchPage(in); err != nil || got != want {
			t.Errorf("parseSearchPage(%q) = %d, %v; want %d", in, got, err, want)
		}
	}
	for in, msg := range map[string]string{
		"abc":        "Invalid page number",
		"1.5":        "Invalid page number",
		" 2":         "Invalid page number",
		"2147483648": "Invalid page number", // past int32
		"0":          "Page number must be >= 1",
		"-3":         "Page number must be >= 1",
		"214748366":  "Page number is too large", // offset would wrap negative
		"2147483647": "Page number is too large",
	} {
		_, err := parseSearchPage(in)
		apperrtest.Want(t, "page "+strconv.Quote(in), err, apperr.KindInvalid, msg)
	}
}

func TestSearchPageCount(t *testing.T) {
	for count, want := range map[int64]int32{0: 1, 1: 1, 9: 1, 10: 1, 11: 2, 20: 2, 21: 3, 1000: 100} {
		if got := searchPageCount(count); got != want {
			t.Errorf("searchPageCount(%d) = %d; want %d", count, got, want)
		}
	}
}
