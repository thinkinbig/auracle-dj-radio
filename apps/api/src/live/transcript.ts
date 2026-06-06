/** Gemini Live transcription fragment (BidiGenerateContentTranscription). */
export interface TranscriptionChunk {
  text?: string;
  finished?: boolean;
}

type TranscriptRole = "user" | "model";

/**
 * Accumulates Gemini Live transcription deltas into full sentences, mirroring
 * rt_llm_proxy/internal/model/gemini/gemini.go handleTranscription.
 */
export class TranscriptAccumulator {
  private userBuf = "";
  private modelBuf = "";

  /** Apply one transcription fragment; returns the full line so far, if any. */
  ingest(role: TranscriptRole, chunk: TranscriptionChunk | undefined): string | null {
    if (!chunk?.text) return null;

    const buf = role === "model" ? this.modelBuf : this.userBuf;
    const full = buf + chunk.text;
    if (role === "model") {
      this.modelBuf = chunk.finished ? "" : full;
    } else {
      this.userBuf = chunk.finished ? "" : full;
    }
    return full || null;
  }

  /** Clear both buffers at a model turn boundary. */
  resetTurn(): void {
    this.userBuf = "";
    this.modelBuf = "";
  }
}
