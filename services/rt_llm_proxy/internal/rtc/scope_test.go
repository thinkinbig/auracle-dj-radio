package rtc

import (
	"io"
	"testing"

	"github.com/pion/webrtc/v4"

	"github.com/thinkinbig/rt-llm-proxy/internal/identity"
	"github.com/thinkinbig/rt-llm-proxy/internal/model"
	"github.com/thinkinbig/rt-llm-proxy/internal/transcript"
)

type silentModel struct{}

func (silentModel) SendAudio([]int16) error        { return nil }
func (silentModel) SendText(string) error          { return nil }
func (silentModel) Recv() ([]int16, error)         { return nil, io.EOF }
func (silentModel) RecvInterrupted() (bool, error) { return false, nil }
func (silentModel) SupportsInterruption() bool     { return false }
func (silentModel) HandleInterrupted() error       { return nil }
func (silentModel) Close() error                   { return nil }

var _ model.Model = silentModel{}

func TestSessionScopeAbortUncommitted(t *testing.T) {
	h, err := NewHub("")
	if err != nil {
		t.Fatal(err)
	}
	pc, err := h.api.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		t.Fatal(err)
	}
	m := silentModel{}
	sess := &session{id: identity.SessionID("s1")}
	scope := newSessionScope(h, pc, m, sess)

	scope.abortIfUncommitted()
	if scope.committed {
		t.Fatal("scope should not be committed")
	}
	if h.Count() != 0 {
		t.Fatalf("hub count = %d, want 0 (uncommitted close must not register)", h.Count())
	}

	scope.abortIfUncommitted() // idempotent
}

func TestSessionScopeCommitThenClose(t *testing.T) {
	h, err := NewHub("")
	if err != nil {
		t.Fatal(err)
	}
	pc, err := h.api.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		t.Fatal(err)
	}
	m := silentModel{}
	sess := &session{
		id:  identity.SessionID("s2"),
		rec: transcript.NewRecorder(0, nil, 8, transcript.SessionMeta{SessionID: "s2"}, nil),
	}
	scope := newSessionScope(h, pc, m, sess)

	scope.commit()
	if h.Count() != 1 {
		t.Fatalf("hub count = %d, want 1", h.Count())
	}

	scope.Close()
	if h.Count() != 0 {
		t.Fatalf("hub count after close = %d, want 0", h.Count())
	}
	scope.Close() // idempotent
}
