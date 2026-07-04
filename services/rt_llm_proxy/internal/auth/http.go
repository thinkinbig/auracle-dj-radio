package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/thinkinbig/rt-llm-proxy/internal/identity"
)

// HTTPVerifier validates opaque bearer tokens against an auth HTTP API.
// Auracle wires this to profile-service GET /auth/me.
type HTTPVerifier struct {
	baseURL string
	client  *http.Client
	budget  time.Duration
}

// NewHTTPVerifier builds a verifier that calls GET {baseURL}/auth/me with the
// bearer token. budget caps lookup latency on the offer path (default 300ms).
func NewHTTPVerifier(baseURL string, budget time.Duration) *HTTPVerifier {
	if budget <= 0 {
		budget = 300 * time.Millisecond
	}
	return &HTTPVerifier{
		baseURL: strings.TrimRight(baseURL, "/"),
		client:  &http.Client{Timeout: budget},
		budget:  budget,
	}
}

type authMeResponse struct {
	User struct {
		ID string `json:"id"`
	} `json:"user"`
}

func (v *HTTPVerifier) Verify(token string) (identity.UserID, error) {
	if token == "" {
		return "", errors.New("empty token")
	}
	ctx, cancel := context.WithTimeout(context.Background(), v.budget)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, v.baseURL+"/auth/me", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := v.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return "", errors.New("invalid token")
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("auth status %d", resp.StatusCode)
	}

	var body authMeResponse
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return "", err
	}
	if body.User.ID == "" {
		return "", errors.New("auth response missing user id")
	}
	return identity.UserID(body.User.ID), nil
}
