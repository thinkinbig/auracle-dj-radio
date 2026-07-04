package offer

import (
	"context"
	"fmt"

	"github.com/thinkinbig/rt-llm-proxy/internal/model"
)

// ModelFactory constructs a provider Model for an offer request. history carries
// the reconnect-restored conversation; gemini consumes it via ContextRestorer.
type ModelFactory interface {
	New(ctx context.Context, provider string, history []model.RestoredTurn, params model.SessionParams) (model.Model, error)
}

// ParseProvider normalizes ?model= query values. Only gemini is supported.
func ParseProvider(raw string) (string, error) {
	switch raw {
	case "gemini", "":
		return "gemini", nil
	default:
		return "", fmt.Errorf("unknown model %q", raw)
	}
}
