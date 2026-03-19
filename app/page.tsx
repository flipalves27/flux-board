"use client";

import Link from "next/link";
import { useAuth } from "@/context/auth-context";

function FluxLogoIcon({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 44" fill="none" className={className} aria-hidden>
      <path d="M8 32L16 20L24 26L36 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M30 10H36V16" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="20" r="2.5" fill="rgba(253,167,223,0.8)" />
      <circle cx="24" cy="26" r="2.5" fill="rgba(0,210,211,0.8)" />
      <path d="M8 36H36" stroke="rgba(255,255,255,0.3)" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

const features = [
  {
    title: "Kanban visual e dinâmico",
    description:
      "Organize demandas por estágios, mova cartões com praticidade e mantenha todo o time alinhado no mesmo fluxo de entrega.",
  },
  {
    title: "Gestão de prioridade e foco",
    description:
      "Destaque o que gera impacto de negócio e evite gargalos com uma visão clara de backlog, tarefas ativas e próximos passos.",
  },
  {
    title: "Fluxo orientado a resultado",
    description:
      "Transforme planejamento em execução com uma plataforma pensada para equipes comerciais, operacionais e produtos digitais.",
  },
];

const innovations = [
  "Insigths diários e leitura inteligente do progresso por board.",
  "Modelo expansível para rotinas, alertas e automações de acompanhamento.",
  "Base pronta para integrar IA em priorização, sumarização e recomendações.",
];

const practicalItems = [
  "Curva de aprendizado curta para adoção rápida do time.",
  "Ambiente centralizado para reduzir retrabalho e comunicação dispersa.",
  "Experiência limpa, responsiva e alinhada à identidade Flux-Board.",
];

export default function HomePage() {
  const { user } = useAuth();

  return (
    <main className="min-h-screen bg-[var(--flux-surface-dark)] text-[var(--flux-text)]">
      <div className="mx-auto w-full max-w-6xl px-6 py-6 md:px-10">
        <header className="flex items-center justify-between rounded-[var(--flux-rad-xl)] border border-[rgba(108,92,231,0.22)] bg-[var(--flux-surface-card)]/75 px-5 py-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-[10px]"
              style={{
                background: "linear-gradient(135deg, var(--flux-primary), var(--flux-primary-dark))",
                boxShadow: "0 8px 20px rgba(108,92,231,0.35)",
              }}
            >
              <FluxLogoIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="font-display text-base font-bold tracking-tight">Flux-Board</p>
              <p className="text-xs text-[var(--flux-text-muted)]">Organize o fluxo. Entregue o que importa.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <Link href="/boards" className="btn-primary">
                Acessar plataforma
              </Link>
            ) : (
              <Link href="/login" className="btn-primary">
                Login
              </Link>
            )}
          </div>
        </header>

        <section className="relative mt-8 overflow-hidden rounded-[var(--flux-rad-xl)] border border-[rgba(108,92,231,0.2)] bg-[linear-gradient(160deg,rgba(108,92,231,0.2),rgba(45,41,82,0.95))] p-8 md:p-12">
          <div className="absolute right-[-120px] top-[-140px] h-64 w-64 rounded-full bg-[rgba(0,210,211,0.18)] blur-3xl" />
          <div className="absolute bottom-[-100px] left-[-80px] h-56 w-56 rounded-full bg-[rgba(253,167,223,0.14)] blur-3xl" />
          <div className="relative grid gap-8 md:grid-cols-[1.2fr_0.8fr] md:items-center">
            <div>
              <p className="inline-flex rounded-full border border-[rgba(255,255,255,0.18)] bg-[rgba(13,11,26,0.45)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--flux-secondary-light)]">
                Plataforma comercial para operação e crescimento
              </p>
              <h1 className="mt-4 max-w-2xl font-display text-3xl font-bold leading-tight md:text-5xl">
                Centralize tarefas, melhore o ritmo do time e escale entregas com o Flux-Board.
              </h1>
              <p className="mt-4 max-w-xl text-sm text-[var(--flux-text-muted)] md:text-base">
                A single-page oficial apresenta uma solução pronta para uso comercial: gestão visual, priorização inteligente e execução com clareza para
                empresas que precisam de velocidade sem perder organização.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/login" className="btn-primary">
                  Entrar para começar
                </Link>
                <Link href="#funcionalidades" className="btn-secondary">
                  Conhecer funcionalidades
                </Link>
              </div>
            </div>

            <div className="rounded-[var(--flux-rad-lg)] border border-[rgba(255,255,255,0.12)] bg-[rgba(26,23,48,0.8)] p-5 shadow-[var(--shadow-md)]">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--flux-secondary)]">Destaques da solução</p>
              <ul className="mt-3 space-y-3">
                <li className="rounded-[var(--flux-rad)] border border-[rgba(108,92,231,0.3)] bg-[var(--flux-surface-card)] px-3 py-2 text-sm">
                  Visão completa de boards, tarefas e prioridades.
                </li>
                <li className="rounded-[var(--flux-rad)] border border-[rgba(108,92,231,0.3)] bg-[var(--flux-surface-card)] px-3 py-2 text-sm">
                  Colaboração com fluxo organizado e foco em entrega.
                </li>
                <li className="rounded-[var(--flux-rad)] border border-[rgba(108,92,231,0.3)] bg-[var(--flux-surface-card)] px-3 py-2 text-sm">
                  Estrutura ideal para operação diária e expansão futura.
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section id="funcionalidades" className="mt-10">
          <div className="mb-4">
            <h2 className="font-display text-2xl font-bold">Principais funcionalidades</h2>
            <p className="mt-2 text-sm text-[var(--flux-text-muted)]">Tudo o que sua equipe precisa para executar melhor, com clareza e padrão operacional.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {features.map((feature) => (
              <article
                key={feature.title}
                className="rounded-[var(--flux-rad-lg)] border border-[rgba(108,92,231,0.22)] bg-[var(--flux-surface-card)] p-5 shadow-[var(--shadow-md)]"
              >
                <h3 className="font-display text-lg font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm text-[var(--flux-text-muted)]">{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-10 grid gap-4 md:grid-cols-2">
          <article className="rounded-[var(--flux-rad-lg)] border border-[rgba(0,210,211,0.28)] bg-[var(--flux-surface-card)] p-6">
            <h3 className="font-display text-xl font-semibold">Inovacoes possiveis com o Flux-Board</h3>
            <ul className="mt-4 space-y-2 text-sm text-[var(--flux-text-muted)]">
              {innovations.map((item) => (
                <li key={item} className="rounded-[var(--flux-rad-sm)] border border-[rgba(255,255,255,0.09)] px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-[var(--flux-rad-lg)] border border-[rgba(253,167,223,0.28)] bg-[var(--flux-surface-card)] p-6">
            <h3 className="font-display text-xl font-semibold">Praticidade no uso diario</h3>
            <ul className="mt-4 space-y-2 text-sm text-[var(--flux-text-muted)]">
              {practicalItems.map((item) => (
                <li key={item} className="rounded-[var(--flux-rad-sm)] border border-[rgba(255,255,255,0.09)] px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
          </article>
        </section>

        <section className="mt-10 rounded-[var(--flux-rad-xl)] border border-[rgba(108,92,231,0.3)] bg-[var(--flux-surface-card)] p-8 text-center">
          <h2 className="font-display text-2xl font-bold">Pronto para transformar a operacao da sua equipe?</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-[var(--flux-text-muted)]">
            O Flux-Board foi pensado para uso comercial real: simples de adotar, consistente no dia a dia e preparado para evoluir com o crescimento do negocio.
          </p>
          <div className="mt-6 flex justify-center">
            <Link href="/login" className="btn-primary">
              Fazer login e iniciar trabalhos
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
