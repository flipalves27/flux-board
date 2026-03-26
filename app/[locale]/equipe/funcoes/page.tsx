export default function Page() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-[var(--flux-text)]">Funções da Equipe</h1>
      <ul className="mt-3 list-disc pl-5 text-sm text-[var(--flux-text-muted)]">
        <li>`team_admin`: gerencia equipe e membros.</li>
        <li>`member`: executa trabalho no board.</li>
        <li>`guest`: acesso de leitura.</li>
      </ul>
    </div>
  );
}
