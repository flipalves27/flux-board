import { getBoardEffectiveRole, roleCanAdmin, roleCanEdit } from "@/lib/kv-board-members";
import type { getBoard } from "@/lib/kv-boards";

type KvBoard = NonNullable<Awaited<ReturnType<typeof getBoard>>>;

export type ViewerCapabilities = {
  canEdit: boolean;
  canAdmin: boolean;
};

export async function getViewerCapabilities(
  orgId: string,
  board: KvBoard,
  userId: string,
  isOrgAdmin: boolean
): Promise<ViewerCapabilities> {
  const role = await getBoardEffectiveRole(orgId, board.id, userId, board.ownerId === userId, isOrgAdmin);
  return {
    canEdit: roleCanEdit(role),
    canAdmin: roleCanAdmin(role),
  };
}
