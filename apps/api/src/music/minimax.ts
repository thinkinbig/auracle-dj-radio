const DEFAULT_BASE = "https://api.minimax.io";

export interface GenerateMusicInput {
  prompt: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  /** Defaults to true (instrumental). */
  isInstrumental?: boolean;
  /** When set on a vocal track, passed to MiniMax. Otherwise lyrics_optimizer is used. */
  lyrics?: string;
}

interface MiniMaxMusicResponse {
  data?: {
    status?: number;
    audio?: string;
  };
  base_resp?: {
    status_code?: number;
    status_msg?: string;
  };
  extra_info?: {
    music_duration?: number;
  };
}

export async function generateMusic(
  input: GenerateMusicInput,
): Promise<{ buffer: Buffer; durationMs?: number }> {
  const isInstrumental = input.isInstrumental !== false;
  const base = input.baseUrl ?? process.env.MINIMAX_API_BASE ?? DEFAULT_BASE;
  const body: Record<string, unknown> = {
    model: input.model,
    prompt: input.prompt,
    is_instrumental: isInstrumental,
    output_format: "hex",
    audio_setting: {
      sample_rate: 44100,
      bitrate: 128000,
      format: "mp3",
    },
  };
  if (!isInstrumental) {
    if (input.lyrics) {
      body.lyrics = input.lyrics;
    } else {
      body.lyrics_optimizer = true;
    }
  }

  const res = await fetch(`${base}/v1/music_generation`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MiniMax HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  const payload = (await res.json()) as MiniMaxMusicResponse;
  const code = payload.base_resp?.status_code ?? -1;
  if (code !== 0) {
    throw new Error(
      `MiniMax error ${code}: ${payload.base_resp?.status_msg ?? "unknown"}`,
    );
  }

  const hex = payload.data?.audio;
  if (!hex) throw new Error("MiniMax returned no audio data");

  return {
    buffer: Buffer.from(hex, "hex"),
    durationMs: payload.extra_info?.music_duration,
  };
}
