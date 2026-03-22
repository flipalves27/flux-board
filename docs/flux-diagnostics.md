# Diagnóstico Flux (`fluxDebug`)

Objetivo: capturar **React #185** e outros erros em produção com **stack** e **componentStack** acessíveis sem depender só do console minificado.

## Ativar o painel (fácil acesso)

1. **Query string (recomendado)**  
   Abra qualquer URL com `?fluxDebug=1`, por exemplo:  
   `https://seu-app.vercel.app/pt-BR/board/SEU_ID?fluxDebug=1`  
   Isso grava `sessionStorage` e mostra o botão flutuante **Diagnóstico** (canto inferior esquerdo).

2. **Persistir entre sessões**  
   No DevTools → Console:
   ```js
   localStorage.setItem("fluxDiag", "1");
   location.reload();
   ```

## Copiar logs

- **Painel**: botões **Copiar** / **Limpar**.
- **Tela de erro** (Error Boundary): **Copiar diagnóstico** (inclui URL, user-agent e buffer).
- **Console global**:
  ```js
  JSON.stringify(window.__FLUX_DIAG__.dump(), null, 2)
  ```

## O que é registrado

| Origem              | Quando |
|---------------------|--------|
| `react-boundary`    | Erro capturado pelo boundary (mensagem, stack, `componentStack`) |
| `window`            | `window.onerror` |
| `unhandledrejection`| Promises rejeitadas |
| `console`           | Só com `fluxDebug` ativo — espelha `console.error` (útil em dev / React) |

## Stack legível em produção

Em `next.config.ts`, `productionBrowserSourceMaps` pode ser ligado com `ENABLE_PROD_BROWSER_SOURCE_MAPS=1` na Vercel (aumenta o tamanho do deploy).

## Validação antes do deploy

```bash
npm run validate:deploy
```

Executa lint, testes Vitest e `next build`.
