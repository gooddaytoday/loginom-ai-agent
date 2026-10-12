# CP1251 cold owner viewport Implementation Plan

> Исполнитель — назначенный Evaler Rich по прежнему author contract и /tdd.
> Не создавать новый worker при active/queued Rich; native GREEN допускает Evaler.

**Goal:** проверить, восстанавливает ли ширина viewport штатный wizard owner.
**Architecture:** один page.setViewportSize внутри withDiagnosticSession,
до workspace preparation; exact CLI
сам выдаёт все proofs. Нет альтернативного owner detector или fallback.
**Tech Stack:** Node ESM, existing Playwright page, Bun public regression.
**Spec:** ../specs/2026-10-12-text-import-cold-owner-viewport-design.md.

**Files:** modify reader.mjs + provenance.json в evals/script/text-import-cold/;
public test evals/test/text-import-cold-reader.test.ts, без mocks/source assertions.
**Base:** 1cdbc18ad6c87e3f6f584cdb7cfa1c52d4eaed8a; CLI
5cd74d8ee5d6125692d953eb327b4d4f833c27a1 и все остальные pins неизменны.

- [x] Сохранён RED: один begin_wizard, GUID verified, 5 breadcrumbs/owner unobserved.
- [x] Read-only spec review ACCEPT; resize внутри diagnostic callback для cleanup.
- [x] Handoff Evaler 01a130cd-5c11-7aff-a072-583fdbf8113b; body/parent/attachment
  exact readback PASS, follow-up queued, явное ограничение cold бюджета.
- [x] Evaler: worker/receipts/release проверены; автономное native/cold продолжение
  LAB-57 разрешено владельцем 01a130f3-a16d-719a-a3b5-1930817d7cb4 до 22:40:20 UTC.
- [x] Rich: source partial 49522d83318bac29779e497798becb2f799bc84e — внутри callback withDiagnosticSession, перед
  первым bindPrepared/workspace prepare:

```js
await page.setViewportSize({width:1920,height:1080});
```

- [x] Provenance adaptation/current SHA обновлены, все source/original/current hashes проверены.
- [ ] Допустить существующий public test к прежним saved/events CP1251 ref №2;
  GREEN — настоящий owner observed, полный прежний cold checker, cleanup,
  fresh execution/bytes/typed oracle. Не повторять unchanged RED и не делать probe.
- [ ] При GREEN проверить прежние обязательные cold negatives; из evals/:
  bun test test/text-import-cold-reader.test.ts; bun test; bun typecheck.
- [ ] Проверить code diff/provenance hashes, publish clean partial; Evaler независимо
  принимает новый receipt и классифицирует cause по evidence, не по названию плана.
- [ ] Если GREEN не разрешён прежним cold бюджетом или сохраняется ambiguity,
  сохранить конкретное ограничение; новый budget/pin/criteria этим планом не выдаётся.

Авторское source исправление опубликовано и проверено; реальный GREEN ещё
не подтверждён. Поручение владельца LAB57-RICH-AUTONOMY-20261012 сняло прежнее
offline-only для LAB-57: Rich выполняет ремонт/native/cold проверку в одном этапе
до 2026-10-12T22:40:20Z без сброса срока/счётчиков; generation/recovery limits прежние.
Это не меняет инструкции других карточек и не предоставляет мониторингу новый run.
Мониторинг проверил 56 файлов, Git/source/provenance и unit release без native запуска. Полный локальный
cold audit исходной поставки требует абсолютных private native journals сервера;
публичные bytes/typed oracle/model rows проверены, proofs/пути не переписывались.
