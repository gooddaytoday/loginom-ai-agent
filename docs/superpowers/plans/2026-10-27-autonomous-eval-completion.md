# Завершение автономной eval-кампании: план реализации

Дальнейшая публикация и полная проверка PR ведутся в
[плане PR](2026-10-27-autonomous-eval-pr-checks.md).

**Goal:** Подчистить `autonomus-eval` и обеспечить своевременный отдельный
финальный ответ EvalRunner, отключение периодического EvalOps и независимую
доставку архива.

**Architecture:** Использовать существующий controller, journal и Multica
comments/mentions. Разделить прочитанный итог, ответ исполнителя и доставку
архива; не создавать новую систему управления.

**Tech Stack:** Bun, TypeScript, Linux/systemd, существующий HTTP API Multica.

**Spec:** [согласованный дизайн](../specs/2026-10-27-autonomous-eval-completion-design.md).

## Ограничения и решения

- Работа в существующей ветке `autonomus-eval`, исходный SHA `60a82320a9`.
  База интеграции `loginom`; чужие checkout/untracked не менять.
- Только `evals/` и необходимые docs. Новых runtime dependencies нет.
- Сохранить native ownership/cleanup, manifest/pins, результаты и no-progress
  clock. Никаких повторных измерений ради PASS.
- Не менять живые Multica rules/agents, не отправлять поручения настоящим
  агентам, не разворачивать поставку и не запускать модельные eval.
- Временные данные: `/home/kiselev/storage/tmp`; все команды тестов из `evals/`.
- TDD: один тест поведения RED → минимум GREEN → упрощение, затем следующий.
  Локальный Bun HTTP fixture проверяет реальный publisher, global mocks нет.

## 1. Отдельный ответ исполнителя и независимая доставка

**Files:** `evals/script/run-campaign.ts`, `evals/test/campaign-publishing.test.ts`,
`evals/test/campaign-finalization.test.ts`, затронутые snapshot/control fixtures.

**Интерфейсы:** сохранить публичные `publishCampaign`, `syncCampaignIssue`,
`finalizeCampaign`; исполнитель разрешается из неизменного `manifest.executor`
через подтверждённый `GET /api/agents` с workspace. Уникальный ID сохраняется
в journal до POST. `reportCommentId` служит ID адресного итога/поручения;
новое поле хранит ID проверенного отдельного ответа исполнителя.

- [x] RED: upload возвращает 503. Вызвать `publishCampaign` и проверить:
  `comments.some(c => c.content.includes('mention://agent/runner'))`,
  periodic disabled, `journal.published !== true`, attempts неизменны.
- [x] GREEN: итог и read-back идут до upload; trigger-preview подавляет всех
  кроме назначенного исполнителя. Периодический wakeup выключается отдельно
  от `finishCampaignIssue`, чужие правила сохраняются.
- [x] RED: вызвать публикацию повторно после потери HTTP ответа POST и restart
  с прочитанным journal. Проверить ровно одно поручение по campaign marker.
- [x] GREEN: сначала read-back существующего поручения; сохранённый target ID
  не разрешать заново при переименовании агента. Не заявлять exactly-once
  транзакцию вне возможностей API; инструкция исполнителю требует проверки
  собственного уже опубликованного финального marker.
- [x] RED: архив доставлен, но ответа нет или ответ чужой/без marker/другой
  ветки. Проверить `published !== true`, статус не `in_review`.
- [x] GREEN: принять только отдельный comment с `author_type=agent`,
  `author_id=executorAgentId`, `parent_id=reportCommentId` и отдельным
  `<!-- eval-executor-final:CAMPAIGN -->`; сохранить ID и проверить повторно.
- [x] RED: правильный ответ пришёл при недоставленном архиве. Проверить,
  что ответ засчитан, а archive retry сохраняется. После восстановления upload
  проверить один архив, `published=true`, `in_review`, все own wakeups disabled.
- [x] GREEN: удалить предположение «final comment означает доставленный
  архив». Сохранить hash/download/CAS и idempotent retry; новый publisher
  различает машинный итог и отдельный ответ исполнителя.
- [x] Проверить partial от недоступного хоста, старый `published=true`,
  отключение правила после временного 503 и отсутствие повторных admissions.
- [x] По исходному no-progress сроку отсутствие ответа исполнителя вызывает
  существующий `blocked` один раз; полный итог измерений сохраняется.
- [x] Запустить `TMPDIR=/home/kiselev/storage/tmp bun test --isolate test/campaign-publishing.test.ts test/campaign-finalization.test.ts test/campaign-snapshot.test.ts`.
- [x] Commit: `fix(evals): deliver executor final independently of archives`.

## 2. Узкие исправления и удаление лишней работы

**Files:** `evals/src/node-evidence.ts`, `evals/test/node-evidence.test.ts`,
`evals/src/slot-storage.ts`, существующие archive/slot-storage tests;
`evals/script/run-campaign.ts`, `evals/test/campaign-limits.test.ts`.

- [x] RED: перенести из `68686f224a` только один поведенческий тест legal
  omission optional `source.bytes/sha256`; убедиться, что он падает.
- [x] GREEN: условие принимает отсутствие optional metadata, но сравнивает
  переданное значение с реальными source bytes/hash. Затем negative test
  подтверждает отказ неверных переданных значений.
- [x] Проверить потребителей `archiveStartupHistory`; удалить возвращаемый
  предварительный inventory, который никто не использует. Сохранить inventory
  после cleanup и проверки mover. Проверить существующими поведенческими tests.
- [x] RED: принадлежащий кампании active batch после no-progress срока не
  возвращает бесконечный `wait`. Проверить отсутствие next admissions и
  `cleanupVerified !== true` для работающих ресурсов.
- [x] GREEN: срок применяется и на этом пути, результат становится честным
  partial, прежние процессы/результаты не объявляются очищенными фиктивно.
- [x] Запустить focused node-evidence/archive/campaign-limits tests.
- [x] Commit: `fix(evals): preserve valid evidence and enforce campaign deadline`.

## 3. Один текущий runbook

**Files:** новый `evals/docs/autonomous-campaigns.md`, `evals/AGENTS.md`,
`docs/plans/2026-10-23-autonomous-evals-plan.md`,
`docs/superpowers/specs/2026-09-18-evals-design.md`.

- [x] Описать текущие reserve/service/repair/resume/final команды из server
  config, разделение результатов/очистки/архива/ответа исполнителя.
- [x] Standing и wakeup инструкции: обычный batch ведёт служба; existing
  blocked/delegation события и fallback 7200 секунд. Отдельный финал
  EvalRunner обязателен; повторные измерения не разрешены.
- [x] Сослаться на исторические планы вместо массового перемещения файлов.
  Явно сохранить незавершённый LAB-170 и исторические SHA/receipts.
- [x] Обновить owning contract и короткую ссылку из AGENTS; состояние
  разработки вести в checkpoint этого плана.
- [x] Commit: `docs(evals): consolidate autonomous campaign operations`.

## 4. Проверка результата и готовность к интеграции

- [x] Из `evals/`: `TMPDIR=/home/kiselev/storage/tmp bun typecheck`.
- [x] Из `evals/`: `TMPDIR=/home/kiselev/storage/tmp bun test --isolate --timeout 30000`.
  Настоящий Node должен быть в PATH; явные opt-in live flags не включать.
- [x] Независимое ревью итогового diff: обязательный отдельный ответ, finite
  lifecycle, отсутствие потерянных результатов/дублей, гарантий cleanup.
- [x] Проверить интеграцию текущего `loginom`, сохранив его продуктовые
  исправления. Финальный `git diff --check`, clean status и checkpoint.
- [x] Сообщить отдельно, что живое внедрение/модельная кампания не выполнялись.

## Checkpoint

### Дополнение владельца: два исправления из lab262-analysis

- Последние коммиты на момент поручения: `6d7614544b`, `5c47047060`.
  План переноса независимо проверен: Approved.
- `6d7614544b` уже полностью представлен в `97abbfba5f`: production и test
  blobs совпали (`git diff --exit-code`), дублирующий пустой коммит не создан.
- `5c47047060` перенесён целиком с исходной ссылкой cherry-pick: inspector,
  тип XML, оба mapping validator, AutoSync tests и документация.
- Общий suite был начат до этого переноса. После его завершения отдельно
  проверены затронутые node/text-import/admission на итоговом коде: 334 PASS /
  5 SKIP / 0 FAIL, 2036 assertions, 31 files, 250,64 с; typecheck — PASS.
  Это новая проверка интегрированного HEAD; исторические replay из исходного
  документа не пересчитывались и не выдаются за новую приёмку.

- Дизайн выбран владельцем; спецификация и план прошли независимое review:
  Approved, обязательные замечания устранены до реализации.
- Исходная ветка переключена в текущем worktree, чужие изменения сохранены.
- `97abbfba5f`: optional metadata и удаление выбрасываемого inventory;
  focused node-evidence/startup-settled — 4 PASS. Процессные archive tests
  дали нестабильный отказ, воспроизведённый отдельной проверкой окружения;
  тот же узкий тест прошёл на baseline и текущей ветке без изменения guards.
- `9ac910cfd2`: текущий runbook, owning contract и ссылки на историю.

- `d8410610be`: завершение/ответ исполнителя, ошибки доставки, snapshot и
  deadline; 58 focused PASS и 2 clock PASS. Независимое финальное code review
  — Approved, обязательных замечаний нет.
- `b108d69e3e`: текущий `loginom` интегрирован без конфликтов, его изменения
  сохранены. Он включён для проверки совместимости с базой интеграции;
  для исправления завершения эта операция не была необходимой.
- `50fe818789`: полный перенос AutoSync fix из `5c47047060`. Проверка
  типов после переноса — PASS; адресные Import/AutoSync — 4 PASS,
  65 assertions. Независимое review переноса — Approved.
- Общая регрессия завершилась exit 1: **1364 PASS / 84 SKIP / 4 FAIL /
  1 error**, 7245 assertions, 1452 tests / 111 files, 2403,63 с.
  Точные flags: `EVAL_SYSTEMD_TESTS=0 EVAL_PAIR_INTEGRATION=0
  EVAL_PROCESS_DENIAL_TESTS=0`; Node v22.16.0 в PATH. Suite начат до
  переноса AutoSync; затронутая группа дополнительно проверена на итоговом коде.
- Четыре падения общего suite: `sandbox.test.ts` (unknown shell/helper:
  ожидался cleanup `failed`, получен `confirmed`), два timeout 30000 мс в
  `judge-environment.test.ts` (saved generation и saved invoke budget),
  timeout 20000 мс в `isolated-storage.test.ts` (доступный прежний сервер).
  Поздний `JUDGE_VERSION_UNCONFIRMED` после первого timeout учтён Bun как
  отдельный error, а не пятый упавший тест.
- Независимый сбор сигнала: связанные tests/fixtures/runtime blobs совпадают
  с исходным `60a82320a9`. Последовательные повторы без изменения лимитов:
  sandbox — 1 PASS / 8 assertions; judge-environment — 22 PASS / 122
  assertions, включая оба исходных timeout. Причина этих трёх общих падений
  и наличие их на baseline не установлены.
- Узкий isolated-storage повторил timeout 20000 мс на текущем коде и на
  исходном `60a82320a9`. В отдельном baseline-архиве 11 исходников/fixtures
  сверены с `git show`; hashes сохранены. Наличие timeout до изменений
  подтверждено, но зависшая операция и причина не установлены: baseline
  остановился раньше, чем текущая ветка. Таймауты не повышались, несвязанный
  runtime не менялся. Все четыре контейнера двух повторов отсутствуют;
  точное владение и уборка подтверждены в `rerun-fixture-cleanup.json`.
- Логи: `/home/kiselev/storage/tmp/autonomus-eval-verification-20261027/`
  (`full-suite.log`, `imported-fixes-final.log`,
  `typecheck-final-with-autosync.log`, `node-affected-final.log`,
  `rerun-*.log`, baseline hashes и cleanup JSON).
- Итоговое независимое review области и достаточности проверки — Approved
  для согласованных исправлений: проверки завершения, импортированные
  правки, затронутые callers и typecheck прошли. Сохранены full-suite FAIL и
  отдельный исходный timeout; полная готовность к слиянию не подтверждена.
  `git diff loginom..HEAD --check` и текущий `git diff --check` — PASS.
- Работа локальная: живые Multica agents/rules не изменены, обновление
  runner не устанавливалось, модельные кампании и push не выполнялись.
  Частота fallback 7200 с описана для установки новых кампаний в runbook;
  это не подтверждение изменения уже действующих правил.
