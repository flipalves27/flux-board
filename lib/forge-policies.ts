import { getForgePolicy, upsertForgePolicy } from "@/lib/kv-forge";
import type { ForgePolicy } from "@/lib/forge-types";

export async function loadMergedForgePolicy(orgId: string, repoId?: string | null): Promise<ForgePolicy | null> {
  const orgWide = await getForgePolicy(orgId, null);
  if (!repoId) return orgWide;
  const override = await getForgePolicy(orgId, repoId);
  if (!override) return orgWide;
  if (!orgWide) return override;
  return {
    ...orgWide,
    ...override,
    _id: override._id,
    blockedPaths: override.blockedPaths ?? orgWide.blockedPaths,
  };
}

export async function saveForgePolicyDoc(doc: Omit<ForgePolicy, "_id" | "updatedAt"> & { _id?: string }): Promise<ForgePolicy> {
  return upsertForgePolicy(doc);
}
