/**
 * Live relay end-to-end smoke test (manual, NOT in CI — needs a real GEMINI_API_KEY
 * and hits Gemini Live, so it costs money and depends on the network).
 *
 * Boots the API on a random port, creates a session, connects to the Live WS,
 * sends one `cue_dj`, and reports the phase sequence, audio byte count, and
 * transcript. Pass means: phases reach dj_turn_end, audio bytes > 0.
 *
 * Run:  npx tsx scripts/live-smoke.mts
 */
import { buildContext } from "../src/context.js";
import { buildServer } from "../src/server.js";

const ctx = await buildContext();
const app = await buildServer(ctx);
await app.listen({ port: 0, host: "127.0.0.1" });
const { port } = app.server.address() as { port: number };

const res = await fetch(`http://127.0.0.1:${port}/sessions`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ mood: "calm", scene: "study", duration_min: 25 }),
});
const session = (await res.json()) as {
  session_id: string;
  session_title: string;
  tracklist: unknown[];
  live_ws_url: string;
};
console.log(`session ${session.session_id} | ${session.tracklist.length} tracks | "${session.session_title}"`);

const ws = new WebSocket(`ws://127.0.0.1:${port}${session.live_ws_url}`);
ws.binaryType = "arraybuffer";
let audioBytes = 0;
let audioChunks = 0;
const transcripts: string[] = [];
const phases: string[] = [];

await new Promise<void>((resolve) => {
  let timer = setTimeout(resolve, 25_000);
  ws.onopen = () => {
    console.log("WS open → cue_dj track_index=0 (opening)");
    ws.send(JSON.stringify({ type: "cue_dj", track_index: 0 }));
  };
  ws.onmessage = (ev: MessageEvent) => {
    if (typeof ev.data !== "string") {
      audioBytes += (ev.data as ArrayBuffer).byteLength;
      audioChunks++;
      return;
    }
    const msg = JSON.parse(ev.data) as { type: string; [k: string]: unknown };
    if (msg.type === "transcript") {
      transcripts.push(`${msg.role as string}: ${msg.text as string}`);
    } else if (msg.type === "phase") {
      phases.push(msg.phase as string);
      console.log("  phase:", msg.phase);
      if (msg.phase === "dj_turn_end") {
        clearTimeout(timer);
        timer = setTimeout(resolve, 500);
      }
    } else {
      console.log("  msg:", JSON.stringify(msg));
    }
  };
  ws.onerror = () => {
    console.error("WS error");
    clearTimeout(timer);
    resolve();
  };
});

const ok = phases.includes("dj_turn_end") && audioBytes > 0;
console.log("\n=== RESULT ===");
console.log("phases:    ", phases.join(" → ") || "(none)");
console.log("audio:     ", audioChunks, "chunks,", audioBytes, "bytes (24kHz PCM)");
console.log("transcript:", transcripts.join(" | ") || "(none)");
console.log(ok ? "\n✅ PASS — relay round-trip works" : "\n❌ FAIL — no audio / no turn end");

ws.close();
await app.close();
process.exit(ok ? 0 : 1);
