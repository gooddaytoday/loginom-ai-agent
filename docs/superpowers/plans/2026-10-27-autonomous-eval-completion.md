# Завершение автономной eval-кампании: план реализации

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

- [ ] RED: upload возвращает 503. Вызвать `publishCampaign` и проверить:
  `comments.some(c => c.content.includes('mention://agent/runner'))`,
  periodic disabled, `journal.published !== true`, attempts неизменны.
- [ ] GREEN: итог и read-back идут до upload; trigger-preview подавляет всех
  кроме назначенного исполнителя. Периодический wakeup выключается отдельно
  от `finishCampaignIssue`, чужие правила сохраняются.
- [ ] RED: вызвать публикацию повторно после потери HTTP ответа POST и restart
  с прочитанным journal. Проверить ровно одно поручение по campaign marker.
- [ ] GREEN: сначала read-back существующего поручения; сохранённый target ID
  не разрешать заново при переименовании агента. Не заявлять exactly-once
  транзакцию вне возможностей API; инструкция исполнителю требует проверки
  собственного уже опубликованного финального marker.
- [ ] RED: архив доставлен, но ответа нет или ответ чужой/без marker/другой
  ветки. Проверить `published !== true`, статус не `in_review`.
- [ ] GREEN: принять только отдельный comment с `author_type=agent`,
  `author_id=executorAgentId`, `parent_id=reportCommentId` и отдельным
  `<!-- eval-executor-final:CAMPAIGN -->`; сохранить ID и проверить повторно.
- [ ] RED: правильный ответ пришёл при недоставленном архиве. Проверить,
  что ответ засчитан, а archive retry сохраняется. После восстановления upload
  проверить один архив, `published=true`, `in_review`, все own wakeups disabled.
- [ ] GREEN: удалить предположение «final comment означает доставленный
  архив». Сохранить hash/download/CAS и idempotent retry; новый publisher
  различает машинный итог и отдельный ответ исполнителя.
- [ ] Проверить partial от недоступного хоста, старый `published=true`,
  отключение правила после временного 503 и отсутствие повторных admissions.
- [ ] По исходному no-progress сроку отсутствие ответа исполнителя вызывает
  существующий `blocked` один раз; полный итог измерений сохраняется.
- [ ] Запустить `TMPDIR=/home/kiselev/storage/tmp bun test --isolate test/campaign-publishing.test.ts test/campaign-finalization.test.ts test/campaign-snapshot.test.ts`.
- [ ] Commit: `fix(evals): deliver executor final independently of archives`.

## 2. Узкие исправления и удаление лишней работы

**Files:** `evals/src/node-evidence.ts`, `evals/test/node-evidence.test.ts`,
`evals/src/slot-storage.ts`, существующие archive/slot-storage tests;
`evals/script/run-campaign.ts`, `evals/test/campaign-limits.test.ts`.

- [ ] RED: перенести из `68686f224a` только один поведенческий тест legal
  omission optional `source.bytes/sha256`; убедиться, что он падает.
- [ ] GREEN: условие принимает отсутствие optional metadata, но сравнивает
  переданное значение с реальными source bytes/hash. Затем negative test
  подтверждает отказ неверных переданных значений.
- [ ] Проверить потребителей `archiveStartupHistory`; удалить возвращаемый
  предварительный inventory, который никто не использует. Сохранить inventory
  после cleanup и проверки mover. Проверить существующими поведенческими tests.
- [ ] RED: принадлежащий кампании active batch после no-progress срока не
  возвращает бесконечный `wait`. Проверить отсутствие next admissions и
  `cleanupVerified !== true` для работающих ресурсов.
- [ ] GREEN: срок применяется и на этом пути, результат становится честным
  partial, прежние процессы/результаты не объявляются очищенными фиктивно.
- [ ] Запустить focused node-evidence/archive/campaign-limits tests.
- [ ] Commit: `fix(evals): preserve valid evidence and enforce campaign deadline`.

## 3. Один текущий runbook

**Files:** новый `evals/docs/autonomous-campaigns.md`, `evals/AGENTS.md`,
`docs/plans/2026-10-23-autonomous-evals-plan.md`,
`docs/superpowers/specs/2026-09-18-evals-design.md`.

- [ ] Описать текущие reserve/service/repair/resume/final команды из server
  config, разделение результатов/очистки/архива/ответа исполнителя.
- [ ] Standing и wakeup инструкции: обычный batch ведёт служба; existing
  blocked/delegation события и fallback 7200 секунд. Отдельный финал
  EvalRunner обязателен; повторные измерения не разрешены.
- [ ] Сослаться на исторические планы вместо массового перемещения файлов.
  Явно сохранить незавершённый LAB-170 и исторические SHA/receipts.
- [ ] Обновить owning contract и короткую ссылку из AGENTS; состояние
  разработки вести в checkpoint этого плана.
- [ ] Commit: `docs(evals): consolidate autonomous campaign operations`.

## 4. Проверка результата и готовность к интеграции

- [ ] Из `evals/`: `TMPDIR=/home/kiselev/storage/tmp bun typecheck`.
- [ ] Из `evals/`: `TMPDIR=/home/kiselev/storage/tmp bun test --isolate --timeout 30000`.
  Настоящий Node должен быть в PATH; явные opt-in live flags не включать.
- [ ] Независимое ревью итогового diff: обязательный отдельный ответ, finite
  lifecycle, отсутствие потерянных результатов/дублей, гарантий cleanup.
- [ ] Проверить интеграцию текущего `loginom`, сохранив его продуктовые
  исправления. Финальный `git diff --check`, clean status и checkpoint.
- [ ] Сообщить отдельно, что живое внедрение/модельная кампания не выполнялись.

## Checkpoint

- Дизайн выбран владельцем; спецификация и план прошли независимое review:
  Approved, обязательные замечания устранены до реализации.
- Исходная ветка переключена в текущем worktree, чужие изменения сохранены.
- `97abbfba5f`: optional metadata и удаление выбрасываемого inventory;
  focused node-evidence/startup-settled — 4 PASS. Процессные archive tests
  дали нестабильный отказ, воспроизведённый отдельной проверкой окружения;
  тот же узкий тест прошёл на baseline и текущей ветке без изменения guards.
- `9ac910cfd2`: текущий runbook, owning contract и ссылки на историю.
