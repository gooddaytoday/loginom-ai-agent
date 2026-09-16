# Подготовка автономной приёмки Node14

Команда `node14:acceptance-preparation:1:c32a5d5e163fe174afba59abce973ac405742cdc`.
Производственный source не изменён: code c32a5d5e, runtime
`a9db4113ac69d38d7227e971ece3652acf3e1bf836723e6e577917eda916406f`, 156 файлов.
Новые harness/goal/auditor фиксируются отдельным коммитом и хешами.

## Матрица допуска

| Требование | Выполненная прямая проверка | Обязанность обычного Hermes / независимого аудитора |
|---|---|---|
| Float average/точность; Integer ±1.5→±2 | Development полный3×5, повтор precision | core+precision, полный выход до10 строк; отдельный полный reopen |
| Среднее, не медиана; zero | Development skew 0,0,9,Null→3 | Отдельный узел «Среднее не медиана» |
| Константа/смена; Null/empty/literal null | Development Done/Close/preserve, NEW_NODE | Основной MISSING→NEW_NODE→Done→Close DISCARD_ME→preserve execute |
| Активные поля | Development Note-only; неподдержанные сочетания отказаны | Отдельный «Только строка»; прочие поля выключены |
| Пороги40/41/42, 5/12 | Development полные12×5 | Три сохранённых узла; Hermes проверяет count+доступный образец, auditor все12 |
| Порог0, 1/120 | Development полный120×5 | Сохранённый узел; Hermes count+первые10, auditor все120 |
| All-null100/empty input | Development полные результаты/схема | Отдельные узлы; исходные Null остаются, пустой набор0×5 |
| Перестановка/одинаковые Same | Development/recovery полный3×5 | Отдельный источник/узел, фиксированный mapping с autosync=false |
| Новый/существующий | Development проверены refs/связи | Создание и изменения тех же GUID; полный список результатов сохраняется |
| Смена CSV, fresh execution без перенастройки Missing | Новая проверка текущего pin: полный4×5, средняя20, те же source/target GUID | Отдельный «Смена источника» с core→changed в том же импорте; preserve{} target |
| Сохранённое состояние / повторное выполнение | Native checkpoint/test-4 проверен в component-диагностике; полный goal остаётся отдельной автономной приёмкой | Hermes один финальный checkpoint; затем отдельный новый browser/document и все12 финальных результатов без перенастройки |
| Ошибка исполнения/cleanup | a63586fe live terminal failed; полный набор регрессий | Targeted development gate, скрытой инъекции в natural goal нет |
| Lost reply исходной input_mapping | c32a5d5e same ID/session recovery; mismatch/locked/budget refusals | Targeted development gate, не моделировать сбой силами Hermes |
| Повтор ID, incompatible field/method | Development negative/replay evidence | Не повторять неизвестный эффект; обычная цель не требует искусственных отказов |

Полное чтение означает все фактические строки. `sample_rows` в публичном API
ограничен10: требование sample_rows==10 не используется как признак полноты
малого результата. Наборы12/120 остаются обязательными полными чтениями отдельного
проверяющего. Прежний3×5 никогда не подставляется вместо полного goal.

В goal сохранены12 финальных Missing-узлов и9 импортов,14 содержательных этапов
выполнения плюс Done/Close/проверка отмены. После candidate-preflight используются8 уникальных CSV и14 независимых expected
закреплены в `fixtures/missing-values/acceptance-pins.json`; oracle использует
Decimal, округление Integer half-away-from-zero и подтверждённую целую долю
пропусков. Он не импортирует обработчик и не читает результат для вычисления expected.
При изменении fixture/expected hash требуется новая фиксация до модели.

## Серверная зависимость

Сначала [VPS.md](VPS.md): только сборка/stage новой immutable версии на VPS.
Реальные URI/SHA/байты candidate и stage-report возвращает координатор.
Старый diagnostic candidate не является admission Node14. Не переключать current.

После stage в отдельном ходе нужно проверить native package.save_checkpoint под
/test-4 и полный candidate preflight. Не обходить запрет старого каталога.
Узел12 владеет расследованием неоднозначного save_as после overwrite_confirmed;
общий переход здесь не менялся. Goal14 требует один финальный checkpoint,
не Save As. Отдельный reader делает реальное открытие уже сохранённого пакета.
Если native-проверка воспроизведёт дефект12, сохранить зависимость и evidence;
не заимствовать исправление молча.

## Воспроизводимый запуск без модели

Все команды выполняются из корня этого worktree. Использовать имеющийся runtime:
`/Users/kartamyshev/.loginom-dock/releases/0.1.0-dev.20260910.3-80ca61417ec7/runtime/node`.

```sh
python3 tools/loginom-acceptance/preflight.py --root . --commit HEAD --require-clean --output .dock/node14-preparation/source-preflight.json
python3 tools/loginom-acceptance/run.py --preflight --goal missing-values-complete --model-profile chatgpt-sol --loginom-user test-4 --loginom-url 'http://logi-test-plan.bg.local/app/?testable=true' --storage-directory /test-4 --dock-config .dock/stream-runtime/config.json --node /Users/kartamyshev/.loginom-dock/releases/0.1.0-dev.20260910.3-80ca61417ec7/runtime/node --timeout 3600 --max-turns 200 --output .dock/node14-preparation/subscription-preflight.json
```

Оба output — новые файлы; старые полные precheck receipts не перезаписывать.
`run.py --preflight` проверяет установленный Hermes/подписку и зависимости,
не запускает MCP/браузер/модель. Истечение подписочного токена — явный blocker;
не менять провайдера/модель и не вращать общие credentials из приватной копии.
До stage отсутствие URI/SHA в этом preflight означает только проверку окружения.
После stage повторить его в новый файл с возвращёнными manifest URI/SHA.

## Будущий автономный запуск — только после отдельного слота

Координатор передаёт проверенные `NODE14_MANIFEST_URI` и `NODE14_MANIFEST_SHA`;
не подставлять вычисленный здесь или старый SHA. Следующая команда сейчас
**не выполнялась и сама по себе не является разрешением на запуск**:

```sh
python3 tools/loginom-acceptance/run.py --run --goal missing-values-complete --model-profile chatgpt-sol --loginom-user test-4 --loginom-url 'http://logi-test-plan.bg.local/app/?testable=true' --storage-directory /test-4 --dock-config .dock/stream-runtime/config.json --node /Users/kartamyshev/.loginom-dock/releases/0.1.0-dev.20260910.3-80ca61417ec7/runtime/node --manifest-uri "$NODE14_MANIFEST_URI" --manifest-sha256 "$NODE14_MANIFEST_SHA" --timeout 3600 --max-turns 200 --runs-root .dock/node14-acceptance-runs
```

Используется существующая подписка openai-codex/gpt-5.6-sol/low, без fallback.
Штатный harness создаёт уникальные run-dir, private HERMES_HOME, Dock state,
профиль и session. Инструменты и браузер запускаются через разрешённый внешний
процесс; при необходимости нужен обычный require_escalated approval. Отказ
auto-review не обходить. Native skill локально скопирован и проверяется по hash.
Промежуточный precheck — только initialize/list_tools; его receipt сохраняется.

`missing-values-client.mjs` добавляет только read-only измерение фактического
окна той же MCP page после настоящего prepare. Результат связан с run/session/
document/pin. Он не меняет product browser code, не повторяет prepare, не вводит
fault и не раскрывает новые инструменты модели. Настройки launch отдельно от
геометрии не доказывают развёрнутое будущее окно. Precheck не создаёт geometry receipt.

## Порядок независимой проверки

1. Hermes завершает все перечисленные операции и один финальный
   `package.save_checkpoint`. Успех устанавливается по paired public call,
   prepared/completed journal, save_flow_completed и наблюдению сохранённого
   открытого workflow, а не по существованию path. Save As с reopening этого
   требования не заменяет. Пакет не требуется переоткрывать внутри natural goal.
2. Экспортируются исходные request/scenario/evidence, metadata каждой session,
   geometry и полный precheck. Рабочая session связывается с prepare/journal.
   Дополнительная precheck session допустима только при workspaceReady=false,
   targetIdentity=null, archiveActive=false и отсутствии её действий в журнале.
3. Байты server-built candidate и stage-report кладутся в отдельный локальный
   каталог. Запускается pre-audit (без reopen он **обязан вернуть passed=false**,
   но выдаёт reopen_plan при достаточном рабочем evidence):

```sh
python3 tools/loginom-acceptance/missing_values_acceptance.py --run-dir "$NODE14_RUN" --candidate "$NODE14_CANDIDATE" --output "$NODE14_RUN/pre-audit.json"
```

4. Только если все остальные gates прошли, независимый reader запускается в новом
   собственном браузере. Он открывает точный path с новым document ID, читает
   сохранённые импорты и отменяет их мастера, выполняет существующие Missing с
   parameters:{} / inputs:[] / mappings:[], затем читает полные строки каждого
   из12 результатов и реальные связи. Настройки из goal не устанавливаются.

```sh
/Users/kartamyshev/.loginom-dock/releases/0.1.0-dev.20260910.3-80ca61417ec7/runtime/node tools/loginom-acceptance/missing-values-reopen.mjs --pre-audit "$NODE14_RUN/pre-audit.json" --config .dock/stream-runtime/config.json --out "$NODE14_REOPEN"
python3 tools/loginom-acceptance/missing_values_acceptance.py --run-dir "$NODE14_RUN" --candidate "$NODE14_CANDIDATE" --reopen-dir "$NODE14_REOPEN" --output "$NODE14_RUN/final-audit.json"
```

NODE14_REOPEN — новый каталог внутри своего .dock. Reader закрывает свой браузер
после сбора, не сохраняет диагностические изменения. Обязательное повторное
открытие настроек не навязывается нормальному settings:{} ради числа жестов;
независимый reader проверяет observed readback фактического выполнения и отдельно
сохранённый источник. Проверяются исходные raw ячейки, не только decoded summary.

5. PASS требует все gates, полный12-result reopen и действительную модельную
   идентичность/usage. Время, вызовы, фазы, токены и cache берутся из штатного
   evidence/efficiency. Неизвестные показатели остаются неизвестными.
   Отсутствующее evidence или любой отказ оставляет итог непрошедшим.

## Ограничения подготовки

Geometry wrapper, staged-candidate readback, native save и полный автономный
reader ещё не прошли end-to-end на будущем candidate — он не собран. Их
компоненты/синтаксис проверяются сейчас; общий PASS приёмки не заявляется.
Смена источника без перенастройки на c32a5d5e проверена4×5; сериализованное
обученное состояние/повторный расчёт из нового native checkpoint остаются
обязательным этапом после stage. Отдельный Train не добавлен в supported API.
Новые методы/типы и configure recovery13 не реализованы.


## Candidate preflight 2026-09-13: исправление admission

Девять startup CSV были отвергнуты штатным `admitStartupArtifacts` до браузера:
максимум восемь. Ограничение production не изменено. `reordered.csv` — точная
перестановка данных `precision.csv`; теперь оба импорта используют один pinned
precision CSV, а порядок Note,Untouched,Count,Id,Amount и метки Same задаются
явно во входном сопоставлении «Переставленных полей». Выходной oracle3×5 совпадает
с прежним целиком; меняется только SHA исходного файла. Исторический CSV сохранён
для проверки эквивалентности, но не передаётся как девятый artifact.

Остаются9 импортов,12 сохранённых Missing Values результатов,14 содержательных
этапов и Done/Close/preserve. Никакой semantic case не удалён. Проверка реального
admission копирует все8 pinned файлов через production API, сверяет выдачу8
артефактов; отрицательная проверка всё ещё отклоняет9. Входное сопоставление
проверяется по публичной схеме API. Старые preflight и9-file failure не перезаписаны.

Для отдельной component-диагностики reader имеет `--component-run`: допуск
вычисляется из реальных исходных journals, проверенных source/node результатов
и native save trace. Это не `--pre-audit` полного goal, не моделируемый Hermes
usage и не автономный PASS. Обычный `--pre-audit` сохраняет полный gate.
