package offer

import (
	"encoding/json"
	"net/http"

	"github.com/thinkinbig/rt-llm-proxy/internal/model"
)

// registerRequest is the JSON body of POST /session/{id}/register. tools mirror
// the Gemini functionDeclarations shape the orchestrator pre-baked.
type registerRequest struct {
	Token             string `json:"token"`
	SystemInstruction string `json:"systemInstruction"`
	Tools             []struct {
		Name        string          `json:"name"`
		Description string          `json:"description"`
		Parameters  json.RawMessage `json:"parameters"`
	} `json:"tools"`
	OpeningCue string `json:"openingCue"`
}

// RegisterHandler stores the orchestrator's pre-baked session contract at
// POST /session/{id}/register so the matching SDP offer can consume it.
type RegisterHandler struct {
	Registry *Registry
	Auth     InternalAuth
}

func (h *RegisterHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !h.Auth.allow(r) {
		h.Auth.reject(w)
		return
	}
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "missing session id", http.StatusBadRequest)
		return
	}
	var req registerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	tools := make([]model.ToolSpec, 0, len(req.Tools))
	for _, t := range req.Tools {
		tools = append(tools, model.ToolSpec{Name: t.Name, Description: t.Description, Parameters: t.Parameters})
	}
	h.Registry.Register(id, Registration{
		Token:             req.Token,
		SystemInstruction: req.SystemInstruction,
		Tools:             tools,
		OpeningCue:        req.OpeningCue,
	})
	w.WriteHeader(http.StatusNoContent)
}
