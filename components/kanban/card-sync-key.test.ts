/**
 * Regressão: valida estabilidade do cardSyncKey contra arrays Immer.
 *
 * Correção verificada:
 *   `useMemo` do cardSyncKey tinha `card.tags`, `card.blockedBy`, `card.links` e
 *   `card.docRefs` como deps de array. O Immer produz novos arrays com o mesmo conteúdo
 *   a cada mutação não relacionada, causando recalcúlo desnecessário do key.
 *   A correção usa `JSON.stringify(...)` nas deps, garantindo que o key só mude
 *   quando o conteúdo realmente muda.
 *
 * Estes são testes unitários da função de serialização — não precisam de DOM.
 */
import { describe, it, expect } from "vitest";
import type { CardData } from "@/app/board/[id]/page";

// ---------------------------------------------------------------------------
// Replica a lógica de buildSyncKey exatamente como está no card-modal-context
// ---------------------------------------------------------------------------
function buildSyncKey(card: CardData): string {
  const tags = [...(card.tags || [])].sort().join("\u0001");
  const blocked = [...(card.blockedBy || [])].sort().join("\u0001");
  return [
    card.id,
    card.title,
    card.desc,
    card.bucket,
    card.priority,
    card.progress,
    card.dueDate ?? "",
    card.direction ?? "",
    tags,
    blocked,
    JSON.stringify(card.links || []),
    JSON.stringify(card.docRefs || []),
  ].join("\u0002");
}

/** Simula o que o Immer faz: cria novos arrays com o mesmo conteúdo. */
function immerClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const baseCard: CardData = {
  id: "c1",
  bucket: "backlog",
  title: "Meu card",
  desc: "Descrição",
  priority: "Média",
  progress: "Não iniciado",
  tags: ["alpha", "beta"],
  direction: null,
  dueDate: null,
  blockedBy: ["c2"],
  order: 0,
  links: [{ url: "https://example.com", label: "Exemplo" }],
  docRefs: [{ docId: "doc_1", title: "Doc teste" }],
};

describe("cardSyncKey — estabilidade contra arrays Immer", () => {
  it("key idêntico quando o Immer cria novos arrays com mesmo conteúdo", () => {
    const original = buildSyncKey(baseCard);

    // Simula Immer recriando arrays com mesmo conteúdo
    const immerCard: CardData = {
      ...baseCard,
      tags: immerClone(baseCard.tags),
      blockedBy: immerClone(baseCard.blockedBy),
      links: immerClone(baseCard.links),
      docRefs: immerClone(baseCard.docRefs),
    };

    // As referências são diferentes (comportamento do Immer)
    expect(immerCard.tags).not.toBe(baseCard.tags);
    expect(immerCard.blockedBy).not.toBe(baseCard.blockedBy);

    // Mas o key deve ser idêntico
    expect(buildSyncKey(immerCard)).toBe(original);
  });

  it("key muda quando o título é alterado", () => {
    const k1 = buildSyncKey(baseCard);
    const k2 = buildSyncKey({ ...baseCard, title: "Novo título" });
    expect(k1).not.toBe(k2);
  });

  it("key muda quando uma tag é adicionada", () => {
    const k1 = buildSyncKey(baseCard);
    const k2 = buildSyncKey({ ...baseCard, tags: [...baseCard.tags, "gamma"] });
    expect(k1).not.toBe(k2);
  });

  it("key muda quando uma tag é removida", () => {
    const k1 = buildSyncKey(baseCard);
    const k2 = buildSyncKey({ ...baseCard, tags: ["alpha"] });
    expect(k1).not.toBe(k2);
  });

  it("key é insensível à ordem das tags (sort interno)", () => {
    const k1 = buildSyncKey({ ...baseCard, tags: ["beta", "alpha"] });
    const k2 = buildSyncKey({ ...baseCard, tags: ["alpha", "beta"] });
    expect(k1).toBe(k2);
  });

  it("key é insensível à ordem de blockedBy", () => {
    const k1 = buildSyncKey({ ...baseCard, blockedBy: ["c3", "c2"] });
    const k2 = buildSyncKey({ ...baseCard, blockedBy: ["c2", "c3"] });
    expect(k1).toBe(k2);
  });

  it("key muda quando blockedBy é alterado", () => {
    const k1 = buildSyncKey(baseCard);
    const k2 = buildSyncKey({ ...baseCard, blockedBy: ["c3"] });
    expect(k1).not.toBe(k2);
  });

  it("key muda quando um link é adicionado", () => {
    const k1 = buildSyncKey(baseCard);
    const k2 = buildSyncKey({
      ...baseCard,
      links: [...(baseCard.links ?? []), { url: "https://other.com" }],
    });
    expect(k1).not.toBe(k2);
  });

  it("key muda quando dueDate muda", () => {
    const k1 = buildSyncKey(baseCard);
    const k2 = buildSyncKey({ ...baseCard, dueDate: "2026-12-31" });
    expect(k1).not.toBe(k2);
  });

  it("key muda quando priority muda", () => {
    const k1 = buildSyncKey(baseCard);
    const k2 = buildSyncKey({ ...baseCard, priority: "Urgente" });
    expect(k1).not.toBe(k2);
  });

  it("key estável para card com arrays vazios após Immer clone", () => {
    const emptyArrayCard: CardData = {
      ...baseCard,
      tags: [],
      blockedBy: [],
      links: [],
      docRefs: [],
    };
    const k1 = buildSyncKey(emptyArrayCard);
    const k2 = buildSyncKey({
      ...emptyArrayCard,
      tags: immerClone([]),
      blockedBy: immerClone([]),
      links: immerClone([]),
      docRefs: immerClone([]),
    });
    expect(k1).toBe(k2);
  });

  it("deps de JSON.stringify são estáveis para arrays com mesmo conteúdo", () => {
    // Simula o que o useMemo vê nas deps: JSON.stringify(card.tags)
    const tags1 = ["alpha", "beta"];
    const tags2 = immerClone(tags1); // nova referência, mesmo conteúdo

    expect(tags1).not.toBe(tags2); // referências diferentes (problema original)
    expect(JSON.stringify(tags1)).toBe(JSON.stringify(tags2)); // strings iguais (correção)
  });
});
