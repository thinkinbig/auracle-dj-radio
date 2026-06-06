const DEFAULT_BASE = "https://api.minimax.io";

export interface GenerateImageInput {
  prompt: string;
  model: string;
  apiKey: string;
  aspectRatio?: "1:1" | "16:9" | "9:16" | "3:4" | "4:3";
  baseUrl?: string;
  promptOptimizer?: boolean;
}

interface MiniMaxImageResponse {
  data?: {
    image_base64?: string[];
  };
  base_resp?: {
    status_code?: number;
    status_msg?: string;
  };
}

/** Text-to-image via MiniMax image-01 (square album covers). */
export async function generateImage(input: GenerateImageInput): Promise<Buffer> {
  const base = input.baseUrl ?? process.env.MINIMAX_API_BASE ?? DEFAULT_BASE;
  const res = await fetch(`${base}/v1/image_generation`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      prompt: input.prompt,
      aspect_ratio: input.aspectRatio ?? "1:1",
      response_format: "base64",
      n: 1,
      prompt_optimizer: input.promptOptimizer ?? true,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MiniMax image HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  const body = (await res.json()) as MiniMaxImageResponse;
  const code = body.base_resp?.status_code ?? -1;
  if (code !== 0) {
    throw new Error(`MiniMax image error ${code}: ${body.base_resp?.status_msg ?? "unknown"}`);
  }

  const b64 = body.data?.image_base64?.[0];
  if (!b64) throw new Error("MiniMax image returned no data");
  return Buffer.from(b64, "base64");
}
