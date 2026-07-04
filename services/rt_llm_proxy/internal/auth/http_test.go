package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHTTPVerifier(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/auth/me" {
			http.NotFound(w, r)
			return
		}
		switch r.Header.Get("Authorization") {
		case "Bearer good":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"user":{"id":"user-42","email":"a@b.c","name":"A"}}`))
		case "Bearer bad":
			http.Error(w, "not authenticated", http.StatusUnauthorized)
		default:
			http.Error(w, "missing", http.StatusUnauthorized)
		}
	}))
	defer srv.Close()

	v := NewHTTPVerifier(srv.URL, 0)

	uid, err := v.Verify("good")
	if err != nil || uid != "user-42" {
		t.Fatalf("good token: uid=%q err=%v", uid, err)
	}

	if _, err := v.Verify("bad"); err == nil {
		t.Fatal("bad token should error")
	}

	if _, err := v.Verify(""); err == nil {
		t.Fatal("empty token should error")
	}
}

func TestUserIDWithHTTPVerifier(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") == "Bearer alice-token" {
			_, _ = w.Write([]byte(`{"user":{"id":"alice"}}`))
			return
		}
		http.Error(w, "nope", http.StatusUnauthorized)
	}))
	defer srv.Close()

	authn := New(NewHTTPVerifier(srv.URL, 0))
	if got := authn.UserID(req("Bearer alice-token")); got != "alice" {
		t.Fatalf("UserID = %q, want alice", got)
	}
	if got := authn.UserID(req("Bearer expired")); got != "" {
		t.Fatalf("invalid token should be anonymous, got %q", got)
	}
}
