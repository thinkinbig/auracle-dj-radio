package offer

import (
	"sync"
	"time"

	"github.com/thinkinbig/rt-llm-proxy/internal/model"
)

// Registration is the pre-baked session contract the orchestrator (memory-service)
// pushes before the browser connects: the full system instruction, the session's
// tools, and the opening cue. The proxy stores it keyed by session id and feeds it
// into the model setup at offer time — it assembles no prompts itself
// (refactor-three-services: push context, direct media).
type Registration struct {
	Token             string
	SystemInstruction string
	Tools             []model.ToolSpec
	OpeningCue        string
}

// Registry holds session registrations until the matching offer arrives. Entries
// expire after a TTL so abandoned registrations don't accumulate. Safe for
// concurrent use.
type Registry struct {
	ttl time.Duration
	mu  sync.Mutex
	m   map[string]registryEntry
}

type registryEntry struct {
	reg       Registration
	expiresAt time.Time
}

// NewRegistry returns a Registry whose entries live for ttl after Register.
func NewRegistry(ttl time.Duration) *Registry {
	return &Registry{ttl: ttl, m: make(map[string]registryEntry)}
}

// Register stores reg under id, replacing any prior entry and resetting its TTL.
func (r *Registry) Register(id string, reg Registration) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.m[id] = registryEntry{reg: reg, expiresAt: time.Now().Add(r.ttl)}
}

// Lookup returns the registration for id when present and unexpired; expired
// entries are dropped lazily on access.
func (r *Registry) Lookup(id string) (Registration, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	e, ok := r.m[id]
	if !ok {
		return Registration{}, false
	}
	if time.Now().After(e.expiresAt) {
		delete(r.m, id)
		return Registration{}, false
	}
	return e.reg, true
}

// Delete removes a registration after the first successful offer consumes it.
func (r *Registry) Delete(id string) {
	if r == nil {
		return
	}
	r.mu.Lock()
	delete(r.m, id)
	r.mu.Unlock()
}
