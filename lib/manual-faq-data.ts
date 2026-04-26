export type ManualFaqItem = { q: string; a: string; topic?: string };

export const MANUAL_FAQ_PT: ManualFaqItem[] = [
  {
    q: "Qual a diferença entre Flux Docs e o manual do produto?",
    a: "Flux Docs é documentação do workspace (da sua org), guardada em armazenamento, com IA e ligação a cards. O manual do produto é a ajuda da plataforma, igual para todas as orgs, para aprender a usar o Flux-Board.",
    topic: "flux-docs-vs-manual",
  },
  {
    q: "O que é o Copilot de board?",
    a: "O Copilot é o assistente contextual num board: resumos, busca e ações. Substitui tarefas operacionais, não a documentação estática; use este manual para conceitos e passos gerais.",
    topic: "copilot-fluxy",
  },
  {
    q: "Onde vejo o que cada plano inclui?",
    a: "Neste manual, abra a secção de planos e a matriz de recursos, derivada do mesmo código de billing e gates do produto.",
    topic: "plans",
  },
];

export const MANUAL_FAQ_EN: ManualFaqItem[] = [
  {
    q: "What is the difference between Flux Docs and the product manual?",
    a: "Flux Docs is workspace knowledge for your org (AI, cards, storage). The product manual is platform help for all customers on how to use Flux-Board.",
    topic: "flux-docs-vs-manual",
  },
  {
    q: "What is the board copilot?",
    a: "The copilot is the in-board assistant: summaries, search, and actions. It does not replace this static manual for learning platform concepts.",
    topic: "copilot-fluxy",
  },
  {
    q: "Where do I see what each plan includes?",
    a: "In this manual, open the plans section with the feature matrix, aligned with the same code used for billing and gating in the app.",
    topic: "plans",
  },
];
