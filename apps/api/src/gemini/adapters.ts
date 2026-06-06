import type { FlowModel } from "../flow/flow-model.js";
import type { Embedder } from "../flow/embedder.js";
import { executeWithGeminiFallback } from "./resilience.js";

/** FlowModel adapter: Gemini primary with heuristic fallback at the seam. */
export function withFlowFallback(primary: FlowModel, fallback: FlowModel): FlowModel {
  return {
    plan: (input) =>
      executeWithGeminiFallback(
        "flow",
        () => primary.plan(input),
        () => fallback.plan(input),
        "heuristic",
      ),
  };
}

/** Embedder adapter: Gemini primary with hash fallback at the seam. */
export function withEmbedFallback(primary: Embedder, fallback: Embedder): Embedder {
  return {
    embedTrack: (t) =>
      executeWithGeminiFallback(
        "embed",
        () => primary.embedTrack(t),
        () => fallback.embedTrack(t),
        "hash embedder",
      ),
    embedQuery: (mood, scene) =>
      executeWithGeminiFallback(
        "embed",
        () => primary.embedQuery(mood, scene),
        () => fallback.embedQuery(mood, scene),
        "hash embedder",
      ),
  };
}
