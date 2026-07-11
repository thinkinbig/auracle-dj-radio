package main

import (
	"flag"
	"time"

	"github.com/thinkinbig/rt-llm-proxy/internal/model/gemini"
	"github.com/thinkinbig/rt-llm-proxy/internal/modelcb"
)

type runConfig struct {
	Addr      string
	AdminAddr string
	// PublicIP rewrites host ICE candidates when the proxy is behind Docker or
	// a 1:1 NAT. UDPPortMin/Max constrain media sockets to a publishable range.
	PublicIP   string
	UDPPortMin uint
	UDPPortMax uint

	RedisAddr string
	RLMax     int
	RLWindow  time.Duration
	TrustProxy bool

	SidechannelMode string
	KafkaBrokers    string
	KafkaTopic      string

	ReplayURL     string
	ReplayTimeout time.Duration
	ReplayLimit   int

	// HarnessURL is the agent-harness base URL for server-side (Lane 1) tool
	// forwarding. Empty keeps model tool calls on the browser-side path.
	HarnessURL string

	// RegisterSecret gates POST /session/{id}/{register,inject}. Empty = dev
	// (no check); production must set PROXY_REGISTER_SECRET or -register-secret.
	RegisterSecret string

	// AuthURL is profile-service (or any auth API exposing GET /auth/me). Empty
	// falls back to DevVerifier for local demos.
	AuthURL string

	ModelCBEnable bool
	ModelCB       modelCBConfigArgs

	OpusComplexity int
	AdaptiveMode   string

	// Provider behavior (config-file only; no CLI flags). Empty fields leave the
	// provider's own defaults in place.
	GeminiSystemPrompt string
	GeminiTools        []gemini.FunctionDeclaration
}

// parseFlags defines and parses CLI flags. It returns the assembled runConfig,
// the set of flag names explicitly provided on the command line (so the config
// file knows which fields it must not override), and the config file path.
func parseFlags() (runConfig, map[string]bool, string) {
	configPath := flag.String("config", "proxy.yaml", "config file path (skipped if absent)")
	addr := flag.String("addr", ":8080", "listen address")
	publicIP := flag.String("public-ip", "", "public IP to advertise in host ICE candidates (empty = interface address)")
	udpPortMin := flag.Uint("udp-port-min", 0, "minimum UDP media port (0 with udp-port-max means unconstrained)")
	udpPortMax := flag.Uint("udp-port-max", 0, "maximum UDP media port (0 with udp-port-min means unconstrained)")
	redisAddr := flag.String("redis", "", "redis address for rate limiting (empty = disabled)")
	rlMax := flag.Int("rl-max", 10, "max sessions per client per window")
	rlWindow := flag.Duration("rl-window", time.Minute, "rate limit window")
	trustProxy := flag.Bool("trust-proxy", false, "trust X-Forwarded-For for the rate-limit client IP (enable only behind a reverse proxy that sets it)")
	scMode := flag.String("sidechannel", "off", "transcript side-channel: off|stdout|kafka")
	kafkaBrokers := flag.String("kafka", "", "kafka seed brokers (csv) for -sidechannel=kafka")
	kafkaTopic := flag.String("kafka-topic", "transcripts", "kafka topic for transcript events")
	replayURL := flag.String("replay-url", "", "replay-index service base URL (enables cross-node reconnect replay when set)")
	replayTimeout := flag.Duration("replay-timeout", 300*time.Millisecond, "replay timeout budget when -replay-url is set")
	replayLimit := flag.Int("replay-limit", 100, "max replay transcript lines on reconnect")
	harnessURL := flag.String("harness-url", "", "agent-harness base URL for server-side (Lane 1) tool forwarding (empty = browser-side tools)")
	registerSecret := flag.String("register-secret", "", "shared secret for POST /session/{id}/{register,inject} (empty = dev, no check)")
	authURL := flag.String("auth-url", "", "auth service base URL for Bearer validation via GET /auth/me (empty = DevVerifier)")
	modelCBEnable := flag.Bool("model-cb", true, "enable model connect circuit breaker")
	modelCBOpenAfter := flag.Int("model-cb-open-after", 5, "consecutive failures before opening model circuit")
	modelCBOpenFor := flag.Duration("model-cb-open-for", 30*time.Second, "open-state duration for transient model failures")
	modelCBHalfOpenSuccess := flag.Int("model-cb-half-open-success", 3, "successful half-open probes required to close model circuit")
	modelCBAuthOpenFor := flag.Duration("model-cb-auth-open-for", 5*time.Minute, "open-state duration for auth failures (401/403)")
	modelCBOpenAfterGemini := flag.Int("model-cb-open-after-gemini", 0, "override model-cb-open-after for gemini (0 = default)")
	modelCBOpenForGemini := flag.Duration("model-cb-open-for-gemini", 0, "override model-cb-open-for for gemini (0 = default)")
	modelCBHalfOpenSuccessGemini := flag.Int("model-cb-half-open-success-gemini", 0, "override model-cb-half-open-success for gemini (0 = default)")
	modelCBAuthOpenForGemini := flag.Duration("model-cb-auth-open-for-gemini", 0, "override model-cb-auth-open-for for gemini (0 = default)")
	adminAddr := flag.String("admin", "", "admin listen address for /stats + /debug/pprof (empty = off)")
	opusComplexity := flag.Int("opus-complexity", -1, "Opus encoder complexity 0-10 (-1 = libopus default; lower = less CPU)")
	adaptiveMode := flag.String("adaptive", "off", "adaptive Opus complexity under load: off|sessions|drift")
	flag.Parse()

	cfg := runConfig{
		Addr:            *addr,
		PublicIP:        *publicIP,
		UDPPortMin:      *udpPortMin,
		UDPPortMax:      *udpPortMax,
		AdminAddr:       *adminAddr,
		RedisAddr:       *redisAddr,
		RLMax:           *rlMax,
		RLWindow:        *rlWindow,
		TrustProxy:      *trustProxy,
		SidechannelMode: *scMode,
		KafkaBrokers:    *kafkaBrokers,
		KafkaTopic:      *kafkaTopic,
		ReplayURL:       *replayURL,
		ReplayTimeout:   *replayTimeout,
		ReplayLimit:     *replayLimit,
		HarnessURL:      *harnessURL,
		RegisterSecret:  *registerSecret,
		AuthURL:         *authURL,
		ModelCBEnable:   *modelCBEnable,
		ModelCB: modelCBConfigArgs{
			OpenAfter:       *modelCBOpenAfter,
			OpenFor:         *modelCBOpenFor,
			HalfOpenSuccess: *modelCBHalfOpenSuccess,
			AuthOpenFor:     *modelCBAuthOpenFor,
			Gemini: modelcb.Config{
				OpenAfter:       *modelCBOpenAfterGemini,
				OpenFor:         *modelCBOpenForGemini,
				HalfOpenSuccess: *modelCBHalfOpenSuccessGemini,
				AuthOpenFor:     *modelCBAuthOpenForGemini,
			},
		},
		OpusComplexity: *opusComplexity,
		AdaptiveMode:   *adaptiveMode,
	}

	set := map[string]bool{}
	flag.Visit(func(f *flag.Flag) { set[f.Name] = true })
	return cfg, set, *configPath
}
