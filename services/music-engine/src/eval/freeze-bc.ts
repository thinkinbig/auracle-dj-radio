#!/usr/bin/env node
/**
 * Freeze a Condition B or C session (doc/auracle_evaluation_design.md) by
 * running music-engine's real full-plan pipeline once and saving the
 * resulting tracklist — so participants in the listening study hear a fixed,
 * repeatable session per condition instead of a live-generated one, and the
 * same artifact shape feeds the objective-metrics script alongside baseline-a.
 *
 * Condition is derived the same way agent-harness does it at session-create
 * time (session/lifecycle/create.ts): C requires a taste summary, B has none.
 */
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Condition, SessionIntent, TastePreference } from "@auracle/shared";
import { Catalog } from "../catalog-store.js";
import { createPlanCached, type PlanDeps } from "../flow/plan.js";
import { resolveSeeds } from "../flow/resolve-seeds.js";

async function main(): Promise<void> {
  const [, , moodArg, sceneArg, durationArg, tasteSummaryArg] = process.argv;
  if (!moodArg || !sceneArg) {
    console.error("usage: tsx src/eval/freeze-bc.ts <mood> <scene> [duration_min] [spotify_taste_summary]");
    console.error("env: TASTE_JSON (optional TastePreference[] JSON, mirrors what the web app derives from Spotify)");
    process.exit(2);
  }

  const intent: SessionIntent = { mood: moodArg, scene: sceneArg, duration_min: durationArg ? Number(durationArg) : 25 };
  const memories = tasteSummaryArg ?? "";
  const condition: Condition = memories ? "C" : "B";
  const taste: TastePreference[] | undefined = process.env.TASTE_JSON ? JSON.parse(process.env.TASTE_JSON) : undefined;

  const catalog = Catalog.fromManifest();
  const deps: PlanDeps = { tracks: () => catalog.allTracks(), resolveSeeds };
  const plan = await createPlanCached(deps, intent, memories, undefined, condition === "C" ? taste : undefined);

  const tracklist = plan.result.tracklist
    .slice()
    .sort((a, b) => a.flow_position - b.flow_position)
    .map((slot) => {
      const candidate = plan.candidatesById.get(slot.id);
      return {
        id: slot.id,
        title: slot.title,
        artist: slot.artist,
        genre: candidate?.genre ?? "",
        energy: slot.energy,
        tempo: candidate?.tempo ?? 0,
      };
    });

  const report = { condition, intent, generated_at: new Date().toISOString(), tracklist };
  const output = process.env.FREEZE_OUTPUT ?? join(tmpdir(), `auracle-freeze-${condition}-${Date.now()}.json`);
  await writeFile(output, JSON.stringify(report, null, 2));

  console.log(`condition ${condition}: "${intent.mood} ${intent.scene}" (${intent.duration_min} min)`);
  for (const t of tracklist) console.log(`  ${t.energy}/5 ${t.tempo}bpm  "${t.title}" — ${t.artist} (${t.genre})`);
  console.log(`\nreport: ${output}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
