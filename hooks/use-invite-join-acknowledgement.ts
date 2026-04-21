"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useToast } from "@/context/toast-context";
import { JOINED_VIA_INVITE_QUERY } from "@/lib/invite-join-feedback";

/**
 * Mostra toast de sucesso quando o utilizador entrou via convite e remove o query param da URL.
 * Usa `window.location.search` em vez de `useSearchParams` para não suspender a árvore toda
 * (evita fallback de Suspense dos boards ficar preso).
 */
export function useInviteJoinAcknowledgement() {
  const pathname = usePathname();
  const router = useRouter();
  const { pushToast } = useToast();
  const t = useTranslations("login.inviteJoined");
  const doneRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (doneRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get(JOINED_VIA_INVITE_QUERY) !== "1") return;
    doneRef.current = true;

    pushToast({
      kind: "success",
      title: t("title"),
      description: t("description"),
      durationMs: 9000,
    });

    params.delete(JOINED_VIA_INVITE_QUERY);
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [pathname, router, pushToast, t]);
}
