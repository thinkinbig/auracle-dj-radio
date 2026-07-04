import { useMemo, useState, type KeyboardEvent } from 'react';
import type { SessionIntent } from '@auracle/shared';
import { cn } from '@/shared/lib/cn';
import styles from './IntentOnboarding.module.css';

interface IntentOnboardingProps {
  onStart: (intent: SessionIntent) => void;
  disabled?: boolean;
  tasteSummary?: string;
  momentSummary?: string;
}

type IntentPreset = {
  id: string;
  label: string;
  mood: string;
  scene: string;
  icon: 'car' | 'target' | 'rain' | 'spark' | 'waves' | 'cozy' | 'moon' | 'focus';
  tone?: string;
  keywords: string[];
};

type QuickPrompt = {
  id: string;
  label: string;
  icon: IntentPreset['icon'];
  vibeId: string;
};

const DEFAULT_VIBE_COUNT = 5;

const VIBE_LIBRARY: IntentPreset[] = [
  {
    id: 'calm',
    label: 'Calm',
    mood: 'calm',
    scene: 'chill',
    icon: 'waves',
    tone: 'Soft and relaxed',
    keywords: ['calm', 'relax', 'relaxed', 'soft', 'quiet', 'peace', 'peaceful', 'slow', 'easy', 'breathe', 'chill'],
  },
  {
    id: 'cozy',
    label: 'Cozy',
    mood: 'warm',
    scene: 'chill',
    icon: 'cozy',
    tone: 'Warm and close',
    keywords: ['cozy', 'warm', 'home', 'comfort', 'coffee', 'blanket', 'soft', 'gentle', 'safe'],
  },
  {
    id: 'nostalgic',
    label: 'Nostalgic',
    mood: 'mellow',
    scene: 'chill',
    icon: 'moon',
    tone: 'Familiar glow',
    keywords: ['nostalgic', 'memory', 'memories', 'old', 'past', 'sad', 'blue', 'miss', 'late', 'night', 'dream'],
  },
  {
    id: 'deep-focus',
    label: 'Deep Focus',
    mood: 'focused',
    scene: 'study',
    icon: 'focus',
    tone: 'Clear and steady',
    keywords: ['focus', 'focused', 'study', 'studying', 'work', 'working', 'code', 'coding', 'write', 'writing', 'read', 'reading', 'deadline', 'exam', 'concentrate'],
  },
  {
    id: 'rainy',
    label: 'Rainy',
    mood: 'mellow',
    scene: 'chill',
    icon: 'rain',
    tone: 'Mellow atmosphere',
    keywords: ['rain', 'rainy', 'storm', 'cloud', 'cloudy', 'gray', 'grey', 'window', 'weather', 'drizzle'],
  },
  {
    id: 'drive-home',
    label: 'Drive Home',
    mood: 'mellow',
    scene: 'commute',
    icon: 'car',
    tone: 'Smooth commute',
    keywords: ['drive', 'driving', 'car', 'commute', 'traffic', 'road', 'home', 'train', 'bus', 'walk'],
  },
  {
    id: 'energize',
    label: 'Energize',
    mood: 'energetic',
    scene: 'gym',
    icon: 'spark',
    tone: 'Bright momentum',
    keywords: ['energy', 'energetic', 'gym', 'workout', 'run', 'running', 'move', 'moving', 'upbeat', 'boost', 'power'],
  },
  {
    id: 'euphoric',
    label: 'Euphoric',
    mood: 'euphoric',
    scene: 'party',
    icon: 'spark',
    tone: 'Lifted and bright',
    keywords: ['happy', 'hype', 'party', 'dance', 'dancing', 'celebrate', 'excited', 'euphoric', 'fun', 'surprise'],
  },
];

const QUICK_PROMPTS: QuickPrompt[] = [
  { id: 'drive-home', label: "I'm driving home", icon: 'car', vibeId: 'drive-home' },
  { id: 'focus', label: 'Need to focus', icon: 'target', vibeId: 'deep-focus' },
  { id: 'rainy-day', label: 'Rainy day', icon: 'rain', vibeId: 'rainy' },
  { id: 'surprise', label: 'Surprise me', icon: 'spark', vibeId: 'euphoric' },
];

export function IntentOnboarding({
  onStart,
  disabled,
  tasteSummary = 'your Taste DNA',
  momentSummary = 'this moment',
}: IntentOnboardingProps) {
  const [prompt, setPrompt] = useState('');
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [selectedVibeId, setSelectedVibeId] = useState(VIBE_LIBRARY[0]!.id);

  const trimmedPrompt = prompt.trim();
  const suggestedVibes = useMemo(() => rankSuggestedVibes(trimmedPrompt), [trimmedPrompt]);
  const selectedVibe =
    VIBE_LIBRARY.find((vibe) => vibe.id === selectedVibeId) ?? suggestedVibes[0] ?? VIBE_LIBRARY[0]!;
  const canCreate = Boolean(trimmedPrompt || selectedVibe) && !disabled;
  const ctaLabel = disabled ? 'Creating Session' : 'Create Session';

  const selectQuickPrompt = (preset: QuickPrompt) => {
    setPrompt(preset.label);
    setSelectedPromptId(preset.id);
    setSelectedVibeId(preset.vibeId);
  };

  const handlePromptChange = (value: string) => {
    const nextVibes = rankSuggestedVibes(value.trim());
    setPrompt(value);
    setSelectedPromptId(null);
    setSelectedVibeId(nextVibes[0]?.id ?? VIBE_LIBRARY[0]!.id);
  };

  const handlePrimary = () => {
    if (!canCreate) return;

    onStart({
      mood: selectedVibe.mood,
      scene: selectedVibe.scene,
      duration_min: 25,
    });
  };

  const handlePromptKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey)) return;
    event.preventDefault();
    handlePrimary();
  };

  return (
    <div className={styles.root}>
      <section className={styles.promptPanel} aria-label="Tell Auracle what is on your mind">
        <textarea
          className={styles.promptInput}
          placeholder="Tell Auracle what's on your mind..."
          value={prompt}
          onChange={(event) => handlePromptChange(event.target.value)}
          onKeyDown={handlePromptKeyDown}
          disabled={disabled}
          aria-label="Tell Auracle what's on your mind"
        />
      </section>

      <div className={styles.quickPromptRow} aria-label="Quick prompts">
        {QUICK_PROMPTS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={cn(styles.quickPrompt, selectedPromptId === preset.id && styles.quickPromptActive)}
            onClick={() => selectQuickPrompt(preset)}
            disabled={disabled}
            aria-pressed={selectedPromptId === preset.id}
          >
            <span className={styles.lineIcon} data-icon={preset.icon} aria-hidden />
            <span>{preset.label}</span>
          </button>
        ))}
      </div>

      <section className={styles.vibePanel} aria-labelledby="suggested-vibes-title">
        <div className={styles.panelHeader}>
          <p id="suggested-vibes-title" className={styles.panelEyebrow}>Suggested vibes</p>
          {trimmedPrompt ? <p className={styles.matchNote}>Matched to {selectedVibe.label}</p> : null}
        </div>

        <div className={styles.vibeGrid}>
          {suggestedVibes.map((vibe) => {
            const active = selectedVibeId === vibe.id;
            return (
              <button
                key={vibe.id}
                type="button"
                className={cn(styles.vibeCard, active && styles.vibeCardActive)}
                onClick={() => setSelectedVibeId(vibe.id)}
                disabled={disabled}
                aria-pressed={active}
              >
                <span className={styles.vibeIcon} data-icon={vibe.icon} aria-hidden />
                <span className={styles.vibeText}>
                  <strong>{vibe.label}</strong>
                  <small>{vibe.tone}</small>
                </span>
              </button>
            );
          })}
        </div>

        <p className={styles.contextHint}>
          <span className={styles.hintSpark} aria-hidden />
          Auracle will blend {tasteSummary}, your intent, and {momentSummary} to create your station.
        </p>
      </section>

      <footer className={styles.actionRow}>
        <button type="button" className={styles.primaryButton} disabled={!canCreate} onClick={handlePrimary}>
          {ctaLabel}
          <span aria-hidden>{'->'}</span>
        </button>
      </footer>
    </div>
  );
}

function rankSuggestedVibes(prompt: string): IntentPreset[] {
  const normalized = normalizePrompt(prompt);
  if (!normalized) return VIBE_LIBRARY.slice(0, DEFAULT_VIBE_COUNT);

  return VIBE_LIBRARY
    .map((vibe, index) => ({ vibe, index, score: scoreVibe(vibe, normalized) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, DEFAULT_VIBE_COUNT)
    .map(({ vibe }) => vibe);
}

function normalizePrompt(prompt: string): string {
  return prompt.toLowerCase().replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim();
}

function scoreVibe(vibe: IntentPreset, prompt: string): number {
  const searchable = [vibe.label, vibe.mood, vibe.scene, vibe.tone ?? '', ...vibe.keywords].join(' ').toLowerCase();
  let score = 0;

  for (const word of prompt.split(' ')) {
    if (!word) continue;
    if (vibe.keywords.includes(word)) score += 4;
    else if (searchable.includes(word)) score += 2;
  }

  for (const keyword of vibe.keywords) {
    if (keyword.length > 3 && prompt.includes(keyword)) score += 3;
  }

  return score;
}
