package offer

import (
	"net/http"
	"strings"
)

// InternalAuth gates orchestrator-only endpoints (register, inject). An empty
// secret disables the check (local dev); production must set one.
type InternalAuth struct {
	Secret string
}

func (a InternalAuth) allow(r *http.Request) bool {
	if a.Secret == "" {
		return true
	}
	tok := bearerToken(r)
	return tok != "" && tok == a.Secret
}

func (a InternalAuth) reject(w http.ResponseWriter) {
	http.Error(w, "unauthorized", http.StatusUnauthorized)
}

func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	const p = "Bearer "
	if len(h) > len(p) && strings.EqualFold(h[:len(p)], p) {
		return strings.TrimSpace(h[len(p):])
	}
	return ""
}
