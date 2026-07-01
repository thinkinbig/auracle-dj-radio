import type { PlannedTrack, QueueRefreshStatus } from "@auracle/shared";
import type { OrchestrationDeps } from "../deps.js";
import type { SessionState } from "../state.js";

/**
 * A change to the not-yet-played queue, ready to deliver to clients. Produced by
 * every queue mutation (mood_change replan, rolling extend, skip-swap);
 * `changedIds` flags the slots that moved so the UI can highlight them (E4).
 */
export interface QueueUpdate {
  remaining: PlannedTrack[];
  changedIds?: string[];
  beforeRemainingIds?: string[];
}

/**
 * The single server-initiated delivery seam for a {@link QueueUpdate}: build the
 * `tracklist_updated` event from the update plus the session's current copy and
 * push it to the browser over the proxy data channel (Lane 3).
 *
 * Used only by mutations that have **no HTTP response to ride on** — the DJ's
 * `mood_change` replan, the rolling extend, and the quick-skip swap all originate
 * server-side. Client-initiated mutations (the Regenerate button) instead return
 * the update in their own HTTP response and must NOT also push here: one logical
 * change, one channel. `ui_events` reaches the browser only (never the DJ model),
 * so this never informs Gemini — see `rt_llm_proxy` `inject`.
 */
/** Push extend/regenerate refresh status to the browser (E6). */
export async function pushQueueRefresh(
  deps: OrchestrationDeps,
  sessionId: string,
  status: Extract<QueueRefreshStatus, "pending" | "error">,
): Promise<void> {
  await deps.proxy.inject(sessionId, {
    ui_events: [{ type: "queue_refresh", status }],
  });
}

export async function pushQueueUpdate(
  deps: OrchestrationDeps,
  state: SessionState,
  update: QueueUpdate,
): Promise<void> {
  await deps.proxy.inject(state.id, {
    ui_events: [
      {
        type: "tracklist_updated",
        remaining: update.remaining,
        session_title: state.title,
        session_subtitle: state.subtitle,
        ...(update.changedIds ? { changed_ids: update.changedIds } : {}),
        ...(update.beforeRemainingIds ? { before_remaining_ids: update.beforeRemainingIds } : {}),
      },
    ],
  });
}
