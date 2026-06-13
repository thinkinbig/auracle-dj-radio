package offer

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/thinkinbig/rt-llm-proxy/internal/model"
	"github.com/thinkinbig/rt-llm-proxy/internal/modelcb"
	"github.com/thinkinbig/rt-llm-proxy/internal/ratelimit"
)

func TestRegistryLookupHitMissExpiry(t *testing.T) {
	r := NewRegistry(time.Hour)
	r.Register("s1", Registration{SystemInstruction: "be a dj", OpeningCue: "hi"})

	got, ok := r.Lookup("s1")
	if !ok || got.SystemInstruction != "be a dj" || got.OpeningCue != "hi" {
		t.Fatalf("hit = %+v ok=%v", got, ok)
	}
	if _, ok := r.Lookup("nope"); ok {
		t.Fatal("miss should not be found")
	}

	exp := NewRegistry(-time.Second) // entries are born already expired
	exp.Register("s2", Registration{})
	if _, ok := exp.Lookup("s2"); ok {
		t.Fatal("expired entry should not be found")
	}
}

func TestRegisterHandlerStoresContract(t *testing.T) {
	reg := NewRegistry(time.Hour)
	mux := http.NewServeMux()
	mux.Handle("POST /session/{id}/register", &RegisterHandler{Registry: reg})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	body := `{"token":"tok","systemInstruction":"be a dj","openingCue":"open the set",
		"tools":[{"name":"skip_track","description":"skip","parameters":{"type":"OBJECT","properties":{}}}]}`
	res, err := http.Post(srv.URL+"/session/abc/register", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("status = %d", res.StatusCode)
	}

	got, ok := reg.Lookup("abc")
	if !ok {
		t.Fatal("registration not stored")
	}
	if got.Token != "tok" || got.SystemInstruction != "be a dj" || got.OpeningCue != "open the set" {
		t.Fatalf("stored = %+v", got)
	}
	if len(got.Tools) != 1 || got.Tools[0].Name != "skip_track" {
		t.Fatalf("tools = %+v", got.Tools)
	}
}

func TestRegisterHandlerRejectsBadJSON(t *testing.T) {
	mux := http.NewServeMux()
	mux.Handle("POST /session/{id}/register", &RegisterHandler{Registry: NewRegistry(time.Hour)})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	res, err := http.Post(srv.URL+"/session/abc/register", "application/json", strings.NewReader("not json"))
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", res.StatusCode)
	}
}

func TestIntakeAdoptsRegisteredSession(t *testing.T) {
	reg := NewRegistry(time.Hour)
	reg.Register("sess-42", Registration{
		SystemInstruction: "you are Auracle",
		OpeningCue:        "ease in",
		Tools:             []model.ToolSpec{{Name: "skip_track"}},
	})
	factory := &fakeFactory{m: &fakeModel{}}
	in := Intake{
		Limiter:  ratelimit.New("", 0, time.Minute),
		Guard:    modelcb.New(modelcb.Config{}, nil),
		Registry: reg,
		Models:   factory,
		Hub:      &fakeHub{},
	}

	res := in.ServeOffer(IntakeRequest{
		Ctx:             nil,
		ClientIP:        "1.2.3.4",
		Model:           "gemini",
		OfferSDP:        []byte("sdp"),
		SessionIDHeader: "sess-42", // orchestrator-minted id, no X-Last-Seq (not a reconnect)
	})
	if res.Status != 200 {
		t.Fatalf("status = %d body=%q", res.Status, res.Body)
	}
	if res.Headers["X-Session-ID"] != "sess-42" {
		t.Fatalf("adopted id = %q, want sess-42", res.Headers["X-Session-ID"])
	}
	p := factory.lastParams
	if p.SystemInstruction != "you are Auracle" || p.OpeningCue != "ease in" {
		t.Fatalf("params = %+v", p)
	}
	if len(p.Tools) != 1 || p.Tools[0].Name != "skip_track" {
		t.Fatalf("params tools = %+v", p.Tools)
	}
}

func TestGeminiToolsConversion(t *testing.T) {
	specs := []model.ToolSpec{{Name: "skip_track", Parameters: []byte(`{"type":"OBJECT","properties":{}}`)}}
	out := geminiTools(specs)
	if len(out) != 1 || out[0].Name != "skip_track" {
		t.Fatalf("converted = %+v", out)
	}
	if out[0].Parameters["type"] != "OBJECT" {
		t.Fatalf("parameters = %+v", out[0].Parameters)
	}
	// A non-object Parameters payload is tolerated (declared without parameters).
	bad := []model.ToolSpec{{Name: "noargs", Parameters: []byte(`"not an object"`)}}
	if got := geminiTools(bad); len(got) != 1 || got[0].Parameters != nil {
		t.Fatalf("bad-params conversion = %+v", got)
	}
}
