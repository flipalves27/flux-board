"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useToast } from "@/context/toast-context";
import { JOINED_VIA_INVITE_QUERY } from "@/lib/invite-join-feedback";

/**
 * Mostra toast de sucesso quando o utilizador entrou via convite e remove o query param da URL.
 */
export function useInviteJoinAcknowledgement() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { pushToast } = useToast();
  const t = useTranslations("login.inviteJoined");
  const doneRef = useRef(false);

  useEffect(() => {
    if (doneRef.current) return;
    if (searchParams.get(JOINED_VIA_INVITE_QUERY) !== "1") return;
    doneRef.current = true;

    pushToast({
      kind: "success",
      title: t("title"),
      description: t("description"),
      durationMs: 9000,
    });

    const params = new URLSearchParams(searchParams.toString());
    params.delete(JOINED_VIA_INVITE_QUERY);
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [searchParams, pathname, router, pushToast, t]);
}
