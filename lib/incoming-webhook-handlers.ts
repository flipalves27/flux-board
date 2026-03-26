export type IncomingWebhookSource = "github" | "gitlab" | "jira" | "generic";

export type WebhookCardAction = {
  action: "create" | "move" | "comment";
  title?: string;
  description?: string;
  targetColumn?: string;
  cardId?: string;
  comment?: string;
  tags?: string[];
  priority?: string;
  externalRef?: string;
};

type GitHubPayload = Record<string, unknown>;
type GitLabPayload = Record<string, unknown>;
type JiraPayload = Record<string, unknown>;

export function detectWebhookSource(headers: Record<string, string>, body: Record<string, unknown>): IncomingWebhookSource {
  if (headers["x-github-event"]) return "github";
  if (headers["x-gitlab-event"]) return "gitlab";
  if (body.webhookEvent && typeof body.webhookEvent === "string" && body.webhookEvent.startsWith("jira:")) return "jira";
  return "generic";
}

export function parseGitHubWebhook(event: string, payload: GitHubPayload): WebhookCardAction | null {
  if (event === "issues" && payload.action === "opened") {
    const issue = payload.issue as Record<string, unknown> | undefined;
    if (!issue) return null;
    return {
      action: "create",
      title: `[GitHub] ${String(issue.title || "")}`,
      description: String(issue.body || "").slice(0, 2000),
      tags: ["github", "issue"],
      priority: "Média",
      externalRef: String(issue.html_url || ""),
    };
  }
  if (event === "pull_request" && payload.action === "opened") {
    const pr = payload.pull_request as Record<string, unknown> | undefined;
    if (!pr) return null;
    return {
      action: "create",
      title: `[GitHub PR] ${String(pr.title || "")}`,
      description: String(pr.body || "").slice(0, 2000),
      tags: ["github", "pr"],
      priority: "Média",
      externalRef: String(pr.html_url || ""),
    };
  }
  if (event === "issue_comment") {
    const comment = payload.comment as Record<string, unknown> | undefined;
    const issue = payload.issue as Record<string, unknown> | undefined;
    if (!comment || !issue) return null;
    return {
      action: "comment",
      comment: `[GitHub] ${String(comment.body || "").slice(0, 1000)}`,
      externalRef: String(issue.html_url || ""),
    };
  }
  return null;
}

export function parseGitLabWebhook(event: string, payload: GitLabPayload): WebhookCardAction | null {
  const attrs = payload.object_attributes as Record<string, unknown> | undefined;
  if (event === "Issue Hook" && attrs) {
    return {
      action: "create",
      title: `[GitLab] ${String(attrs.title || "")}`,
      description: String(attrs.description || "").slice(0, 2000),
      tags: ["gitlab", "issue"],
      priority: "Média",
      externalRef: String(attrs.url || ""),
    };
  }
  if (event === "Merge Request Hook" && attrs) {
    return {
      action: "create",
      title: `[GitLab MR] ${String(attrs.title || "")}`,
      description: String(attrs.description || "").slice(0, 2000),
      tags: ["gitlab", "mr"],
      priority: "Média",
      externalRef: String(attrs.url || ""),
    };
  }
  return null;
}

export function parseJiraWebhook(payload: JiraPayload): WebhookCardAction | null {
  const event = String(payload.webhookEvent || "");
  const issue = payload.issue as Record<string, unknown> | undefined;
  const fields = issue?.fields as Record<string, unknown> | undefined;

  if (event.includes("issue_created") && fields) {
    return {
      action: "create",
      title: `[Jira] ${String(fields.summary || "")}`,
      description: String(fields.description || "").slice(0, 2000),
      tags: ["jira"],
      priority: "Média",
      externalRef: String(issue?.self || ""),
    };
  }
  return null;
}

export function parseGenericWebhook(body: Record<string, unknown>): WebhookCardAction | null {
  if (typeof body.title === "string") {
    return {
      action: (body.action as string) || "create",
      title: String(body.title).slice(0, 300),
      description: typeof body.description === "string" ? body.description.slice(0, 2000) : undefined,
      targetColumn: typeof body.targetColumn === "string" ? body.targetColumn : undefined,
      tags: Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === "string").slice(0, 8) : undefined,
      priority: typeof body.priority === "string" ? body.priority : undefined,
      externalRef: typeof body.externalRef === "string" ? body.externalRef : undefined,
    };
  }
  return null;
}

export function routeIncomingWebhook(
  source: IncomingWebhookSource,
  headers: Record<string, string>,
  body: Record<string, unknown>
): WebhookCardAction | null {
  switch (source) {
    case "github":
      return parseGitHubWebhook(headers["x-github-event"] ?? "", body);
    case "gitlab":
      return parseGitLabWebhook(headers["x-gitlab-event"] ?? "", body);
    case "jira":
      return parseJiraWebhook(body);
    case "generic":
      return parseGenericWebhook(body);
    default:
      return null;
  }
}
