"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";

const IDEIAS = [
  {
    titulo: "Flux Analytics & comitês",
    pitch:
      "O dashboard de portfólio e o brief executivo em Markdown transformam o Kanban em narrativa para C-level e comitês de priorização — pacote vendável como add-on ou tier Pro.",
    implementado: ["Dashboard na lista de boards", "GET /api/executive-brief", "Exportação Markdown na UI"],
  },
  {
    titulo: "Integrações e data products",
    pitch:
      "JSON estável do portfólio (métricas por board) alimenta BI, n8n, warehouse ou cobrança por uso — contrato de API versionado com autenticação JWT existente.",
    implementado: ["GET /api/portfolio-export (schema flux-board.portfolio.v1)"],
  },
  {
    titulo: "B2B / consultorias por cliente",
    pitch:
      "Campo “Cliente / conta” por board permite faturamento por conta, relatórios white-label e separação comercial sem multi-tenant completo.",
    implementado: ["Campo clientLabel persistido no board", "Exibição na lista e no cabeçalho do quadro"],
  },
  {
    titulo: "Freemium com teto de boards",
    pitch:
      "Limite configurável por ambiente cria gatilho natural de upgrade; tenant “Pro” ignora o teto via variável de ambiente.",
    implementado: ["FLUX_MAX_BOARDS_PER_USER + FLUX_PRO_TENANT", "Banner na lista quando no limite"],
  },
  {
    titulo: "IA operacional no board",
    pitch:
      "Daily insights e copiloto no quadro sustentam ofertas de “copiloto de backlog” e POCs pagas com escopo fechado.",
    implementado: ["Insights diários no board", "Copilot contextual por board"],
  },
];

const PLANO_IA = [
  {
    fase: "0-30 dias",
    foco: "Confiança e adoção",
    entregas: [
      "Copilot e command palette com mensagens unificadas de plano/trial e limites.",
      "Explicabilidade no Flux Forms: mostrar racional de classificação e quando houve mesclagem por duplicata.",
      "Medição: taxa de uso de IA por board e taxa de conclusão após sugestão.",
    ],
  },
  {
    fase: "31-60 dias",
    foco: "Produtividade operacional",
    entregas: [
      "Digest executivo multicanal (e-mail/Slack) com links diretos para ações no board.",
      "Sugestões de próxima ação por card com base em atraso, WIP e risco.",
      "Medição: redução de cards parados por mais de 5 dias.",
    ],
  },
  {
    fase: "61-90 dias",
    foco: "Diferencial de mercado",
    entregas: [
      "Copilot em modo comercial (priorização por valor/risco e cliente).",
      "NLQ unificado entre palette e Copilot com comandos consistentes.",
      "Medição: tempo até primeira decisão executiva (brief + ação no board).",
    ],
  },
];

export default function NegociosPage() {
  const router = useRouter();
  const { user, isChecked } = useAuth();

  useEffect(() => {
    if (!isChecked) return;
    if (!user) router.replace("/login");
  }, [isChecked, user, router]);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[var(--flux-surface-dark)]">
      <Header title="Estratégia de negócios do produto" backHref="/boards" backLabel="← Boards" />
      <main className="max-w-[900px] mx-auto px-6 py-8 space-y-8">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--flux-secondary)]">Produto</p>
          <h2 className="font-display text-2xl font-bold text-[var(--flux-text)]">
            Tese comercial e de inovação do Flux-Board
          </h2>
          <p className="text-sm text-[var(--flux-text-muted)] leading-relaxed max-w-2xl">
            Cada ideia abaixo aponta para um problema que compradores corporativos já reconhecem: visibilidade executiva,
            integração com dados, organização por cliente, monetização por escala e aceleração com IA.
          </p>
        </header>

        <section className="rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-22)] bg-[var(--flux-surface-card)] p-5 space-y-4">
          <h3 className="font-display text-sm font-bold text-[var(--flux-text)]">Ações rápidas</h3>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/boards"
              className="rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-10)] px-3 py-2 text-xs font-semibold text-[var(--flux-primary-light)] hover:border-[var(--flux-primary)]"
            >
              Ver portfólio e exportar brief
            </Link>
            <Link
              href="/reports"
              className="rounded-[var(--flux-rad)] border border-[var(--flux-secondary-alpha-35)] bg-[var(--flux-secondary-alpha-08)] px-3 py-2 text-xs font-semibold text-[var(--flux-secondary)] hover:border-[var(--flux-secondary)]"
            >
              Relatórios
            </Link>
          </div>
        </section>

        <div className="space-y-5">
          {IDEIAS.map((item, i) => (
            <article
              key={item.titulo}
              className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-card)] p-5"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-primary-light)]">
                Ideia {i + 1}
              </p>
              <h3 className="mt-1 font-display text-lg font-bold text-[var(--flux-text)]">{item.titulo}</h3>
              <p className="mt-2 text-sm text-[var(--flux-text-muted)] leading-relaxed">{item.pitch}</p>
              <ul className="mt-4 space-y-1.5 text-xs text-[var(--flux-text)]">
                {item.implementado.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className="text-[var(--flux-success)] shrink-0">✓</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <section className="rounded-[var(--flux-rad)] border border-[var(--flux-secondary-alpha-30)] bg-[var(--flux-surface-card)] p-5">
          <h3 className="font-display text-sm font-bold text-[var(--flux-text)]">Plano de inovação com IA (90 dias)</h3>
          <p className="mt-1 text-xs text-[var(--flux-text-muted)]">
            Sequência pragmática para destacar o produto sem quebrar experiência, orçamento e identidade visual.
          </p>
          <div className="mt-4 grid gap-3">
            {PLANO_IA.map((fase) => (
              <article
                key={fase.fase}
                className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-elevated)] p-4"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-secondary)]">{fase.fase}</p>
                <h4 className="mt-1 text-sm font-semibold text-[var(--flux-text)]">{fase.foco}</h4>
                <ul className="mt-2 space-y-1.5 text-xs text-[var(--flux-text-muted)]">
                  {fase.entregas.map((entrega) => (
                    <li key={entrega} className="flex gap-2">
                      <span className="text-[var(--flux-secondary)]">•</span>
                      <span>{entrega}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
