#!/usr/bin/env node
/**
 * Offline feedback-loop eval over `session_events` (#66–#69).
 *
 * Reads events via memory-service `POST /events/query` (internal) and track
 * metadata via music-engine `GET /tracks/:id`, then reports:
 *
 *   --session <id>        Feedback timeline (#66) + per-feedback #68 metrics
 *                         (changed_ids, Δenergy_mean of next 2 slots, artist_repeat)
 *                         + regenerate checks + played_track_ids reconstruction.
 *   --user <id>           The user's sessions (session_created) + current taste
 *                         rows, flagging `source: "session"` prefs (#69).
 *   --compare <idA> <idB> Played-tracklist Jaccard + energy histograms (C vs B).
 *
 * HITL runs: see doc/auracle_feedback_eval_runbook.md. Requires a running
 * memory-service (+ music-engine for metadata); no Gemini/proxy needed.
 */
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";

const memoryUrl = process.env.MEMORY_SERVICE_URL ?? "http://localhost:3020";
const musicUrl = process.env.MUSIC_ENGINE_URL ?? "http://localhost:3010";
const output = process.env.FEEDBACK_EVAL_OUTPUT ?? join(tmpdir(), `auracle-feedback-eval-${Date.now()}.json`);

/** A feedback event is paired with the first replan that lands within this window. */
const REPLAN_PAIR_WINDOW_MS = 60_000;
/** #68 scores the shift over the next N upcoming slots. */
const NEXT_SLOTS = 2;

async function requestJson(url, options = {}) {
  let res;
  try {
    res = await fetch(url, { ...options, headers: { "content-type": "application/json", ...(options.headers ?? {}) } });
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
  if (!res.ok) throw new Error(`${options.method ?? "GET"} ${url} -> ${res.status}: ${text}`);
  return body;
}

const postJson = (base, path, body) => requestJson(`${base}${path}`, { method: "POST", body: JSON.stringify(body) });

async function queryEvents(filter) {
  const { events } = await postJson(memoryUrl, "/events/query", filter);
  return events;
}

/** trackId → { energy, artist, artistSlug } | null (unresolved: Spotify uri / stale id). */
const trackMetaCache = new Map();
async function trackMeta(id) {
  if (trackMetaCache.has(id)) return trackMetaCache.get(id);
  let meta = null;
  try {
    const t = await requestJson(`${musicUrl}/tracks/${encodeURIComponent(id)}`);
    meta = { energy: t.energy, artist: t.artist, artistSlug: t.artistSlug };
  } catch {
    meta = null; // unresolved — e.g. a Spotify queue item with no catalog identity
  }
  trackMetaCache.set(id, meta);
  return meta;
}

async function metasFor(ids) {
  return Promise.all(ids.map((id) => trackMeta(id)));
}

function meanEnergy(metas) {
  const energies = metas.filter((m) => m && typeof m.energy === "number").map((m) => m.energy);
  if (energies.length === 0) return null;
  return energies.reduce((a, b) => a + b, 0) / energies.length;
}

/** Positional diff — same rule as agent-harness `changedIdsFromRemaining`. */
function changedIds(beforeIds, afterIds) {
  const changed = new Set();
  const max = Math.max(beforeIds.length, afterIds.length);
  for (let i = 0; i < max; i += 1) {
    const afterId = afterIds[i];
    if (afterId && beforeIds[i] !== afterId) changed.add(afterId);
  }
  return [...changed];
}

const offset = (ts, t0) => {
  const s = Math.round((ts - t0) / 1000);
  return `+${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** Consecutive-dedup track_started ids — the actual on-air sequence, never the initial plan. */
function playedTrackIds(events) {
  const played = [];
  for (const e of events) {
    if (e.event_type !== "track_started") continue;
    const id = e.payload?.track_id;
    if (id && played.at(-1) !== id) played.push(id);
  }
  return played;
}

const FEEDBACK_FIELDS = ["feedback", "track_id", "remaining_ids", "source"];

async function sessionReport(sessionId) {
  const events = await queryEvents({ session_id: sessionId, limit: 2000 });
  if (events.length === 0) throw new Error(`no events for session ${sessionId} — wrong id or memory-service DB?`);
  const t0 = events[0].ts;

  const created = events.find((e) => e.event_type === "session_created");
  const timeline = events.map((e) => ({
    at: offset(e.ts, t0),
    ts: e.ts,
    event_type: e.event_type,
    payload: e.payload,
  }));

  // #66 — every playlist_feedback row must be fully attributed.
  const feedbackEvents = events.filter((e) => e.event_type === "playlist_feedback");
  const attribution = feedbackEvents.map((e) => ({
    at: offset(e.ts, t0),
    feedback: e.payload?.feedback,
    track_id: e.payload?.track_id,
    source: e.payload?.source,
    missing_fields: FEEDBACK_FIELDS.filter((f) => e.payload?.[f] === undefined || e.payload?.[f] === null),
  }));

  // #68 — pair each like/dislike with the next replan inside the window.
  const replans = events.filter((e) => e.event_type === "replan");
  const feedbackMetrics = [];
  for (const fb of feedbackEvents) {
    const kind = fb.payload?.feedback;
    if (kind !== "like" && kind !== "dislike") continue;
    const replan = replans.find((r) => r.ts >= fb.ts && r.ts - fb.ts <= REPLAN_PAIR_WINDOW_MS);
    const entry = {
      at: offset(fb.ts, t0),
      feedback: kind,
      track_id: fb.payload?.track_id,
      source: fb.payload?.source,
      replan_paired: Boolean(replan),
    };
    if (replan) {
      const before = replan.payload?.before ?? [];
      const after = replan.payload?.after ?? [];
      const nextBefore = before.slice(0, NEXT_SLOTS);
      const nextAfter = after.slice(0, NEXT_SLOTS);
      const [beforeMetas, afterMetas, fbMeta] = await Promise.all([
        metasFor(nextBefore),
        metasFor(nextAfter),
        trackMeta(fb.payload?.track_id ?? ""),
      ]);
      const beforeMean = meanEnergy(beforeMetas);
      const afterMean = meanEnergy(afterMetas);
      entry.replan_at = offset(replan.ts, t0);
      entry.replan_scope = replan.payload?.scope;
      entry.replan_latency_ms = replan.ts - fb.ts;
      entry.changed_ids = changedIds(before, after);
      entry.next_slots_before = nextBefore;
      entry.next_slots_after = nextAfter;
      entry.delta_energy_mean = beforeMean !== null && afterMean !== null ? Number((afterMean - beforeMean).toFixed(2)) : null;
      entry.unresolved_ids = [...nextBefore, ...nextAfter].filter((id, i, arr) => arr.indexOf(id) === i && !trackMetaCache.get(id));
      if (kind === "dislike") {
        entry.feedback_artist = fbMeta?.artist ?? null;
        entry.artist_repeat_before = fbMeta ? beforeMetas.filter((m) => m?.artistSlug === fbMeta.artistSlug).length : null;
        // #68: disliked artist should be absent from the next slots after the nudge.
        entry.artist_repeat_after = fbMeta ? afterMetas.filter((m) => m?.artistSlug === fbMeta.artistSlug).length : null;
      }
    }
    feedbackMetrics.push(entry);
  }

  // Regenerate: full-queue rebuild must actually change something.
  const regenerates = events
    .filter((e) => e.event_type === "playlist_regenerate_requested")
    .map((e) => ({
      at: offset(e.ts, t0),
      source: e.payload?.source,
      changed_count: changedIds(e.payload?.before ?? [], e.payload?.after ?? []).length,
      before: e.payload?.before ?? [],
      after: e.payload?.after ?? [],
    }));

  const failures = events
    .filter((e) => e.event_type === "taste_feedback_failed" || e.event_type === "replan_failed")
    .map((e) => ({ at: offset(e.ts, t0), event_type: e.event_type, payload: e.payload }));

  return {
    session_id: sessionId,
    user_id: events[0].user_id,
    condition: created?.payload?.condition ?? null,
    intent: created?.payload?.intent ?? null,
    played_track_ids: playedTrackIds(events),
    feedback_attribution: attribution,
    feedback_metrics: feedbackMetrics,
    regenerates,
    failures,
    timeline,
  };
}

async function userReport(userId) {
  const created = await queryEvents({ user_id: userId, event_type: "session_created", limit: 200 });
  const sessions = created.map((e) => ({
    session_id: e.session_id,
    started: new Date(e.ts).toISOString(),
    condition: e.payload?.condition ?? null,
    intent: e.payload?.intent ?? null,
  }));
  const { preferences } = await postJson(memoryUrl, "/taste/weights", { user_id: userId });
  return {
    user_id: userId,
    sessions,
    taste: preferences,
    // #69: rows written by voice like/dislike carry source "session".
    session_sourced_taste: preferences.filter((p) => p.source === "session"),
  };
}

async function compareReport(a, b) {
  const [eventsA, eventsB] = await Promise.all([
    queryEvents({ session_id: a, limit: 2000 }),
    queryEvents({ session_id: b, limit: 2000 }),
  ]);
  const playedA = playedTrackIds(eventsA);
  const playedB = playedTrackIds(eventsB);
  const setA = new Set(playedA);
  const setB = new Set(playedB);
  const intersection = [...setA].filter((id) => setB.has(id));
  const union = new Set([...setA, ...setB]);

  async function histogram(ids) {
    const metas = await metasFor(ids);
    const hist = {};
    for (const m of metas) {
      if (m && typeof m.energy === "number") hist[m.energy] = (hist[m.energy] ?? 0) + 1;
    }
    return hist;
  }

  return {
    session_a: { id: a, played: playedA, energy_histogram: await histogram(playedA) },
    session_b: { id: b, played: playedB, energy_histogram: await histogram(playedB) },
    jaccard: union.size === 0 ? null : Number((intersection.length / union.size).toFixed(3)),
    shared_tracks: intersection,
  };
}

function summarizeSession(r) {
  const lines = [
    `session ${r.session_id} (user ${r.user_id}, condition ${r.condition ?? "?"})`,
    `  played: ${r.played_track_ids.join(" → ") || "(none)"}`,
  ];
  for (const a of r.feedback_attribution) {
    const ok = a.missing_fields.length === 0 ? "ok" : `MISSING ${a.missing_fields.join(",")}`;
    lines.push(`  ${a.at} playlist_feedback ${a.feedback} track=${a.track_id} source=${a.source} [${ok}]`);
  }
  for (const m of r.feedback_metrics) {
    if (!m.replan_paired) {
      lines.push(`  ${m.at} ${m.feedback} → NO replan within ${REPLAN_PAIR_WINDOW_MS / 1000}s (condition A noop, or check #68 wiring)`);
      continue;
    }
    const bits = [
      `changed=${m.changed_ids.length}`,
      `Δenergy(next${NEXT_SLOTS})=${m.delta_energy_mean ?? "n/a"}`,
    ];
    if (m.feedback === "dislike") bits.push(`artist_repeat ${m.artist_repeat_before ?? "?"}→${m.artist_repeat_after ?? "?"} (want 0)`);
    lines.push(`  ${m.at} ${m.feedback} → replan ${m.replan_at} (${m.replan_latency_ms}ms, ${m.replan_scope}): ${bits.join(", ")}`);
  }
  for (const g of r.regenerates) {
    lines.push(`  ${g.at} regenerate (${g.source}): changed_count=${g.changed_count}${g.changed_count === 0 ? " ← want ≥1" : ""}`);
  }
  for (const f of r.failures) lines.push(`  ${f.at} ${f.event_type}: ${JSON.stringify(f.payload)}`);
  if (r.feedback_attribution.length === 0) lines.push("  (no playlist_feedback events)");
  return lines.join("\n");
}

function summarizeUser(r) {
  const lines = [`user ${r.user_id}: ${r.sessions.length} session(s)`];
  for (const s of r.sessions) lines.push(`  ${s.started} ${s.session_id} condition=${s.condition ?? "?"}`);
  lines.push(`  taste rows: ${r.taste.length} total, ${r.session_sourced_taste.length} session-sourced (#69)`);
  for (const p of r.session_sourced_taste) {
    lines.push(`    ${p.polarity} ${p.entityType}:${p.entityId} strength=${p.strength ?? "-"} status=${p.status ?? "-"}`);
  }
  return lines.join("\n");
}

function summarizeCompare(r) {
  return [
    `A ${r.session_a.id}: ${r.session_a.played.length} played, energies ${JSON.stringify(r.session_a.energy_histogram)}`,
    `B ${r.session_b.id}: ${r.session_b.played.length} played, energies ${JSON.stringify(r.session_b.energy_histogram)}`,
    `Jaccard=${r.jaccard ?? "n/a"} shared=[${r.shared_tracks.join(", ")}]`,
  ].join("\n");
}

function usage() {
  console.error(
    "usage: node scripts/feedback-eval.mjs --session <id> | --user <id> | --compare <idA> <idB>\n" +
      "env: MEMORY_SERVICE_URL (default :3020), MUSIC_ENGINE_URL (default :3010), FEEDBACK_EVAL_OUTPUT",
  );
  process.exit(2);
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0];
  let report;
  let summary;
  if (mode === "--session" && args[1]) {
    report = { kind: "session", ...(await sessionReport(args[1])) };
    summary = summarizeSession(report);
  } else if (mode === "--user" && args[1]) {
    report = { kind: "user", ...(await userReport(args[1])) };
    summary = summarizeUser(report);
  } else if (mode === "--compare" && args[1] && args[2]) {
    report = { kind: "compare", ...(await compareReport(args[1], args[2])) };
    summary = summarizeCompare(report);
  } else {
    usage();
    return;
  }
  report.generated_at = new Date().toISOString();
  report.memory_service = memoryUrl;
  await writeFile(output, JSON.stringify(report, null, 2));
  console.log(summary);
  console.log(`\nreport: ${output}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
