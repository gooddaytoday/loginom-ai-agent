# Judge ordinary-exec cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: executing-plans или subagent-driven-development; TDD по одному поведению. До независимого review этого плана исходники, тесты и нормативные документы не менять.

**Goal:** Будущий небраузерный judge получает confirmed после естественного выхода собственного ordinary exec descendant и полного доказательства отсутствия своего дерева.
**Architecture:** Расширить существующий ledger и shutdown supervisor; сохранить исходную signal identity. Уже используемый `owner.kind === "judge"` — достаточный явный opt-in, нового флага/политики не требуется.
**Tech Stack:** Bun, Linux `/proc`, существующий subreaper; без зависимостей.
**Spec:** `docs/superpowers/specs/2026-09-18-evals-design.md` (process cleanup), `evals/docs/parallel-users-contract.md` §24; новое явное разрешение владельца ниже.

## Global Constraints

- Владелец разрешил: «разрешить подтверждённую очистку, если собственный процесс после обычного exec завершился естественно, его PID, время рождения, UID, группа и сессия совпадают, а два полных прохода при живом контроллере подтверждают отсутствие процессов».
- Исключение только для continuous `owner.kind=judge`, без profile/sandbox, уже proven ordinary descendant; отсутствие профиля само по себе не определяет judge. `invoke` и `judgeVersion` уже передают такого owner; systemd judge имеет отдельный путь.
- Launcher, selected CLI, sandbox wrapper, browser/helper и неизвестный origin исключены. Любое несовпадение birth/UID/PGID/SID, unreadable relevant identity и capture/persistence failure остаётся fatal.
- Изменённый образ не получает сигнал, allowed admission либо здоровую peer-публикацию; исходные `sameIdentity`/`signalProcess` и свежая проверка перед syscall сохраняются.
- Existing 60s cleanup budget judge не увеличивать. Два успешных полных прохода с интервалом ≥100ms выполняются при свежепроверенном живом subreaper; пустота означает отсутствие всех own descendant births и текущих blockers, включая pending/refused/late adoption, кроме самого контроллера.
- Исторические failed/gateblocked, retained leases, pins и evidence неизменны. P21 recovery принадлежит root; никаких actual CLI/Loginom/browser/judge/admin/profile/lease/model/network действий в этой работе.

## Review Focus

- Только executable device/inode изменились: origin и остальные identity поля должны быть доказаны свежим полным чтением; обычный signal guard не ослабляется.
- Живой changed image не исчезает из ожидания из-за refused; deadline даёт failed без сигнала этому образу.
- Поздний потомок и adoption не позволяют закрыть subreaper или вернуть verdict до полного proof; failed scan не считается пустым.
- Исторический exec остаётся в evidence; исключение не снимает произвольный первый error и не разрешает verdict/retry при другом отказе.
- Чужие процессы, browser bindings/helpers, birth mismatch и другие callers сохраняют поведение; использовать существующие regression tests.

## Files, size and exclusions

Изменить только `evals/src/process-supervisor.ts` (~90–140 строк diff), `evals/test/judge.test.ts` (~150–220), два нормативных абзаца в указанных Spec (~12–18); создать этот план (≤80). Оценка: 5 файлов, ~320–450 строк additions+deletions по `git diff --stat`, включая тесты и документацию.
`judge.ts`, launcher, fake-codex, другие production callers и системная граница не требуют изменений. Временный process-fixture wrapper создаётся самим тестом рядом с existing gateFixture и использует `fixtures/fake-codex.ts`; общей fixture-инфраструктуры не добавлять.
Исключены перенос private patches, recovery API, отдельный inventory/ledger/service, новые deadline settings/retries, реальная калибровка, изменение prompt/rubric/oracle, commit/push/merge/release.

### Task 1: Первый проверяемый judge verdict после ordinary exec

- [x] После независимого plan review минимально внести разрешённое исключение в два нормативных абзаца; сохранить все остальные fatal условия. Проверка: diff соответствует Global Constraints без расширения на других owners.
- [x] В `judge.test.ts` добавить один real-process тест `ordinary exec: natural exit confirms judge verdict`: через public judgeTask/gateFixture запускать собственный wrapper и detached bash; marker разрешает exec лишь после admission, подтверждённого public supervisedProcesses. После exec в конечный fixture-образ PID/birth/UID/PGID/SID прежние, device/inode другие.
- [x] RED: targeted command ниже отклоняет существующий failed cleanup. Fixture пишет нормальный verdict через fake-codex, завершает selected CLI раньше exec-child; конечный образ сам выходит внутри budget. Проверять observable verdict, natural exit/no-signal, отсутствие births и proof до завершения launcher, а не число внутренних полей.
- [x] GREEN: в ProcessEntry хранить наблюдённый executable-only переход отдельно от immutable `process`, проецировать факт в ProcessCleanup; qualifying ordinary descendant остаётся refused для сигналов. В этом случае не latch fatal identity error; другие ошибки никогда не сбрасывать.
- [x] Применить тот же узкий разбор к свежему полному чтению после identity refusal в `signalOwned`: exec между scan и guarded syscall не становится иным fatal классом из-за гонки. Сам syscall/`sameIdentity` не менять; отсутствие полного доказательства перехода остаётся fatal.
- [x] Существующий scan продолжает происхождение детей через свежепроверенный same-birth exec parent и subreaper, не наделяя сам changed image сигналами; browser/helper admission не обходить. Отбор ordinary исключает browser/native/helper признаки до и после exec.
- [x] В judge shutdown ждать все собственные живые записи; сохранять subreaper до двух успешных пустых проходов ≥100ms, каждый со свежей полной проверкой его исходной identity. Позднее появление сбрасывает пару и продолжает тот же drain/deadline. После этого штатно закрыть launcher и выполнить прежнюю final verification.
- [x] Исключать завершённый qualifying exec из текущих blockers только после этого proof, сохраняя переход/admission в evidence; никакого общего фильтра всех исторических unknown. Проверка: targeted natural-exit test GREEN, обычный judge gate не изменён.

### Task 2: Живой изменённый образ сохраняет failed

- [x] Следующим отдельно добавить `ordinary exec: live changed image reaches deadline without signal`; тот же конечный fixture живёт дольше существующих 60s, затем самостоятельно заканчивает работу. Не вводить настройку budget ради теста; индивидуальный timeout теста 90s.
- [x] Проверить фактическое ожидание budget, failed/cleanupUnconfirmed и отсутствие retry; тот же birth/executable жив после возврата, signal receipts пусты. Дождаться естественного выхода fixture, не сигналить по PID и не оставлять фоновых процессов.
- [x] Если тест выявляет дефект, сначала записать RED, затем минимально исправить existing wait/signal membership и получить GREEN; при уже зелёном поведении сохранить эту regression без искусственной поломки.

### Task 3: Поздний потомок и закрытие доказательства

- [x] Следующим отдельно добавить `ordinary exec: late descendant adoption prevents early proof`: управляемый exec fixture создаёт собственного потомка после завершения selected CLI и выходит, оставляя его subreaper; потомок имеет конечный natural lifetime.
- [x] Проверить отсутствие раннего возврата verdict, fresh ownership позднего birth, живой исходный subreaper до выхода потомка и двух полных пустых проходов; затем confirmed. Любой воспроизведённый RED исправлять только в existing scan/drain, затем GREEN.
- [x] Прогнать существующие foreign/browser/helper/birth/signal/gate/capture/persistence regressions и package typecheck. Независимый final review обязателен из-за process/signal boundary; mandatory замечания закрыть, optional не расширяют критерии.

## Verification and stopping

Все команды из `evals/`: `bun test --isolate --timeout 90000 test/judge.test.ts -t "ordinary exec"`; затем `bun test --isolate --timeout 30000 test/judge.test.ts test/process-supervisor.test.ts test/process-supervisor-integration.test.ts test/judge-unit.test.ts test/parallel-process-resources.test.ts`; затем `bun run test` и `bun typecheck`.
Не включать live/denial/PID-reuse флаги: требующие отдельного окна existing tests остаются skipped и честно отмечаются. PID-reuse/signal проверки, доступные без этих флагов, должны пройти; source-only proof не объявлять проверкой установленного judge.
Сначала получить первый natural-exit judge verdict; до него не добавлять hardening/telemetry/новые проверки окружения. При размере >2× оценки, новом механизме или новой границе контракта остановить реализацию и пересмотреть план.
Готовность реализации: три новых поведения проверены последовательно, соответствующие regressions/typecheck проходят, независимые mandatory замечания закрыты; historical incidents остаются failed. Checkpoint ≤20 строк только при необходимости продолжения.
## Checkpoint — source implementation проверен

- SHA: `6cc3134e14`; source и незакоммиченные изменения сохранены, commit/push/merge не выполнялись.
- M1 исключает selected CLI по receipt PID и сохраняет fatal для поздно распознанного ended exec; независимое SPEC-закрытие APPROVE.
- M2 наследует ordinary qualification из existing parent ledger и необратимо снижает её по fresh own flags/known ancestry; adoption не забывает native/helper роль.
- Public M2 RED→GREEN: known executable chrome → helper без flags → adoption → exec/natural exit; прежний false verdict теперь failed без retry/сигнала changed image.
- Конечный Bun 1.3.14/pinned PATH: judge/gate/peer regressions 56 passed / 0 failed, включая пять ordinary-exec tests; package typecheck exit 0.
- Свои scoped-test/fixture/boundary процессы отсутствуют; старые orphan/Authoring/profile/lease ресурсы не затрагивались.
- M2 SPEC→quality APPROVE; после отдельного reviewed inotify capacity fix полный pinned suite:1226PASS/39SKIP/0FAIL,6188assertions,1265tests/93files,1405.17s; старые failed runs сохранены. Capacity actual review APPROVE.
- Overall/M1/M2 exact diff и evidence: `.superpowers/sdd/2026-10-28-analytics-expansion-implementation/judge-exec-implementation-report.md`.
- Source-only implementation завершён; следующий шаг кампании — адресное обновление трёх собственных файлов reused harness и первый live judge. Installed/live verdict этой проверкой не подтверждается.
