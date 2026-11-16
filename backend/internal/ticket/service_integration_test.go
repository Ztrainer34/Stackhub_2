package ticket

import (
	"context"
	"strings"
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

// Approving a suggestion with a hidden tool links the tool but leaves it hidden,
// batch label and all: /admin requires the admin role (admins table, RequireAdmin
// in routes.go), but un-hiding is a curation decision made only with
// scripts/hide-tools.mjs, never by a ticket approval.
func TestResolveWithHiddenToolKeepsItHiddenIntegration(t *testing.T) {
	conn := testdb.Open(t)
	tx := testdb.Begin(t, conn)
	ctx := context.Background()
	q := db.New(tx)
	tickets := ticketService{db: tx, q: q}
	requester, resolver := testdb.TwoProfiles(t, tx)
	tool := testdb.SomeTools(t, tx, 1)[0]
	if _, err := tx.Exec(ctx,
		`UPDATE tools SET hidden_at = now(), hidden_batch = 'test-batch' WHERE id = $1`, tool); err != nil {
		t.Fatal(err)
	}
	ticket, err := q.CreateStandaloneToolTicket(ctx, db.CreateStandaloneToolTicketParams{RequestedBy: requester, ToolName: "Hidden Tool Request"})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := tickets.resolveWithExisting(ctx, ticket, resolver, tool); err != nil {
		t.Fatal(err)
	}

	if resolved := testdb.Scalar[string](t, tx, `SELECT status FROM tool_tickets WHERE id = $1`, ticket); resolved != "resolved" {
		t.Errorf("ticket status %q; want resolved", resolved)
	}
	if batch := testdb.Scalar[string](t, tx, `SELECT COALESCE(hidden_batch, '') FROM tools WHERE id = $1 AND hidden_at IS NOT NULL`, tool); batch != "test-batch" {
		t.Errorf("after approval the tool has hidden_batch %q; want it still hidden in test-batch", batch)
	}
}

// A suggestion cannot be resolved by creating a second tool whose name gives the
// same URL slug as an existing one: the copy would take over or shadow the
// original page, hidden or not.
func TestResolveWithNewRefusesTakenNameIntegration(t *testing.T) {
	conn := testdb.Open(t)
	tx := testdb.Begin(t, conn)
	ctx := context.Background()
	q := db.New(tx)
	tickets := ticketService{db: tx, q: q}
	requester, resolver := testdb.TwoProfiles(t, tx)
	if _, err := tx.Exec(ctx, `INSERT INTO tools (name, hidden_at) VALUES ('Zqx Dup!', now())`); err != nil {
		t.Fatal(err)
	}
	ticket, err := q.CreateStandaloneToolTicket(ctx, db.CreateStandaloneToolTicketParams{RequestedBy: requester, ToolName: "zqx dup"})
	if err != nil {
		t.Fatal(err)
	}
	before := testdb.Scalar[int64](t, tx, `SELECT count(*) FROM tools`)

	_, _, err = tickets.resolveWithNew(ctx, ticket, resolver, ResolveTicketWithNewRequest{Name: "zqx dup", Description: "A copy"})
	apperrtest.Want(t, "name already taken", err, apperr.KindConflict, "A tool with this name already exists. Resolve the suggestion with the existing tool instead.")
	if after := testdb.Scalar[int64](t, tx, `SELECT count(*) FROM tools`); after != before {
		t.Errorf("tools %d -> %d; a refused resolution must not create a tool", before, after)
	}
}

func TestCreatePostTicketsReturnsTheNewIDsIntegration(t *testing.T) {
	conn := testdb.Open(t)
	tx := testdb.Begin(t, conn)
	ctx := context.Background()
	q := db.New(tx)
	requester, _ := testdb.TwoProfiles(t, tx)
	postID := testdb.Scalar[uuid.UUID](t, tx, `SELECT id FROM posts LIMIT 1`)

	ids, err := CreatePostTickets(ctx, q, postID, requester, []Suggestion{
		{Name: "Returned One", Website: "https://example.com"},
		{Name: "Returned Two"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(ids) != 2 {
		t.Fatalf("got %d ids; want one per suggestion", len(ids))
	}
	for _, id := range ids {
		if n := testdb.Scalar[int64](t, tx, `SELECT count(*) FROM tool_tickets WHERE id = $1 AND requested_by = $2`, id, requester); n != 1 {
			t.Errorf("ticket %s does not exist for the requester", id)
		}
	}

	none, err := CreatePostTickets(ctx, q, postID, requester, nil)
	if err != nil || len(none) != 0 {
		t.Errorf("no suggestions: got %v, %v; want no ids and no error", none, err)
	}
}

func TestListToolTicketsForAlertIntegration(t *testing.T) {
	conn := testdb.Open(t)
	tx := testdb.Begin(t, conn)
	ctx := context.Background()
	q := db.New(tx)
	requester, resolver := testdb.TwoProfiles(t, tx)
	cats := testdb.SomeCategories(t, tx, 2)
	postID := testdb.Scalar[uuid.UUID](t, tx, `SELECT id FROM posts LIMIT 1`)
	postName := testdb.Scalar[string](t, tx, `SELECT name FROM posts WHERE id = $1`, postID)
	username := testdb.Scalar[string](t, tx, `SELECT username FROM profiles WHERE id = $1`, requester)

	posted, err := CreatePostTickets(ctx, q, postID, requester, []Suggestion{
		{Name: "Alert On Post", Description: "d", Website: "https://example.com", Categories: []int{int(cats[0]), int(cats[1])}},
	})
	if err != nil {
		t.Fatal(err)
	}
	standalone, err := q.CreateStandaloneToolTicket(ctx, db.CreateStandaloneToolTicketParams{RequestedBy: requester, ToolName: "Alert Standalone"})
	if err != nil {
		t.Fatal(err)
	}
	resolved, err := q.CreateStandaloneToolTicket(ctx, db.CreateStandaloneToolTicketParams{RequestedBy: requester, ToolName: "Alert Resolved"})
	if err != nil {
		t.Fatal(err)
	}
	rejected, err := q.CreateStandaloneToolTicket(ctx, db.CreateStandaloneToolTicketParams{RequestedBy: requester, ToolName: "Alert Rejected"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `UPDATE tool_tickets SET status = 'resolved', resolved_by = $2 WHERE id = $1`, resolved, resolver); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `UPDATE tool_tickets SET status = 'rejected', resolved_by = $2 WHERE id = $1`, rejected, resolver); err != nil {
		t.Fatal(err)
	}

	rows, err := q.ListToolTicketsForAlert(ctx, []uuid.UUID{posted[0], standalone, resolved, rejected, uuid.New()})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 {
		t.Fatalf("got %d rows; want only the two pending tickets", len(rows))
	}
	for _, r := range rows {
		if r.RequesterUsername != username {
			t.Errorf("%s: requester %q; want %q", r.ToolName, r.RequesterUsername, username)
		}
		switch r.ID {
		case posted[0]:
			if !r.PostName.Valid || r.PostName.String != postName {
				t.Errorf("post ticket: PostName %+v; want %q", r.PostName, postName)
			}
			// The database's own ordering: its collation need not be byte order.
			wantCats := testdb.IDs[string](t, tx, `SELECT name FROM categories WHERE id = ANY($1) ORDER BY name`, cats)
			if len(r.CategoryNames) != 2 || strings.Join(r.CategoryNames, "|") != strings.Join(wantCats, "|") {
				t.Errorf("post ticket: categories %v; want %v", r.CategoryNames, wantCats)
			}
			if r.ToolDescription != "d" || r.ToolWebsite != "https://example.com" {
				t.Errorf("post ticket: description %q, website %q", r.ToolDescription, r.ToolWebsite)
			}
		case standalone:
			if r.PostName.Valid {
				t.Errorf("standalone ticket: PostName %+v; want none", r.PostName)
			}
			if len(r.CategoryNames) != 0 || r.ToolDescription != "" || r.ToolWebsite != "" {
				t.Errorf("standalone ticket: want empty categories, description and website, got %+v", r)
			}
		default:
			t.Errorf("unexpected ticket %s (%s) listed", r.ID, r.ToolName)
		}
	}

	for name, ids := range map[string][]uuid.UUID{"empty list": {}, "nil list": nil} {
		got, err := q.ListToolTicketsForAlert(ctx, ids)
		if err != nil || len(got) != 0 {
			t.Errorf("%s: got %d rows, %v; want none and no error", name, len(got), err)
		}
	}
}
