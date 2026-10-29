# Browser recovery failure observation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans after independent plan review. Root owns authorization, review and checkpoints. This document authorizes no native run by itself.

**Goal:** В одной отдельной диагностике получить точный logical sample и ветвь `no_scroll_owner` текущего `findNativeStorageRow`, либо подтверждённый exact-target результат этого reader, с фактическими отдельными cleanup outcomes.

**Architecture:** Заменить только measurement существующего временного preparatory driver вызовом настоящего shared reader. Существующие `read`/`log`, native UI primitives, `waitForExportStorageObservation` и `finally` сохраняют ответы до reader checks и очищают собственный пакет. Runtime, public API и S5 harness не меняются.

**Tech Stack:** текущие staged Node ESM/runtime и один authenticated `loginBrowser` context; pinned toolchain и stock stage — как в [storage-settle plan](2026-10-29-browser-recovery-storage-settle.md).

**Spec:** [browser recovery design](../specs/2026-10-19-browser-recovery-design.md), [plan5](2026-10-19-browser-recovery-5-acceptance.md); фактическое основание — [29.10 source report](../../testing/loginom-ai-agent/reports/2026-10-20-browser-recovery-source/report.md#2026-10-29--storage-settle-source-ready-native-br-s5-fail).

## Global Constraints

- Independent plan preflight GO, mandatory0/optional0: static private adaptation разрешена. Один последующий probe — отдельное разрешение root после review фактической adaptation; нового S5 сейчас нет.
- Никаких Export, upload, старого receipt/run replay, загрузки старого пакета, второго browser/CDP, новых hooks/API/infra, recovery, расширения bounds или повторов жеста.
- Только свой новый empty draft, UUID `.lgp`, один initial Save с `conflict_policy:fail`; подтверждённый Save сохраняется до вспомогательных проверок. Существующие config packages/exports совпадают; проверить это до live, иначе STOP без новой схемы навигации.
- Первый неожиданный отказ завершает measurement; после него только существующий guarded cleanup. Не делать final Save/replace или discard для обхода неожиданного dirty state.
- Diagnostic PASS не равен S5 PASS; исходные completion criteria browser recovery не меняются. Все прежние cleanup UNKNOWN остаются UNKNOWN.

## Review Focus

1. Raw logical table записан до empty/owner/readiness assertions: сохранён именно отказавший sample, а не post-action snapshot.
2. Для anchor branch привязан последний принятый table и следующий exact-name lookup; последний по времени snapshot сам по себе не определяет ветвь.
3. Native gesture refusal сохраняет реальные `status/phase/effect_possible/cleanup_complete`; ошибка wrapper не превращает known no-effect в unknown native effect.
4. Fast exact-target result допустим, но без scroll не проверяет гипотезу о settling; не добавлять жесты ради воспроизведения.
5. Diagnostic data, native Close/logout/noDiscard, context close и OS attribution оцениваются раздельно; failure вспомогательной записи не отменяет сохранённые результаты.

## Решение, гипотеза и границы доказательства

**Проверяемая гипотеза:** отказ повторяется на unchanged generic native storage search без Export/recovery и возникает на новом logical sample, отличном от сохранённого post-action snapshot. Одна проба либо локализует повторение, либо даёт `NOT_REPRODUCED`/конкретный иной blocker; успешный поиск не опровергает прошлый S5 отказ.

`readNativeExportFile` не журналирует каждый `read`. Его `ready` записывает `exportStorageObservation` только при exhausted wait; immediate reader throw такого поля не имеет. Старые receipts поэтому не восстанавливают потерянный sample. Простое позднее DOM read тоже не восстанавливает состояние отказа.

`createNativeObserver` уже вызывает настоящий `findNativeStorageRow`; `record` получает full completed response до проверок reader. Но весь observer требует export graph/source edge, baseline execution/bytes, `/test-2/*.csv|tsv`, download и return. Его ready — 250ms до общего deadline, SDK route перехватывает replace и ограничивает observer 60s. Подключать его целиком к empty draft или fake baseline нельзя. `recordResponse` отдельно содержит лишь bounded metadata, не rows. Переносить SDK hooks или расширять observer не требуется.

Выбран сохранённый preparatory driver: `/home/george/.cache/loginom-ai-agent/browser-recovery-boundary-_3o_g_rg/driver-source.txt`. Он уже имеет verified stock resources/catalog/Save path, `loginBrowser`, own draft/Save, `read` с raw logging до assertions, native cleanup и context/OS accounting. Старые stage/evidence не исполнять. Удаляем endpoint geometry/ручной scroll loop; вызываем reader один раз для basename собственного freshly saved `.lgp` в совпадающем export folder. Extension не ограничивает shared reader; это не проверка export provenance/download.

Реальные limits сохраняются у shared reader: ≤12 scroll, |delta|≤1000, exact lookup после settlement; `waitForExportStorageObservation`: 100 samples, 100ms sleeps, ≤3 `UI_ROOT_STALE`. Используем существующий driver guard (identity/uncertain) и его raw-logged native `act`, без gesture retry. У preparatory caller нет node-operation deadline/cancellation и receipt/lease machinery `readNativeExportFile`; не объявлять его точным replay этого caller. Дополнительные identity reads и disk logging меняют timing. Одна native context создана штатным `loginBrowser`, но это не managed IPC acceptance и managed ACK не выдаётся.

### Task 1: Один captured shared-reader probe после preflight GO

**Files:** temporary private `<new-private-root>/failure-observation-probe.mjs`, его private evidence; после результата root обновляет только source report, этот план и canonical checkpoint≤20 строк. Production/test/harness files не менять.

**Interfaces:** `findNativeStorageRow({name,read,roots,ready,act,guard}) → snapshot`; `waitForExportStorageObservation({observe,condition,guard,quiet})`; текущие `makeWorkspaceUiCode` и `makePackageCleanupCode`. `name` — basename exact path из confirmed initial Save, не произвольное имя отсутствующего файла.

- [ ] **Step 1 — static adaptation и independent preflight.** В новом private каталоге0700 адаптировать указанный driver; все logs0600. Сохранить preparation/Save/native finally, убрать geometry/endpoint/causal loop и их проверки owner/anchors до reader. В measurement вызвать ровно один настоящий staged `findNativeStorageRow`. Использовать существующие `read`, `roots`, `act`; `ready` вызывает настоящий export wait и после успешного возврата пишет через existing `log` ID/sequence принятого snapshot. `read` продолжает сохранять полный response перед собственными guards. Записать исходную ошибку с `code`, `storage_entry`, stack и последним accepted-table ID; никакие wrappers не заменяют reader error. Убрать ветку cleanup `save('replace')`: при неожиданном dirty сохраняется отказ. Static review проверяет, что failure-поля не dereference-ят отсутствующий owner и не перекрывают исходную ошибку. Проверка: pinned Node `--check`, diff только measurement/удаление лишнего Save; independent reviewer подтверждает полный call path и cleanup. Без GO live не запускать.
- [ ] **Step 2 — первый сквозной результат, одна попытка.** Новый stock stage текущего clean source и штатный `verifyResources`; сохранить identities private. Новый собственный draft/Save, initial native modified=false, Files и однократный existing Refresh/переход в assigned folder. Не требовать непустые rows/anchors отдельным measurement guard до reader. Вызвать reader; первый возврат/throw завершает measurement. Existing act post-state и каждый logical observe различаются по sequence. Проверка — exact target с observed label/tid и текущими bindings либо сохранённый отказавший sample и ошибка. Если target сразу найден, результат limited exact-target PASS, settling `NOT_EXERCISED`; новых scroll/запусков нет.

```bash
<fresh-resources>/bin/node <new-private-root>/failure-observation-probe.mjs \
  --config /home/george/.config/loginom-ai-agent-tests/browser-recovery.json \
  --resources <fresh-resources> --output <new-private-root>/evidence
```

- [ ] **Step 3 — branch attribution и фактический cleanup.** В том же existing `finally` выполнить только собственный guarded return/saved-state и single native Close/logout/noDiscard; далее context.close и прежний OS collector, без kill. Для branch A (`table` до condition) доказать `rows.length===0 || !rows[0].scroll` на exact grid response. Для branch B доказать accepted `rendered_window_ready:true` table с owner, затем absent exact-name lookup и `anchors.length===0` именно на accepted table; сохранить оба observation IDs. По raw snapshot указать row count, first/all scroll metadata, owner refs/top/max, readiness, anchors и document/workflow/tab/root/directory bindings. Stack actual staged source подтверждает branch; неоднозначный/неполный ledger = UNKNOWN, не guessed cause. Native PASS только при package_closed/logged_out/noDiscard; context CLOSED только close event/pages0; OS UNKNOWN/NOT_CONFIRMED не повышать до PASS по одному exit. Проверка — private result с отдельными diagnostic/native/context/OS outcomes, root append factual report/checkpoint, удалить temporary executable после сохранения исходника. Confirmed sample сохраняет ценность даже при cleanup или bookkeeping blocker.

## Scope, цена и stopping conditions

Первый E2E: exact failure sample + branch + rows/owner/readiness/anchors/binding (либо exact own target PASS) и подтверждённые own initial Save/native cleanup/context; OS facts отдельно. Если cleanup не подтверждён — diagnostic outcome сохраняется, task остаётся с конкретным cleanup limitation.

Оценка: сейчас 1 tracked plan≈90 строк + 1 ignored design report≈35 строк; возможное выполнение — один private driver≤210 строк (существующий210, большая часть measurement удаляется), adaptation≤70 changed lines, до3 tracked docs≈+35/−10. Считать фактический tracked `git diff --stat`, private diff отдельно; >2×оценки — STOP/reassessment. Новых persistent mechanisms/зависимостей нет: raw evidence и ready-return marker нужны только для различения двух уже существующих branches.

STOP: source/stage/config ownership mismatch, preparatory failure, первый native отказ/unknown, другой reader error, bounds exhaustion, incomplete evidence или невозможность безопасного cleanup. Не добирать желаемую ветвь повторной пробой. Не чинить OS collector, не расширять inventory/telemetry/общее logging, не добавлять тестовую инфраструктуру и upstream suite.

Возможная последующая production correction — отдельное решение по точному наблюдению и отдельный reviewed scope; этот план её и второй S5 не разрешает и не обещает.
