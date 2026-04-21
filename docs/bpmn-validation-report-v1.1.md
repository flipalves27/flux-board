# BPMN Visual Validation Report v1.1

## Escopo validado
- Reconhecimento de tipo por forma (evento, atividade, gateway, artefato).
- Distincao entre fluxo de sequencia e associacao.
- Compreensao de estados (`default`, `selected`, `invalid`).

## Metodo rapido de validacao
- 3 cenarios de leitura com mini fluxos.
- 5 participantes internos (produto, design, engenharia).
- Tarefa: identificar tipo do elemento sem legenda externa.

## Resultado consolidado
- Acerto em elementos principais: 94%.
- Maior confusao observada: `intermediate_event` vs `start_event` em zoom baixo.
- Distincao entre fluxo de sequencia e associacao: 100%.

## Ajustes aplicados na v1.1
- Aumentado contraste do anel interno de `intermediate_event`.
- Reforco de espessura para `end_event` em estado `default`.
- Ajuste de hit-area para alvos pequenos em conectores.

## Pendencias para v2
- Expandir cobertura para pool/lane e eventos especiais.
- Testar variacoes de densidade em canvas muito carregado.
- Medir tempo medio de leitura vs baseline historico.
