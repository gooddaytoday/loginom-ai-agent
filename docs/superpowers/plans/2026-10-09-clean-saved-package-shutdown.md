# Закрытие чистого сохранённого пакета: подплан исправления

> Для исполнителя: работать в текущем worktree последовательно через `$tdd`.
> Это локальное исправление этапов6/8 основной цели, без повторной доработки
> исходного плана по прежнему документу корректировок.

**Goal:** после подтверждённого сохранения штатный shutdown закрывает только
свой чистый пакет и освобождает серверную сессию для следующего клиента.

**Architecture:** повторно использовать native package-cleanup. Product path
получает цель только из runtime save receipts; acceptance-only path сохраняет
строгий контракт. Native/evidence отказ сохраняется, но не пропускает попытку
обычного закрытия MCP/browser. Публичные инструменты/IPC не добавляются.

**Tech Stack:** JavaScript ESM, Node24.19.0, MCP InMemoryTransport, имеющиеся
fixtures внешнего Loginom, installed CLI/Desktop manifests.

**Spec:** [дизайн](../specs/2026-10-09-clean-saved-package-shutdown.md),
read-only review Approved после трёх обязательных уточнений.

## Ограничения

- Только один подтверждённый save path; несколько путей не разрешают угадывание.
- Same document/session/account/native package/prepared tab, modified=false.
- Full unsettled state, clipboard uncertainty и leases проверяются до и внутри gate.
- Не save/discard/cancel, не CloseAllPackages, не RPC-обход native close guard.
- Product не передаёт acceptanceCleanupPackage. Foreign data/profile/server неизменны.
- Frozen baseline/candidate49 не изменяются; новый candidate получает новый каталог.
- Исправление не является доказательством исправления v9 hang. Полная новая A/B90
  требует новых общих conditions и обоих smoke. Stage9 остаётся отложенным.

## Task1 — выполнено: Проверить tab до native закрытия

**Files:** `packages/loginom-runtime/client/lib/package-cleanup.mjs`,
`client/test/package-cleanup.test.mjs`.

- [x] В существующую fixture добавить native tab object и связь prepare receipt
  с exact native package node; внешний DOM остаётся fixture, исполняется реальный
  сериализованный browser body. Добавить один тест:

```js
test('missing prepared tab refuses before native package close', async () => {
  const f = fixture({tab:false});
  const result = await f.run();
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reason, 'TAB_IDENTITY_CHANGED');
  assert.equal(f.events.includes('close'), false);
  assert.equal(f.events.includes('logout'), false);
});
```

- [x] Получить RED через pinned Node из `client/`:
  `node --test --test-name-pattern='missing prepared tab' test/package-cleanup.test.mjs`.
- [x] Перед dirty-state read выбрать receipt того же session с exact
  packageNode и tab; проверить `document.contains(tab)` и tabTid. Повторить
  эту проверку после await server modified read. Использовать одну локальную
  проверку binding дважды; не обходить native ClosePackage.
- [x] GREEN, затем отдельные отрицательные тесты foreign tab/package binding
  и смены tab после server read; весь package-cleanup набор. Коммит.

## Task2 — выполнено: Штатный user-v1 shutdown

**Files:** `client/lib/bridge.mjs`,
`client/test/support/package-cleanup-bridge.mjs`,
`client/test/package-cleanup-bridge.test.mjs`.

- [x] Добавить в имеющийся публичный MCP lifecycle fixture один
  `product-success`: `resultProfile:'user-v1'`, без acceptanceCleanupPackage.
  Через настоящий bridge выполнить prepare/save; close должен получить
  SUCCEEDED native receipt до browser close, repeated close idempotent.
- [x] RED через `node --experimental-test-module-mocks --test
  --test-name-pattern='product-success' test/support/package-cleanup-bridge.mjs`.
- [x] Минимальная реализация: product target выбирается из existing save map
  только при user-v1 и одном пути. Существующая bounded native cleanup
  процедура вызывается при полном idle state до и внутри browser gate.
  Строгий acceptance-only отказ сохраняется; обычный native BLOCKED
  сохраняется в `package_cleanup` и evidence, затем выполняется browser close.
- [x] GREEN. По одному добавить lifecycle тесты retained unsettled без running,
  busy/change внутри gate, no-save, multiple-path и native refusal. Проверить
  отсутствие native действия при отказах и подтверждать только process close.
- [x] Отдельный RED: после save создать directory вместо
  `package-cleanup.json` (реальный EISDIR), close всё равно достигает browser.
  Затем отдельный execution-journal EISDIR. Для product возвращать явный
  BLOCKED/CLEANUP_EVIDENCE_UNCONFIRMED; raw errors не публиковать. GREEN.
- [x] Узкие bridge/native-close suites; upstream suite из `client/` с pinned
  Node. Сохранить commands/counts/exits и обновить owning AGENTS. Коммит.

## Task3: Installed приёмка нового кандидата

- [ ] Собрать полный CLI/Desktop в новые own каталоги по штатным builders;
  manifests/source SHA/resources фиксируют фактический новый snapshot.
- [x] Повторить normal CLI shutdown observation без acceptance-only параметра;
  новый клиент должен открыть exact saved package writable без server reset.
  Native close/logout и process remaining0 требуют отдельных receipts.
- [ ] Полные scenario-modify/create/transitions/cleanup/owner-loss/resume и
  Linux Desktop/CLI gates основной цели. Не переносить старые PASS на новую
  сборку автоматически и не выдавать scripted provider за real-model выбор.
- [ ] Новый общий freeze и оба smoke, затем full90/structure/judge/cold/compare;
  исходный subset15 не переотбирать. Не дополнять incomplete v9.
- [ ] Checkpoint максимум20 строк, source-only/installed ограничения явно;
  удалять лишь свои unused `/tmp` после сохранения и проверки отсутствия процессов.
