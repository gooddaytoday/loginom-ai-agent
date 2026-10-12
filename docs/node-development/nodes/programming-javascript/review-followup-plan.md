# Review follow-up implementation plan

**Goal:** Исправить два подтверждённых P2 из review итоговой `node-javascript`
после rebase на `loginom@a3d8e2947`. Объём согласован владельцем 2026-10-12.

**Architecture:** Обычный preview сокращается по окончательной MCP-упаковке.
Source/context сохраняют синхронную доставку и получают внутренний сигнал
операции; отмена завершает подтверждённый cleanup, а неизвестный эффект удерживает
браузер. Публичные схемы и исходные deadlines сохраняются.

**Tech Stack:** ESM, pinned Node24.19.0, Bun1.3.14, MCP SDK1.30.0.

## Constraints and design

- Финальный user-v1 MCP reply <=46000 bytes; не повышать лимит.
- Сокращать только целые строки обычного preview, пересчитывая completeness
  и row/zero/NULL limitations; не менять исходный operation receipt.
- Полные JS schemas/mappings/tables и native exact-table evidence сохранять:
  их oversized delivery остаётся явным отказом.
- `session.read(request, {signal})` проверяет отмену до открытия и на безопасных
  границах. Начатые Setting/Next/read/Close ждут своего подтверждённого ответа;
  AbortSignal не обрывает транспорт мутации и не освобождает gate.
- После known source opening обязательны стабильные source/settings reads и
  единственный owned discard с ACK. Отменённая операция не доставляет source.
- Context закрывает только known-opened port wizard через неотменённый канал,
  затем проверяет исходный полный граф. Unknown open/Close не повторять.
- Registry сохраняет controller и receipts operation ID. Cancel/status/wait
  обслуживают source/context через существующую nodeJobResultSchema;
  состояние cleanup публикуется в progress, без выдуманного node.apply outcome.
- Не расширять deadline, не создавать новый браузер, не сохранять пакет и не
  изменять чужие refs/настройки. Live acceptance и выпуск — отдельные стадии.

## Task 1 — ordinary preview

Files: `client/lib/{user-preview-budget,user-results,node-result-reply}.mjs`,
`client/test/user-preview-budget.test.mjs`.

- [x] RED: existing72x5 fixture, long/escaped/Cyrillic strings через nodeResultReply.
- [x] Add `compactNodeResult(result, {wireSize})`; финальный serializer учитывает
  `content` и `structuredContent`, omission и свежие ограничения.
- [x] GREEN: ordinary preview delivery и прежние JS/native refusals.

## Task 2 — source/context cancellation

Files: `client/lib/javascript-{source-read,source-read-session,context-read,
source-read-registry}.mjs`, `client/lib/{executor,node-api,user-results}.mjs`;
source/context registry, reader и public route tests.

- [x] RED: cancellation до open/при known open/read/Close, context mapping
  observation, lost opening/Close, exact retry и wait cancellation.
- [x] Registry `read(request, {signal})` связывает caller abort с собственным
  controller; `has/status/wait/cancel` обслуживают retained operation ID.
- [x] Runtime передаёт signal в read и routes lifecycle calls к его registry.
- [x] Readers заканчивают только безопасный cleanup; unknown effect остаётся
  unsettled. Cleanup использует исходный owner и deadline.
- [x] GREEN: actual dispatcher/runtime, reader/session и MCP schema validation.

## Task 3 — integration and checkpoint

- [x] Independent review изменённых границ отмены, receipts и preview sizing.
- [x] Full Client suite и Runtime suite из package directories pinned Node.
- [x] Host typecheck и относящиеся к cancellation/deadline проверки.
- [x] Обновить только SHA изменённых migrated files в source-transforms.json;
  исходную attribution и заранее существовавшие несовпадения сохранить.
- [x] `git diff --check`, краткий checkpoint <=20 lines с результатом и пределами.

## Verified result — 2026-10-12

- Source base `9e4a7ea8d1c1376e88efc17688efb5ee594633b2`; Node24.19.0/Bun1.3.14.
- Preview RED:3 new delivery regressions; cancellation RED:6 public runtime cases
  plus direct-reader regressions. All now pass;42 regression/safety cases added.
- Full Client:3751 PASS/10 SKIP/0 FAIL (3761 tests). Afterwards added two real MCP
  interruption cases; the complete10-case public cancellation suite passes.
- Runtime:61 PASS/3 SKIP/0 FAIL. Host `bun typecheck` and read-timeouts PASS.
- Independent cancellation review: no actionable findings;182 targeted tests
  and separate joined-caller cancellation/owned-Close probe PASS.
- `git diff --check` PASS. Updated6 changed migrated-file transforms;5045 active
  records checked,19 unchanged historical mismatches and no new ones.
- No live Loginom, rebuilt CLI or installed Desktop acceptance performed.
- Cancellation cooperates at settled boundaries: in-flight opening/Close is
  awaited under its original deadline; unknown effects keep the browser gate.
