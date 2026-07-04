package rtc

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pion/interceptor"
	"github.com/pion/rtp"
	"github.com/pion/webrtc/v4"
	"github.com/pion/webrtc/v4/pkg/media"

	"github.com/thinkinbig/rt-llm-proxy/internal/identity"
	"github.com/thinkinbig/rt-llm-proxy/internal/model"
	"github.com/thinkinbig/rt-llm-proxy/internal/transcript"
)

func newTestHub() *Hub {
	return &Hub{
		conns:    map[identity.SessionID]*session{},
		archives: newSessionArchiveStore(time.Minute, time.Now),
	}
}

func TestResumeOwnershipAndExpiry(t *testing.T) {
	hist := []transcript.Line{{Seq: 1, Role: "user", Text: "a"}, {Seq: 2, Role: "model", Text: "b"}}
	fresh := func() sessionArchive {
		return sessionArchive{provider: "gemini", userID: "alice", history: hist, maxSeq: 2, expiry: time.Now().Add(time.Minute)}
	}

	t.Run("owner resumes", func(t *testing.T) {
		h := newTestHub()
		arch := fresh()
		h.archives.put("s1", arch.provider, arch.userID, arch.history, arch.maxSeq)
		full, replay, startSeq, ok := h.Resume("s1", "alice", "gemini", 1)
		if !ok || startSeq != 2 || len(full) != 2 || len(replay) != 1 || replay[0].Seq != 2 {
			t.Fatalf("owner resume = %v %v %d %v", full, replay, startSeq, ok)
		}
	})

	t.Run("other user rejected", func(t *testing.T) {
		h := newTestHub()
		arch := fresh()
		h.archives.put("s1", arch.provider, arch.userID, arch.history, arch.maxSeq)
		if _, _, _, ok := h.Resume("s1", "bob", "gemini", 1); ok {
			t.Fatal("cross-user resume must be rejected")
		}
	})

	t.Run("anonymous rejected", func(t *testing.T) {
		h := newTestHub()
		arch := fresh()
		h.archives.put("s1", arch.provider, arch.userID, arch.history, arch.maxSeq)
		if _, _, _, ok := h.Resume("s1", "", "gemini", 1); ok {
			t.Fatal("anonymous resume must be rejected")
		}
	})

	t.Run("provider mismatch rejected", func(t *testing.T) {
		h := newTestHub()
		arch := fresh()
		h.archives.put("s1", arch.provider, arch.userID, arch.history, arch.maxSeq)
		if _, _, _, ok := h.Resume("s1", "alice", "other", 1); ok {
			t.Fatal("provider mismatch must be rejected")
		}
	})

	t.Run("expired archive rejected", func(t *testing.T) {
		h := newTestHub()
		now := time.Now()
		h.archives = newSessionArchiveStore(time.Minute, func() time.Time { return now })
		arch := fresh()
		h.archives.put("s1", arch.provider, arch.userID, arch.history, arch.maxSeq)
		h.archives.now = func() time.Time { return now.Add(2 * time.Minute) }
		if _, _, _, ok := h.Resume("s1", "alice", "gemini", 1); ok {
			t.Fatal("expired archive must be rejected")
		}
		if _, _, ok := h.SessionState("s1", "alice"); ok {
			t.Fatal("expired archive must not report session state")
		}
	})
}

func TestRestoredTurnsMapping(t *testing.T) {
	lines := []transcript.Line{
		{Seq: 1, Role: "user", Text: "hi"},
		{Seq: 2, Role: "model", Text: "hello"},
	}
	turns := restoredTurns(lines)
	if len(turns) != 2 {
		t.Fatalf("turns = %d, want 2", len(turns))
	}
	if turns[0].Role != "user" || turns[0].Text != "hi" ||
		turns[1].Role != "model" || turns[1].Text != "hello" {
		t.Fatalf("turns = %+v", turns)
	}
	if got := restoredTurns(nil); len(got) != 0 {
		t.Fatalf("nil lines -> %+v, want empty", got)
	}
}

func TestSessionRecordNotifiesListener(t *testing.T) {
	var got []transcript.Line
	l := listenerFunc(func(_ transcript.SessionMeta, line transcript.Line) {
		got = append(got, line)
	})
	meta := transcript.SessionMeta{SessionID: "s1", Provider: "gemini"}
	rec := transcript.NewRecorder(0, nil, 256, meta, l)

	line := rec.Record("user", "hello")
	if line.Seq != 1 || line.Role != "user" || line.Text != "hello" {
		t.Fatalf("record = %+v", line)
	}
	if len(got) != 1 || got[0] != line {
		t.Fatalf("listener got %+v", got)
	}
}

func TestRecorderSnapshotAfterSeq(t *testing.T) {
	meta := transcript.SessionMeta{SessionID: "s1"}
	rec := transcript.NewRecorder(0, nil, 256, meta, nil)
	rec.Record("user", "a")
	rec.Record("model", "b")
	rec.Record("user", "c")

	snap := rec.Snapshot(1)
	if len(snap) != 2 || snap[0].Seq != 2 || snap[1].Seq != 3 {
		t.Fatalf("snapshot = %+v", snap)
	}
}

type listenerFunc func(transcript.SessionMeta, transcript.Line)

func (f listenerFunc) OnLine(m transcript.SessionMeta, l transcript.Line) { f(m, l) }

type fakeReceiver struct {
	mu    sync.Mutex
	pcms  [][]int16
	err   error
	calls int
}

func (r *fakeReceiver) Recv() ([]int16, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.calls++
	if len(r.pcms) == 0 {
		return nil, r.err
	}
	p := r.pcms[0]
	r.pcms = r.pcms[1:]
	return p, nil
}

type fakeEncoder struct {
	failAt int
	calls  int
}

func (e *fakeEncoder) Encode(in []int16) ([]byte, error) {
	e.calls++
	if e.failAt > 0 && e.calls == e.failAt {
		return nil, errors.New("encode failed")
	}
	return []byte{byte(len(in) % 251)}, nil
}

type fakeWriter struct {
	mu      sync.Mutex
	samples []media.Sample
}

func (w *fakeWriter) WriteSample(s media.Sample) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.samples = append(w.samples, s)
	return nil
}

func TestWriteOutboundLoopReportsEarlyFaultBeforeAudio(t *testing.T) {
	recv := &fakeReceiver{err: io.EOF}
	enc := &fakeEncoder{}
	out := &fakeWriter{}
	ticks := make(chan time.Time, 1)

	var gotProduced bool
	var gotErr error
	writeOutboundLoop(context.Background(), out, recv, enc, ticks, func(produced bool, err error) {
		gotProduced = produced
		gotErr = err
	}, time.Now, "")

	if gotProduced {
		t.Fatal("expected produced=false for first Recv failure")
	}
	if !errors.Is(gotErr, io.EOF) {
		t.Fatalf("report error = %v, want EOF", gotErr)
	}
}

func TestWriteOutboundLoopReportsFaultAfterAudio(t *testing.T) {
	recv := &fakeReceiver{
		pcms: [][]int16{
			make([]int16, frameSamples),
		},
		err: io.EOF,
	}
	enc := &fakeEncoder{}
	out := &fakeWriter{}
	ticks := make(chan time.Time, 1)
	ticks <- time.Now()

	var gotProduced bool
	writeOutboundLoop(context.Background(), out, recv, enc, ticks, func(produced bool, err error) {
		gotProduced = produced
	}, time.Now, "")

	if !gotProduced {
		t.Fatal("expected produced=true once at least one frame was written")
	}
	if len(out.samples) != 1 {
		t.Fatalf("written samples = %d, want 1", len(out.samples))
	}
}

func TestWriteOutboundLoopSplitsIntoFrames(t *testing.T) {
	recv := &fakeReceiver{
		pcms: [][]int16{
			make([]int16, frameSamples*2+100),
		},
		err: io.EOF,
	}
	enc := &fakeEncoder{}
	out := &fakeWriter{}
	ticks := make(chan time.Time, 2)
	ticks <- time.Now()
	ticks <- time.Now()

	writeOutboundLoop(context.Background(), out, recv, enc, ticks, nil, time.Now, "")

	if len(out.samples) != 2 {
		t.Fatalf("written samples = %d, want 2", len(out.samples))
	}
	if enc.calls != 2 {
		t.Fatalf("encode calls = %d, want 2", enc.calls)
	}
}

func TestWriteOutboundLoopStopsOnContextDone(t *testing.T) {
	recv := &fakeReceiver{
		pcms: [][]int16{
			make([]int16, frameSamples),
			make([]int16, frameSamples),
		},
		err: io.EOF,
	}
	enc := &fakeEncoder{}
	out := &fakeWriter{}
	ticks := make(chan time.Time)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})

	go func() {
		writeOutboundLoop(ctx, out, recv, enc, ticks, nil, time.Now, "")
		close(done)
	}()

	// First frame write blocks on tick gate; cancel should unblock via ctx.Done.
	cancel()
	select {
	case <-done:
	case <-time.After(200 * time.Millisecond):
		t.Fatal("writeOutboundLoop did not stop after context cancellation")
	}
}

// --- narrow-interface fakes for the data-channel + inbound-audio pumps ---

type fakeTextSender struct {
	mu    sync.Mutex
	state webrtc.DataChannelState
	sent  []string
}

func (f *fakeTextSender) SendText(s string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.sent = append(f.sent, s)
	return nil
}

func (f *fakeTextSender) ReadyState() webrtc.DataChannelState {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.state
}

func (f *fakeTextSender) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.sent)
}

type fakeTranscriber struct {
	trs []model.Transcript
	i   int
}

func (f *fakeTranscriber) RecvTranscript() (model.Transcript, error) {
	if f.i >= len(f.trs) {
		return model.Transcript{}, io.EOF
	}
	t := f.trs[f.i]
	f.i++
	return t, nil
}

type fakeToolDispatcher struct {
	calls []model.ToolCall
	i     int
}

func (f *fakeToolDispatcher) RecvToolCall() (model.ToolCall, error) {
	if f.i >= len(f.calls) {
		return model.ToolCall{}, io.EOF
	}
	c := f.calls[f.i]
	f.i++
	return c, nil
}

func (f *fakeToolDispatcher) SendToolResult(model.ToolResult) error { return nil }

type fakeRTPReader struct {
	pkts []*rtp.Packet
	i    int
}

func (f *fakeRTPReader) ReadRTP() (*rtp.Packet, interceptor.Attributes, error) {
	if f.i >= len(f.pkts) {
		return nil, nil, io.EOF
	}
	p := f.pkts[f.i]
	f.i++
	return p, nil, nil
}

type fakeDecoder struct{ failAt, calls int }

func (d *fakeDecoder) Decode(b []byte) ([]int16, error) {
	d.calls++
	if d.failAt > 0 && d.calls == d.failAt {
		return nil, errors.New("decode fail")
	}
	return []int16{int16(len(b))}, nil
}

type fakeAudioSink struct {
	pcms   [][]int16
	failAt int
	calls  int
}

func (s *fakeAudioSink) SendAudio(p []int16) error {
	s.calls++
	if s.failAt > 0 && s.calls == s.failAt {
		return errors.New("send fail")
	}
	s.pcms = append(s.pcms, p)
	return nil
}

func TestForwardTranscriptsRecordsAndSends(t *testing.T) {
	sender := &fakeTextSender{state: webrtc.DataChannelStateOpen}
	tr := &fakeTranscriber{trs: []model.Transcript{{Role: "model", Text: "hello"}}}
	sess := &session{rec: transcript.NewRecorder(0, nil, 256, transcript.SessionMeta{}, transcript.NopListener{})}
	forwardTranscripts(context.Background(), sender, tr, sess)
	if sender.count() != 1 {
		t.Fatalf("want 1 send, got %d", sender.count())
	}
	if !strings.Contains(sender.sent[0], "hello") {
		t.Fatalf("sent missing transcript text: %s", sender.sent[0])
	}
}

type fakePhaser struct {
	phases []model.TurnPhase
	i      int
}

func (f *fakePhaser) RecvPhase() (model.TurnPhase, error) {
	if f.i >= len(f.phases) {
		return model.TurnPhase{}, io.EOF
	}
	p := f.phases[f.i]
	f.i++
	return p, nil
}

func TestForwardPhasesEncodesUIEvents(t *testing.T) {
	sender := &fakeTextSender{state: webrtc.DataChannelStateOpen}
	p := &fakePhaser{phases: []model.TurnPhase{{Phase: "dj_turn_start"}, {Phase: "dj_turn_end"}}}
	forwardPhases(context.Background(), sender, p)
	if sender.count() != 2 {
		t.Fatalf("want 2 sends, got %d", sender.count())
	}
	if !strings.Contains(sender.sent[0], `"type":"ui_event"`) || !strings.Contains(sender.sent[0], "dj_turn_start") {
		t.Fatalf("first phase not encoded as ui_event: %s", sender.sent[0])
	}
	if !strings.Contains(sender.sent[1], "dj_turn_end") {
		t.Fatalf("second phase missing: %s", sender.sent[1])
	}
}

func TestForwardToolCallsEncodesAndSends(t *testing.T) {
	sender := &fakeTextSender{state: webrtc.DataChannelStateOpen}
	td := &fakeToolDispatcher{calls: []model.ToolCall{{ID: "a", Name: "play", Args: json.RawMessage(`{}`)}}}
	forwardToolCalls(context.Background(), sender, td)
	if sender.count() != 1 || !strings.Contains(sender.sent[0], "play") {
		t.Fatalf("tool call not forwarded: %v", sender.sent)
	}
}

func TestForwardToolCallsStopsWhenChannelClosed(t *testing.T) {
	sender := &fakeTextSender{state: webrtc.DataChannelStateClosed}
	td := &fakeToolDispatcher{calls: []model.ToolCall{{ID: "a", Name: "play", Args: json.RawMessage(`{}`)}}}
	forwardToolCalls(context.Background(), sender, td)
	if sender.count() != 0 {
		t.Fatalf("must not send on a non-open channel: %v", sender.sent)
	}
}

type recordingToolDispatcher struct {
	calls   []model.ToolCall
	i       int
	results []model.ToolResult
}

func (f *recordingToolDispatcher) RecvToolCall() (model.ToolCall, error) {
	if f.i >= len(f.calls) {
		return model.ToolCall{}, io.EOF
	}
	c := f.calls[f.i]
	f.i++
	return c, nil
}

func (f *recordingToolDispatcher) SendToolResult(r model.ToolResult) error {
	f.results = append(f.results, r)
	return nil
}

type fakeToolBackend struct {
	sessionIDs []identity.SessionID
	outcome    ToolOutcome
	err        error
}

func (b *fakeToolBackend) RunTool(_ context.Context, id identity.SessionID, _ model.ToolCall) (ToolOutcome, error) {
	b.sessionIDs = append(b.sessionIDs, id)
	if b.err != nil {
		return ToolOutcome{}, b.err
	}
	return b.outcome, nil
}

func TestForwardToolCallsServerReturnsResultAndPushesUIEvents(t *testing.T) {
	sender := &fakeTextSender{state: webrtc.DataChannelStateOpen}
	td := &recordingToolDispatcher{calls: []model.ToolCall{{ID: "a", Name: "skip_track", Args: json.RawMessage(`{}`)}}}
	backend := &fakeToolBackend{outcome: ToolOutcome{
		GeminiResult: json.RawMessage(`{"ok":true}`),
		UIEvents:     []json.RawMessage{json.RawMessage(`{"type":"skip"}`)},
	}}

	forwardToolCallsServer(context.Background(), sender, td, backend, "sess-1")

	if len(backend.sessionIDs) != 1 || backend.sessionIDs[0] != "sess-1" {
		t.Fatalf("backend session ids = %v, want [sess-1]", backend.sessionIDs)
	}
	if len(td.results) != 1 || td.results[0].ID != "a" || !strings.Contains(string(td.results[0].Response), `"ok":true`) {
		t.Fatalf("tool result = %+v", td.results)
	}
	if sender.count() != 1 || !strings.Contains(sender.sent[0], `"ui_event"`) || !strings.Contains(sender.sent[0], `"skip"`) {
		t.Fatalf("ui event not pushed: %v", sender.sent)
	}
}

func TestForwardToolCallsServerStillRepliesOnBackendError(t *testing.T) {
	sender := &fakeTextSender{state: webrtc.DataChannelStateOpen}
	td := &recordingToolDispatcher{calls: []model.ToolCall{{ID: "a", Name: "skip_track"}}}
	backend := &fakeToolBackend{err: errors.New("backend down")}

	forwardToolCallsServer(context.Background(), sender, td, backend, "sess-1")

	// The model must always get a result so it does not hang waiting on the reply.
	if len(td.results) != 1 || !strings.Contains(string(td.results[0].Response), `"ok":false`) {
		t.Fatalf("expected an error stub result, got %+v", td.results)
	}
	if sender.count() != 0 {
		t.Fatalf("no ui events expected on backend error: %v", sender.sent)
	}
}

type fakeInjectModel struct {
	mu    sync.Mutex
	texts []string
}

func (m *fakeInjectModel) SendAudio([]int16) error { return nil }
func (m *fakeInjectModel) SendText(t string) error {
	m.mu.Lock()
	m.texts = append(m.texts, t)
	m.mu.Unlock()
	return nil
}
func (m *fakeInjectModel) Recv() ([]int16, error) { return nil, io.EOF }
func (m *fakeInjectModel) Close() error           { return nil }

func injectableSession(id identity.SessionID, m model.Model, dc textSender) *session {
	s := &session{id: id, model: m, rec: transcript.NewRecorder(0, nil, 256, transcript.SessionMeta{}, transcript.NopListener{})}
	if dc != nil {
		s.setDataChannel(dc)
	}
	return s
}

func TestHubInjectPushesTextAndUIEvents(t *testing.T) {
	h := newTestHub()
	m := &fakeInjectModel{}
	sender := &fakeTextSender{state: webrtc.DataChannelStateOpen}
	h.add(injectableSession("s1", m, sender))

	if !h.Inject("s1", "the set just shifted darker", []json.RawMessage{json.RawMessage(`{"type":"tracklist_updated"}`)}) {
		t.Fatal("inject into a live session must report a hit")
	}
	if len(m.texts) != 1 || m.texts[0] != "the set just shifted darker" {
		t.Fatalf("model texts = %v", m.texts)
	}
	if sender.count() != 1 || !strings.Contains(sender.sent[0], `"ui_event"`) || !strings.Contains(sender.sent[0], "tracklist_updated") {
		t.Fatalf("ui event not pushed: %v", sender.sent)
	}
}

func TestHubInjectMissReturnsFalse(t *testing.T) {
	h := newTestHub()
	if h.Inject("nope", "x", nil) {
		t.Fatal("inject into an unknown session must report a miss")
	}
}

func TestHubInjectDropsUIEventsWhenChannelClosed(t *testing.T) {
	h := newTestHub()
	m := &fakeInjectModel{}
	sender := &fakeTextSender{state: webrtc.DataChannelStateClosed}
	h.add(injectableSession("s1", m, sender))

	if !h.Inject("s1", "nudge", []json.RawMessage{json.RawMessage(`{"type":"x"}`)}) {
		t.Fatal("hit expected")
	}
	// The text nudge still reaches the model even when the data channel is not open.
	if len(m.texts) != 1 {
		t.Fatalf("model texts = %v", m.texts)
	}
	if sender.count() != 0 {
		t.Fatalf("ui events must be dropped on a non-open channel: %v", sender.sent)
	}
}

func TestReadInboundLoopSkipsEmptyAndForwards(t *testing.T) {
	pkts := []*rtp.Packet{
		{Payload: nil},             // empty -> skipped
		{Payload: []byte{1, 2, 3}}, // decoded + forwarded
	}
	sink := &fakeAudioSink{}
	readInboundLoop(&fakeRTPReader{pkts: pkts}, &fakeDecoder{}, sink)
	if len(sink.pcms) != 1 {
		t.Fatalf("want 1 forwarded pcm (empty skipped), got %d", len(sink.pcms))
	}
}

func TestReadInboundLoopContinuesOnDecodeError(t *testing.T) {
	pkts := []*rtp.Packet{
		{Payload: []byte{1}}, // decode fails -> continue
		{Payload: []byte{2}}, // decoded + forwarded
	}
	sink := &fakeAudioSink{}
	readInboundLoop(&fakeRTPReader{pkts: pkts}, &fakeDecoder{failAt: 1}, sink)
	if len(sink.pcms) != 1 {
		t.Fatalf("decode error not skipped: got %d forwarded", len(sink.pcms))
	}
}

func TestReadInboundLoopExitsOnSinkError(t *testing.T) {
	pkts := []*rtp.Packet{{Payload: []byte{1}}, {Payload: []byte{2}}}
	sink := &fakeAudioSink{failAt: 1}
	readInboundLoop(&fakeRTPReader{pkts: pkts}, &fakeDecoder{}, sink)
	if sink.calls != 1 {
		t.Fatalf("must exit after first sink error, calls=%d", sink.calls)
	}
}
