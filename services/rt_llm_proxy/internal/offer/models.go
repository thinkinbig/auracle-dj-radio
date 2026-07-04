package offer

import (
	"context"
	"encoding/json"

	"github.com/thinkinbig/rt-llm-proxy/internal/model"
	"github.com/thinkinbig/rt-llm-proxy/internal/model/gemini"
)

// ProdModelFactory connects the Gemini Live adapter for production wiring.
// Per-deployment behavior (persona, tools) is resolved at startup from flags
// and the config file; credentials come from the environment inside the adapter.
type ProdModelFactory struct {
	Gemini gemini.Config
}

func (f ProdModelFactory) New(ctx context.Context, provider string, _ []model.RestoredTurn, params model.SessionParams) (model.Model, error) {
	_ = provider // only gemini is supported
	cfg := f.Gemini
	if params.SystemInstruction != "" {
		// Pre-baked registration: full override, proxy assembles nothing.
		cfg.SystemPrompt = params.SystemInstruction
	} else {
		cfg.SystemPrompt = joinSystem(cfg.SystemPrompt, params.SystemSuffix)
	}
	if len(params.Tools) > 0 {
		cfg.Tools = geminiTools(params.Tools)
	}
	cfg.OpeningCue = params.OpeningCue
	return gemini.NewWithConfig(ctx, cfg)
}

// geminiTools converts the provider-agnostic session tool specs into Gemini
// functionDeclarations. A spec whose Parameters is not a JSON object is declared
// without parameters rather than failing the session.
func geminiTools(specs []model.ToolSpec) []gemini.FunctionDeclaration {
	out := make([]gemini.FunctionDeclaration, 0, len(specs))
	for _, t := range specs {
		fd := gemini.FunctionDeclaration{Name: t.Name, Description: t.Description}
		if len(t.Parameters) > 0 {
			var params map[string]any
			if err := json.Unmarshal(t.Parameters, &params); err == nil {
				fd.Parameters = params
			}
		}
		out = append(out, fd)
	}
	return out
}

// joinSystem appends a per-session suffix to a base system prompt, separated by a
// blank line. Either side may be empty.
func joinSystem(base, suffix string) string {
	switch {
	case suffix == "":
		return base
	case base == "":
		return suffix
	default:
		return base + "\n\n" + suffix
	}
}
