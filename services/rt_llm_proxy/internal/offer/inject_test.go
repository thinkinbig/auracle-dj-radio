package offer

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/thinkinbig/rt-llm-proxy/internal/identity"
)

type fakeInjector struct {
	id     identity.SessionID
	text   string
	events []json.RawMessage
	hit    bool
}

func (f *fakeInjector) Inject(id identity.SessionID, text string, events []json.RawMessage) bool {
	f.id = id
	f.text = text
	f.events = events
	return f.hit
}

func injectServer(inj SessionInjector) *httptest.Server {
	mux := http.NewServeMux()
	mux.Handle("POST /session/{id}/inject", &InjectHandler{Injector: inj})
	return httptest.NewServer(mux)
}

func TestInjectHandlerForwardsToLiveSession(t *testing.T) {
	inj := &fakeInjector{hit: true}
	srv := injectServer(inj)
	defer srv.Close()

	body := `{"inject_text":"set shifted","ui_events":[{"type":"tracklist_updated"}]}`
	res, err := http.Post(srv.URL+"/session/sess-9/inject", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", res.StatusCode)
	}
	if inj.id != "sess-9" || inj.text != "set shifted" {
		t.Fatalf("forwarded id=%q text=%q", inj.id, inj.text)
	}
	if len(inj.events) != 1 || string(inj.events[0]) != `{"type":"tracklist_updated"}` {
		t.Fatalf("forwarded events = %v", inj.events)
	}
}

func TestInjectHandlerReturns404OnMiss(t *testing.T) {
	srv := injectServer(&fakeInjector{hit: false})
	defer srv.Close()

	res, err := http.Post(srv.URL+"/session/gone/inject", "application/json", strings.NewReader(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", res.StatusCode)
	}
}

func TestInjectHandlerRejectsBadJSON(t *testing.T) {
	srv := injectServer(&fakeInjector{hit: true})
	defer srv.Close()

	res, err := http.Post(srv.URL+"/session/s/inject", "application/json", strings.NewReader("not json"))
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", res.StatusCode)
	}
}
