import { redirect } from "next/navigation";
import { routing } from "@/i18n";

/**
 * `/` não devia duplicar a landing nem bloquear em leitura Mongo. A home canónica:
 * `/{locale}` (ex. `/pt-BR`), com catálogo resiliente em `app/[locale]/page.tsx`.
 */
export default function RootPathRedirect() {
  redirect(`/${routing.defaultLocale}`);
}
