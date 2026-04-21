# BPMN Semantic Mapping v1

| BPMN type | Categoria | Shape | Icone | Borda | Cor semantica | Label obrigatorio | Fallback |
|---|---|---|---|---|---|---|---|
| `start_event` | Event | Circle | `play` | Solid | `eventStart` | Sim | `generic_task` |
| `intermediate_event` | Event | Circle | `ring` | Double | `eventIntermediate` | Sim | `generic_task` |
| `timer_event` | Event | Circle | `clock` | Double | `eventIntermediate` | Sim | `generic_task` |
| `message_event` | Event | Circle | `mail` | Double | `eventIntermediate` | Sim | `generic_task` |
| `end_event` | Event | Circle | `stop` | Thick | `eventEnd` | Sim | `generic_task` |
| `task` | Task | Rounded Rect | `check` | Solid | `task` | Sim | `generic_task` |
| `user_task` | Task | Rounded Rect | `user` | Solid | `task` | Sim | `generic_task` |
| `service_task` | Task | Rounded Rect | `gear` | Solid | `task` | Sim | `generic_task` |
| `script_task` | Task | Rounded Rect | `code` | Solid | `task` | Sim | `generic_task` |
| `call_activity` | Task | Rounded Rect | `replay` | Double | `task` | Sim | `generic_task` |
| `sub_process` | Task | Rounded Rect | `plus-box` | Solid | `task` | Sim | `generic_task` |
| `exclusive_gateway` | Gateway | Diamond | `x` | Solid | `gateway` | Sim | `generic_task` |
| `parallel_gateway` | Gateway | Diamond | `plus` | Solid | `gateway` | Sim | `generic_task` |
| `inclusive_gateway` | Gateway | Diamond | `circle` | Solid | `gateway` | Sim | `generic_task` |
| `data_object` | Artifact | Document | `file` | Solid | `artifact` | Nao | `generic_task` |

## Regras de prioridade visual
1. Semantica principal pela forma.
2. Subtipo pelo icone interno e estilo de borda.
3. Cor reforca categoria e estado, mas nao substitui forma.

## Regras de fallback
- Tipo desconhecido: renderizar `generic_task`.
- Fallback exige label visivel.
- Em estado `invalid`, priorizar borda de erro mantendo forma original.
