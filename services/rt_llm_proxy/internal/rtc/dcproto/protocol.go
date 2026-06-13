// Package dcproto owns the browser-facing data-channel wire contract: the only
// place that encodes and decodes the messages exchanged over the WebRTC data
// channel. The format is asymmetric by design, to match the existing client:
//
//   - transcript line (outbound): bare {"seq","role","text"}, NO type tag — the
//     browser keys it by the presence of role+text.
//   - tool call (outbound):       {"type":"tool_call","id","name","args"}.
//   - ui event (outbound):        {"type":"ui_event","event":{...}} — business
//     side-effects (e.g. skip/tracklist_updated) the orchestrator emitted when a
//     tool ran server-side; the browser keys on the inner event's own "type".
//   - tool result (inbound):      {"type":"tool_result","id","name","response"}.
//   - user text (inbound):        anything else — plain text or any other JSON.
//
// Decode only classifies; it does not gate on capability. The Bridge decides
// whether a tool_result is actually routable (the model must be a ToolDispatcher).
package dcproto

import (
	"encoding/json"

	"github.com/thinkinbig/rt-llm-proxy/internal/model"
	"github.com/thinkinbig/rt-llm-proxy/internal/transcript"
)

const (
	typeToolCall   = "tool_call"
	typeToolResult = "tool_result"
	typeUIEvent    = "ui_event"
)

// Encode renders a transcript line as the data-channel string the browser
// expects: a bare {seq,role,text} object with no type discriminator.
func Encode(line transcript.Line) string {
	b, _ := json.Marshal(line)
	return string(b)
}

type toolCallEnvelope struct {
	Type string          `json:"type"`
	ID   string          `json:"id"`
	Name string          `json:"name"`
	Args json.RawMessage `json:"args"`
}

// EncodeToolCall renders a model tool call as a tagged tool_call message.
func EncodeToolCall(c model.ToolCall) string {
	b, _ := json.Marshal(toolCallEnvelope{Type: typeToolCall, ID: c.ID, Name: c.Name, Args: c.Args})
	return string(b)
}

type uiEventEnvelope struct {
	Type  string          `json:"type"`
	Event json.RawMessage `json:"event"`
}

// EncodeUIEvent wraps an orchestrator-produced ui event as a tagged ui_event
// message. The event payload is forwarded verbatim (it carries its own inner
// "type"), so the browser handles new event kinds without a proxy change.
func EncodeUIEvent(event json.RawMessage) string {
	b, _ := json.Marshal(uiEventEnvelope{Type: typeUIEvent, Event: event})
	return string(b)
}

// Decode classifies an inbound data-channel string. A tool_result envelope
// yields the ToolResult and ok=true; anything else yields ok=false, and the
// caller treats the raw bytes as user text input.
func Decode(data []byte) (model.ToolResult, bool) {
	var env struct {
		Type     string          `json:"type"`
		ID       string          `json:"id"`
		Name     string          `json:"name"`
		Response json.RawMessage `json:"response"`
	}
	if err := json.Unmarshal(data, &env); err != nil || env.Type != typeToolResult {
		return model.ToolResult{}, false
	}
	return model.ToolResult{ID: env.ID, Name: env.Name, Response: env.Response}, true
}
