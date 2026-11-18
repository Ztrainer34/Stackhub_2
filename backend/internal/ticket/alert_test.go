package ticket

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
)

// Everything here is pure: a fake loader, fake channels and a fake clock. No
// test sends mail or touches a database.

type fakeClock struct {
	mu sync.Mutex
	t  time.Time
}

func newClock(h, m int) *fakeClock {
	return &fakeClock{t: time.Date(2026, 3, 10, h, m, 0, 0, time.UTC)}
}
func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}
func (c *fakeClock) Add(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.t = c.t.Add(d)
}
func (c *fakeClock) Set(t time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.t = t
}

type fakeLoader struct {
	mu      sync.Mutex
	calls   [][]uuid.UUID
	missing map[uuid.UUID]bool   // withdrawn or decided before the flush
	who     map[uuid.UUID]string // submitter of each id; default "alice"
	err     error
	none    bool // return no rows at all
}

func (l *fakeLoader) Load(ctx context.Context, ids []uuid.UUID) ([]NewToolAlert, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.calls = append(l.calls, append([]uuid.UUID(nil), ids...))
	if l.err != nil {
		return nil, l.err
	}
	if l.none {
		return nil, nil
	}
	var out []NewToolAlert
	for _, id := range ids {
		if l.missing[id] {
			continue
		}
		who := l.who[id]
		if who == "" {
			who = "alice"
		}
		out = append(out, NewToolAlert{TicketID: id, ToolName: "tool " + id.String()[:8], RequesterUsername: who})
	}
	return out, nil
}

func (l *fakeLoader) loaded() []uuid.UUID {
	l.mu.Lock()
	defer l.mu.Unlock()
	var all []uuid.UUID
	for _, c := range l.calls {
		all = append(all, c...)
	}
	return all
}

type fakeChannel struct {
	name       string
	err        error
	panicFirst bool
	block      chan struct{} // Deliver waits for this and ignores ctx
	entered    chan struct{} // signalled when Deliver starts

	mu      sync.Mutex
	calls   int
	batches []AlertBatch
}

func (c *fakeChannel) Name() string {
	if c.name == "" {
		return "fake"
	}
	return c.name
}

func (c *fakeChannel) Deliver(ctx context.Context, batch AlertBatch) error {
	c.mu.Lock()
	c.calls++
	n := c.calls
	c.mu.Unlock()
	if c.entered != nil {
		select {
		case c.entered <- struct{}{}:
		default:
		}
	}
	if c.panicFirst && n == 1 {
		panic("boom for admin@example.com")
	}
	if c.block != nil {
		<-c.block
	}
	c.mu.Lock()
	c.batches = append(c.batches, batch)
	c.mu.Unlock()
	return c.err
}

func (c *fakeChannel) sent() []AlertBatch {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]AlertBatch(nil), c.batches...)
}

func (c *fakeChannel) callCount() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.calls
}

func newIDs(n int) []uuid.UUID {
	out := make([]uuid.UUID, n)
	for i := range out {
		out[i] = uuid.New()
	}
	return out
}

func captureLog(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	log.SetOutput(&buf)
	t.Cleanup(func() { log.SetOutput(os.Stderr) })
	return &buf
}

var anyone = uuid.MustParse("00000000-0000-0000-0000-00000000000a")

func TestNilAlerterIsANoOp(t *testing.T) {
	var a *Alerter
	a.Enqueue(anyone, uuid.New())
	a.Flush(context.Background())
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	a.Run(ctx) // returns at once
}

func TestEnqueueTwiceLoadsOnce(t *testing.T) {
	clk := newClock(0, 0)
	ld, ch := &fakeLoader{}, &fakeChannel{}
	a := NewAlerter(ld.Load, []AlertChannel{ch}, testCfg(clk))
	id := uuid.New()
	a.Enqueue(anyone, id, id)
	a.Enqueue(anyone, id)
	a.Flush(context.Background())

	if got := ld.loaded(); len(got) != 1 || got[0] != id {
		t.Errorf("loader got %v; want the id once", got)
	}
	if len(ch.sent()) != 1 || len(ch.sent()[0].Alerts) != 1 {
		t.Errorf("batches = %+v; want one digest with one tool", ch.sent())
	}
}

func testCfg(clk *fakeClock) AlerterConfig {
	cfg := DefaultAlerterConfig()
	cfg.Now = clk.Now
	cfg.DeliverTimeout = 2 * time.Second
	return cfg
}

func TestFlushWithNothingPendingDoesNothing(t *testing.T) {
	ld, ch := &fakeLoader{}, &fakeChannel{}
	a := NewAlerter(ld.Load, []AlertChannel{ch}, testCfg(newClock(0, 0)))
	a.Flush(context.Background())
	if len(ld.calls) != 0 || ch.callCount() != 0 {
		t.Error("an empty flush loaded or delivered")
	}
}

func TestSelectForDigestIsFairAcrossSubmitters(t *testing.T) {
	var alerts []NewToolAlert
	for i := 0; i < 30; i++ {
		alerts = append(alerts, NewToolAlert{ToolName: fmt.Sprintf("a%02d", i), RequesterUsername: "A"})
	}
	alerts = append(alerts, NewToolAlert{ToolName: "b0", RequesterUsername: "B"})

	listed, more, subs := selectForDigest(alerts, 20, 5)
	var fromA, fromB int
	for _, al := range listed {
		switch al.RequesterUsername {
		case "A":
			fromA++
		case "B":
			fromB++
		}
	}
	if fromB != 1 || fromA != 5 {
		t.Errorf("listed %d from A and %d from B; want 5 and 1", fromA, fromB)
	}
	if more != 25 || subs != 1 {
		t.Errorf("more = %d from %d submitters; want 25 from 1", more, subs)
	}
	if listed[0].ToolName != "a00" || listed[4].ToolName != "a04" {
		t.Errorf("not oldest first within a submitter: %v", listed)
	}
}

func TestSelectForDigestCapsTheTotal(t *testing.T) {
	var alerts []NewToolAlert
	for i := 0; i < 25; i++ {
		alerts = append(alerts, NewToolAlert{ToolName: fmt.Sprintf("t%02d", i), RequesterUsername: fmt.Sprintf("u%d", i%10)})
	}
	listed, more, subs := selectForDigest(alerts, 20, 5)
	if len(listed) != 20 || more != 5 {
		t.Fatalf("listed %d, more %d; want 20 and 5", len(listed), more)
	}
	if subs < 1 || subs > 5 {
		t.Errorf("moreSubmitters = %d; want 1 to 5", subs)
	}
	last := map[string]string{}
	for _, al := range listed {
		if prev := last[al.RequesterUsername]; prev >= al.ToolName {
			t.Errorf("%s: %s listed after %s; input order not kept", al.RequesterUsername, al.ToolName, prev)
		}
		last[al.RequesterUsername] = al.ToolName
	}
}

func TestMaxPendingCountsTheOverflow(t *testing.T) {
	clk := newClock(0, 0)
	cfg := testCfg(clk)
	cfg.MaxPending = 3
	ld, ch := &fakeLoader{}, &fakeChannel{}
	a := NewAlerter(ld.Load, []AlertChannel{ch}, cfg)

	a.Enqueue(anyone, newIDs(5)...)
	a.Flush(context.Background())

	if got := ld.loaded(); len(got) != 3 {
		t.Errorf("loader got %d ids; want 3", len(got))
	}
	sent := ch.sent()
	if len(sent) != 1 || len(sent[0].Alerts) != 3 || sent[0].More != 2 {
		t.Errorf("batch = %+v; want 3 listed and 2 more", sent)
	}
}

// A flood from one account must not stop another account's suggestion being
// held once the queue is full.
func TestMaxPendingEvictsTheHeaviestSubmitter(t *testing.T) {
	clk := newClock(0, 0)
	cfg := testCfg(clk)
	cfg.MaxPending = 3
	ld, ch := &fakeLoader{}, &fakeChannel{}
	a := NewAlerter(ld.Load, []AlertChannel{ch}, cfg)

	flooder := uuid.New()
	other := uuid.New()
	a.Enqueue(flooder, newIDs(3)...)
	late := uuid.New()
	a.Enqueue(other, late)
	a.Flush(context.Background())

	loaded := ld.loaded()
	if len(loaded) != 3 {
		t.Fatalf("loader got %d ids; want 3", len(loaded))
	}
	found := false
	for _, id := range loaded {
		found = found || id == late
	}
	if !found {
		t.Error("the other submitter's ticket was refused while one account filled the queue")
	}
	if sent := ch.sent(); len(sent) != 1 || sent[0].More != 1 {
		t.Errorf("batch = %+v; want the evicted one counted as more", sent)
	}
}

func TestDailyCapKeepsPendingUntilTheNextUTCDay(t *testing.T) {
	clk := newClock(0, 0)
	cfg := testCfg(clk)
	cfg.MaxPerDay = 2
	ld, ch := &fakeLoader{}, &fakeChannel{}
	a := NewAlerter(ld.Load, []AlertChannel{ch}, cfg)
	ctx := context.Background()

	a.Enqueue(anyone, uuid.New())
	a.Flush(ctx) // 00:00, send 1
	clk.Set(time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC))
	a.Enqueue(anyone, uuid.New())
	a.Flush(ctx) // send 2
	if len(ch.sent()) != 2 {
		t.Fatalf("sends = %d; want 2", len(ch.sent()))
	}

	held := uuid.New()
	a.Enqueue(anyone, held)
	clk.Set(time.Date(2026, 3, 10, 23, 30, 0, 0, time.UTC))
	a.Flush(ctx)
	if len(ch.sent()) != 2 {
		t.Fatal("a third send went out the same day")
	}

	clk.Set(time.Date(2026, 3, 11, 12, 0, 0, 0, time.UTC))
	a.Flush(ctx)
	sent := ch.sent()
	if len(sent) != 3 || len(sent[2].Alerts) != 1 || sent[2].Alerts[0].TicketID != held {
		t.Errorf("after the rollover the held ticket was not sent: %+v", sent)
	}
}

func runDay(t *testing.T, cfg AlerterConfig, clk *fakeClock) (sendTimes []time.Time) {
	t.Helper()
	ld, ch := &fakeLoader{}, &fakeChannel{}
	a := NewAlerter(ld.Load, []AlertChannel{ch}, cfg)
	for i := 0; i < 24*6; i++ { // a ticket every 10 minutes, a flush each time
		a.Enqueue(anyone, uuid.New())
		before := ch.callCount()
		a.Flush(context.Background())
		if ch.callCount() > before {
			sendTimes = append(sendTimes, clk.Now())
		}
		clk.Add(10 * time.Minute)
	}
	return sendTimes
}

func TestSendsAreSpreadAcrossTheDay(t *testing.T) {
	clk := newClock(0, 0)
	cfg := testCfg(clk)
	times := runDay(t, cfg, clk)

	if len(times) > cfg.MaxPerDay {
		t.Errorf("%d sends in a day; the cap is %d", len(times), cfg.MaxPerDay)
	}
	var evening, morning int
	for _, ts := range times {
		if ts.Hour() >= 20 {
			evening++
		}
		if ts.Hour() < 12 {
			morning++
		}
	}
	if evening == 0 {
		t.Errorf("nothing sent after 20:00: a burst early in the day used the whole allowance (%v)", times)
	}
	if morning > 13 {
		t.Errorf("%d sends before noon; the allowance should be spread", morning)
	}
}

func TestDeliveryCapLimitsSendsPerDay(t *testing.T) {
	clk := newClock(0, 0)
	cfg := testCfg(clk)
	cfg.Recipients = 10
	cfg.MaxDeliveriesPerDay = 40
	times := runDay(t, cfg, clk)

	if len(times) != 4 {
		t.Errorf("%d sends; 10 recipients against 40 deliveries a day allows exactly 4 (%v)", len(times), times)
	}
}

func TestFailedDeliveryIsNotRetriedAndStillCounts(t *testing.T) {
	logs := captureLog(t)
	clk := newClock(0, 0)
	cfg := testCfg(clk)
	cfg.MaxPerDay = 1
	ld := &fakeLoader{}
	ch := &fakeChannel{name: "email", err: errors.New("resend rejected admin@example.com")}
	a := NewAlerter(ld.Load, []AlertChannel{ch}, cfg)
	ctx := context.Background()

	a.Enqueue(anyone, uuid.New())
	a.Flush(ctx)
	clk.Add(time.Hour)
	a.Flush(ctx)
	if ch.callCount() != 1 {
		t.Errorf("deliveries = %d; a failed batch must not be retried", ch.callCount())
	}

	a.Enqueue(anyone, uuid.New())
	clk.Add(time.Hour)
	a.Flush(ctx)
	if ch.callCount() != 1 {
		t.Error("the failed attempt did not count against the daily cap")
	}

	if strings.Contains(logs.String(), "@") {
		t.Errorf("a recipient address reached the log:\n%s", logs)
	}
	if !strings.Contains(logs.String(), "email") {
		t.Errorf("the failure was not logged by channel name:\n%s", logs)
	}
}

func TestOneFailingChannelDoesNotStopTheNext(t *testing.T) {
	captureLog(t)
	clk := newClock(0, 0)
	ld := &fakeLoader{}
	first := &fakeChannel{name: "first", err: errors.New("down")}
	second := &fakeChannel{name: "second"}
	a := NewAlerter(ld.Load, []AlertChannel{first, second}, testCfg(clk))

	a.Enqueue(anyone, uuid.New())
	a.Flush(context.Background())
	if len(second.sent()) != 1 {
		t.Error("the second channel did not get the batch")
	}
}

func TestPanickingChannelIsContained(t *testing.T) {
	logs := captureLog(t)
	clk := newClock(0, 0)
	ld := &fakeLoader{}
	bad := &fakeChannel{name: "bad", panicFirst: true}
	good := &fakeChannel{name: "good"}
	a := NewAlerter(ld.Load, []AlertChannel{bad, good}, testCfg(clk))
	ctx := context.Background()

	a.Enqueue(anyone, uuid.New())
	a.Flush(ctx)
	if len(good.sent()) != 1 {
		t.Error("a panicking channel stopped the next one")
	}

	clk.Add(2 * time.Hour)
	a.Enqueue(anyone, uuid.New())
	a.Flush(ctx)
	if len(bad.sent()) != 1 || len(good.sent()) != 2 {
		t.Errorf("the next flush did not work: bad %d, good %d", len(bad.sent()), len(good.sent()))
	}
	if strings.Contains(logs.String(), "@") {
		t.Errorf("a panic value with an address reached the log:\n%s", logs)
	}
}

func TestBlockedChannelIsCutOffAtTheTimeout(t *testing.T) {
	captureLog(t)
	clk := newClock(0, 0)
	cfg := testCfg(clk)
	cfg.DeliverTimeout = 50 * time.Millisecond
	block := make(chan struct{})
	defer close(block)
	ld := &fakeLoader{}
	a := NewAlerter(ld.Load, []AlertChannel{&fakeChannel{name: "stuck", block: block}}, cfg)

	a.Enqueue(anyone, uuid.New())
	start := time.Now()
	a.Flush(context.Background())
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Errorf("Flush took %v with a stuck channel; want about the timeout", elapsed)
	}
}

func TestLoaderErrorDropsTheBatchQuietly(t *testing.T) {
	captureLog(t)
	ld := &fakeLoader{err: errors.New("database down")}
	ch := &fakeChannel{}
	a := NewAlerter(ld.Load, []AlertChannel{ch}, testCfg(newClock(0, 0)))

	a.Enqueue(anyone, uuid.New())
	a.Flush(context.Background())
	if ch.callCount() != 0 {
		t.Error("delivered after the loader failed")
	}
	ld.err = nil
	a.Flush(context.Background())
	if ch.callCount() != 0 {
		t.Error("the dropped batch came back")
	}
}

func TestLoaderPanicIsContained(t *testing.T) {
	captureLog(t)
	ch := &fakeChannel{}
	a := NewAlerter(func(context.Context, []uuid.UUID) ([]NewToolAlert, error) { panic("boom") },
		[]AlertChannel{ch}, testCfg(newClock(0, 0)))
	a.Enqueue(anyone, uuid.New())
	a.Flush(context.Background()) // must not panic
	if ch.callCount() != 0 {
		t.Error("delivered after the loader panicked")
	}
}

func TestEverythingWithdrawnSendsNothingAndCostsNothing(t *testing.T) {
	clk := newClock(0, 0)
	cfg := testCfg(clk)
	cfg.MaxPerDay = 1
	ld, ch := &fakeLoader{none: true}, &fakeChannel{}
	a := NewAlerter(ld.Load, []AlertChannel{ch}, cfg)
	ctx := context.Background()

	a.Enqueue(anyone, uuid.New())
	a.Flush(ctx)
	if ch.callCount() != 0 {
		t.Fatal("sent a digest of nothing")
	}

	ld.none = false
	a.Enqueue(anyone, uuid.New())
	a.Flush(ctx)
	if ch.callCount() != 1 {
		t.Error("the empty flush used up the day's only send")
	}
}

func TestAWithdrawnTicketIsOmittedAndTheRestSend(t *testing.T) {
	clk := newClock(0, 0)
	ids := newIDs(3)
	ld := &fakeLoader{missing: map[uuid.UUID]bool{ids[1]: true}}
	ch := &fakeChannel{}
	a := NewAlerter(ld.Load, []AlertChannel{ch}, testCfg(clk))

	a.Enqueue(anyone, ids...)
	a.Flush(context.Background())

	sent := ch.sent()
	if len(sent) != 1 || len(sent[0].Alerts) != 2 || sent[0].More != 0 {
		t.Fatalf("batch = %+v; want the two that remain", sent)
	}
	for _, al := range sent[0].Alerts {
		if al.TicketID == ids[1] {
			t.Error("the withdrawn ticket was listed")
		}
	}
}

func TestEnqueueDoesNotWaitForADelivery(t *testing.T) {
	clk := newClock(0, 0)
	release := make(chan struct{})
	ch := &fakeChannel{block: release, entered: make(chan struct{}, 1)}
	cfg := testCfg(clk)
	cfg.DeliverTimeout = 30 * time.Second
	ld := &fakeLoader{}
	a := NewAlerter(ld.Load, []AlertChannel{ch}, cfg)

	a.Enqueue(anyone, uuid.New())
	flushed := make(chan struct{})
	go func() {
		a.Flush(context.Background())
		close(flushed)
	}()
	select {
	case <-ch.entered:
	case <-time.After(5 * time.Second):
		t.Fatal("Flush never reached the channel")
	}

	enqueued := make(chan struct{})
	go func() {
		a.Enqueue(anyone, uuid.New())
		close(enqueued)
	}()
	select {
	case <-enqueued:
	case <-time.After(2 * time.Second):
		t.Error("Enqueue waited for a delivery in progress")
	}

	close(release)
	select {
	case <-flushed:
	case <-time.After(5 * time.Second):
		t.Error("Flush did not finish once the channel returned")
	}
}

func TestRunStopsWhenCancelled(t *testing.T) {
	a := NewAlerter((&fakeLoader{}).Load, nil, testCfg(newClock(0, 0)))
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		a.Run(ctx)
		close(done)
	}()
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Error("Run did not stop")
	}
}
