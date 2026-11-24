package ticket

// Admin alerts for newly suggested tools.
//
// Every manual tool suggestion becomes a tool_tickets row. After the
// transaction that created it commits, its id is handed to an Alerter, which
// batches ids and, on a timer, sends admins one digest through each
// AlertChannel (email is the only one).
//
// /admin requires the admin role (admins table, RequireAdmin in routes.go), but
// anyone signed in can suggest a tool, so everything here treats the suggestion text as hostile: it is only
// ever read by the loader and passed to a channel, and the channel decides how
// to render it. The Alerter bounds how much can be sent however many tickets
// are filed: a minimum gap between sends, a per-day cap on sends, and a per-day
// cap on recipient-deliveries (Resend plan unknown, so stay well under a free
// tier). It never blocks or fails the request that filed the ticket.
//
// Pending alerts live in memory and are lost on restart or when dropped for a
// cap. That is deliberate: the admin ticket queue is the source of truth, and
// the digest is only a nudge.

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	"stackhub.com/stackhub/pkg/db"
	"stackhub.com/stackhub/pkg/mail"
)

// NewToolAlert is one suggested tool, as an admin digest shows it. Every field
// except TicketID is user-written and untrusted.
type NewToolAlert struct {
	TicketID          uuid.UUID
	ToolName          string
	Website           string
	Description       string
	RequesterUsername string
	PlaybookName      string
	Categories        []string
}

// AlertBatch is what one digest carries: the tools to list, how many more were
// left out, and how many submitters they came from.
type AlertBatch struct {
	Alerts         []NewToolAlert
	More           int
	MoreSubmitters int
}

// AlertChannel delivers a digest somewhere admins will see it. Deliver must
// honour ctx. An error (or panic) is logged by name only and not retried.
type AlertChannel interface {
	Name() string
	Deliver(ctx context.Context, batch AlertBatch) error
}

// AlertLoader turns ticket ids into the alerts to show. It returns only
// tickets that still exist and are pending; an id it cannot find is skipped.
type AlertLoader func(ctx context.Context, ids []uuid.UUID) ([]NewToolAlert, error)

// AlerterConfig is the Alerter's limits. DefaultAlerterConfig is what runs in
// production; tests shrink them.
type AlerterConfig struct {
	MinInterval         time.Duration // floor between sends
	Burst               int           // sends per UTC day that need only MinInterval between them; the rest are spread
	MaxPerDay           int           // sends per UTC day
	MaxDeliveriesPerDay int           // recipient-deliveries per UTC day: a send costs Recipients
	Recipients          int           // recipients per send, to cost a send
	MaxListed           int           // tools listed in one digest
	MaxPerRequester     int           // tools listed per submitter in one digest
	MaxPending          int           // ids held between sends
	DeliverTimeout      time.Duration // load and each channel's delivery
	Now                 func() time.Time
}

// DefaultAlerterConfig returns the production limits.
func DefaultAlerterConfig() AlerterConfig {
	return AlerterConfig{
		MinInterval: 10 * time.Minute,
		// The first few sends of a day only wait MinInterval, so two
		// suggestions an hour apart are both announced promptly. Only after
		// that is the rest of the allowance spread over what is left of the
		// day, which is what stops one account using it all up early.
		Burst: 3,
		MaxPerDay:   24,
		// The Resend plan is unknown. Each recipient of a send counts as a
		// delivery, so this keeps a day's mail well under a 100/day free tier
		// and leaves room for the welcome, star, follower and approval emails
		// that share the quota.
		MaxDeliveriesPerDay: 40,
		Recipients:          1,
		MaxListed:           20,
		MaxPerRequester:     5,
		MaxPending:          500,
		DeliverTimeout:      10 * time.Second,
		Now:                 time.Now,
	}
}

type pendingAlert struct {
	id        uuid.UUID
	requester uuid.UUID
}

// Alerter batches new-tool tickets and sends admins a digest. A nil *Alerter is
// valid and does nothing, so callers need no "is it on" checks.
type Alerter struct {
	load     AlertLoader
	channels []AlertChannel
	cfg      AlerterConfig

	flushMu sync.Mutex // one Flush at a time

	mu              sync.Mutex // guards everything below
	pending         []pendingAlert
	known           map[uuid.UUID]bool
	overflow        int // ids dropped for MaxPending since the last send
	day             string
	sendsToday      int
	deliveriesToday int
	lastSend        time.Time
	heldNoted       bool // "held for spacing" already logged since the last send
}

// NewAlerter builds an Alerter. Zero values in cfg that would break it fall
// back to the defaults.
func NewAlerter(load AlertLoader, channels []AlertChannel, cfg AlerterConfig) *Alerter {
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	if cfg.Recipients < 1 {
		cfg.Recipients = 1
	}
	if cfg.DeliverTimeout <= 0 {
		cfg.DeliverTimeout = 10 * time.Second
	}
	return &Alerter{load: load, channels: channels, cfg: cfg, known: map[uuid.UUID]bool{}}
}

// Enqueue notes new tickets filed by requester. Call it only after the
// transaction that created them committed. It does no I/O and never blocks.
//
// When MaxPending is reached, a new ticket from a submitter with fewer
// pending than the heaviest takes the place of that heaviest submitter's
// newest one, so a flood from one account cannot crowd out everyone else; a
// ticket from the heaviest submitter is dropped. Either way the dropped ticket
// is only counted, and shows in the digest as "more".
func (a *Alerter) Enqueue(requester uuid.UUID, ids ...uuid.UUID) {
	if a == nil {
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()

	for _, id := range ids {
		if a.known[id] {
			continue
		}
		if len(a.pending) >= a.cfg.MaxPending {
			if !a.makeRoomFor(requester) {
				a.overflow++
				continue
			}
		}
		a.known[id] = true
		a.pending = append(a.pending, pendingAlert{id: id, requester: requester})
	}
}

// makeRoomFor evicts the newest pending ticket of the submitter with the most
// pending, unless that submitter is requester (or ties with them): then there
// is no room and the new ticket is the one to drop. Caller holds mu.
func (a *Alerter) makeRoomFor(requester uuid.UUID) bool {
	counts := map[uuid.UUID]int{}
	for _, p := range a.pending {
		counts[p.requester]++
	}
	var heaviest uuid.UUID
	most := 0
	for _, p := range a.pending { // pending order keeps ties deterministic
		if counts[p.requester] > most {
			most, heaviest = counts[p.requester], p.requester
		}
	}
	if heaviest == requester || counts[requester] >= most {
		return false
	}
	for i := len(a.pending) - 1; i >= 0; i-- {
		if a.pending[i].requester == heaviest {
			delete(a.known, a.pending[i].id)
			a.pending = append(a.pending[:i], a.pending[i+1:]...)
			a.overflow++
			return true
		}
	}
	return false
}

// minGap is the least time to wait after the last send. It is MinInterval, or
// more: what is left of the UTC day divided by the sends still allowed, so a
// burst of tickets early in the day cannot use the whole allowance and leave
// the evening unannounced. Caller holds mu and has checked a send is allowed.
func (a *Alerter) minGap(now time.Time) time.Duration {
	if a.sendsToday < a.cfg.Burst {
		return a.cfg.MinInterval
	}
	sendsLeft := a.cfg.MaxPerDay - a.sendsToday
	if byDeliveries := (a.cfg.MaxDeliveriesPerDay - a.deliveriesToday) / a.cfg.Recipients; byDeliveries < sendsLeft {
		sendsLeft = byDeliveries
	}
	if sendsLeft < 1 {
		sendsLeft = 1
	}
	endOfDay := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, time.UTC)
	gap := endOfDay.Sub(now) / time.Duration(sendsLeft)
	if gap < a.cfg.MinInterval {
		gap = a.cfg.MinInterval
	}
	return gap
}

// take removes and returns everything pending, or reports that a send is not
// allowed yet (nothing pending, a cap reached, or too soon after the last
// send). In every "not yet" case nothing is cleared.
func (a *Alerter) take(now time.Time) (ids []uuid.UUID, overflow int, ok bool) {
	a.mu.Lock()
	defer a.mu.Unlock()

	if len(a.pending) == 0 && a.overflow == 0 {
		return nil, 0, false
	}
	if day := now.Format("2006-01-02"); day != a.day {
		a.day, a.sendsToday, a.deliveriesToday = day, 0, 0
	}
	if a.sendsToday >= a.cfg.MaxPerDay || a.deliveriesToday+a.cfg.Recipients > a.cfg.MaxDeliveriesPerDay {
		return nil, 0, false
	}
	if !a.lastSend.IsZero() {
		if wait := a.minGap(now) - now.Sub(a.lastSend); wait > 0 {
			// Say so once per hold: without this a held alert looks like a
			// lost one. Counts and a duration only, never an address.
			if !a.heldNoted {
				a.heldNoted = true
				log.Printf("admin tool alert: %d pending, next send in about %s", len(a.pending), wait.Round(time.Minute))
			}
			return nil, 0, false
		}
	}

	ids = make([]uuid.UUID, len(a.pending))
	for i, p := range a.pending {
		ids[i] = p.id
	}
	overflow = a.overflow
	a.pending, a.known, a.overflow = nil, map[uuid.UUID]bool{}, 0
	return ids, overflow, true
}

// spend counts a send against the day's caps. It happens before delivery, so a
// failing channel cannot be retried into more mail than the caps allow.
func (a *Alerter) spend(now time.Time) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.sendsToday++
	a.deliveriesToday += a.cfg.Recipients
	a.lastSend = now
	a.heldNoted = false
}

// Flush sends a digest of what is pending, if the caps and spacing allow, and
// otherwise keeps everything for a later call. It never panics and never
// retries: a batch that fails to load or deliver is dropped (the ticket queue
// has it).
func (a *Alerter) Flush(ctx context.Context) {
	if a == nil {
		return
	}
	a.flushMu.Lock()
	defer a.flushMu.Unlock()
	defer func() {
		if recover() != nil {
			log.Println("admin tool alert: recovered from panic")
		}
	}()

	now := a.cfg.Now().UTC()
	ids, overflow, ok := a.take(now)
	if !ok {
		return
	}

	loadCtx, cancel := context.WithTimeout(ctx, a.cfg.DeliverTimeout)
	alerts, err := a.load(loadCtx, ids)
	cancel()
	if err != nil {
		log.Println("admin tool alert: load failed:", err)
		return
	}
	// Everything withdrawn or decided since: nothing to say, and it must not
	// use up a send.
	if len(alerts) == 0 && overflow == 0 {
		return
	}

	a.spend(now)

	listed, more, moreSubmitters := selectForDigest(alerts, a.cfg.MaxListed, a.cfg.MaxPerRequester)
	more += overflow
	if more > 0 && moreSubmitters == 0 {
		// The ones dropped for MaxPending are only counted, not attributed.
		moreSubmitters = 1
	}
	batch := AlertBatch{Alerts: listed, More: more, MoreSubmitters: moreSubmitters}
	for _, ch := range a.channels {
		a.deliver(ch, batch)
	}
}

// deliver gives one channel the batch, bounded by DeliverTimeout. A channel
// that errors, panics or hangs is logged by name only: its error can carry
// recipient addresses, which must not reach the logs.
func (a *Alerter) deliver(ch AlertChannel, batch AlertBatch) {
	ctx, cancel := context.WithTimeout(context.Background(), a.cfg.DeliverTimeout)
	defer cancel()

	done := make(chan error, 1)
	go func() {
		defer func() {
			if recover() != nil {
				log.Println("admin tool alert: recovered from panic")
				done <- context.Canceled // any non-nil value: reported as a failure
			}
		}()
		done <- ch.Deliver(ctx, batch)
	}()

	select {
	case err := <-done:
		if err != nil {
			log.Println("admin tool alert:", ch.Name(), "delivery failed")
		}
	case <-ctx.Done():
		log.Println("admin tool alert:", ch.Name(), "delivery timed out")
	}
}

// Run flushes on a timer until ctx is cancelled. It checks every minute, which
// is finer than the shortest gap a send can be held to.
func (a *Alerter) Run(ctx context.Context) {
	if a == nil {
		return
	}
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			a.Flush(ctx)
		}
	}
}

// selectForDigest picks what one digest lists. It goes round-robin across
// submitters, oldest first within each, taking at most maxPerRequester from any
// one and maxListed in all, so one account filing many tickets cannot hide
// everyone else's. What is left out is counted: more tools, from
// moreSubmitters submitters. alerts must be oldest first. The listed ones keep
// their input order.
func selectForDigest(alerts []NewToolAlert, maxListed, maxPerRequester int) (listed []NewToolAlert, more int, moreSubmitters int) {
	var order []string // submitters, by first appearance
	queues := map[string][]int{}
	for i, al := range alerts {
		if _, seen := queues[al.RequesterUsername]; !seen {
			order = append(order, al.RequesterUsername)
		}
		queues[al.RequesterUsername] = append(queues[al.RequesterUsername], i)
	}

	taken := map[int]bool{}
	for round := 0; round < maxPerRequester && len(taken) < maxListed; round++ {
		for _, who := range order {
			if len(taken) >= maxListed {
				break
			}
			if q := queues[who]; round < len(q) {
				taken[q[round]] = true
			}
		}
	}

	left := map[string]bool{}
	for i, al := range alerts {
		if taken[i] {
			listed = append(listed, al)
			continue
		}
		more++
		left[al.RequesterUsername] = true
	}
	return listed, more, len(left)
}

// LoadAlertsFrom is the AlertLoader that reads tickets from the database.
func LoadAlertsFrom(q *db.Queries) AlertLoader {
	return func(ctx context.Context, ids []uuid.UUID) ([]NewToolAlert, error) {
		rows, err := q.ListToolTicketsForAlert(ctx, ids)
		if err != nil {
			return nil, err
		}
		alerts := make([]NewToolAlert, 0, len(rows))
		for _, r := range rows {
			al := NewToolAlert{
				TicketID:          r.ID,
				ToolName:          r.ToolName,
				Website:           r.ToolWebsite,
				Description:       r.ToolDescription,
				RequesterUsername: r.RequesterUsername,
				Categories:        append([]string(nil), r.CategoryNames...),
			}
			if r.PostName.Valid {
				al.PlaybookName = r.PostName.String
			}
			alerts = append(alerts, al)
		}
		return alerts, nil
	}
}

// EmailChannel sends the digest to the admins by email.
type EmailChannel struct {
	Mailer *mail.Mailer
	To     []string
}

func (EmailChannel) Name() string { return "email" }

func (c EmailChannel) Deliver(ctx context.Context, batch AlertBatch) error {
	if c.Mailer == nil || len(c.To) == 0 {
		return nil
	}
	items := make([]mail.NewToolItem, len(batch.Alerts))
	for i, al := range batch.Alerts {
		items[i] = mail.NewToolItem{
			TicketID:          al.TicketID.String(),
			ToolName:          al.ToolName,
			Website:           al.Website,
			Description:       al.Description,
			RequesterUsername: al.RequesterUsername,
			PlaybookName:      al.PlaybookName,
			Categories:        al.Categories,
		}
	}
	return c.Mailer.SendNewToolDigest(ctx, c.To, items, batch.More, batch.MoreSubmitters)
}
