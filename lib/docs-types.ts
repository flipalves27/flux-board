export type DocBacklink = {
  boardId: string;
  boardName: string;
  cardId: string;
  cardTitle: string;
};

export type DocRef = {
  docId: string;
  title?: string;
  excerpt?: string;
};

export const DOC_TYPES = ["general", "briefing", "minutes", "decision", "prd", "retro"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export type DocData = {
  id: string;
  orgId: string;
  title: string;
  slug: string;
  parentId: string | null;
  contentMd: string;
  excerpt: string;
  tags: string[];
  /** Board IDs for semantic scope / search boost (e.g. primary boards for this document). */
  boardIds: string[];
  projectId: string | null;
  docType: DocType;
  ownerUserId: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
};

export type DocTreeNode = DocData & { children: DocTreeNode[] };

export function flattenDocTree(nodes: DocTreeNode[]): DocData[] {
  const out: DocData[] = [];
  const walk = (list: DocTreeNode[]) => {
    for (const n of list) {
      out.push(n);
      if (n.children.length) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

export function findDocInTree(nodes: DocTreeNode[], id: string): DocData | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findDocInTree(n.children, id);
    if (found) return found;
  }
  return null;
}

export function updateDocInTree(nodes: DocTreeNode[], doc: DocData): DocTreeNode[] {
  return nodes.map((n) => {
    if (n.id === doc.id) return { ...n, ...doc, children: n.children };
    if (n.children.length) return { ...n, children: updateDocInTree(n.children, doc) };
    return n;
  });
}

export function normalizeDocData(raw: Record<string, unknown> & { id: string; orgId: string }): DocData {
  const o = raw;
  const b = o.boardIds;
  const boardIds = uniqueStrArray(Array.isArray(b) ? b : []);
  const pid = o.projectId;
  const projectId = pid != null && String(pid).trim() ? String(pid).trim() : null;
  const dt = String(o.docType || "general");
  const docType: DocType = (DOC_TYPES as readonly string[]).includes(dt) ? (dt as DocType) : "general";
  const ow = o.ownerUserId;
  const ownerUserId = ow != null && String(ow).trim() ? String(ow).trim() : null;
  const tagsRaw = o.tags;
  const tags = Array.isArray(tagsRaw) ? tagsRaw.map((t) => String(t || "").trim()).filter(Boolean) : [];
  return {
    id: String(o.id),
    orgId: String(o.orgId),
    title: String(o.title || "Untitled").trim() || "Untitled",
    slug: String(o.slug || "untitled-doc"),
    parentId: o.parentId == null || o.parentId === undefined ? null : String(o.parentId),
    contentMd: String(o.contentMd ?? ""),
    excerpt: String(o.excerpt ?? ""),
    tags,
    boardIds,
    projectId,
    docType,
    ownerUserId,
    createdAt: String(o.createdAt ?? new Date().toISOString()),
    updatedAt: String(o.updatedAt ?? o.createdAt ?? new Date().toISOString()),
    archivedAt: o.archivedAt == null ? null : String(o.archivedAt),
  };
}

function uniqueStrArray(a: unknown[]): string[] {
  return [...new Set(a.map((x) => String(x).trim()).filter(Boolean))];
}

export function findNodeInTree(nodes: DocTreeNode[], id: string): DocTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const c = findNodeInTree(n.children, id);
    if (c) return c;
  }
  return null;
}

export function getDescendantIdsFromDocTree(roots: DocTreeNode[], dragId: string): string[] {
  const self = findNodeInTree(roots, dragId);
  if (!self) return [];
  const acc: string[] = [];
  (function w(x: DocTreeNode) {
    for (const c of x.children) {
      acc.push(c.id);
      w(c);
    }
  })(self);
  return acc;
}

function subtreeMatchesBoard(n: DocTreeNode, boardId: string): boolean {
  if (n.boardIds?.includes(boardId)) return true;
  return n.children.some((c) => subtreeMatchesBoard(c, boardId));
}

export function sortTreeByRelevantBoard(nodes: DocTreeNode[], boardId: string | null): DocTreeNode[] {
  if (!boardId) return nodes;
  return [...nodes]
    .sort((a, b) => {
      const ma = subtreeMatchesBoard(a, boardId) ? 1 : 0;
      const mb = subtreeMatchesBoard(b, boardId) ? 1 : 0;
      if (ma !== mb) return mb - ma;
      return 0;
    })
    .map((n) => ({ ...n, children: sortTreeByRelevantBoard(n.children, boardId) }));
}
