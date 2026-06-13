package offer

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/thinkinbig/rt-llm-proxy/internal/identity"
	"github.com/thinkinbig/rt-llm-proxy/internal/model"
	"github.com/thinkinbig/rt-llm-proxy/internal/rtc"
)

// HTTPToolBackend forwards model tool calls to the memory-service orchestrator
// over HTTP (POST /sessions/{id}/tool) and returns the {gemini_result,
// ui_events} envelope as an rtc.ToolOutcome. It implements rtc.ToolBackend.
type HTTPToolBackend struct {
	baseURL string
	client  *http.Client
}

// NewHTTPToolBackend builds a backend posting to baseURL (the memory-service
// base, e.g. http://localhost:3020). A trailing slash is tolerated.
func NewHTTPToolBackend(baseURL string) *HTTPToolBackend {
	return &HTTPToolBackend{
		baseURL: strings.TrimRight(baseURL, "/"),
		client:  &http.Client{Timeout: 30 * time.Second},
	}
}

type toolCallRequest struct {
	Name string          `json:"name"`
	Args json.RawMessage `json:"args,omitempty"`
}

type toolEnvelope struct {
	GeminiResult json.RawMessage   `json:"gemini_result"`
	UIEvents     []json.RawMessage `json:"ui_events"`
}

func (b *HTTPToolBackend) RunTool(ctx context.Context, sessionID identity.SessionID, call model.ToolCall) (rtc.ToolOutcome, error) {
	body, err := json.Marshal(toolCallRequest{Name: call.Name, Args: call.Args})
	if err != nil {
		return rtc.ToolOutcome{}, err
	}
	url := fmt.Sprintf("%s/sessions/%s/tool", b.baseURL, sessionID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return rtc.ToolOutcome{}, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := b.client.Do(req)
	if err != nil {
		return rtc.ToolOutcome{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return rtc.ToolOutcome{}, fmt.Errorf("tool backend status %d", resp.StatusCode)
	}

	var env toolEnvelope
	if err := json.NewDecoder(resp.Body).Decode(&env); err != nil {
		return rtc.ToolOutcome{}, err
	}
	return rtc.ToolOutcome{GeminiResult: env.GeminiResult, UIEvents: env.UIEvents}, nil
}
