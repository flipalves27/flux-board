/** `always`: `/` redireciona para `/pt-BR/…` (1×); ver DevTools. Sem redirect → `as-needed` + alinhar `href` em toda a app. */
export const routing = {
  locales: ["pt-BR", "en"] as const,
  defaultLocale: "pt-BR" as const,
  localePrefix: "always" as const,
};

