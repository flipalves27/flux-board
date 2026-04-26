import type { Octokit } from "@octokit/rest";
import { replaceRepoChunks, searchForgeChunks } from "@/lib/kv-forge";

const MAX_FILE_BYTES = 48_000;
const CHUNK_LINES = 120;

function chunkText(path: string, content: string): { path: string; content: string; tokenEstimate: number }[] {
  const lines = content.split("\n");
  if (lines.length <= CHUNK_LINES) {
    return [{ path, content, tokenEstimate: Math.ceil(content.length / 4) }];
  }
  const out: { path: string; content: string; tokenEstimate: number }[] = [];
  for (let i = 0; i < lines.length; i += CHUNK_LINES) {
    const slice = lines.slice(i, i + CHUNK_LINES).join("\n");
    out.push({
      path: `${path}#L${i + 1}`,
      content: slice,
      tokenEstimate: Math.ceil(slice.length / 4),
    });
  }
  return out;
}

/**
 * Walk default branch tree and persist text chunks for RAG (MVP: no embeddings).
 */
export async function indexRepositoryTree(params: {
  orgId: string;
  repoFullName: string;
  octokit: Octokit;
  /** When omitted, resolves default branch HEAD. */
  commitSha?: string;
}): Promise<{ commitSha: string; fileCount: number; chunkCount: number }> {
  const [owner, repo] = params.repoFullName.split("/");
  if (!owner || !repo) throw new Error("invalid_repo_full_name");

  let sha = params.commitSha?.trim();
  if (!sha) {
    const { data: ref } = await params.octokit.rest.repos.getBranch({
      owner,
      repo,
      branch: (
        await params.octokit.rest.repos.get({ owner, repo })
      ).data.default_branch,
    });
    sha = ref.commit.sha;
  }

  const { data: tree } = await params.octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: sha!,
    recursive: "true",
  });

  const blobs: { path: string; content: string; tokenEstimate: number }[] = [];
  let fileCount = 0;

  for (const item of tree.tree ?? []) {
    if (item.type !== "blob" || !item.path || !item.sha) continue;
    if (!/\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|cs|md|yml|yaml|json)$/i.test(item.path)) continue;
    fileCount += 1;
    try {
      const { data: blob } = await params.octokit.rest.git.getBlob({
        owner,
        repo,
        file_sha: item.sha,
      });
      if (blob.encoding !== "base64") continue;
      const buf = Buffer.from(blob.content, "base64");
      if (buf.length > MAX_FILE_BYTES) continue;
      const text = buf.toString("utf8");
      blobs.push(...chunkText(item.path, text));
    } catch {
      /* skip binary / errors */
    }
  }

  await replaceRepoChunks({
    orgId: params.orgId,
    repoFullName: params.repoFullName,
    commitSha: sha!,
    chunks: blobs,
  });

  return { commitSha: sha!, fileCount, chunkCount: blobs.length };
}

export async function retrieveForgeRagContext(params: {
  orgId: string;
  repoFullName: string;
  commitSha: string;
  query: string;
  topK?: number;
}): Promise<{ path: string; excerpt: string }[]> {
  const chunks = await searchForgeChunks({
    orgId: params.orgId,
    repoFullName: params.repoFullName,
    commitSha: params.commitSha,
    query: params.query,
    limit: params.topK ?? 10,
  });
  return chunks.map((c) => ({
    path: c.path,
    excerpt: c.content.slice(0, 1200),
  }));
}
