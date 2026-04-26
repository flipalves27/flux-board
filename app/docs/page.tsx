"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Header } from "@/components/header";
import { useAuth } from "@/context/auth-context";
import { DocsSidebarTree } from "@/components/docs/docs-sidebar-tree";
import { DocsSearch } from "@/components/docs/docs-search";
import { DocsEditor } from "@/components/docs/docs-editor";
import { DocsGenerationPanel } from "@/components/docs/docs-generation-panel";
import type { DocData, DocTreeNode } from "@/lib/docs-types";

export default function DocsPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("docsPage");
  const localeRoot = `/${locale}`;
  const { user, getHeaders, isChecked } = useAuth();
  const [docsTree, setDocsTree] = useState<DocTreeNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<DocData[]>([]);

  const loadDocs = useCallback(async () => {
    const res = await fetch("/api/docs", { headers: getHeaders() });
    const data = (await res.json().catch(() => ({}))) as { docs?: DocTreeNode[] };
    setDocsTree(Array.isArray(data.docs) ? data.docs : []);
    if (!selectedId && Array.isArray(data.docs) && data.docs[0]) {
      setSelectedId(data.docs[0].id);
    }
  }, [getHeaders, selectedId]);

  useEffect(() => {
    if (!isChecked) return;
    if (!user) {
      router.replace(`${localeRoot}/login`);
      return;
    }
    loadDocs();
  }, [isChecked, user, router, loadDocs, localeRoot]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const q = search.trim();
      if (!q) {
        setSearchResults([]);
        return;
      }
      const res = await fetch(`/api/docs/search?q=${encodeURIComponent(q)}`, { headers: getHeaders() });
      const data = (await res.json().catch(() => ({}))) as { docs?: DocData[] };
      setSearchResults(Array.isArray(data.docs) ? data.docs : []);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, getHeaders]);

  const selectedDoc = useMemo(() => {
    const flat: DocData[] = [];
    for (const root of docsTree) {
      flat.push(root);
      flat.push(...root.children);
    }
    return flat.find((d) => d.id === selectedId) ?? null;
  }, [docsTree, selectedId]);

  const createDoc = async (parentId: string | null) => {
    const res = await fetch("/api/docs", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getHeaders() },
      body: JSON.stringify({ title: t("newDocTitle"), parentId, contentMd: "" }),
    });
    const data = (await res.json().catch(() => ({}))) as { doc?: DocData };
    if (res.ok && data.doc) {
      await loadDocs();
      setSelectedId(data.doc.id);
    }
  };

  return (
    <div className="flux-page-contract min-h-screen" data-flux-area="analytics">
      <Header title={t("title")} backHref={`${localeRoot}/boards`} backLabel={t("headerBack")} />
      <div className="flex min-h-[calc(100vh-56px)]">
        <DocsSidebarTree docs={docsTree} selectedId={selectedId} onSelect={setSelectedId} onCreate={createDoc} />
        <div className="flex flex-1 flex-col">
          <DocsGenerationPanel
            getHeaders={getHeaders}
            onDocCreated={(doc) => {
              void loadDocs();
              setSelectedId(doc.id);
            }}
          />
          <DocsSearch query={search} onQueryChange={setSearch} results={searchResults} onSelect={setSelectedId} />
          <DocsEditor
            doc={selectedDoc}
            getHeaders={getHeaders}
            onSaved={(doc) => {
              setDocsTree((prev) =>
                prev.map((r) => (r.id === doc.id ? { ...r, ...doc } : { ...r, children: r.children.map((c) => (c.id === doc.id ? { ...c, ...doc } : c)) }))
              );
            }}
            onDelete={async (docId) => {
              await fetch(`/api/docs/${encodeURIComponent(docId)}`, { method: "DELETE", headers: getHeaders() });
              await loadDocs();
              setSelectedId(null);
            }}
          />
        </div>
      </div>
    </div>
  );
}
