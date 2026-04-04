"use client";

/**
 * Contexto do cliente para anexar a cada evento de diagnóstico (sem hooks).
 */
export function readDiagClientContext(): {
  href: string;
  route: string;
  locale: string;
  userAgent: string;
} {
  if (typeof window === "undefined") {
    return { href: "", route: "", locale: "", userAgent: "" };
  }
  const href = window.location.href;
  const path = window.location.pathname + window.location.search;
  const parts = path.replace(/^\/+/, "").split("/");
  const maybeLocale = parts[0];
  const locale =
    maybeLocale === "en" || maybeLocale === "pt-BR" ? maybeLocale : "";
  return {
    href,
    route: path,
    locale,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 240) : "",
  };
}

/** Versão exposta no build (defina NEXT_PUBLIC_APP_VERSION no CI). */
export function readAppVersion(): string {
  return (process.env.NEXT_PUBLIC_APP_VERSION || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "dev").toString().slice(0, 40);
}
