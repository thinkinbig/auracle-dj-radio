package offer

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/thinkinbig/rt-llm-proxy/internal/model"
)

func TestHTTPToolBackendPostsCallAndParsesEnvelope(t *testing.T) {
	var gotPath string
	var gotBody toolCallRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"gemini_result":{"ok":true},"ui_events":[{"type":"skip"}]}`)
	}))
	defer srv.Close()

	backend := NewHTTPToolBackend(srv.URL + "/") // trailing slash tolerated
	outcome, err := backend.RunTool(context.Background(), "sess-1",
		model.ToolCall{ID: "a", Name: "skip_track", Args: json.RawMessage(`{"reason":"x"}`)})
	if err != nil {
		t.Fatalf("RunTool: %v", err)
	}

	if gotPath != "/sessions/sess-1/tool" {
		t.Fatalf("path = %q, want /sessions/sess-1/tool", gotPath)
	}
	if gotBody.Name != "skip_track" || string(gotBody.Args) != `{"reason":"x"}` {
		t.Fatalf("forwarded body = %+v", gotBody)
	}
	if string(outcome.GeminiResult) != `{"ok":true}` {
		t.Fatalf("gemini_result = %s", outcome.GeminiResult)
	}
	if len(outcome.UIEvents) != 1 || string(outcome.UIEvents[0]) != `{"type":"skip"}` {
		t.Fatalf("ui_events = %v", outcome.UIEvents)
	}
}

func TestHTTPToolBackendErrorsOnNon200(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	backend := NewHTTPToolBackend(srv.URL)
	if _, err := backend.RunTool(context.Background(), "missing", model.ToolCall{Name: "skip_track"}); err == nil {
		t.Fatal("expected an error for a non-200 response")
	}
}
