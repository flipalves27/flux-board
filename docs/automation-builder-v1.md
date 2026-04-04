# Automation Builder v1 (scaffold + execution logs)

This increment delivers a practical scaffold for Automation Builder v1 with execution visibility.

## APIs

- Existing rules API:
  - `GET /api/boards/[id]/automations`
  - `PUT /api/boards/[id]/automations`
- New logs API:
  - `GET /api/boards/[id]/automations/logs`
  - `POST /api/boards/[id]/automations/logs` (manual test execution log)

## Persistence

- Rules: `board_automations` / KV fallback.
- Logs: `board_automation_logs` / KV fallback.

## Runtime logs

Automation engine now appends execution logs for:

- board PUT sync triggers
- form submission triggers
- cron time-based triggers

## UI

- `BoardAutomationsModal` now shows latest execution logs.
- "Testar" action per rule writes a simulated execution log.

## Next increments

- Rich execution details (before/after fields, actor/source metadata).
- Retry/error workflow and failed execution triage.
- Dedicated board automations history panel with filters.

