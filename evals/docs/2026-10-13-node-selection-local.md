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

`modelStarted:false` подтверждается только до запуска CLI либо явным отсутствием
dispatch при подтверждённом завершении. Preflight incident хранится отдельно
в новом `incidents/<task>/<attempt>/<timestamp-uuid>/`; исходные квитанции не удаляются.

CLI exit и код wrapper — разные значения. Код 0 wrapper подтверждает машинные
проверки; обязательное review исключения остаётся отдельным условием. Код 130
CLI означает отмену; timeout требует записанного deadline и собственного SIGINT.
90 секунд после SIGINT — предел ожидания для фиксации блокера, не гарантия выхода.
Неподтверждённые exit/cleanup запрещают следующий CLI run. Чужой writer не удаляется.

## TDD и пилот

Task 1A уже читает реальные reference XML/oracle, считает все JS apply и оба
XML-типа; неполнота не становится нулём. До Task 1B намеренно возвращается
`AUDIT_NOT_FINALIZED`: минимальный аудитор не сертифицирует полную историю,
settlement, модель или digest. Первый baseline входит в 18 и даёт реальные
fixtures; после уточнения parser он перепроверяется offline без нового model run.

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
