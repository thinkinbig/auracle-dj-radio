package main

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"

	"github.com/thinkinbig/rt-llm-proxy/internal/model/gemini"
)

// fileConfig mirrors the YAML config file. It covers provider behavior only;
// infrastructure knobs stay on CLI flags and environment variables.
type fileConfig struct {
	Gemini struct {
		SystemPrompt string `yaml:"system_prompt"`
		Tools        []struct {
			Name        string         `yaml:"name"`
			Description string         `yaml:"description"`
			Parameters  map[string]any `yaml:"parameters"`
		} `yaml:"tools"`
	} `yaml:"gemini"`
}

// applyConfigFile loads the YAML config at path and folds it into cfg. A missing
// file is not an error — the config file is optional.
func applyConfigFile(path string, cfg *runConfig, _ map[string]bool) error {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("read %s: %w", path, err)
	}
	var fc fileConfig
	if err := yaml.Unmarshal(data, &fc); err != nil {
		return fmt.Errorf("parse %s: %w", path, err)
	}

	cfg.GeminiSystemPrompt = fc.Gemini.SystemPrompt
	cfg.GeminiTools = nil
	for _, td := range fc.Gemini.Tools {
		cfg.GeminiTools = append(cfg.GeminiTools, gemini.FunctionDeclaration{
			Name:        td.Name,
			Description: td.Description,
			Parameters:  td.Parameters,
		})
	}
	return nil
}
