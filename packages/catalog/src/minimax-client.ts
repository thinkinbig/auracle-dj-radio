export const DEFAULT_MINIMAX_API_BASE = "https://api.minimax.io";
export const DEFAULT_MUSIC_MODEL = "music-2.6";
export const DEFAULT_IMAGE_MODEL = "image-01";

export interface MinimaxMusicRequest {
  model?: string;
  prompt: string;
  isInstrumental: boolean;
  lyrics?: string;
  lyricsOptimizer?: boolean;
}

interface MinimaxBaseResp {
  status_code: number;
  status_msg: string;
}

interface MinimaxMusicResponse {
  data?: { status?: number; audio?: string };
  base_resp?: MinimaxBaseResp;
}

interface MinimaxImageResponse {
  data?: { image_base64?: string[] };
  base_resp?: MinimaxBaseResp;
}

export function getMinimaxApiKey(): string {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new Error(
      "MINIMAX_API_KEY is required. Set it in the repo-root .env (see .env.example) or export it in your shell.",
    );
  }
  return apiKey;
}

function apiBase(): string {
  return process.env.MINIMAX_API_BASE ?? DEFAULT_MINIMAX_API_BASE;
}

async function minimaxPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getMinimaxApiKey()}`,
    },
    body: JSON.stringify(body),
  });

  const json = (await response.json()) as T & { base_resp?: MinimaxBaseResp };
  const code = json.base_resp?.status_code;
  if (code !== undefined && code !== 0) {
    throw new Error(`MiniMax API ${code}: ${json.base_resp?.status_msg ?? response.statusText}`);
  }
  if (!response.ok) {
    throw new Error(`MiniMax HTTP ${response.status}: ${response.statusText}`);
  }
  return json;
}

/** Generate MP3 bytes via MiniMax Music 2.6. */
export async function generateMinimaxMusic(request: MinimaxMusicRequest): Promise<Buffer> {
  const body: Record<string, unknown> = {
    model: request.model ?? DEFAULT_MUSIC_MODEL,
    prompt: request.prompt,
    is_instrumental: request.isInstrumental,
    output_format: "hex",
    audio_setting: {
      sample_rate: 44100,
      bitrate: 256000,
      format: "mp3",
    },
  };

  if (request.lyrics) body.lyrics = request.lyrics;
  if (request.lyricsOptimizer) body.lyrics_optimizer = true;

  const result = await minimaxPost<MinimaxMusicResponse>("/v1/music_generation", body);
  const audio = result.data?.audio;
  if (!audio || result.data?.status !== 2) {
    throw new Error("MiniMax music response missing completed audio");
  }
  return Buffer.from(audio, "hex");
}

/** Generate one square image via MiniMax image-01 (or override model). */
export async function generateMinimaxImage(prompt: string, model = "image-01"): Promise<Buffer> {
  const result = await minimaxPost<MinimaxImageResponse>("/v1/image_generation", {
    model,
    prompt,
    aspect_ratio: "1:1",
    response_format: "base64",
    n: 1,
  });

  const base64 = result.data?.image_base64?.[0];
  if (!base64) throw new Error("MiniMax image response missing image_base64");
  return Buffer.from(base64, "base64");
}
