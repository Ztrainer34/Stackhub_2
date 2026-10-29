package ticket

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"stackhub.com/stackhub/internal/apperr"
	"stackhub.com/stackhub/internal/apperr/apperrtest"
	"stackhub.com/stackhub/internal/pg"
	"stackhub.com/stackhub/internal/testdb"
	"stackhub.com/stackhub/pkg/db"
)

func TestToolApprovalDecisionIntegration(t *testing.T) {
	conn := testdb.Open(t)
	tx := testdb.Begin(t, conn)
	ctx := context.Background()
	q := db.New(tx)
	tickets := ticketService{db: tx, q: q}
	requester, resolver := testdb.TwoProfiles(t, tx)
	tool := testdb.SomeTools(t, tx, 1)[0]

	standalone := func(name string) uuid.UUID {
		t.Helper()
		id, err := q.CreateStandaloneToolTicket(ctx, db.CreateStandaloneToolTicketParams{RequestedBy: requester, ToolName: name})
		if err != nil {
			t.Fatal(err)
		}
		return id
	}

	approval, err := tickets.resolveWithExisting(ctx, standalone("Approval Decision Tool"), resolver, tool)
	if err != nil {
		t.Fatal(err)
	}
	if approval == nil || *approval != (toolApproval{requesterID: requester, toolName: "Approval Decision Tool"}) {
		t.Errorf("approval = %+v; want an email to the requester naming the tool", approval)
	}

	if own, err := tickets.resolveWithExisting(ctx, standalone("Own Decision Tool"), requester, tool); err != nil || own != nil {
		t.Errorf("requester resolving their own ticket: approval %+v, err %v; want none", own, err)
	}
}

// Every approved tool notifies its requester once, even when one admin
// approves several of their suggestions within the hour. The notification used
// to be keyed on the ticket's post (NULL for a standalone suggestion), so the
// hourly dedup swallowed every approval after the first from the same post,
// and every standalone one after the first.
func TestEveryApprovedToolNotifiesIntegration(t *testing.T) {
	conn := testdb.Open(t)
	tx := testdb.Begin(t, conn)
	ctx := context.Background()
	q := db.New(tx)
	tickets := ticketService{db: tx, q: q}
	requester, resolver := testdb.TwoProfiles(t, tx)
	tools := testdb.SomeTools(t, tx, 4)
	postID := testdb.Scalar[uuid.UUID](t, tx, `SELECT id FROM posts LIMIT 1`)
	if _, err := tx.Exec(ctx, `DELETE FROM notifications WHERE recipient_id = $1 AND type = 'tool_approved'`, requester); err != nil {
		t.Fatal(err)
	}

	cases := []struct {
		name   string
		onPost bool
		tool   uuid.UUID
	}{
		{"first tool from a post", true, tools[0]},
		{"second tool from the same post", true, tools[1]},
		{"first standalone suggestion", false, tools[2]},
		{"second standalone suggestion", false, tools[3]},
	}
	for _, c := range cases {
		var ticket uuid.UUID
		var err error
		if c.onPost {
			ticket, err = q.CreateToolTicket(ctx, db.CreateToolTicketParams{PostID: pg.UUID(postID), RequestedBy: requester, ToolName: c.name})
		} else {
			ticket, err = q.CreateStandaloneToolTicket(ctx, db.CreateStandaloneToolTicketParams{RequestedBy: requester, ToolName: c.name})
		}
		if err != nil {
			t.Fatal(err)
		}

		approval, err := tickets.resolveWithExisting(ctx, ticket, resolver, c.tool)
		if err != nil {
			t.Fatalf("%s: %v", c.name, err)
		}
		if approval == nil {
			t.Errorf("%s: no approval email; want one", c.name)
		}
		entity := testdb.Scalar[uuid.UUID](t, tx, `SELECT entity_id FROM notifications WHERE recipient_id = $1 AND type = 'tool_approved' AND message LIKE '%' || $2 || '%'`, requester, c.name)
		if entity != c.tool {
			t.Errorf("%s: notification entity %v; want the approved tool %v", c.name, entity, c.tool)
		}
	}

	if n := testdb.Scalar[int64](t, tx, `SELECT count(*) FROM notifications WHERE recipient_id = $1 AND type = 'tool_approved'`, requester); n != int64(len(cases)) {
		t.Errorf("%d approval notifications; want %d", n, len(cases))
	}
}

// A resolution that fails after the tool was created must not leave the tool
// behind, nor move the ticket.
func TestResolveWithNewIsAtomicIntegration(t *testing.T) {
	conn := testdb.Open(t)
	tx := testdb.Begin(t, conn)
	ctx := context.Background()
	q := db.New(tx)
	tickets := ticketService{db: tx, q: q}
	requester, resolver := testdb.TwoProfiles(t, tx)

	ticket, err := q.CreateStandaloneToolTicket(ctx, db.CreateStandaloneToolTicketParams{RequestedBy: requester, ToolName: "Atomic Tool"})
	if err != nil {
		t.Fatal(err)
	}
	before := testdb.Scalar[int64](t, tx, `SELECT count(*) FROM tools`)

	_, _, err = tickets.resolveWithNew(ctx, ticket, resolver, ResolveTicketWithNewRequest{
		Name:       "Atomic Tool",
		Categories: []int{2147483000}, // no such category: fails after CreateTool
	})
	apperrtest.Want(t, "unknown category", err, apperr.KindInternal, "Could not assign categories to tool")

	if after := testdb.Scalar[int64](t, tx, `SELECT count(*) FROM tools`); after != before {
		t.Errorf("tools %d -> %d; the failed resolution's tool was kept", before, after)
	}
	if status := testdb.Scalar[string](t, tx, `SELECT status FROM tool_tickets WHERE id = $1`, ticket); status != "pending" {
		t.Errorf("ticket status %q after a failed resolution; want pending", status)
	}
}
