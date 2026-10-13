# Локальная приёмка выбора узлов

Источник требований — согласованные spec и plan в `docs/superpowers/`.
Этот запуск выполняется в текущей системе без общего isolated runner.
Продуктовый baseline фиксируется до изменения `loginom-automation`.

## Модель и окружение

Пользователь выбрал `gpt-6-sol`, reasoning `medium`, fast. CLI принимает
`--model openai/gpt-6-sol-fast --variant medium`: alias сохраняет API model
`gpt-6-sol` и запрашивает `serviceTier:priority`. Фактически обслуженный tier
не предполагается по имени alias.

Публичный каталог модели копируется в `frozen-models.json`, его SHA закреплён
в pins обеих серий. Дочернему CLI передаётся `LOGINOM_AI_AGENT_MODELS_PATH`.
Пользовательская конфигурация моделей не меняется.

Текущая локальная серия использует существующий профиль `analytic-evals`:
status/check подтвердили `http://localhost/app/`, user, /user. Client на порту 80
проксирует WebSocket на существующий `loginom-server-7.4.2-test:8080/ws/`.
Container ID, сеть и UserStorage проверены read-only, public routing evidence
сохранён в приватном каталоге серии. Профили и настройки не перенастраивались.

Серия: 18 baseline и 25 candidate (18 standard, 3 explicit-js, 3 tags,
1 recovery). Первые 9 candidate входят в эти 25; повторы разрешены только
после чистой первой волны. При нарушении политики следующие слоты этой
 версии skill не запускаются. До model dispatch инцидент не занимает слот;
после dispatch провал сохраняется в знаменателе.

Текущая серия — `20261013T142936Z-072953`; `20261013T132356Z-0a3983` остановлена
после двух baseline и сохранена отдельно. Исходная `20261013T093809Z-f5d429`
остановлена после трёх baseline и сохранена отдельно. Пользователь поручил
самостоятельно устранять блокеры; необходимый общий runtime-дефект
`imports.text.date_format` исправлен по TDD в `263df9620`. Обе новые сборки
на `1bfc135430` выполнены в одном worktree и проверены против owning source;
runtime/dependencies/compiled CLI побайтно совпадают. Native Host proof дат,
Save/cleanup/logout прошёл без LLM. Smoke не входит в 43 модельных слота.
Новая пара также включает dataset output overflow fix `c2c898aca5`; exact native
overflow/Close/output/Save/cleanup подтверждены отдельно без LLM.
Новые pins immutable; inputs/oracle/model/reviewSeed прежние. Исторический
acceptance lock сохранён побайтно, новые hashes привязаны отдельным
`pins-preparation-review.json`, 72/72 current source hashes PASS.

## Одна попытка

Из `evals/`:

```bash
bun script/run-node-selection-attempt.ts --pins /absolute/baseline-pins.json \
  --task sales-by-category --attempt 1
```

Pins закрепляют payload/profile, manifest SHA, skill digest, каталог модели,
model/variant, task prompt/input/oracle hashes, публичное подключение и
подтверждённый server container/storage. Пароли, OAuth и API keys не включаются.
Один вызов запускает одну модельную попытку. Каталог существующего слота не
перезаписывается. Для повторной оценки сохранённых данных вызывается только
offline-аудит; он не запускает модель или Loginom.

У ABC/1 третьей серии CLI0/cleanup true, но исходный wrapper2 остановился на
Help в receipt parser. Повтор модели не выполняется. Exact copyout и offline
аудит сохранены в отдельной явной проекции `evidence/abc-collector-recovery`:
только receipt paths добавлены к копии attempt metadata, original outcomes
и hashes неизменны. Итог этой попытки читать вместе с исходным attempt.json,
`forensic/{receipt-recovery,copyout-recovery,copyout-recovery-review}.json` и
audit проекции. Baseline policy failed из-за двух JS, oracle/calculation true.
Collector `f5eb5373e2` ограничивает только receipt projection по `loginom_dock_*`;
полные parts/Help сохраняются. RED/GREEN, 88 целевых tests, typecheck и independent
review PASS. Historical lock сохранён; `collector-fix-lock.json` закрепляет новый
runner hash, 71 прежний hash и неизменные runtime/pins/auditVersion. Та же текущая
серия продолжается без пересборки matched payload и без повторения ABC модели.

## Доказательства

`<resultsRoot>/<phase>/<taskID>/<attemptNo>/` содержит:

- `attempt.json`: `sessionID`, `cliExitCode`, `mode`, `taskID`, `model`, `variant`,
  `expectedSkillDigest`, `packagePath`, `resultPath`, `startedAt`, `finishedAt`,
  `binaryManifestSha256`, `modelStarted`, `timedOut`, `interruptSentAt`.
  Неизвестные значения — null; unknown dispatch не разрешает новый запуск слота.
- `prompt.txt`, `events.jsonl`, `stderr.txt`, PID и supervisor deadline/exit.
- `parts.json`: read-only snapshot `{sessionID,parentID,childSessionIDs,messages,parts}`
  только своей Session; сохраняются все parts и сообщения.
- Runtime journals только из
  `generations/*/chats/<sha256(agent SessionID)>/attempts/*/`.
  `session.json.sessionId` и journal `session_id` — внутренний Dock UUID.
- `artifact/package.lgp`, `artifact/unpacked/`, `artifact/results/*.result.csv`:
  точные собственные пути определяются save/export receipts. Copy-out read-only.
- `selection-audit.json`: JS counts, `policyStatus:passed|failed|incomplete`,
  `oraclePassed:true|false|null`, `calculationPassed`, `historyComplete`,
  `runtimeSettled`, failures и версия аудита. Последние два поля вычисляются
  из evidence, а не принимаются входными флагами.
- `graph-review.json` для всех исключений/аномалий и трёх заранее воспроизводимо
  выбранных standard-успехов. Seed закрепляется до пилота.

Содержательное review записывает отдельный reviewer после чтения кода и трассы:
`{verdict:"passed"|"failed", reviewer, sessionID, packageSha256, evidence, notes}`.
`evidence` — непустой список существующих относительных путей внутри попытки;
`notes` объясняет verdict. Session и SHA связывают review с фактическим пакетом.
Для explicit-js обязателен `javascriptRole:"requested-aggregation"`, для tags —
`javascriptRole:"variable-unpack-only"`, для recovery — `recoveryObserved:true`.
Без обязательного review машинные оси сохраняются, общий PASS исключения закрыт.

`modelStarted:false` подтверждается только до запуска CLI либо явным отсутствием
dispatch при подтверждённом завершении. Preflight incident хранится отдельно
в новом `incidents/<task>/<attempt>/<timestamp-uuid>/`; исходные квитанции не удаляются.

CLI exit и код wrapper — разные значения. Код 0 wrapper подтверждает машинные
проверки; обязательное review исключения остаётся отдельным условием. Код 130
CLI означает отмену; timeout требует записанного deadline и собственного SIGINT.
90 секунд после SIGINT — предел ожидания для фиксации блокера, не гарантия выхода.
Неподтверждённые exit/cleanup запрещают следующий CLI run. Чужой writer не удаляется.

## TDD и пилот

Task 1B завершён на реальном пилоте: история, settlement, модель/digest/catalog,
импорт из закреплённых inputs, export identity, XML lineage, oracle и review gates.
Первый baseline входит в 18 и перепроверен offline без нового model run.
Финальный auditVersion:
`1f1e63ba844350aa21b9722ced44579050d12eaade0b78217085d5ae797eb34d`.
Root checks: 95 tests/219 assertions, typecheck и diff-check PASS. Независимый
review подтвердил закрытие export/context identity дефектов пятью регрессиями.
`acceptance-lock.json` в приватном run-каталоге закрепляет auditor/runner,
существующие loader/oracle/XML dependencies и все task/fixture hashes.
Исторический pilot wrapper exit 2 отражает минимальный Task 1A; текущий
`selection-audit.json` после offline-проверки является источником текущих осей.
Не переписывать исторический CLI/wrapper exit ради нового verdict.

Initial TDD evidence: `36cf3558f`, `e60abc34f`, `9beee7cbf`, `312ff3872`,
`86618a093`. Каждый новый сценарий сначала дал RED, затем GREEN. Fixtures
созданы циклами `81c4a14e7`, `2de55ec10`, `3de3526f9`; Python oracle tags
даёт blue=3, green=1, red=153, recovery — B=62, A=55.

## Границы

Общий benchmark, судья и аналитический корпус не меняются. Baseline получает
машинную проверку, candidate — полный policy/oracle audit и ограниченный semantic
review. Tags не проверяется отдельной Session на изменённом входе. Targeted
recovery покрывает один наблюдённый отказ; естественные ошибки учитываются
дополнительно только если возникли. Desktop и natural activation не проверяются.
