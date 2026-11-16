package post

import (
	"context"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"stackhub.com/stackhub/internal/apperr"
	"stackhub.com/stackhub/internal/apperr/apperrtest"
	"stackhub.com/stackhub/internal/testdb"
	"stackhub.com/stackhub/internal/ticket"
	"stackhub.com/stackhub/pkg/db"
)

// toolEditFixture is a fresh post of the given type with the given tools linked.
func toolEditFixture(t *testing.T, tx pgx.Tx, postType string, author uuid.UUID, tools ...uuid.UUID) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	postID := testdb.Scalar[uuid.UUID](t, tx, `
		INSERT INTO posts (author_id, type, name, slug, description)
		VALUES ($1, $2, 'Tool edit', $3, '') RETURNING id`, author, postType, "tool-edit-"+uuid.NewString())
	for _, tool := range tools {
		if _, err := tx.Exec(ctx, `INSERT INTO post_tools (post_id, tool_id) VALUES ($1, $2)`, postID, tool); err != nil {
			t.Fatal(err)
		}
	}
	return postID
}

func linkedTools(t *testing.T, tx pgx.Tx, postID uuid.UUID) map[uuid.UUID]bool {
	t.Helper()
	out := map[uuid.UUID]bool{}
	for _, id := range testdb.IDs[uuid.UUID](t, tx, `SELECT tool_id FROM post_tools WHERE post_id = $1`, postID) {
		out[id] = true
	}
	return out
}

func addTicket(t *testing.T, tx pgx.Tx, postID, requester uuid.UUID, name string) uuid.UUID {
	t.Helper()
	return testdb.Scalar[uuid.UUID](t, tx, `
		INSERT INTO tool_tickets (post_id, requested_by, tool_name) VALUES ($1, $2, $3) RETURNING id`, postID, requester, name)
}

func TestSetToolsReplacesTheToolsIntegration(t *testing.T) {
	conn := testdb.Open(t)
	tx := testdb.Begin(t, conn)
	ctx := context.Background()
	posts := postService{db: tx}
	author, _ := testdb.TwoProfiles(t, tx)
	tools := testdb.SomeTools(t, tx, 3)
	postID := toolEditFixture(t, tx, "playbook", author, tools[0], tools[1])

	got, err := posts.setTools(ctx, author, postID, UpdatePostToolsForm{Tools: []uuid.UUID{tools[1], tools[2], tools[2]}})
	if err != nil {
		t.Fatal(err)
	}
	if got == nil {
		t.Error("setTools returned no tools; the edit screen needs the new list")
	}
	linked := linkedTools(t, tx, postID)
	if len(linked) != 2 || !linked[tools[1]] || !linked[tools[2]] {
		t.Errorf("linked tools = %v; want exactly tools 1 and 2", linked)
	}
}

func TestSetToolsEnforcesTheMinimumIntegration(t *testing.T) {
	conn := testdb.Open(t)
	tx := testdb.Begin(t, conn)
	ctx := context.Background()
	posts := postService{db: tx}
	author, _ := testdb.TwoProfiles(t, tx)
	tools := testdb.SomeTools(t, tx, 2)

	playbook := toolEditFixture(t, tx, "playbook", author, tools[0])
	_, err := posts.setTools(ctx, author, playbook, UpdatePostToolsForm{})
	apperrtest.Want(t, "playbook with no tools", err, apperr.KindInvalid, "Playbooks require at least one tool or tool suggestion")
	if linked := linkedTools(t, tx, playbook); !linked[tools[0]] {
		t.Error("a refused edit removed the playbook's tool")
	}

	comparison := toolEditFixture(t, tx, "comparison", author, tools[0], tools[1])
	_, err = posts.setTools(ctx, author, comparison, UpdatePostToolsForm{Tools: tools[:1]})
	apperrtest.Want(t, "comparison with one tool", err, apperr.KindInvalid, "Comparisons require at least two tools or tool suggestions")

	// A suggestion counts, as it does when creating a post.
	_, err = posts.setTools(ctx, author, comparison, UpdatePostToolsForm{
		Tools:          tools[:1],
		SuggestedTools: []ticket.Suggestion{{Name: "Brand New Tool", Website: "https://example.com"}},
	})
	if err != nil {
		t.Errorf("one tool and one suggestion on a comparison: %v; want it accepted", err)
	}
}

func TestSetToolsIsAuthorOnlyIntegration(t *testing.T) {
	conn := testdb.Open(t)
	tx := testdb.Begin(t, conn)
	posts := postService{db: tx}
	author, stranger := testdb.TwoProfiles(t, tx)
	tools := testdb.SomeTools(t, tx, 2)
	postID := toolEditFixture(t, tx, "playbook", author, tools[0])

	_, err := posts.setTools(context.Background(), stranger, postID, UpdatePostToolsForm{Tools: tools[1:]})
	apperrtest.Want(t, "stranger", err, apperr.KindNotFound, "Post not found")
	if linked := linkedTools(t, tx, postID); len(linked) != 1 || !linked[tools[0]] {
		t.Errorf("a stranger's edit changed the post: %v", linked)
	}
}

func TestSetToolsHandlesPendingSuggestionsIntegration(t *testing.T) {
	conn := testdb.Open(t)
	tx := testdb.Begin(t, conn)
	ctx := context.Background()
	posts := postService{db: tx}
	author, _ := testdb.TwoProfiles(t, tx)
	tools := testdb.SomeTools(t, tx, 1)
	postID := toolEditFixture(t, tx, "playbook", author, tools[0])
	kept := addTicket(t, tx, postID, author, "Kept Tool")
	addTicket(t, tx, postID, author, "Removed Tool")

	if _, err := posts.setTools(ctx, author, postID, UpdatePostToolsForm{Tools: tools, TicketIDs: []uuid.UUID{kept}}); err != nil {
		t.Fatal(err)
	}
	tickets := testdb.IDs[uuid.UUID](t, tx, `SELECT id FROM tool_tickets WHERE post_id = $1`, postID)
	if len(tickets) != 1 || tickets[0] != kept {
		t.Errorf("tickets = %v; want only the kept one, the other withdrawn outright", tickets)
	}
}

// The suggestion was approved while the author had the edit page open, so the
// page still shows it as a suggestion and sends its ticket id. Its tool must
// not be unlinked by the edit that "keeps" it.
func TestSetToolsKeepsAToolApprovedMeanwhileIntegration(t *testing.T) {
	conn := testdb.Open(t)
	tx := testdb.Begin(t, conn)
	ctx := context.Background()
	posts := postService{db: tx}
	author, _ := testdb.TwoProfiles(t, tx)
	tools := testdb.SomeTools(t, tx, 2)
	postID := toolEditFixture(t, tx, "playbook", author, tools[0], tools[1])
	approved := addTicket(t, tx, postID, author, "Approved Tool")
	if _, err := tx.Exec(ctx, `UPDATE tool_tickets SET status = 'resolved', resolved_tool_id = $2 WHERE id = $1`, approved, tools[1]); err != nil {
		t.Fatal(err)
	}

	if _, err := posts.setTools(ctx, author, postID, UpdatePostToolsForm{Tools: tools[:1], TicketIDs: []uuid.UUID{approved}}); err != nil {
		t.Fatal(err)
	}
	if linked := linkedTools(t, tx, postID); !linked[tools[1]] {
		t.Errorf("linked = %v; the approved tool was dropped", linked)
	}
	status := testdb.Scalar[string](t, tx, `SELECT status FROM tool_tickets WHERE id = $1`, approved)
	if status != "resolved" {
		t.Errorf("ticket status = %q; a decided ticket must stay on record", status)
	}
}

// With no tools kept, the keep list is empty. A nil slice would reach Postgres
// as NULL, and NOT (x = ANY(NULL)) matches nothing, so the old tool would stay
// linked while the edit reported success.
func TestSetToolsCanRemoveEveryConfirmedToolIntegration(t *testing.T) {
	conn := testdb.Open(t)
	tx := testdb.Begin(t, conn)
	ctx := context.Background()
	posts := postService{db: tx}
	author, _ := testdb.TwoProfiles(t, tx)
	tools := testdb.SomeTools(t, tx, 1)
	postID := toolEditFixture(t, tx, "playbook", author, tools[0])
	pending := addTicket(t, tx, postID, author, "Stale Suggestion")

	_, err := posts.setTools(ctx, author, postID, UpdatePostToolsForm{
		SuggestedTools: []ticket.Suggestion{{Name: "Replacement Tool", Website: "https://example.com"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if linked := linkedTools(t, tx, postID); len(linked) != 0 {
		t.Errorf("linked = %v; want the tool removed", linked)
	}
	names := testdb.IDs[string](t, tx, `SELECT tool_name FROM tool_tickets WHERE post_id = $1`, postID)
	if len(names) != 1 || names[0] != "Replacement Tool" {
		t.Errorf("suggestions = %v; want only the replacement, %s withdrawn", names, pending)
	}
}

func TestSetToolsIgnoresAnotherPostsTicketIntegration(t *testing.T) {
	conn := testdb.Open(t)
	tx := testdb.Begin(t, conn)
	ctx := context.Background()
	posts := postService{db: tx}
	author, _ := testdb.TwoProfiles(t, tx)
	tools := testdb.SomeTools(t, tx, 1)
	postID := toolEditFixture(t, tx, "playbook", author, tools[0])
	other := toolEditFixture(t, tx, "playbook", author, tools[0])
	foreign := addTicket(t, tx, other, author, "Other Post's Tool")

	// Counting it would let this edit satisfy the minimum with a suggestion
	// that belongs to another post.
	_, err := posts.setTools(ctx, author, postID, UpdatePostToolsForm{TicketIDs: []uuid.UUID{foreign}})
	apperrtest.Want(t, "another post's ticket", err, apperr.KindInvalid, "Playbooks require at least one tool or tool suggestion")
}

// idRecorder stands in for the alert loader and channel: it records which ticket
// ids the Alerter asked about, and answers with one alert per id. Nothing is
// sent anywhere.
type idRecorder struct {
	mu     sync.Mutex
	loaded []uuid.UUID
	sent   []ticket.AlertBatch
}

func (r *idRecorder) Load(_ context.Context, ids []uuid.UUID) ([]ticket.NewToolAlert, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.loaded = append(r.loaded, ids...)
	alerts := make([]ticket.NewToolAlert, len(ids))
	for i, id := range ids {
		alerts[i] = ticket.NewToolAlert{TicketID: id, ToolName: "tool", RequesterUsername: "someone"}
	}
	return alerts, nil
}

func (r *idRecorder) Name() string { return "recorder" }

func (r *idRecorder) Deliver(_ context.Context, batch ticket.AlertBatch) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.sent = append(r.sent, batch)
	return nil
}

func (r *idRecorder) loadedIDs() []uuid.UUID {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]uuid.UUID(nil), r.loaded...)
}

func newPlaybookForm(suggestions ...ticket.Suggestion) CreatePostWithSuggestedToolsForm {
	return CreatePostWithSuggestedToolsForm{
		Type:           "playbook",
		Name:           "Alert playbook " + uuid.NewString(),
		SuggestedTools: suggestions,
	}
}

func sameIDs(a, b []uuid.UUID) bool {
	if len(a) != len(b) {
		return false
	}
	seen := map[uuid.UUID]int{}
	for _, id := range a {
		seen[id]++
	}
	for _, id := range b {
		seen[id]--
	}
	for _, n := range seen {
		if n != 0 {
			return false
		}
	}
	return true
}

func TestCreateAlertsAdminsToTheNewSuggestionsIntegration(t *testing.T) {
	conn := testdb.Open(t)
	tx := testdb.Begin(t, conn)
	rec := &idRecorder{}
	alerter := ticket.NewAlerter(rec.Load, []ticket.AlertChannel{rec}, ticket.DefaultAlerterConfig())
	posts := postService{db: tx, alerts: alerter}
	author, _ := testdb.TwoProfiles(t, tx)

	created, err := posts.create(context.Background(), author, newPlaybookForm(
		ticket.Suggestion{Name: "Alert Tool One", Website: "https://example.com"},
		ticket.Suggestion{Name: "Alert Tool Two"},
	))
	if err != nil {
		t.Fatal(err)
	}
	alerter.Flush(context.Background())

	want := testdb.IDs[uuid.UUID](t, tx, `SELECT id FROM tool_tickets WHERE post_id = $1`, created.ID)
	if len(want) != 2 {
		t.Fatalf("%d tickets filed; want 2", len(want))
	}
	if got := rec.loadedIDs(); !sameIDs(got, want) {
		t.Errorf("alerted about %v; want exactly the two new tickets %v", got, want)
	}
}

func TestFailedCreateAlertsNobodyIntegration(t *testing.T) {
	conn := testdb.Open(t)
	tx := testdb.Begin(t, conn)
	rec := &idRecorder{}
	alerter := ticket.NewAlerter(rec.Load, []ticket.AlertChannel{rec}, ticket.DefaultAlerterConfig())
	posts := postService{db: tx, alerts: alerter}
	author, _ := testdb.TwoProfiles(t, tx)

	form := newPlaybookForm(ticket.Suggestion{Name: "Never Filed"})
	form.Name = "   " // fails validation, before anything is stored
	if _, err := posts.create(context.Background(), author, form); err == nil {
		t.Fatal("create with an empty name succeeded")
	}
	alerter.Flush(context.Background())

	if got := rec.loadedIDs(); len(got) != 0 {
		t.Errorf("a refused create alerted about %v", got)
	}
}

func TestSetToolsAlertsAdminsToTheNewSuggestionIntegration(t *testing.T) {
	conn := testdb.Open(t)
	tx := testdb.Begin(t, conn)
	rec := &idRecorder{}
	alerter := ticket.NewAlerter(rec.Load, []ticket.AlertChannel{rec}, ticket.DefaultAlerterConfig())
	posts := postService{db: tx, alerts: alerter}
	author, _ := testdb.TwoProfiles(t, tx)
	tools := testdb.SomeTools(t, tx, 1)
	postID := toolEditFixture(t, tx, "playbook", author, tools[0])

	_, err := posts.setTools(context.Background(), author, postID, UpdatePostToolsForm{
		Tools:          tools,
		SuggestedTools: []ticket.Suggestion{{Name: "Edit Time Suggestion"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	alerter.Flush(context.Background())

	want := testdb.IDs[uuid.UUID](t, tx, `SELECT id FROM tool_tickets WHERE post_id = $1`, postID)
	if got := rec.loadedIDs(); len(want) != 1 || !sameIDs(got, want) {
		t.Errorf("alerted about %v; want the one new ticket %v", got, want)
	}
}

// A suggestion withdrawn between the request and the digest is not news, and
// the rest of the digest still goes out.
func TestAWithdrawnSuggestionIsLeftOutOfTheDigestIntegration(t *testing.T) {
	conn := testdb.Open(t)
	tx := testdb.Begin(t, conn)
	rec := &idRecorder{}
	alerter := ticket.NewAlerter(ticket.LoadAlertsFrom(db.New(tx)), []ticket.AlertChannel{rec}, ticket.DefaultAlerterConfig())
	posts := postService{db: tx, alerts: alerter}
	author, _ := testdb.TwoProfiles(t, tx)

	created, err := posts.create(context.Background(), author, newPlaybookForm(
		ticket.Suggestion{Name: "Kept In Digest"},
		ticket.Suggestion{Name: "Withdrawn Before Digest"},
	))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(context.Background(), `DELETE FROM tool_tickets WHERE post_id = $1 AND tool_name = 'Withdrawn Before Digest'`, created.ID); err != nil {
		t.Fatal(err)
	}
	alerter.Flush(context.Background())

	rec.mu.Lock()
	defer rec.mu.Unlock()
	if len(rec.sent) != 1 || len(rec.sent[0].Alerts) != 1 || rec.sent[0].Alerts[0].ToolName != "Kept In Digest" {
		t.Errorf("digest = %+v; want only the suggestion that still exists", rec.sent)
	}
}

func TestSetToolsRefusesAnUnknownToolIntegration(t *testing.T) {
	conn := testdb.Open(t)
	tx := testdb.Begin(t, conn)
	posts := postService{db: tx}
	author, _ := testdb.TwoProfiles(t, tx)
	tools := testdb.SomeTools(t, tx, 1)
	postID := toolEditFixture(t, tx, "playbook", author, tools[0])

	_, err := posts.setTools(context.Background(), author, postID, UpdatePostToolsForm{Tools: []uuid.UUID{uuid.New()}})
	apperrtest.Want(t, "unknown tool", err, apperr.KindInvalid, "One of those tools no longer exists")
}
