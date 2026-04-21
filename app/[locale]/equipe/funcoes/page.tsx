"use client";

import { useLocale } from "next-intl";
import { Header } from "@/components/header";
import { TeamWorkspacePanel } from "@/components/team/team-workspace-panel";

export default function Page() {
  const locale = useLocale();
  const localeRoot = `/${locale}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Header title="Equipe — Funções" backHref={`${localeRoot}/boards`} backLabel="← Boards" />
      <TeamWorkspacePanel>
        <h1 className="font-display text-lg font-semibold text-[var(--flux-text)]">Funções da equipe</h1>
        <p className="mt-1 text-xs text-[var(--flux-text-muted)]">Papéis usados nos vínculos de membros (organização ou board).</p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-[var(--flux-text-muted)]">
          <li>
            <strong className="text-[var(--flux-text)]">Gestor</strong> — gerencia vínculos e níveis no contexto Equipe.
          </li>
          <li>
            <strong className="text-[var(--flux-text)]">Membro</strong> — executa trabalho no board.
          </li>
          <li>
            <strong className="text-[var(--flux-text)]">Convidado</strong> — acesso de leitura.
          </li>
        </ul>
      </TeamWorkspacePanel>
    </div>
  );
}
