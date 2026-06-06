import { describe, expect, it } from "vitest";
import type { FlowResult, SessionIntent, TrackCandidate } from "@auracle/shared";
import { HashEmbedder } from "../src/flow/embedder.js";
import type { FlowModel, FlowInput } from "../src/flow/flow-model.js";
import { createPlan, type PlanDeps } from "../src/flow/plan.js";
import { SEED_TRACKS } from "../src/db/seed-data.js";
import type { TrackRow } from "../src/db/index.js";

class RecordingFlowModel implements FlowModel {
  readonly hints: string[] = [];

  constructor(
    private readonly first: FlowResult,
    private readonly second: FlowResult,
  ) {}

  async plan(input: FlowInput): Promise<FlowResult> {
    if (input.repairHint) this.hints.push(input.repairHint);
    return this.hints.length === 0 ? this.first : this.second;
  }
}

describe("runFlow violation-aware retry", () => {
  it("passes violations into the second plan call", async () => {
    const embedder = new HashEmbedder();
    const rows: TrackRow[] = [];
    for (const t of SEED_TRACKS) {
      rows.push({ ...t, embedding: await embedder.embedTrack(t) });
    }

    const bad: FlowResult = {
      session_title: "Bad",
      session_subtitle: "25 min",
      arc: "build",
      tracklist: [
        { id: "t01", flow_position: 1, reason: "" },
        { id: "t12", flow_position: 2, reason: "" },
      ],
    };
    const good: FlowResult = {
      session_title: "Good",
      session_subtitle: "25 min",
      arc: "build",
      tracklist: SEED_TRACKS.slice(0, 8).map((t, i) => ({
        id: t.id,
        flow_position: i + 1,
        reason: "",
      })),
    };

    const model = new RecordingFlowModel(bad, good);
    const deps: PlanDeps = { embedder, flowModel: model, tracks: () => rows };
    const intent: SessionIntent = { mood: "calm", scene: "study", duration_min: 25 };

    const { result, violations } = await createPlan(deps, intent);
    expect(model.hints).toHaveLength(1);
    expect(model.hints[0]).toMatch(/tempo_jump|energy_jump/);
    expect(result.session_title).toBe("Good");
    expect(violations).toEqual([]);
  });
});
