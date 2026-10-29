package tool

import (
	"context"
	"testing"

	"stackhub.com/stackhub/internal/apperr"
	"stackhub.com/stackhub/internal/apperr/apperrtest"
	"stackhub.com/stackhub/internal/testdb"
)

// A tool page edit that fails on its last step must not keep its first.
func TestUpdatePageIsAtomicIntegration(t *testing.T) {
	conn := testdb.Open(t)
	tx := testdb.Begin(t, conn)
	ctx := context.Background()
	tool := testdb.SomeTools(t, tx, 1)[0]

	before := testdb.Scalar[string](t, tx, `SELECT COALESCE(description, '') FROM tools WHERE id = $1`, tool)
	rich := `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Should not stick"}]}]}`
	bad := []int32{2147483000}

	err := toolService{db: tx}.updatePage(ctx, tool, UpdateToolPageRequest{DescriptionRich: &rich, CategoryIDs: &bad})
	apperrtest.Want(t, "unknown category", err, apperr.KindInternal, "Failed to save the categories")

	if after := testdb.Scalar[string](t, tx, `SELECT COALESCE(description, '') FROM tools WHERE id = $1`, tool); after != before {
		t.Errorf("description changed to %q although the edit failed", after)
	}
}
