import type { Organization } from "@/lib/kv-organizations";
import { getBoard } from "@/lib/kv-boards";
import { getIntegrationConnection } from "@/lib/kv-integrations";
import { resolveOrgLlmRuntime } from "@/lib/org-llm-runtime";
import { OpenAiCompatLlmProvider } from "@/lib/llm-provider";
import { anthropicMessagesChat, resolveAnthropicForgeConfig } from "@/lib/llm-anthropic-provider";
import { forgeDiffSystemPrompt, forgePlanSystemPrompt } from "@/lib/forge-prompts";
import { redactForForge } from "@/lib/forge-redaction";
import { loadMergedForgePolicy } from "@/lib/forge-policies";
import { createForgeOctokit, createDraftPullRequest, dispatchFluxForgeWorkflow, parseRepoFullName } from "@/lib/forge-github-client";
import { indexRepositoryTree, retrieveForgeRagContext } from "@/lib/forge-repo-index";
import { getForgeJob, updateForgeJob } from "@/lib/kv-forge";
import type { ForgeJob } from "@/lib/forge-types";
import type { PlanGateAuthPayload } from "@/lib/plan-gates";

export type ForgePipelineEvent = { event: string; data: Record<string, unknown> };

function pushTimeline(job: ForgeJob, phase: string, detail?: string, ok = true): ForgeJob["timeline"] {
  return [...job.timeline, { phase, at: new Date().toISOString(), detail, ok }];
}

async function llmComplete(params: {
  org: Organization | null;
  system: string;
  user: string;
}): Promise<{ text: string; usage?: { inputTokens: number; outputTokens: number }; model: string }> {
  const anth = resolveAnthropicForgeConfig();
  if (anth) {
    const r = await anthropicMessagesChat({
      apiKey: anth.apiKey,
      model: anth.model,
      system: params.system,
      messages: [{ role: "user", content: params.user }],
      options: { temperature: 0.2, maxTokens: 8192 },
    });
    if (r.ok) {
      return { text: r.assistantText, usage: r.usage, model: r.model };
    }
  }

  const rt = resolveOrgLlmRuntime(params.org);
  if (!rt?.apiKey) {
    return {
      text: "# Plan\n- LLM not configured (set ANTHROPIC_API_KEY or org BYOK).\n- Mock implementation only.\n",
      model: "none",
    };
  }
  const prov = new OpenAiCompatLlmProvider(rt);
  const res = await prov.chat(
    [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
    undefined,
    { temperature: 0.2, maxTokens: 8192, model: rt.model }
  );
  if (!res.ok) {
    throw new Error(res.error || "llm_failed");
  }
  return { text: res.assistantText, usage: res.usage, model: res.model };
}

function buildCardBrief(board: NonNullable<Awaited<ReturnType<typeof getBoard>>>, cardIds: string[]): string {
  const set = new Set(cardIds);
  const raw = (board.cards ?? []) as { id?: string; title?: string; desc?: string }[];
  const cards = raw.filter((c) => c.id && set.has(c.id));
  return cards
    .map((c) => `### ${c.title ?? "—"} (${c.id})\n${String(c.desc ?? "").trim() || "_no description_"}\n`)
    .join("\n");
}

/**
 * Advances a forge job through phases (intended for SSE worker or server continuation).
 */
export async function runForgePipeline(params: {
  jobId: string;
  orgId: string;
  org: Organization | null;
  authPayload: PlanGateAuthPayload;
  onEvent?: (ev: ForgePipelineEvent) => void;
}): Promise<void> {
  let job = await getForgeJob(params.orgId, params.jobId);
  if (!job) return;

  const emit = (event: string, data: Record<string, unknown>) => {
    params.onEvent?.({ event, data });
  };

  const fail = async (msg: string) => {
    await updateForgeJob(params.orgId, job!._id, {
      status: "failed",
      errorMessage: msg,
      timeline: pushTimeline(job!, "failed", msg, false),
    });
    emit("status", { phase: "failed", message: msg });
  };

  try {
    if (job.cancelRequested) {
      await updateForgeJob(params.orgId, job._id, {
        status: "cancelled",
        timeline: pushTimeline(job, "cancelled", "user_cancelled"),
      });
      return;
    }

    const policy = await loadMergedForgePolicy(params.orgId, job.repoId);
    const ghConn = await getIntegrationConnection(params.orgId, "github");
    const octoCtx = ghConn?.status === "connected" ? await createForgeOctokit(ghConn) : null;
    const repoFull = job.repoFullName?.trim() || "";
    const parsedRepo = parseRepoFullName(repoFull);

    /** --- indexing --- */
    if (job.status === "queued" || job.status === "indexing") {
      job = (await updateForgeJob(params.orgId, job._id, {
        status: "indexing",
        timeline: pushTimeline(job, "indexing", "repo_rag"),
      }))!;
      emit("status", { phase: "indexing" });

      let commitSha = "local";
      if (octoCtx && repoFull) {
        try {
          const idx = await indexRepositoryTree({
            orgId: params.orgId,
            repoFullName: repoFull,
            octokit: octoCtx.octokit,
          });
          commitSha = idx.commitSha;
          emit("index", { commitSha, files: idx.fileCount, chunks: idx.chunkCount });
        } catch (e) {
          emit("index", { warning: e instanceof Error ? e.message : "index_skipped" });
        }
      } else {
        emit("index", { skipped: true });
      }

      job = (await updateForgeJob(params.orgId, job._id, {
        status: "planning",
        timeline: pushTimeline(job, "indexing", "done"),
      }))!;
    }

    if (job.cancelRequested) return void (await fail("cancelled"));

    /** --- planning --- */
    if (job.status === "planning") {
      emit("status", { phase: "planning" });
      const board = job.boardId ? await getBoard(job.boardId, params.orgId) : null;
      const brief =
        board && job.cardIds.length
          ? buildCardBrief(board, job.cardIds)
          : job.cardIds.map((id) => `Card ${id}`).join("\n");

      const redactedBrief = redactForForge(brief, policy?.redactPiiRegex);
      let ragBlock = "";
      if (repoFull && octoCtx && parsedRepo) {
        const head = (
          await octoCtx.octokit.rest.repos.get({
            owner: parsedRepo.owner,
            repo: parsedRepo.repo,
          })
        ).data.default_branch;
        const ref = await octoCtx.octokit.rest.repos.getBranch({
          owner: parsedRepo.owner,
          repo: parsedRepo.repo,
          branch: head,
        });
        const sha = ref.data.commit.sha;
        const rag = await retrieveForgeRagContext({
          orgId: params.orgId,
          repoFullName: repoFull,
          commitSha: sha,
          query: redactedBrief.slice(0, 400),
          topK: 8,
        });
        ragBlock = rag.map((r) => `File: ${r.path}\n${r.excerpt}`).join("\n---\n");
      }

      const planSys = forgePlanSystemPrompt(policy?.defaultLanguage);
      const planUser = `Repository: ${repoFull}\n\nCards:\n${redactedBrief}\n\nContext excerpts:\n${ragBlock || "_none_"}`;
      const planLlm = await llmComplete({ org: params.org, system: planSys, user: planUser });

      job = (await updateForgeJob(params.orgId, job._id, {
        planMarkdown: planLlm.text,
        usage: {
          inputTokens: (job.usage?.inputTokens ?? 0) + (planLlm.usage?.inputTokens ?? 0),
          outputTokens: (job.usage?.outputTokens ?? 0) + (planLlm.usage?.outputTokens ?? 0),
          usd: job.usage?.usd,
        },
        timeline: pushTimeline(job, "planning", `model:${planLlm.model}`),
      }))!;

      const needApproval = Boolean(policy?.requireHumanPlanApproval || job.requirePlanApproval);
      if (needApproval) {
        job = (await updateForgeJob(params.orgId, job._id, {
          status: "plan_review",
        }))!;
        emit("status", { phase: "plan_review" });
        return;
      }

      job = (await updateForgeJob(params.orgId, job._id, {
        status: "generating",
      }))!;
    }

    if (job.status === "plan_review") {
      emit("status", { phase: "plan_review", waiting: true });
      return;
    }

    /** --- generating --- */
    if (job.status === "generating") {
      emit("status", { phase: "generating" });
      const diffSys = forgeDiffSystemPrompt(policy?.defaultLanguage);
      const diffUser = `Plan:\n${job.planMarkdown ?? ""}\n\nProduce unified diff for repo ${job.repoFullName}, base ${job.branchBase ?? "main"}.`;
      const diffLlm = await llmComplete({ org: params.org, system: diffSys, user: diffUser });

      const branchForge = job.branchForge ?? `flux-forge/${job.cardIds[0] ?? job._id.slice(-6)}`;

      job = (await updateForgeJob(params.orgId, job._id, {
        diffText: diffLlm.text,
        branchForge,
        usage: {
          inputTokens: (job.usage?.inputTokens ?? 0) + (diffLlm.usage?.inputTokens ?? 0),
          outputTokens: (job.usage?.outputTokens ?? 0) + (diffLlm.usage?.outputTokens ?? 0),
          usd: job.usage?.usd,
        },
        timeline: pushTimeline(job, "generating", `model:${diffLlm.model}`),
      }))!;

      if (job.tier === "tested" && octoCtx && parsedRepo) {
        const d = await dispatchFluxForgeWorkflow({
          octokit: octoCtx.octokit,
          owner: parsedRepo.owner,
          repo: parsedRepo.repo,
          clientPayload: { forgeJobId: job._id, branch: branchForge },
        });
        job = (await updateForgeJob(params.orgId, job._id, {
          status: "testing",
          ciStatus: d.ok
            ? [{ name: "flux-forge.yml", state: "pending" }]
            : [{ name: "flux-forge.yml", state: "failure" }],
          timeline: pushTimeline(job, "testing", d.ok ? "dispatch_workflow" : d.error),
          ...(d.ok ? {} : { errorMessage: d.error }),
        }))!;
        emit("ci", { dispatched: d.ok, error: d.ok ? undefined : d.error });
      } else if (job.tier === "tested") {
        job = (await updateForgeJob(params.orgId, job._id, {
          status: "pr_opened",
          timeline: pushTimeline(job, "testing", "skipped_no_github"),
        }))!;
      } else if (job.tier === "autonomous") {
        job = (await updateForgeJob(params.orgId, job._id, {
          status: "testing",
          timeline: pushTimeline(job, "autonomous", "enter_loop"),
        }))!;
      } else {
        job = (await updateForgeJob(params.orgId, job._id, { status: "pr_opened" }))!;
      }
    }

    /** --- testing / autonomous --- */
    job = (await getForgeJob(params.orgId, params.jobId))!;
    if (!job) return;

    if (job.status === "testing" && job.tier === "autonomous") {
      await runAutonomousLoop({
        orgId: params.orgId,
        jobId: job._id,
        org: params.org,
        emit,
      });
      job = (await getForgeJob(params.orgId, params.jobId))!;
    }

    if (job.status === "testing" && job.tier === "tested") {
      job = (await updateForgeJob(params.orgId, job._id, {
        status: "pr_opened",
        timeline: pushTimeline(job, "testing", "completed_assumed"),
      }))!;
    }

    /** --- PR --- */
    job = (await getForgeJob(params.orgId, params.jobId))!;
    if (!job) return;

    if (job.status === "pr_opened" && !job.prUrl) {
      const title = `[flux-forge] ${job.cardIds[0] ?? job._id}`;
      const body = `Automated draft from Flux Forge.\n\nJob: \`${job._id}\`\n\n<details><summary>Plan</summary>\n\n${job.planMarkdown ?? ""}\n\n</details>`;
      if (octoCtx && parsedRepo && job.branchForge) {
        const pr = await createDraftPullRequest({
          octokit: octoCtx.octokit,
          owner: parsedRepo.owner,
          repo: parsedRepo.repo,
          title,
          head: job.branchForge,
          base: job.branchBase ?? "main",
          body,
        });
        if (pr.ok) {
          await updateForgeJob(params.orgId, job._id, {
            prNumber: pr.number,
            prUrl: pr.url,
            timeline: pushTimeline(job, "pr_opened", pr.url),
          });
          emit("pr", { url: pr.url, number: pr.number });
        } else {
          await updateForgeJob(params.orgId, job._id, {
            timeline: pushTimeline(job, "pr_opened", `simulated:${pr.error}`),
            errorMessage: pr.error,
          });
          emit("pr", { simulated: true, error: pr.error });
        }
      } else {
        await updateForgeJob(params.orgId, job._id, {
          timeline: pushTimeline(job, "pr_opened", "simulated_no_github"),
        });
        emit("pr", { simulated: true });
      }
    }

    emit("done", { ok: true });
  } catch (e) {
    await fail(e instanceof Error ? e.message : "pipeline_error");
  }
}

async function runAutonomousLoop(params: {
  orgId: string;
  jobId: string;
  org: Organization | null;
  emit: (event: string, data: Record<string, unknown>) => void;
}): Promise<void> {
  const maxAttempts = Number(process.env.FLUX_FORGE_AUTONOMOUS_MAX_ATTEMPTS ?? "4") || 4;
  let job = await getForgeJob(params.orgId, params.jobId);
  if (!job) return;

  for (let n = 1; n <= maxAttempts; n++) {
    job = (await getForgeJob(params.orgId, params.jobId))!;
    if (!job || job.cancelRequested) return;
    const attempts = [...(job.attempts ?? []), { n, at: new Date().toISOString(), reason: n === 1 ? "start" : "retry" }];
    await updateForgeJob(params.orgId, job._id, { attempts });
    params.emit("autonomous", { attempt: n, max: maxAttempts });

    /* Simplified: re-run diff generation on retry */
    const policy = await loadMergedForgePolicy(params.orgId, job.repoId);
    const diffSys = forgeDiffSystemPrompt(policy?.defaultLanguage);
    const diffUser = `Retry ${n}. Prior output had issues. Plan:\n${job.planMarkdown ?? ""}\n\nRefine unified diff.`;
    const diffLlm = await llmComplete({ org: params.org, system: diffSys, user: diffUser });
    job = (await updateForgeJob(params.orgId, job._id, {
      diffText: diffLlm.text,
      timeline: pushTimeline(job, "autonomous_attempt", `n=${n}`),
    }))!;

    if (n === maxAttempts) break;
  }

  job = (await getForgeJob(params.orgId, params.jobId))!;
  if (job) {
    await updateForgeJob(params.orgId, job._id, {
      status: "pr_opened",
      timeline: pushTimeline(job, "autonomous", "loop_done"),
    });
  }
}
