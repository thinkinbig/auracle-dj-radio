#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const memoryUrl = process.env.MEMORY_SERVICE_URL ?? "http://localhost:3020";
const agentUrl = process.env.AGENT_HARNESS_URL ?? "http://localhost:3030";
const musicUrl = process.env.MUSIC_ENGINE_URL ?? "http://localhost:3010";
const qdrantUrl = process.env.QDRANT_URL ?? "http://localhost:6333";
const output = process.env.MEMORY_SMOKE_OUTPUT ?? `/tmp/auracle-memory-smoke-${Date.now()}.json`;
const intent = {
  mood: process.env.MEMORY_SMOKE_MOOD ?? "calm",
  scene: process.env.MEMORY_SMOKE_SCENE ?? "studying",
  duration_min: Number(process.env.MEMORY_SMOKE_DURATION_MIN ?? 25),
};
const seededFact =
  process.env.MEMORY_SMOKE_FACT ?? "User prefers lighter energy and sparse piano during studying sessions.";

async function requestJson(url, options = {}) {
  let res;
  try {
    res = await fetch(url, {
      ...options,
      headers: { "content-type": "application/json", ...(options.headers ?? {}) },
    });
  } catch (err) {
    throw new Error(`${options.method ?? "GET"} ${url} failed: ${err instanceof Error ? err.message : err}`);
  }
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${options.method ?? "GET"} ${url} -> ${res.status}: ${text}`);
  }
  return body;
}


async function preflight() {
  const [memoryHealth, qdrantCollections] = await Promise.all([
    requestJson(`${memoryUrl}/health`),
    requestJson(`${qdrantUrl}/collections`),
  ]);
  if (!memoryHealth.memory?.enabled) {
    throw new Error("memory-service mem0 is disabled; set GEMINI_API_KEY before starting the stack");
  }
  if (memoryHealth.memory?.degraded) {
    throw new Error("memory-service mem0 is already degraded; restart memory-service after fixing Qdrant/Gemini connectivity");
  }
  return { memoryHealth, qdrantCollections };
}

function postJson(base, path, body, headers) {
  return requestJson(`${base}${path}`, { method: "POST", body: JSON.stringify(body), headers });
}

async function getTrackEnergy(id) {
  const track = await requestJson(`${musicUrl}/tracks/${encodeURIComponent(id)}`);
  return track.energy;
}

async function summarizeSession(session) {
  const energies = await Promise.all(session.tracklist.map((t) => getTrackEnergy(t.id)));
  const avgEnergy = energies.reduce((sum, energy) => sum + energy, 0) / Math.max(1, energies.length);
  return {
    sessionId: session.session_id,
    mem0Context: session.mem0_context ?? "",
    trackIds: session.tracklist.map((t) => t.id),
    energies,
    avgEnergy,
    reasons: session.tracklist.map((t) => t.reason ?? ""),
  };
}

function containsAny(text, words) {
  const lower = text.toLowerCase();
  return words.some((word) => lower.includes(word));
}

async function main() {
  const preflightResult = await preflight();
  const runId = `memory-smoke-${Date.now()}`;
  const email = `${runId}@example.invalid`;
  const registered = await postJson(memoryUrl, "/auth/register", {
    email,
    password: "Secret123",
    name: "Memory Smoke",
  });
  const userId = registered.user.id;
  const token = registered.token;

  await postJson(memoryUrl, "/memory/remember", {
    fact: seededFact,
    session_id: runId,
    user_id: userId,
  });

  const auth = { authorization: `Bearer ${token}` };
  const bSession = await postJson(agentUrl, "/sessions", { ...intent, condition: "B" }, auth);
  const cSession = await postJson(agentUrl, "/sessions", { ...intent, condition: "C" }, auth);

  const b = await summarizeSession(bSession);
  const c = await summarizeSession(cSession);
  const cContext = c.mem0Context.toLowerCase();
  const reasonText = c.reasons.join("\n");
  const checks = {
    bHasNoMemory: b.mem0Context === "",
    cHasSeededMemory: containsAny(cContext, ["lighter energy", "sparse piano"]),
    cAverageEnergyLower: c.avgEnergy <= b.avgEnergy - 0.5,
    cReasonsMentionPreference: containsAny(reasonText, ["lighter", "sparse", "preference", "profile"]),
  };
  const passed = Object.values(checks).every(Boolean);
  const artifact = {
    passed,
    checks,
    services: { memoryUrl, agentUrl, musicUrl, qdrantUrl },
    preflight: preflightResult,
    userId,
    intent,
    seededFact,
    b,
    c,
  };

  const outPath = resolve(output);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(JSON.stringify({ passed, output: outPath, checks, bAvgEnergy: b.avgEnergy, cAvgEnergy: c.avgEnergy }, null, 2));
  if (!passed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
