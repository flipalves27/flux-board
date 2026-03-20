export type DocRef = {
  docId: string;
  title?: string;
  excerpt?: string;
};

export type DocData = {
  id: string;
  orgId: string;
  title: string;
  slug: string;
  parentId: string | null;
  contentMd: string;
  excerpt: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
};

export type DocTreeNode = DocData & { children: DocData[] };
