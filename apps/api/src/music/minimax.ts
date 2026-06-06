const DEFAULT_BASE = "https://api.minimax.io";

export interface GenerateInstrumentalInput {
  prompt: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
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

export async function generateInstrumental(
  input: GenerateInstrumentalInput,
): Promise<{ buffer: Buffer; durationMs?: number }> {
  const base = input.baseUrl ?? process.env.MINIMAX_API_BASE ?? DEFAULT_BASE;
  const res = await fetch(`${base}/v1/music_generation`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      prompt: input.prompt,
      is_instrumental: true,
      output_format: "hex",
      audio_setting: {
        sample_rate: 44100,
        bitrate: 128000,
        format: "mp3",
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MiniMax HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  const body = (await res.json()) as MiniMaxMusicResponse;
  const code = body.base_resp?.status_code ?? -1;
  if (code !== 0) {
    throw new Error(
      `MiniMax error ${code}: ${body.base_resp?.status_msg ?? "unknown"}`,
    );
  }

  const hex = body.data?.audio;
  if (!hex) throw new Error("MiniMax returned no audio data");

  return {
    buffer: Buffer.from(hex, "hex"),
    durationMs: body.extra_info?.music_duration,
  };
}
