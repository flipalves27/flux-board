import crypto from "crypto";
import { hashPassword } from "@/lib/auth";
import type { BoardData } from "@/lib/kv-boards";
import { deletePortalIndex, upsertPortalIndex } from "@/lib/kv-portal";
import type { BoardPortalBranding, BoardPortalSettings } from "@/lib/portal-types";

export function newPortalToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export type PortalBoardPatch = {
  enabled?: boolean;
  regenerateToken?: boolean;
  visibleBucketKeys?: string[];
  cardIdsAllowlist?: string[];
  branding?: Partial<{ [K in keyof BoardPortalBranding]: BoardPortalBranding[K] | null }>;
  /** `null` ou string vazia remove a senha; string define nova senha. */
  portalPassword?: string | null;
};

export function stripPortalForClient(portal: BoardPortalSettings | undefined): Omit<BoardPortalSettings, "passwordHash"> & { passwordProtected: boolean } | undefined {
  if (!portal) return undefined;
  const { passwordHash: _h, ...rest } = portal;
  return {
    ...rest,
    passwordProtected: Boolean(portal.passwordHash),
  };
}

export async function applyPortalPatch(
  board: BoardData,
  patch: PortalBoardPatch
): Promise<{ portal: BoardPortalSettings; prevToken?: string }> {
  const prev = board.portal;
  const prevToken = prev?.token;

  let next: BoardPortalSettings = prev
    ? { ...prev }
    : {
        enabled: false,
        token: newPortalToken(),
      };

  if (patch.enabled !== undefined) {
    next.enabled = patch.enabled;
  }

  if (patch.regenerateToken) {
    next.token = newPortalToken();
  } else if (!next.token) {
    next.token = newPortalToken();
  }

  if (patch.visibleBucketKeys !== undefined) {
    next.visibleBucketKeys = patch.visibleBucketKeys?.length ? [...patch.visibleBucketKeys] : undefined;
  }

  if (patch.cardIdsAllowlist !== undefined) {
    next.cardIdsAllowlist = patch.cardIdsAllowlist?.length ? [...patch.cardIdsAllowlist] : undefined;
  }

  if (patch.branding !== undefined) {
    const b = patch.branding;
    next.branding = {
      logoUrl: b.logoUrl?.trim() || undefined,
      primaryColor: b.primaryColor?.trim() || undefined,
      secondaryColor: b.secondaryColor?.trim() || undefined,
      accentColor: b.accentColor?.trim() || undefined,
      title: b.title?.trim() || undefined,
    };
    if (
      !next.branding.logoUrl &&
      !next.branding.primaryColor &&
      !next.branding.secondaryColor &&
      !next.branding.accentColor &&
      !next.branding.title
    ) {
      next.branding = undefined;
    }
  }

  if (patch.portalPassword !== undefined) {
    if (patch.portalPassword === null || patch.portalPassword === "") {
      delete next.passwordHash;
    } else {
      next.passwordHash = hashPassword(patch.portalPassword);
    }
  }

  const now = new Date().toISOString();

  if (prevToken && prevToken !== next.token) {
    await deletePortalIndex(prevToken);
  }

  if (next.enabled) {
    await upsertPortalIndex({
      token: next.token,
      boardId: board.id,
      orgId: board.orgId,
      enabled: true,
      updatedAt: now,
    });
  } else {
    await deletePortalIndex(next.token);
  }

  return { portal: next, prevToken: prevToken && prevToken !== next.token ? prevToken : undefined };
}
