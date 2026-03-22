# Runbook de segurança — Flux-Board

Procedimentos operacionais para incidentes e rotação de credenciais.

## 1. Suspeita de vazamento de JWT / sessão comprometida

1. Rotacionar **`JWT_SECRET`** no painel do host (Vercel → Environment Variables).
2. Fazer **novo deploy** para aplicar o segredo.
3. **Impacto:** todas as sessões existentes invalidam no próximo refresh ou uso do access token antigo.
4. Opcional: limpar documentos de refresh na coleção usada por `kv-refresh-sessions` se houver necessidade de corte imediato em massa.

## 2. Webhook de organização comprometido

1. Admin da org: **Configurações** → Webhooks → revogar subscription afetada ou regenerar segredo (conforme UI/API disponível).
2. Em **`app/api/org/webhooks`**, o segredo completo só é mostrado na criação; se perdido, criar nova subscription e desativar a antiga.
3. Auditar entregas recentes em `webhook-deliveries` / logs se disponíveis.

## 3. Desligar ou limitar IA por organização

1. **Custo:** definir `AI_ORG_DAILY_USD_CAP=0` globalmente (bloqueia novas chamadas que respeitam o gate) ou ajustar cap numérico em env.
2. **Produto:** features já respeitam `plan-gates`; downgrade de plano no Stripe reduz escopo.
3. **Emergência:** remover temporariamente chaves `ANTHROPIC_API_KEY` / `TOGETHER_API_KEY` no ambiente (afeta todos os tenants).

## 4. Abuso de rota pública (forms, portal, embed)

1. Aumentar limites em [`lib/rate-limit.ts`](../lib/rate-limit.ts) **não** é a primeira resposta — preferir **bloqueio na origem** (IP, país) via Vercel Firewall / WAF se disponível.
2. Desativar form no board (`intakeForm.enabled = false`) ou alterar slug.
3. Regenerar token de portal (`regenerateToken` no patch de portal).

## 5. Cron ou job interno invocado indevidamente

1. Confirmar que **`VERCEL_ENV=production`** exige `x-cron-secret` igual ao segredo configurado ([`lib/cron-secret.ts`](../lib/cron-secret.ts)).
2. Rotacionar segredos específicos: `AUTOMATION_CRON_SECRET`, `ANOMALY_CRON_SECRET`, `WEBHOOK_CRON_SECRET`, `CARD_DEPENDENCY_CRON_SECRET`, `WEEKLY_DIGEST_SECRET`.
3. Nunca reutilizar `JWT_SECRET` como único segredo de cron.

## 6. Dependências vulneráveis

```bash
npm audit
```

Integrar ao pipeline existente: `npm run validate:deploy` pode incluir `npm audit --audit-level=high` conforme política do time.

## 7. Contatos

- Definir canal interno (Slack/PagerDuty) e dono de segurança do produto.
- Stripe: dashboard para disputas e webhooks.

## 8. Pentest leve (desenvolvimento)

```bash
npm run security:audit
```

Executa auditoria de dependências e varreduras estáticas documentadas no script.
