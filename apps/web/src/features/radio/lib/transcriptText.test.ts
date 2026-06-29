import { describe, expect, it } from 'vitest';
import { sanitizeTranscriptText } from './transcriptText';

describe('sanitizeTranscriptText', () => {
  it('strips leading [casual remark] from user lines', () => {
    expect(
      sanitizeTranscriptText(
        '[casual remark] This is so much better than the last session, very soothing so far.',
        'user',
      ),
    ).toBe('This is so much better than the last session, very soothing so far.');
  });

  it('strips multiple stacked bracket tags', () => {
    expect(sanitizeTranscriptText('[casual remark] [follow-up] Hello', 'user')).toBe('Hello');
  });

  it('leaves model lines unchanged', () => {
    const line = '[casual remark] Glad you are feeling it.';
    expect(sanitizeTranscriptText(line, 'model')).toBe(line);
  });

  it('returns empty when only a tag remains', () => {
    expect(sanitizeTranscriptText('[casual remark]', 'user')).toBe('');
  });
});
