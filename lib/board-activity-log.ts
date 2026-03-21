import type { BoardActivityContext, BoardActivityDelta } from "./board-activity-types";
import { insertBoardActivities } from "./kv-board-activity";
import { isMongoConfigured } from "./mongo";
import { getOrganizationById } from "./kv-organizations";
import { getBoardActivityRetentionDays } from "./plan-gates";

/**
 * Fire-and-forget persistence of audit rows. Does not block the request path beyond queueing microtask work.
 */
export function scheduleBoardActivityWrites(
  deltas: BoardActivityDelta[],
  ctx: BoardActivityContext & { boardId: string }
): void {
  if (!deltas.length || !isMongoConfigured()) return;
  queueMicrotask(() => {
    void (async () => {
      try {
        const org = await getOrganizationById(ctx.orgId);
        const days = getBoardActivityRetentionDays(org);
        const expiresAt = days !== null ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : undefined;
        await insertBoardActivities(deltas, ctx, expiresAt);
      } catch (e) {
        console.error("[board-activity]", e);
      }
    })();
  });
}
