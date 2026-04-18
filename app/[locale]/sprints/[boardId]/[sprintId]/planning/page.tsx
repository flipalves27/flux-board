"use client";

import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Header } from "@/components/header";
import { useAuth } from "@/context/auth-context";
import { FluxSurface } from "@/components/ui/flux-surface";
import Link from "next/link";

export default function SprintPlanningAssistPage() {
  const params = useParams();
  const locale = useLocale();
  const localeRoot = `/${locale}`;
  const t = useTranslations("navigation");
  const { user, isChecked } = useAuth();
  const boardId = Array.isArray(params.boardId) ? params.boardId[0] ?? "" : (params.boardId as string);
  const sprintId = Array.isArray(params.sprintId) ? params.sprintId[0] ?? "" : (params.sprintId as string);

  if (!isChecked || !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--flux-text-muted)]">
        …
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header title="Planning assistido" backHref={`${localeRoot}/sprints/${boardId}/${sprintId}`} backLabel="← Sprint" />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-4 px-4 py-6">
        <p className="text-xs text-[var(--flux-text-muted)]">
          {t("sprints")} · board <span className="font-mono text-[var(--flux-text)]">{boardId}</span> · sprint{" "}
          <span className="font-mono text-[var(--flux-text)]">{sprintId}</span>
        </p>
        <FluxSurface tier={2} className="p-5">
          <h2 className="font-display text-lg font-semibold text-[var(--flux-text)]">Cenários de capacidade</h2>
          <p className="mt-2 text-sm text-[var(--flux-text-muted)] leading-relaxed">
            Arraste itens sugeridos e confirme antes de aplicar em massa. Integração com previsão de entrega e OKRs será
            refinada nas próximas iterações.
          </p>
          <div className="mt-4 flex gap-2">
            <Link href={`${localeRoot}/sprints/${boardId}/${sprintId}`} className="btn-secondary px-3 py-1.5 text-xs">
              Voltar ao sprint
            </Link>
          </div>
        </FluxSurface>
      </main>
    </div>
  );
}
