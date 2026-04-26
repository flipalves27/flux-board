import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import type { IntegrationConnection } from "@/lib/kv-integrations";
import { decryptOrgAiSecrets, getOrgAiSecretsMasterKey } from "@/lib/org-ai-secrets-crypto";

export type ForgeGithubContext = {
  octokit: Octokit;
  token: string;
};

function pemFromEnvOrEnc(connection: IntegrationConnection): string | null {
  const envPem = process.env.FLUX_GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n")?.trim();
  if (envPem) return envPem;
  const blob = connection.appPrivateKeyEnc?.trim();
  const master = getOrgAiSecretsMasterKey();
  if (!blob || !master) return null;
  const dec = decryptOrgAiSecrets(blob, master);
  const pem = dec?.githubAppPrivateKeyPem;
  return typeof pem === "string" && pem.includes("PRIVATE KEY") ? pem : null;
}

function appIdFromConnection(connection: IntegrationConnection): string | null {
  const fromConn = connection.githubAppId?.trim();
  if (fromConn) return fromConn;
  return process.env.FLUX_GITHUB_APP_ID?.trim() || null;
}

/**
 * Authenticated Octokit for a GitHub App installation (org connection).
 */
export async function createForgeOctokit(connection: IntegrationConnection): Promise<ForgeGithubContext | null> {
  const installationId = connection.installationId?.trim();
  const appId = appIdFromConnection(connection);
  const privateKey = pemFromEnvOrEnc(connection);
  if (!installationId || !appId || !privateKey) return null;

  const auth = createAppAuth({
    appId,
    privateKey,
    installationId,
  });
  const { token } = await auth({ type: "installation", installationId: Number(installationId) || installationId });
  const octokit = new Octokit({ auth: token });
  return { octokit, token };
}

export async function dispatchFluxForgeWorkflow(params: {
  octokit: Octokit;
  owner: string;
  repo: string;
  clientPayload?: Record<string, unknown>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await params.octokit.rest.repos.createDispatchEvent({
      owner: params.owner,
      repo: params.repo,
      event_type: "flux-forge",
      client_payload: params.clientPayload ?? {},
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "dispatch_failed";
    return { ok: false, error: msg };
  }
}

export async function createDraftPullRequest(params: {
  octokit: Octokit;
  owner: string;
  repo: string;
  title: string;
  head: string;
  base: string;
  body: string;
}): Promise<{ ok: true; number: number; url: string } | { ok: false; error: string }> {
  try {
    const { data } = await params.octokit.rest.pulls.create({
      owner: params.owner,
      repo: params.repo,
      title: params.title,
      head: params.head,
      base: params.base,
      body: params.body,
      draft: true,
    });
    return { ok: true, number: data.number, url: data.html_url };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "pr_failed";
    return { ok: false, error: msg };
  }
}

export function parseRepoFullName(repoFullName: string): { owner: string; repo: string } | null {
  const parts = repoFullName.split("/").filter(Boolean);
  if (parts.length !== 2) return null;
  return { owner: parts[0]!, repo: parts[1]! };
}
