# BPMN Design System Guide (Icon-first)

## Contexto
Esta especificacao adapta o BPMN para uma linguagem visual orientada a icones, tomando como referencia a estrutura da imagem-base: eventos circulares, atividades retangulares, gateways em losango e conectores com contraste semantico.

## Foundations visuais
- Formas primarias: `circle`, `rounded-rect`, `diamond`, `document`.
- Hierarquia visual: forma primeiro, icone segundo, cor terceiro.
- Texto sempre obrigatorio para eventos, tarefas e gateways.
- Espacamento base em grade de 8px.

## Tokens publicados
Os tokens oficiais da v1 estao em `docs/bpmn-visual-tokens.json`.

## Biblioteca de icones
O set inicial esta em `public/icons/bpmn/bpmn-icon-sprite.svg` e cobre:
- Evento inicio / intermediario / fim
- Atividade
- Gateway
- Fluxo de sequencia
- Associacao
- Objeto de dados

## Mapeamento semantico
A matriz consolidada fica em `docs/bpmn-semantic-mapping.md`.

## Estados e interacoes
- Estados suportados: `default`, `hover`, `selected`, `dragging`, `invalid`, `connected`, `disabled`.
- Fluxo de sequencia: linha solida + seta.
- Associacao: linha pontilhada sem seta preenchida.
- Para canvas denso: manter hit-area minima de 24px em alvos interativos.

## Boas praticas
- Use a forma correta antes de diferenciar por cor.
- Mantenha labels curtos e orientados a acao.
- Preserve contraste minimo de 4.5:1 para texto e contornos.
- Evite usar apenas cor para comunicar estado critico.

## Anti-padroes
- Usar o mesmo icone para tipos semanticos diferentes.
- Remover label de gateway para "economizar espaco".
- Trocar espessura de borda sem regra de estado.
- Misturar seta de fluxo com associacao pontilhada.

## Criterios de aceite da v1
- Cobertura de 100% dos tipos BPMN suportados pelo editor.
- Especificacao de estado completa para todos os tipos.
- Mapeamento semantico versionado e testado.
- Kit pronto para handoff em design/produto.
