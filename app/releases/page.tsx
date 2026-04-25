"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Header } from "@/components/header";
import { useAuth } from "@/context/auth-context";
import { ReleasesHub } from "@/components/releases/releases-hub";

export default function OrgReleasesPage() {
  const router = useRouter();
  const locale = useLocale();
  const localeRoot = `/${locale}`;
  const { user, getHeaders, isChecked } = useAuth();

  useEffect(() => {
    if (isChecked && !user) {
      router.replace(`${localeRoot}/login`);
    }
  }, [isChecked, user, router, localeRoot]);

  if (!isChecked || !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4 text-sm text-[var(--flux-text-muted)]">
        …
      </div>
    );
  }

  return (
    <>
      <Header />
      <ReleasesHub getHeaders={getHeaders} />
    </>
  );
}
