"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Header } from "@/components/header";
import { useAuth } from "@/context/auth-context";
import { useOrgFeaturesOptional } from "@/hooks/use-org-features";
import { DocsHealthPanel } from "@/components/docs/docs-health-panel";
import { DocsSidebarTree } from "@/components/docs/docs-sidebar-tree";
import { DocsSearch } from "@/components/docs/docs-search";
import { DocsEditor } from "@/components/docs/docs-editor";
import { DocsGenerationPanel } from "@/components/docs/docs-generation-panel";
import { DocsContextPanel } from "@/components/docs/docs-context-panel";
import type { DocData, DocTreeNode } from "@/lib/docs-types";
import { findDocInTree, updateDocInTree } from "@/lib/docs-types";

export default function DocsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const t = useTranslations("docsPage");
  const tSidebar = useTranslations("docsPage.sidebar");
  const localeRoot = `/${locale}`;
  const { user, getHeaders, isChecked } = useAuth();
  const isAdmin = Boolean(user?.isAdmin);
  const orgFeat = useOrgFeaturesOptional();
  const canDocsRag = Boolean(orgFeat?.data?.flux_docs_rag);
  useEffect(() => {
    if (!canDocsRag) setSearchHybrid(false);
  }, [canDocsRag]);
  const [docsTree, setDocsTree] = useState<DocTreeNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchDocType, setSearchDocType] = useState("");
  const [searchResults, setSearchResults] = useState<DocData[]>([]);
  const [searchHybrid, setSearchHybrid] = useState(false);
  const [searchUsedVector, setSearchUsedVector] = useState<boolean | null>(null);
  const [searchEvidence, setSearchEvidence] = useState<Record<string, { chunkId: string; excerpt: string; score: number }>>({});
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<string[]>([]);
  const newDocTriggered = useRef(false);
  const selectedRef = useRef<string | null>(null);
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  const boardIdFromUrl = searchParams.get("boardId");
  const cardIdFromUrl = searchParams.get("cardId");

  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  const replaceQuery = useCallback((mutate: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(searchParamsRef.current.toString());
    mutate(p);
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router]);

  const selectDoc = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      replaceQuery((p) => {
        if (id) p.set("docId", id);
        else p.delete("docId");
      });
    },
    [replaceQuery]
  );

  const loadDocs = useCallback(
    async (opts?: { forceId?: string | null; clear?: boolean }) => {
      const bid = searchParamsRef.current.get("boardId");
      const qs = bid ? `?${new URLSearchParams({ boardId: bid }).toString()}` : "";
      const res = await fetch(`/api/docs${qs}`, { headers: getHeaders() });
      const data = (await res.json().catch(() => ({}))) as { docs?: DocTreeNode[] };
      const tree = Array.isArray(data.docs) ? data.docs : [];
      setDocsTree(tree);
      if (opts?.clear) {
        setSelectedId(null);
        replaceQuery((p) => p.delete("docId"));
        return;
      }
      const urlDoc = searchParamsRef.current.get("docId");
      const prev = selectedRef.current;
      let next: string | null = null;
      if (opts?.forceId && findDocInTree(tree, opts.forceId)) next = opts.forceId;
      else if (urlDoc && findDocInTree(tree, urlDoc)) next = urlDoc;
      else if (prev && findDocInTree(tree, prev)) next = prev;
      else next = tree[0]?.id ?? null;
      setSelectedId(next);
      replaceQuery((p) => {
        if (next) p.set("docId", next);
        else p.delete("docId");
      });
    },
    [getHeaders, replaceQuery]
  );

  useEffect(() => {
    if (!isChecked) return;
    if (!user) {
      router.replace(`${localeRoot}/login`);
      return;
    }
    void loadDocs();
    // Intentionally only when auth gate opens; loadDocs identity stays stable (no searchParams).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChecked, user?.id, localeRoot, router]);

  useEffect(() => {
    const urlDoc = searchParams.get("docId");
    if (!urlDoc || !docsTree.length) return;
    if (findDocInTree(docsTree, urlDoc)) setSelectedId(urlDoc);
  }, [searchParams, docsTree]);

  useEffect(() => {
    if (searchParams.get("newDoc") !== "1" || newDocTriggered.current || !isChecked || !user) return;
    newDocTriggered.current = true;
    void (async () => {
      const b = searchParamsRef.current.get("boardId");
      const res = await fetch("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getHeaders() },
        body: JSON.stringify({ title: t("newDocTitle"), parentId: null, contentMd: "", ...(b ? { boardIds: [b] } : {}) }),
      });
      const data = (await res.json().catch(() => ({}))) as { doc?: DocData };
      replaceQuery((p) => p.delete("newDoc"));
      if (res.ok && data.doc) await loadDocs({ forceId: data.doc.id });
      else newDocTriggered.current = false;
    })();
  }, [searchParams, isChecked, user, getHeaders, t, loadDocs, replaceQuery]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const q = search.trim();
      if (!q) {
        setSearchResults([]);
        setSearchUsedVector(null);
        setSearchEvidence({});
        return;
      }
      const p = new URLSearchParams();
      p.set("q", q);
      const bid = searchParamsRef.current.get("boardId");
      if (bid) p.set("boardId", bid);
      if (searchDocType.trim()) p.set("docType", searchDocType.trim());
      const useHybrid = searchHybrid && canDocsRag;
      if (useHybrid) p.set("hybrid", "1");
      const res = await fetch(`/api/docs/search?${p.toString()}`, { headers: getHeaders() });
      if (!res.ok) {
        setSearchResults([]);
        setSearchUsedVector(null);
        setSearchEvidence({});
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        docs?: DocData[];
        usedVector?: boolean;
        evidence?: Array<{ docId: string; chunkId: string; excerpt: string; score: number }>;
      };
      setSearchResults(Array.isArray(data.docs) ? data.docs : []);
      if (useHybrid) {
        setSearchUsedVector(typeof data.usedVector === "boolean" ? data.usedVector : null);
        const next: typeof searchEvidence = {};
        if (Array.isArray(data.evidence)) {
          for (const e of data.evidence) {
            if (e?.docId) next[e.docId] = { chunkId: e.chunkId, excerpt: e.excerpt, score: e.score };
          }
        }
        setSearchEvidence(next);
      } else {
        setSearchUsedVector(null);
        setSearchEvidence({});
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, getHeaders, searchDocType, searchHybrid, canDocsRag]);

  const bulkSelectedSet = useMemo(() => new Set(bulkSelected), [bulkSelected]);

  const toggleBulk = useCallback((id: string) => {
    setBulkSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const onBulkModeChange = useCallback((next: boolean) => {
    setBulkMode(next);
    if (!next) setBulkSelected([]);
  }, []);

  const onBulkDelete = useCallback(async () => {
    if (bulkSelected.length === 0) return;
    if (typeof window !== "undefined" && !window.confirm(tSidebar("bulkConfirm", { n: bulkSelected.length }))) return;
    const res = await fetch("/api/docs/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getHeaders() },
      body: JSON.stringify({ docIds: bulkSelected }),
    });
    if (!res.ok) return;
    setBulkMode(false);
    setBulkSelected([]);
    await loadDocs();
  }, [bulkSelected, getHeaders, loadDocs, tSidebar]);

  const selectedDoc = useMemo(() => {
    if (!selectedId) return null;
    return findDocInTree(docsTree, selectedId);
  }, [docsTree, selectedId]);

  const createDoc = async (parentId: string | null) => {
    const b = searchParamsRef.current.get("boardId");
    const res = await fetch("/api/docs", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getHeaders() },
      body: JSON.stringify({
        title: t("newDocTitle"),
        parentId,
        contentMd: "",
        ...(b ? { boardIds: [b] } : {}),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { doc?: DocData };
    if (res.ok && data.doc) await loadDocs({ forceId: data.doc.id });
  };

  const reparentDoc = useCallback(
    async (docId: string, newParentId: string | null) => {
      const res = await fetch(`/api/docs/${encodeURIComponent(docId)}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getHeaders() },
        body: JSON.stringify({ parentId: newParentId }),
      });
      if (res.ok) await loadDocs();
    },
    [getHeaders, loadDocs]
  );

  const onDocPatched = useCallback(
    (doc: DocData) => {
      setDocsTree((prev) => updateDocInTree(prev, doc));
    },
    [setDocsTree]
  );

  return (
    <div className="flux-page-contract min-h-screen" data-flux-area="analytics">
      <Header title={t("title")} backHref={`${localeRoot}/boards`} backLabel={t("headerBack")} />
      <div className="flex min-h-[calc(100vh-56px)]">
        <DocsSidebarTree
          docs={docsTree}
          selectedId={selectedId}
          onSelect={(id) => selectDoc(id)}
          onCreate={createDoc}
          onReparent={reparentDoc}
          isAdmin={isAdmin}
          bulkMode={bulkMode}
          onBulkModeChange={onBulkModeChange}
          selectedBulkIds={bulkSelectedSet}
          onToggleBulk={toggleBulk}
          onBulkDelete={onBulkDelete}
        />
        <div className="flex min-w-0 flex-1 flex-col lg:flex-row">
          <div className="flex min-w-0 flex-1 flex-col">
            <DocsGenerationPanel
              getHeaders={getHeaders}
              initialBoardId={boardIdFromUrl}
              onDocCreated={(doc) => {
                void loadDocs({ forceId: doc.id });
              }}
            />
            <DocsHealthPanel
              getHeaders={getHeaders}
              onSelectDoc={(id) => {
                selectDoc(id);
                setBulkMode(false);
                setBulkSelected([]);
              }}
            />
            <DocsSearch
              query={search}
              onQueryChange={setSearch}
              docTypeFilter={searchDocType}
              onDocTypeFilterChange={setSearchDocType}
              results={searchResults}
              onSelect={(id) => selectDoc(id)}
              hybridEnabled={searchHybrid}
              onHybridChange={setSearchHybrid}
              showHybridToggle={canDocsRag}
              usedVector={searchUsedVector}
              evidenceByDocId={searchEvidence}
            />
            <DocsEditor
              doc={selectedDoc}
              getHeaders={getHeaders}
              onSaved={(doc) => {
                setDocsTree((prev) => updateDocInTree(prev, doc));
              }}
              onDelete={async (docId) => {
                await fetch(`/api/docs/${encodeURIComponent(docId)}`, { method: "DELETE", headers: getHeaders() });
                await loadDocs({ clear: true });
              }}
            />
          </div>
          <DocsContextPanel
            docId={selectedId}
            boardIdFromUrl={boardIdFromUrl}
            cardIdFromUrl={cardIdFromUrl}
            selectedDoc={selectedDoc}
            getHeaders={getHeaders}
            onDocPatched={onDocPatched}
            onAfterMutation={() => void loadDocs()}
            onGeneratedDoc={(d) => void loadDocs({ forceId: d.id })}
          />
        </div>
      </div>
    </div>
  );
}
