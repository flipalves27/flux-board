/**
 * Enriquecimento de entradas de diagnóstico (hints + links) sem dependência de React.
 * Usado pelo store de flux-diagnostics e pela página admin Tracer.
 */

export type DocLink = { label: string; url: string };

/** Extrai "185" de "Minified React error #185" ou similar. */
export function extractReactErrorCode(message: string): string | null {
  const m = message.match(/(?:React error|error)\s*#(\d+)/i);
  return m ? m[1] : null;
}

function pushUnique(arr: string[], line: string) {
  if (line && !arr.includes(line)) arr.push(line);
}

function pushDoc(links: DocLink[], label: string, url: string) {
  if (!links.some((l) => l.url === url)) links.push({ label, url });
}

/**
 * Gera hints e links de documentação a partir da mensagem/stack (produção minificada).
 */
export function enrichDiagMessage(message: string, stack?: string): { hints: string[]; docLinks: DocLink[] } {
  const hints: string[] = [];
  const docLinks: DocLink[] = [];
  const combined = `${message}\n${stack ?? ""}`;

  const code = extractReactErrorCode(message) ?? extractReactErrorCode(combined);
  if (code) {
    pushDoc(docLinks, `React #${code} (documentação)`, `https://react.dev/errors/${code}`);
  }

  const lower = message.toLowerCase();
  const combinedLower = combined.toLowerCase();

  if (
    code === "418" ||
    combinedLower.includes("hydration") ||
    combinedLower.includes("418") ||
    lower.includes("did not match")
  ) {
    pushUnique(
      hints,
      "Hidratação: o HTML do servidor não bate com o primeiro render no cliente. Evite Date.now()/Math.random()/localStorage no render; valide tema/locale; teste sem extensões do browser."
    );
    pushDoc(docLinks, "React — hidratação", "https://react.dev/reference/react-dom/client/hydrateRoot");
  }

  if (code === "185" || combinedLower.includes("maximum update depth")) {
    pushUnique(
      hints,
      "Profundidade máxima de atualização: loop de setState/useEffect. Revise arrays de dependências, useSprintStore/useStore com seletores estáveis e evite atualizar o pai durante o render do filho."
    );
    pushDoc(docLinks, "React — useEffect", "https://react.dev/reference/react/useEffect");
  }

  if (combinedLower.includes("chunkload") || combinedLower.includes("loading chunk")) {
    pushUnique(hints, "Falha ao carregar chunk JS: deploy novo com cache antigo. Peça hard refresh (Ctrl+Shift+R) ou limpe cache do CDN.");
  }

  if (combinedLower.includes("nonce") || combinedLower.includes("csp")) {
    pushUnique(hints, "Possível interação com CSP/nonce no <head>; o layout já usa suppressHydrationWarning no script de tema se necessário.");
  }

  if (hints.length === 0) {
    pushUnique(
      hints,
      "Reproduza em `next dev` para mensagem completa. Use o componentStack do boundary e a rota abaixo para localizar o módulo."
    );
  }

  pushDoc(docLinks, "React — códigos de erro", "https://react.dev/errors");

  return { hints, docLinks };
}