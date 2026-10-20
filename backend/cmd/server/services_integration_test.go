package main

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"stackhub.com/stackhub/pkg/db"
)

// Service tests against a real database, without HTTP. They cover what the
// characterisation tests cannot see through the router: the email decisions
// (the test server has no mailer) and that a failure part-way through a
// service leaves nothing half-written.
//
// Same rules as feed_integration_test.go: opt-in via TEST_DB_CONNECTION, local
// databases only, every write rolled back.

func TestStarEmailDecisionIntegration(t *testing.T) {
	conn := testDB(t)
	tx := beginRollback(t, conn)
	ctx := context.Background()
	posts := postService{db: tx}

	var postID, author uuid.UUID
	var name, slug, authorUsername string
	err := tx.QueryRow(ctx, `
		SELECT p.id, p.author_id, p.name, p.slug, pr.username
		FROM posts p JOIN profiles pr ON pr.id = p.author_id
		WHERE p.is_published LIMIT 1`).Scan(&postID, &author, &name, &slug, &authorUsername)
	if err != nil {
		t.Skipf("no published posts (%v)", err)
	}
	liker := scalar[uuid.UUID](t, tx, `SELECT id FROM profiles WHERE id <> $1 ORDER BY created_at LIMIT 1`, author)
	if _, err := tx.Exec(ctx, `DELETE FROM notifications WHERE entity_id = $1`, postID); err != nil {
		t.Fatal(err)
	}

	email, err := posts.star(ctx, liker, postID)
	if err != nil {
		t.Fatal(err)
	}
	if email == nil {
		t.Fatal("first star by someone else: no email; want one to the author")
	}
	want := starEmail{
		recipientID:   author,
		actorName:     actorName(t, tx, liker),
		actorUsername: scalar[string](t, tx, `SELECT username FROM profiles WHERE id = $1`, liker),
		postName:      name,
		postURL:       fmt.Sprintf("%s/%s/%s", siteURL, authorUsername, slug),
	}
	if *email != want {
		t.Errorf("email = %+v; want %+v", *email, want)
	}

	if again, err := posts.star(ctx, liker, postID); err != nil || again != nil {
		t.Errorf("repeat star: email %+v, err %v; want no email", again, err)
	}
	if own, err := posts.star(ctx, author, postID); err != nil || own != nil {
		t.Errorf("author starring own post: email %+v, err %v; want no email", own, err)
	}
}

func TestToolApprovalDecisionIntegration(t *testing.T) {
	conn := testDB(t)
	tx := beginRollback(t, conn)
	ctx := context.Background()
	q := db.New(tx)
	tickets := ticketService{db: tx, q: q}
	requester, resolver := twoProfiles(t, tx)
	tool := someTools(t, tx, 1)[0]

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
	conn := testDB(t)
	tx := beginRollback(t, conn)
	ctx := context.Background()
	q := db.New(tx)
	tickets := ticketService{db: tx, q: q}
	requester, resolver := twoProfiles(t, tx)
	tools := someTools(t, tx, 4)
	postID := scalar[uuid.UUID](t, tx, `SELECT id FROM posts LIMIT 1`)
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
			ticket, err = q.CreateToolTicket(ctx, db.CreateToolTicketParams{PostID: ToPgUUID(postID), RequestedBy: requester, ToolName: c.name})
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
		entity := scalar[uuid.UUID](t, tx, `SELECT entity_id FROM notifications WHERE recipient_id = $1 AND type = 'tool_approved' AND message LIKE '%' || $2 || '%'`, requester, c.name)
		if entity != c.tool {
			t.Errorf("%s: notification entity %v; want the approved tool %v", c.name, entity, c.tool)
		}
	}

	if n := scalar[int64](t, tx, `SELECT count(*) FROM notifications WHERE recipient_id = $1 AND type = 'tool_approved'`, requester); n != int64(len(cases)) {
		t.Errorf("%d approval notifications; want %d", n, len(cases))
	}
}

// A resolution that fails after the tool was created must not leave the tool
// behind, nor move the ticket.
func TestResolveWithNewIsAtomicIntegration(t *testing.T) {
	conn := testDB(t)
	tx := beginRollback(t, conn)
	ctx := context.Background()
	q := db.New(tx)
	tickets := ticketService{db: tx, q: q}
	requester, resolver := twoProfiles(t, tx)

	ticket, err := q.CreateStandaloneToolTicket(ctx, db.CreateStandaloneToolTicketParams{RequestedBy: requester, ToolName: "Atomic Tool"})
	if err != nil {
		t.Fatal(err)
	}
	before := scalar[int64](t, tx, `SELECT count(*) FROM tools`)

	_, _, err = tickets.resolveWithNew(ctx, ticket, resolver, ResolveTicketWithNewRequest{
		Name:       "Atomic Tool",
		Categories: []int{2147483000}, // no such category: fails after CreateTool
	})
	wantServiceError(t, "unknown category", err, http.StatusInternalServerError, "Could not assign categories to tool")

	if after := scalar[int64](t, tx, `SELECT count(*) FROM tools`); after != before {
		t.Errorf("tools %d -> %d; the failed resolution's tool was kept", before, after)
	}
	if status := scalar[string](t, tx, `SELECT status FROM tool_tickets WHERE id = $1`, ticket); status != "pending" {
		t.Errorf("ticket status %q after a failed resolution; want pending", status)
	}
}

// A tool page edit that fails on its last step must not keep its first.
func TestUpdatePageIsAtomicIntegration(t *testing.T) {
	conn := testDB(t)
	tx := beginRollback(t, conn)
	ctx := context.Background()
	tool := someTools(t, tx, 1)[0]

	before := scalar[string](t, tx, `SELECT COALESCE(description, '') FROM tools WHERE id = $1`, tool)
	rich := `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Should not stick"}]}]}`
	bad := []int32{2147483000}

	err := toolService{db: tx}.updatePage(ctx, tool, UpdateToolPageRequest{DescriptionRich: &rich, CategoryIDs: &bad})
	wantServiceError(t, "unknown category", err, http.StatusInternalServerError, "Failed to save the categories")

	if after := scalar[string](t, tx, `SELECT COALESCE(description, '') FROM tools WHERE id = $1`, tool); after != before {
		t.Errorf("description changed to %q although the edit failed", after)
	}
}
