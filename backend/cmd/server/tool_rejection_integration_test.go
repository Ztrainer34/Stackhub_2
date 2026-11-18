package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"stackhub.com/stackhub/internal/pg"
	"stackhub.com/stackhub/internal/testdb"
	"stackhub.com/stackhub/pkg/db"
)

// Integration tests for rejecting a tool suggestion with a reason: what is
// stored, who is told (in-app; the email is sent by the handler and needs a
// mailer, which these tests never configure), and what must NOT leak.
//
// Same rules as the other *_integration_test.go files: opt-in via
// TEST_DB_CONNECTION, local databases only, every write rolled back. The local
// database must have 20261117120000_tool_rejection_reason.sql (a rebuilt
// supabase/migrations baseline has it).

// rejectionFixture is one admin, one requester and one bystander, with the
// requester's notifications cleared so a test sees only its own.
type rejectionFixture struct {
	t         *testing.T
	tx        pgx.Tx
	api       *testAPI
	q         *db.Queries
	requester uuid.UUID
	admin     uuid.UUID
	other     uuid.UUID
}

func newRejectionFixture(t *testing.T) *rejectionFixture {
	t.Helper()
	conn := testdb.Open(t)
	tx := testdb.Begin(t, conn)
	requester, admin := testdb.TwoProfiles(t, tx)
	testdb.MakeAdmin(t, tx, admin)
	others := testdb.IDs[uuid.UUID](t, tx, `SELECT id FROM profiles WHERE id NOT IN ($1, $2) ORDER BY created_at LIMIT 1`, requester, admin)
	if len(others) == 0 {
		t.Skip("need three profiles — seed the database first")
	}
	f := &rejectionFixture{t: t, tx: tx, api: newTestAPI(t, tx), q: db.New(tx), requester: requester, admin: admin, other: others[0]}

	// Nothing unread for anybody involved, so the feed holds only what the test makes.
	for _, id := range []uuid.UUID{requester, admin, f.other} {
		if _, err := tx.Exec(context.Background(), `UPDATE notifications SET is_read = true WHERE recipient_id = $1`, id); err != nil {
			t.Fatal(err)
		}
	}
	return f
}

func (f *rejectionFixture) ticket(requestedBy uuid.UUID, name string) uuid.UUID {
	f.t.Helper()
	id, err := f.q.CreateStandaloneToolTicket(context.Background(), db.CreateStandaloneToolTicketParams{RequestedBy: requestedBy, ToolName: name})
	if err != nil {
		f.t.Fatal(err)
	}
	return id
}

func rejectPath(ticket uuid.UUID) string {
	return "/admin/tool-tickets/" + ticket.String() + "/reject"
}

func reasonBody(t *testing.T, reason string) string {
	t.Helper()
	raw, err := json.Marshal(map[string]string{"reason": reason})
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

// reject sends the reject request as the fixture's admin and wants a 204.
func (f *rejectionFixture) reject(ticket uuid.UUID, reason string) {
	f.t.Helper()
	if status, body := f.api.call("POST", rejectPath(ticket), f.admin, reasonBody(f.t, reason)); status != http.StatusNoContent {
		f.t.Fatalf("reject: %d %q; want 204", status, body)
	}
}

func (f *rejectionFixture) rejections(recipient uuid.UUID) int64 {
	f.t.Helper()
	return testdb.Scalar[int64](f.t, f.tx, `SELECT count(*) FROM notifications WHERE recipient_id = $1 AND type = 'tool_rejected'`, recipient)
}

func (f *rejectionFixture) storedReason(ticket uuid.UUID) *string {
	f.t.Helper()
	return testdb.Scalar[*string](f.t, f.tx, `SELECT rejection_reason FROM tool_tickets WHERE id = $1`, ticket)
}

func (f *rejectionFixture) status(ticket uuid.UUID) string {
	f.t.Helper()
	return testdb.Scalar[string](f.t, f.tx, `SELECT status FROM tool_tickets WHERE id = $1`, ticket)
}

func feedFor(t *testing.T, q *db.Queries, viewer uuid.UUID) []db.GetUserFeedRow {
	t.Helper()
	feed, err := q.GetUserFeed(context.Background(), db.GetUserFeedParams{ViewerID: viewer, PageLimit: 100, PageOffset: 0})
	if err != nil {
		t.Fatalf("GetUserFeed: %v", err)
	}
	return feed
}

func TestRejectToolTicketStoresReasonAndNotifiesRequesterIntegration(t *testing.T) {
	f := newRejectionFixture(t)
	adminName := testdb.Scalar[string](t, f.tx, `SELECT username FROM profiles WHERE id = $1`, f.admin)
	ticket := f.ticket(f.requester, "Rejection Notify Tool")

	// Control characters, a bidi override and a line break are cleaned; the
	// markup is kept as plain text, not escaped.
	f.reject(ticket, "  Too similar to\r\nAirtable ‮ & <b>already</b> listed.  ")
	const cleaned = "Too similar to Airtable & <b>already</b> listed."

	if got := f.status(ticket); got != "rejected" {
		t.Errorf("ticket status %q; want rejected", got)
	}
	if got := f.storedReason(ticket); got == nil || *got != cleaned {
		t.Errorf("stored reason %v; want %q", got, cleaned)
	}
	if by := testdb.Scalar[uuid.UUID](t, f.tx, `SELECT resolved_by FROM tool_tickets WHERE id = $1`, ticket); by != f.admin {
		t.Errorf("resolved_by %v; want the admin", by)
	}

	if n := f.rejections(f.requester); n != 1 {
		t.Fatalf("tool_rejected notifications for the requester = %d; want 1", n)
	}
	var (
		actor      *uuid.UUID
		entity     *uuid.UUID
		entityType *string
		title, msg string
		isRead     *bool
	)
	if err := f.tx.QueryRow(context.Background(),
		`SELECT actor_id, entity_id, entity_type, title, message, is_read FROM notifications WHERE recipient_id = $1 AND type = 'tool_rejected'`,
		f.requester).Scan(&actor, &entity, &entityType, &title, &msg, &isRead); err != nil {
		t.Fatal(err)
	}
	if actor != nil {
		t.Errorf("actor_id = %v; want NULL (StackHub)", *actor)
	}
	if entity == nil || *entity != ticket {
		t.Errorf("entity_id = %v; want the ticket %v", entity, ticket)
	}
	if entityType == nil || *entityType != "tool_ticket" {
		t.Errorf("entity_type = %v; want tool_ticket", entityType)
	}
	if title != "Tool not approved" {
		t.Errorf("title = %q", title)
	}
	for _, want := range []string{"Rejection Notify Tool", cleaned} {
		if !strings.Contains(msg, want) {
			t.Errorf("message %q does not contain %q", msg, want)
		}
	}
	if strings.Contains(msg, adminName) {
		t.Errorf("message names the reviewer %q: %q", adminName, msg)
	}
	if strings.ContainsAny(msg, "\r\n‮") {
		t.Errorf("message keeps characters that should have been cleaned: %q", msg)
	}

	// Nobody else is notified.
	for name, id := range map[string]uuid.UUID{"the admin": f.admin, "a bystander": f.other} {
		if n := f.rejections(id); n != 0 {
			t.Errorf("%s got %d tool_rejected notifications; want 0", name, n)
		}
	}

	// The requester's notifications list shows it, with no actor.
	status, body := f.api.call("GET", "/notifications?limit=50", f.requester, "")
	if status != http.StatusOK {
		t.Fatalf("GET /notifications: %d %q", status, body)
	}
	var list struct {
		Notifications []map[string]json.RawMessage `json:"notifications"`
	}
	if err := json.Unmarshal([]byte(body), &list); err != nil {
		t.Fatalf("notifications body %q: %v", body, err)
	}
	var found map[string]json.RawMessage
	for _, n := range list.Notifications {
		if string(n["type"]) == `"tool_rejected"` {
			found = n
		}
	}
	if found == nil {
		t.Fatalf("the rejection is missing from GET /notifications: %q", body)
	}
	if string(found["actor_id"]) != "null" || string(found["actor_username"]) != "null" || string(found["actor_display_name"]) != "null" {
		t.Errorf("rejection actor fields = %s %s %s; want all null", found["actor_id"], found["actor_username"], found["actor_display_name"])
	}
	if raw, _ := json.Marshal(found); strings.Contains(string(raw), adminName) || strings.Contains(string(raw), f.admin.String()) {
		t.Errorf("the rejection names its reviewer: %s", raw)
	}

	// The requester's feed has it, actor NULL; a third user's feed does not.
	var item *db.GetUserFeedRow
	feed := feedFor(t, f.q, f.requester)
	for i := range feed {
		if feed[i].Reason == "tool_rejected" {
			item = &feed[i]
		}
	}
	if item == nil {
		t.Fatalf("the rejection is missing from the requester's feed (%d rows)", len(feed))
	}
	if item.ActorUsername.Valid || item.ActorID.Valid {
		t.Errorf("feed rejection actor = %+v / %+v; want NULL", item.ActorID, item.ActorUsername)
	}
	if m, _ := item.NotificationMessage.(string); !strings.Contains(m, cleaned) {
		t.Errorf("feed message %v does not carry the reason", item.NotificationMessage)
	}
	for _, row := range feedFor(t, f.q, f.other) {
		if row.Reason == "tool_rejected" {
			t.Errorf("a third user's feed contains the rejection: %+v", row)
		}
	}
}

// Only the two named notification types may appear in the feed without an
// actor. A NULL-actor post_star (its actor deleted) is still left out.
func TestFeedStillDropsNullActorNotificationsOfOtherTypesIntegration(t *testing.T) {
	f := newRejectionFixture(t)
	if _, err := f.tx.Exec(context.Background(),
		`INSERT INTO notifications (recipient_id, actor_id, type, title, message) VALUES ($1, NULL, 'post_star', 'Star', 'someone starred')`,
		f.requester); err != nil {
		t.Fatal(err)
	}
	f.reject(f.ticket(f.requester, "Feed Allowlist Tool"), "Does not meet the catalogue criteria.")

	var sawRejected bool
	for _, row := range feedFor(t, f.q, f.requester) {
		switch row.Reason {
		case "post_star":
			t.Errorf("a NULL-actor post_star reached the feed: %+v", row)
		case "tool_rejected":
			sawRejected = true
		}
	}
	if !sawRejected {
		t.Error("the tool_rejected row is missing from the feed")
	}
}

func TestRejectingAgainChangesTheReasonButNeverNotifiesTwiceIntegration(t *testing.T) {
	f := newRejectionFixture(t)
	ticket := f.ticket(f.requester, "Rejected Twice Tool")

	f.reject(ticket, "The first reason, long enough.")
	if n := f.rejections(f.requester); n != 1 {
		t.Fatalf("after the first rejection: %d notifications; want 1", n)
	}

	f.reject(ticket, "A better second reason, also long.")
	if got := f.storedReason(ticket); got == nil || *got != "A better second reason, also long." {
		t.Errorf("reason after re-rejecting = %v; want the second one", got)
	}
	if n := f.rejections(f.requester); n != 1 {
		t.Errorf("after re-rejecting: %d notifications; want still 1", n)
	}

	// Past the hourly dedupe window the answer is the same: it is the status,
	// not the clock, that decides.
	if _, err := f.tx.Exec(context.Background(),
		`UPDATE notifications SET created_at = now() - interval '2 hours' WHERE recipient_id = $1 AND type = 'tool_rejected'`, f.requester); err != nil {
		t.Fatal(err)
	}
	f.reject(ticket, "A third reason, long enough too.")
	if n := f.rejections(f.requester); n != 1 {
		t.Errorf("re-rejecting two hours later: %d notifications; want still 1", n)
	}
	if got := f.storedReason(ticket); got == nil || *got != "A third reason, long enough too." {
		t.Errorf("reason after the third rejection = %v", got)
	}
}

// requested_by has no foreign key, so a ticket can outlive its requester's
// profile. Rejecting it must still work (and notify nobody) rather than fail
// forever on the notification's recipient foreign key.
func TestRejectingATicketWhoseRequesterIsGoneStillWorksIntegration(t *testing.T) {
	f := newRejectionFixture(t)
	ticket := f.ticket(f.requester, "Orphaned Suggestion")
	if _, err := f.tx.Exec(context.Background(),
		"UPDATE tool_tickets SET requested_by = $1 WHERE id = $2", uuid.New(), ticket); err != nil {
		t.Fatal(err)
	}

	f.reject(ticket, "The requester's account no longer exists.")

	if got := f.status(ticket); got != "rejected" {
		t.Errorf("status %q; want rejected", got)
	}
}

func TestRejectingYourOwnSuggestionDoesNotNotifyYouIntegration(t *testing.T) {
	f := newRejectionFixture(t)
	ticket := f.ticket(f.admin, "Admin Own Suggestion")

	f.reject(ticket, "Withdrawn by its own author.")

	if got := f.status(ticket); got != "rejected" {
		t.Errorf("status %q; want rejected", got)
	}
	if n := f.rejections(f.admin); n != 0 {
		t.Errorf("the admin was notified of rejecting their own ticket (%d)", n)
	}
}

func TestResolvedTicketCannotBeRejectedWithAReasonIntegration(t *testing.T) {
	f := newRejectionFixture(t)
	tool := testdb.SomeTools(t, f.tx, 1)[0]

	// Pending -> resolved -> reject: refused, nothing stored, nobody notified.
	resolved := f.ticket(f.requester, "Resolved Then Rejected")
	if status, body := f.api.call("POST", "/admin/tool-tickets/"+resolved.String()+"/resolve-existing", f.admin, `{"tool_id":"`+tool.String()+`"}`); status != http.StatusNoContent {
		t.Fatalf("resolve: %d %q", status, body)
	}
	f.api.expect("reject a resolved ticket", "POST", rejectPath(resolved), f.admin, reasonBody(t, "Changed my mind, sorry."), http.StatusConflict, "This ticket has already been resolved")
	if got := f.storedReason(resolved); got != nil {
		t.Errorf("a refused rejection stored the reason %q", *got)
	}
	if n := f.rejections(f.requester); n != 0 {
		t.Errorf("a refused rejection notified the requester (%d)", n)
	}

	// Pending -> rejected -> resolved -> reject again: the first reason stays.
	again := f.ticket(f.requester, "Rejected Resolved Rejected")
	f.reject(again, "The reason that was on record.")
	if status, body := f.api.call("POST", "/admin/tool-tickets/"+again.String()+"/resolve-existing", f.admin, `{"tool_id":"`+tool.String()+`"}`); status != http.StatusNoContent {
		t.Fatalf("resolve a rejected ticket: %d %q", status, body)
	}
	f.api.expect("reject it again once resolved", "POST", rejectPath(again), f.admin, reasonBody(t, "A reason that must not land."), http.StatusConflict, "This ticket has already been resolved")
	if got := f.storedReason(again); got == nil || *got != "The reason that was on record." {
		t.Errorf("reason after a refused rejection = %v; want the one on record", got)
	}
	if n := f.rejections(f.requester); n != 1 {
		t.Errorf("notifications = %d; want only the one from the first rejection", n)
	}
}

func TestRejectNeedsAValidReasonIntegration(t *testing.T) {
	f := newRejectionFixture(t)
	ticket := f.ticket(f.requester, "Reasonless Tool")
	path := rejectPath(ticket)

	for _, c := range []struct{ name, body, msg string }{
		{"no body", "", "Invalid request body"},
		{"malformed JSON", `{"reason":`, "Invalid request body"},
		{"no reason field", `{}`, "A reason is required"},
		{"empty reason", `{"reason":""}`, "A reason is required"},
		{"whitespace reason", `{"reason":"   \n\t "}`, "A reason is required"},
		{"9 characters", `{"reason":"123456789"}`, "Reason must be at least 10 characters"},
		{"501 characters", reasonBody(t, strings.Repeat("a", 501)), "Reason must be at most 500 characters"},
		{"wrong type", `{"reason":5}`, "Invalid request body"},
	} {
		f.api.expect(c.name, "POST", path, f.admin, c.body, http.StatusBadRequest, c.msg)
	}
	if got := f.status(ticket); got != "pending" {
		t.Errorf("ticket status %q after refused requests; want pending", got)
	}
	if got := f.storedReason(ticket); got != nil {
		t.Errorf("a refused request stored the reason %q", *got)
	}
	if n := f.rejections(f.requester); n != 0 {
		t.Errorf("a refused request notified the requester (%d)", n)
	}

	// The boundaries themselves are accepted.
	f.reject(f.ticket(f.requester, "Ten Chars Tool"), "1234567890")
	f.reject(f.ticket(f.requester, "Five Hundred Tool"), strings.Repeat("é", 500))

	// A ticket that does not exist is a 404 (it used to read as "already resolved").
	f.api.expect("unknown ticket", "POST", rejectPath(uuid.New()), f.admin, reasonBody(t, "Nothing to reject here."), http.StatusNotFound, "Tool ticket not found")
}

func TestOnlyAdminsCanRejectATicketWithAReasonIntegration(t *testing.T) {
	f := newRejectionFixture(t)
	testdb.NotAdmin(t, f.tx, f.other)
	ticket := f.ticket(f.requester, "Admin Only Reject")
	body := reasonBody(t, "Not for the likes of you.")

	if status, got := f.api.call("POST", rejectPath(ticket), uuid.Nil, body); status != http.StatusUnauthorized {
		t.Errorf("anonymous: %d %q; want 401", status, got)
	}
	f.api.expect("non-admin", "POST", rejectPath(ticket), f.other, body, http.StatusForbidden, "Forbidden")
	// Not even the requester may reject their own suggestion this way.
	testdb.NotAdmin(t, f.tx, f.requester)
	f.api.expect("the requester, not an admin", "POST", rejectPath(ticket), f.requester, body, http.StatusForbidden, "Forbidden")

	if got := f.status(ticket); got != "pending" {
		t.Errorf("status %q after refused requests; want pending", got)
	}
	if got := f.storedReason(ticket); got != nil {
		t.Errorf("a refused request stored the reason %q", *got)
	}
	if n := f.rejections(f.requester); n != 0 {
		t.Errorf("a refused request notified the requester (%d)", n)
	}
}

// The reason is for the requester and the admins. A unique string in it must not
// show up in anything the post's author, other users or search engines read:
// the author's "waiting / rejected" posts list, the post page, the tool built
// from a ticket, or search.
func TestRejectionReasonNeverLeaksIntoPublicOrAuthorResponsesIntegration(t *testing.T) {
	f := newRejectionFixture(t)
	ctx := context.Background()

	var postID, authorID uuid.UUID
	var postSlug, authorSlug string
	if err := f.tx.QueryRow(ctx, `SELECT p.id, p.author_id, p.slug, pr.username FROM posts p JOIN profiles pr ON pr.id = p.author_id LIMIT 1`).
		Scan(&postID, &authorID, &postSlug, &authorSlug); err != nil {
		t.Skipf("need a post — seed the database first (%v)", err)
	}
	admin := f.admin
	if authorID == admin {
		admin = f.other
		testdb.MakeAdmin(t, f.tx, admin)
	}

	canary := "CanaryReasonZq7x9w1k"
	ticket, err := f.q.CreateToolTicket(ctx, db.CreateToolTicketParams{PostID: pg.UUID(postID), RequestedBy: authorID, ToolName: "Canary Rejected Tool"})
	if err != nil {
		t.Fatal(err)
	}
	if status, body := f.api.call("POST", rejectPath(ticket), admin, reasonBody(t, "Reason "+canary+" for the record.")); status != http.StatusNoContent {
		t.Fatalf("reject: %d %q", status, body)
	}

	for _, c := range []struct {
		name, path string
		as         uuid.UUID
	}{
		{"approval posts, as the author (rejected)", "/user/" + authorSlug + "/approval-posts?status=rejected&limit=100", authorID},
		{"approval posts, as the author (all)", "/user/" + authorSlug + "/approval-posts?status=all&limit=100", authorID},
		{"post counts, as the author", "/user/" + authorSlug + "/post-counts", authorID},
		{"post page, as the author", "/post/" + postSlug, authorID},
		{"post page, anonymous", "/post/" + postSlug, uuid.Nil},
		{"post content, as the author", "/post/" + postSlug + "/content", authorID},
		{"author's posts, anonymous", "/user/" + authorSlug + "/posts", uuid.Nil},
		{"profile, anonymous", "/user/" + authorSlug, uuid.Nil},
		{"search for the canary", "/search?q=" + canary, authorID},
		{"search for the tool name", "/search?q=Canary+Rejected+Tool", uuid.Nil},
		{"search facets", "/search/facets?q=Canary", uuid.Nil},
	} {
		if _, body := f.api.call("GET", c.path, c.as, ""); strings.Contains(body, canary) {
			t.Errorf("%s (%s) leaks the rejection reason: %q", c.name, c.path, body)
		}
	}

	// The tool built from a ticket (what a draft page shows for a pending tool).
	row, err := f.q.GetToolFromTicket(ctx, ticket)
	if err != nil {
		t.Fatal(err)
	}
	if raw, _ := json.Marshal(row); strings.Contains(string(raw), canary) {
		t.Errorf("GetToolFromTicket leaks the rejection reason: %s", raw)
	}
	posts, err := f.q.ListUserPostsByApprovalStatus(ctx, db.ListUserPostsByApprovalStatusParams{
		AuthorUsername: authorSlug, Limit: 100, Offset: 0, AuthenticatedID: authorID, ApprovalStatus: "all",
	})
	if err != nil {
		t.Fatal(err)
	}
	if raw, _ := json.Marshal(posts); strings.Contains(string(raw), canary) {
		t.Errorf("ListUserPostsByApprovalStatus leaks the rejection reason")
	}

	// Positive control: the admin's own view does carry it.
	status, body := f.api.call("GET", "/admin/tool-tickets/"+ticket.String(), admin, "")
	if status != http.StatusOK || !strings.Contains(body, canary) || !strings.Contains(body, `"rejection_reason"`) {
		t.Errorf("admin ticket view: %d %q; want the stored reason", status, body)
	}
	status, body = f.api.call("GET", "/admin/tool-tickets?status=rejected&limit=100", admin, "")
	if status != http.StatusOK || !strings.Contains(body, canary) {
		t.Errorf("admin ticket list: %d; want the stored reason", status)
	}
}

// The migration is safe to run twice, adds the column, and lets the new
// notification type in while still refusing an unknown one.
func TestToolRejectionMigrationIntegration(t *testing.T) {
	conn := testdb.Open(t)
	tx := testdb.Begin(t, conn)
	ctx := context.Background()
	requester, _ := testdb.TwoProfiles(t, tx)

	up := testdb.MigrationUp(t, "20261117120000_tool_rejection_reason.sql")
	for i := 0; i < 2; i++ {
		if _, err := tx.Exec(ctx, up); err != nil {
			t.Fatalf("apply the migration (run %d): %v", i+1, err)
		}
	}

	if testdb.Scalar[string](t, tx, `SELECT data_type FROM information_schema.columns WHERE table_name = 'tool_tickets' AND column_name = 'rejection_reason'`) != "text" {
		t.Error("tool_tickets.rejection_reason is not a text column")
	}

	insert := func(kind string) error {
		sp, err := tx.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer sp.Rollback(ctx)
		_, err = sp.Exec(ctx, `INSERT INTO notifications (recipient_id, type, title, message) VALUES ($1, $2, 't', 'm')`, requester, kind)
		if err != nil {
			return err
		}
		return sp.Commit(ctx)
	}
	for _, kind := range []string{"follow", "post_star", "post_comment", "tool_approved", "tool_rejected"} {
		if err := insert(kind); err != nil {
			t.Errorf("notification type %q refused: %v", kind, err)
		}
	}
	err := insert("something_else")
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "23514" {
		t.Errorf("unknown notification type: %v; want a check violation (23514)", err)
	}
}
