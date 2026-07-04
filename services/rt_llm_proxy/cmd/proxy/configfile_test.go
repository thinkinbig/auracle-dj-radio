package main

import (
	"os"
	"path/filepath"
	"testing"
)

func writeTemp(t *testing.T, body string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "proxy.yaml")
	if err := os.WriteFile(p, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestApplyConfigFileProviderFields(t *testing.T) {
	path := writeTemp(t, `
gemini:
  system_prompt: "你是DJ"
`)
	cfg := runConfig{}
	if err := applyConfigFile(path, &cfg, map[string]bool{}); err != nil {
		t.Fatal(err)
	}
	if cfg.GeminiSystemPrompt != "你是DJ" {
		t.Fatalf("gemini system prompt = %q", cfg.GeminiSystemPrompt)
	}
}

func TestApplyConfigFileGeminiTools(t *testing.T) {
	path := writeTemp(t, `
gemini:
  system_prompt: "你是助手"
  tools:
    - name: get_weather
      description: 查询天气
      parameters:
        type: object
        properties:
          city:
            type: string
        required: [city]
`)
	cfg := runConfig{}
	if err := applyConfigFile(path, &cfg, map[string]bool{}); err != nil {
		t.Fatal(err)
	}
	if len(cfg.GeminiTools) != 1 {
		t.Fatalf("tools = %d, want 1", len(cfg.GeminiTools))
	}
	tool := cfg.GeminiTools[0]
	if tool.Name != "get_weather" || tool.Description != "查询天气" {
		t.Fatalf("tool meta wrong: %+v", tool)
	}
	if tool.Parameters["type"] != "object" {
		t.Fatalf("tool parameters not parsed: %+v", tool.Parameters)
	}
}

func TestApplyConfigFileMissingIsOK(t *testing.T) {
	cfg := runConfig{}
	if err := applyConfigFile(filepath.Join(t.TempDir(), "nope.yaml"), &cfg, map[string]bool{}); err != nil {
		t.Fatalf("missing config file must not error: %v", err)
	}
}
