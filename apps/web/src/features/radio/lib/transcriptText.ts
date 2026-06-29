/** Strip Gemini-internal intent labels that leak into user input transcription. */
export function sanitizeTranscriptText(text: string, role: 'user' | 'model'): string {
  let cleaned = text.trim();
  if (role !== 'user') return cleaned;
  while (/^\[[^\]]+\]\s*/.test(cleaned)) {
    cleaned = cleaned.replace(/^\[[^\]]+\]\s*/, '').trim();
  }
  return cleaned;
}
