package offer

import (
	"encoding/json"
	"net/http"

	"github.com/thinkinbig/rt-llm-proxy/internal/identity"
)

// SessionInjector pushes an async business update (Lane 3) into a live session.
// *rtc.Hub satisfies it.
type SessionInjector interface {
	Inject(id identity.SessionID, injectText string, uiEvents []json.RawMessage) bool
}

// injectRequest is the JSON body of POST /session/{id}/inject. Both fields are
// optional; inject_text nudges the model, ui_events are pushed to the browser.
type injectRequest struct {
	InjectText string            `json:"inject_text"`
	UIEvents   []json.RawMessage `json:"ui_events"`
}

// InjectHandler is the Lane-3 endpoint the orchestrator calls when async work
// (e.g. a replan) lands after the originating tool call already returned.
type InjectHandler struct {
	Injector SessionInjector
	Auth     InternalAuth
}

func (h *InjectHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !h.Auth.allow(r) {
		h.Auth.reject(w)
		return
	}
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "missing session id", http.StatusBadRequest)
		return
	}
	var req injectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	// A miss means the session ended before the async work landed — expected, not
	// an error the caller can act on, so report it as 404 and move on.
	if !h.Injector.Inject(identity.SessionID(id), req.InjectText, req.UIEvents) {
		http.Error(w, "no live session", http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
