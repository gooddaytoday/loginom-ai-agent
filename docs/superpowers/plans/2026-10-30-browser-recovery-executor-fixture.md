# Browser recovery executor fixture Implementation Plan

> Execute one task at a time with subagent-driven-development/TDD after independent plan review. Root owns commits, review and checkpoints.

**Goal:** Устранить четыре текущих upstream failures без ослабления reader/ожиданий и сохранить подтверждённый native BR-S5 PASS.

**Основание:** последний раздел [source report](../../testing/loginom-ai-agent/reports/2026-10-20-browser-recovery-source/report.md), [parent plan](2026-10-30-browser-recovery-scroll-anchor.md). Один полный upstream:4490PASS/4FAIL/14SKIP; все четыре Export-теста используют `verificationFixture` в `client/test/browser-recovery-executor.test.mjs`.

**Подтверждённая причина:** `state()` этой fixture не выдавал `active_tab_ref`, хотя actual workspace producer выдаёт ref активной вкладки, а `findNativeStorageRow.bind` требует его даже для найденного файла. Один field из существующего `el(...).ref` восстановил соответствие snapshot; focused RED→GREEN и полный upstream подтвердили исправление всех четырёх failures. Production guards сохранены.

Первый проверяемый результат — прежний failing typed-transport Export test возвращает verified current file/completed. Native E2E уже прошёл на current production source; test-only изменение сохраняет его доказательство при неизменных runtime bytes, без нового native запуска.

## Constraints / scope

- Единственная source/test правка — `packages/loginom-runtime/client/test/browser-recovery-executor.test.mjs`, один field в существующем `state()`. Runtime/producer/reader/actuator/public schemas/ready bounds/harness/ожидания не менять.
- Root обновляет этот план, parent checkpoint, canonical master, current plan5 status и append source report: всего6 tracked файлов, около+95/−10 строк, production0/test≈1 строка; при>210 changed lines остановиться. Новых механизмов/deps/hooks/timers/fixtures0.
- Использовать existing `verificationFixture`/typed transport/current assertions. Не добавлять общую mock-инфраструктуру, parser/validator или diagnostic runtime hook. Не менять expected completed/verified/unknown-download/refusal ownership.
- No Loginom/browser/network/stage/native/model/install/cleanup/kill/release. Исторические FAIL/UNKNOWN не переклассифицировать, artifact source identity не менять. Current actual runtime bytes должны совпасть с принятыми S5 resources.
- Pinned Node `/home/george/.cache/loginom-toolchain/loginom-node/node-v24.19.0-linux-x64/bin/node`; tests только из `packages/loginom-runtime/client`. Полный script — из runtime с этим Node bin первым в command-local PATH и pinned Bun.

## Review focus

Только ли snapshot fixture исправлен; ref соответствует уже delivered active tab; все4 исходных assertions сохраняются; no production guard weakening; каждый новый прогон имеет конкретное основание, native не повторяется.

### Task 1: Проверить и исправить общий snapshot, затем завершить проверку

- [x] **Step1 — focused RED.** Прочитать `verificationFixture.state`, её callers в этом файле, producer `active_tab_ref` и reader `bind`. Запустить pinned Node `--test --test-name-pattern='^export verifies the file with this pass execution and fresh deadline through typed transport$' test/browser-recovery-executor.test.mjs`; сохранить исходный assertion failure. Сопоставить с отсутствующим field, не добавлять logging/probe ради догадки.
- [x] **Step2 — одна переменная/GREEN.** Добавить `active_tab_ref` из существующего ref активной вкладки для current files/graph surface, без других edits. Повторить тот же test. Если он не GREEN, гипотеза не подтверждена: не добавлять следующие поля/обходы, убрать опровергнутую правку и сообщить точный BLOCKED.
- [x] **Step3 — relevant checks.** После GREEN один весь `node --test test/browser-recovery-executor.test.mjs`, затем один `bun run test:upstream` из runtime с command-local pinned Node PATH. Existing4508 tests должны пройти без failures;14 existing skips допустимы. Новая failure → report/STOP, без автоповтора/расширения scope. `git diff --check`, stat и подтверждение неизменности runtime against accepted stage. Нет typecheck script у runtime.
- [x] **Step4 — source review / checkpoint.** Root сохраняет candidate commit для scoped spec+quality review, mandatory0 до принятия. Reviewer читает actual diff/logs, не повторяет suite. После PASS обновить owning docs/checkpoints≤20строк и parent full-check status, commit. NativeS5/actual stage сохраняют исходную identity; повторные stage/acceptance не нужны для test-only изменения. До следующей задачи должны пройти relevant checks.

## Checkpoint — COMPLETE

- Task1 COMPLETE: source `cc77b1f8dd`, один field существующей fixture, production/ожидания без изменений.
- Focused meaningful RED→GREEN; весь файл74PASS, полный upstream4494PASS/0FAIL/14SKIP, exit0/230834ms, новых warnings нет.
- Independent source spec+quality Approved, mandatory0/optional0; root проверил diff/raw summary/полный review, git diff --check PASS.
- 359 source hashes/355 staged runtime files неизменны; actual native builder и manifest сохраняют исходную identity из source report.
- Native BR-S5 strict PASS принят ранее и не повторялся; authenticated context close подтверждён, OS absence UNKNOWN, старые cleanup не переоценены.
- Parent scroll-anchor Task2/план5Task2 завершены; следующий шаг — packaged Task3, release gate остаётся закрыт.
