package gemini

import (
	"context"
	"testing"

	"github.com/thinkinbig/rt-llm-proxy/internal/model"
)

// drainPhases reads everything buffered on phaseCh without blocking.
func drainPhases(g *Gemini) []string {
	var out []string
	for {
		select {
		case p := <-g.phaseCh:
			out = append(out, p.Phase)
		default:
			return out
		}
	}
}

func TestPhaseStateMachine(t *testing.T) {
	g := &Gemini{ctx: context.Background(), phaseCh: make(chan model.TurnPhase, 8)}

	// A full turn: first audio starts it, more audio does not re-fire start,
	// turn completion ends it.
	g.markDJTurnStart()
	g.markDJTurnStart()
	g.markDJTurnEnd()
	if got := drainPhases(g); !equal(got, []string{"dj_turn_start", "dj_turn_end"}) {
		t.Fatalf("turn: got %v", got)
	}

	// A barge-in turn: start, then the user speaks over the DJ.
	g.markDJTurnStart()
	g.markBargeIn()
	if got := drainPhases(g); !equal(got, []string{"dj_turn_start", "user_barge_in"}) {
		t.Fatalf("barge-in: got %v", got)
	}

	// No phantom ends/barge-ins when the DJ is not speaking.
	g.markDJTurnEnd()
	g.markBargeIn()
	if got := drainPhases(g); len(got) != 0 {
		t.Fatalf("phantom phases emitted: %v", got)
	}
}

func equal(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
