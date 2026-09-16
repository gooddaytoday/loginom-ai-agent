# Текущий профиль — 7 сентября 2026

Новые запуски используют `--model-profile chatgpt-sol` по умолчанию:
существующая подписка Hermes, `openai-codex / gpt-5.6-sol / low`, без fallback.
Исторические Luna/medium evidence остаются читаемыми; новый admission их не принимает.
`--goal prepare-workspace` проверяет только подготовку нового черновика;
его независимый audit допускает чтение workspace, но запрещает запуск узлов,
сохранение и остальные мутации. Полный контракт: [подготовка workspace](../../docs/loginom-dock/workspace-preparation.md).
Датированные Luna/MiMo примеры ниже — история прежних запусков.

Проверочную обвязку и её полный unittest-набор запускайте Python **3.11+**
из окружения Hermes. Системный `python3` в Ubuntu 22.04 может быть 3.10:
он отличается разбором ISO-времени с `Z` и CSV с NUL. Для тестовых Node-генераторов
можно явно задать `DOCK_TEST_NODE` на закреплённый исполняемый файл.

## Сравнение отображаемых результатов

rendered_results.py сравнивает data_column/data_cell с полным expected fixture,
используя явный числовой формат и Decimal, без округления и удаления дубликатов.
Полный diagnostic audit включает сравнения только для неизменённых raw receipts,
связанных с реальным вызовом/ответом. Numeric format пока не подтверждён, поэтому
live diagnostics требуют его доказательства, а не выбирают локаль по догадке.
rendered_rows_match не является допуском P3: полное покрытие строк, владение
результатом, новый execution и сохранность после reopen проверяются отдельно.

## Полная диагностика P3

`--goal data-pipeline --loginom-user test --storage-directory /test` ставит
полную задачу CSV → импорт → Калькулятор → Группировка → save/reopen/reexecute.
До запуска закреплены CSV, expected.json, task.txt и goal. Передача использует
явный replace grant только для run-specific CSV; пакет перезаписывать запрещено.

Сейчас это диагностический запуск, **не готовый допуск P3**: data_pipeline.py
проверяет transfer prefix до первой следующей мутации, но всегда оставляет FAIL
для ещё не реализованных независимых проверок настроек, execution identity,
полного typed output и повторного выполнения. Model prose не является evidence.
Следующие итерации должны заменить каждый missing verifier реальным proof,
а не ослабить критерии. Цель запуска при этом запрашивает весь сценарий.

## Сверка серверной копии через Hermes

`--goal file-upload-verify --loginom-user test --storage-directory /test` добавляет
к той же однократной отправке поиск точной строки CSV, один dock_artifact_verify
и inspect исходной операции. Аудит связывает file ref с raw observation и pending
context, native download receipt — с host download_verified, grant и исходным
SHA/size. Теперь после confirmed submission, совпадения байтов, cleanup и durable
transfer_completed/verification_completed исходная операция должна стать resolved,
а upload_completion_verified=true. Прежний frozen run 222924 проверял ещё pending
поведение; новый контракт не переоценивает тот отчёт. Прогон не закрывает P3,
reject/конфликты или download budget. Все helper/fixture inputs закреплены до run.

## Диагностика отправки файла через Hermes

`--goal file-upload-probe --loginom-user test --storage-directory /test` использует
закреплённые 230 байтов fixtures/data-pipeline/sales.csv с отдельным display name
Dock-upload-<run_id>.csv. Launcher явно выдаёт replace grant только этому имени
в выбранном каталоге и фиксирует public descriptor в request.json; sourcePath
остаётся private startup argument. Fixture входит в harness pins.

Цель: навигация → свежий directory read → один dock_artifact_upload → inspect
pending, без последующих изменений UI. Аудит отдельно проверяет admission grant,
доставленное наблюдение, native submission trace и immutable journal binding.
PASS означает только корректную отправку в native input и сохранение неизвестного
server result. Он не доказывает серверное сохранение, SHA скачанной копии,
отсутствие конфликта или завершение P3. Остальные goals не допускают upload.

## Локальная проверка передачи и скачивания файла

`artifact-transport-check.mjs BROWSER_RUNTIME_DIR NEW_REPORT_PATH` запускается
закреплённым Node и проверяет private staging через настоящий MCP/Chromium на
синтетическом HTML input[type=file]. Не использует Loginom, модель или исходные
файлы пользователя и не является Loginom upload acceptance. Успех подтверждает
basename/size/bytes SHA и передачу path вместо встроенного payload. Затем
браузер скачивает Blob из выбранного синтетического файла через настоящее
download event и Download.saveAs в отдельный private lease. Клиент проверяет
suggestedFilename, размер и SHA скачанных байтов; содержимое не возвращается
через browser result. Это не доказывает серверное происхождение файла.
Нужен новый report path; повторное использование отвергается до browser connect.
Закреплённые зависимости проверяются runtime-check.mjs перед браузером.

## Разрешение на доставку входного файла

Trusted CLI `--input-artifact` принимает `sourcePath`, `name`, `bytes`, `sha256`
и необязательный объект `upload` с ровно двумя полями: `directory` (например,
`/test/данные`, явно выбранный путь Loginom) и `overwrite` (`reject` или
`replace`, без default). Остальные поля запрещены. Весь batch проверяется до
чтения файлов. Локальный sourcePath и серверный directory имеют разный смысл;
путь пользователя ОС не определяет каталог Loginom.

Admission выдаёт artifact_id, а для upload — отдельный session-local grant_id
и точный destination с исходным display name. Без upload входной файл не имеет
разрешённого назначения. Grant — разрешение, не выполненная загрузка и не
доказательство отсутствия конфликта. В replay теперь есть dock_artifact_upload
с четырьмя ID: artifact_id, upload_grant_id, observation_id, operation_id.
Он поддерживает отправку только по явному replace grant; reject пока отвергает
до staging. После отправки операция остаётся AMBIGUOUS до серверной проверки,
которую ещё нужно реализовать. Повтор ID не отправляет файл заново; разрешены
observe/inspect, но не abandon/UI repair/следующие мутации. Это ещё не runnable
data-pipeline acceptance; diagnostic run должен учитывать незавершённый transfer.

В candidate runtime добавлен dock_artifact_verify: operation_id исходной загрузки,
новый verification_id, observation_id и file_ref подробного чтения строки CSV.
Он сверяет скачанную копию с admitted SHA/size. При lost reply сначала inspect
исходной операции; новый ID не обходит незавершённое скачивание. Успех byte proof
при confirmed submission/cleanup и durable completion снимает pending. Ошибка
SHA, неопределённая отправка, cleanup или journal failure сохраняют блокировку.
Для живой цепочки используется file-upload-verify; file-upload-probe разрешает
только submission + pending inspection и не должен вызываться для verify.

## Имена Loginom и destination (schema 2, 2026-09-05)

Каждый новый `--run` требует `--loginom-user ACCOUNT --storage-directory /PATH`.
Это независимо выбранные Loginom account и destination, не имя ОС/SSH и не
неявный user. Учётная запись должна быть разрешена оператором для входа без
пароля. Пользователь разрешил test для отладки; /test проверен в живом Loginom.
Для текущей file-storage-inspect проверки можно явно выбрать
`--loginom-user test --storage-directory /test`. Не переносить эти значения
в другие окружения без проверки. Goal template и directory фиксируются до run;
новые package paths строятся внутри выбранного destination/packages. Существование
этого подкаталога нужно установить перед save/upload, проверка навигации его
не создаёт. Старые request schema1 и их immutable audits остаются историческими.

# Приёмка выхода из MVP

Поддерживаемый операторский инструментарий этапа P0. Он не входит в клиентский
bundle. Доступны source preflight, изолированный запуск базовой goal-only задачи,
независимый аудит очищенных evidence, их индекс и сверка pinned источников.
Перенесены operator fault wrappers и независимые аудиторы для `lost_receipt`,
`rename`, `partial_link`, `position` и `save_reopen`; доступны базовая задача и
auto-link retain/remove. Manual reopen требует явного флага и отдельного proof. Этот каталог не выдаёт
production attestation и не заменяет платформенную/native-приёмку.

## Состав исходников

Из корня репозитория:

```sh
python3 tools/loginom-acceptance/preflight.py \
  --require-clean --output .dock/post-mvp-p0/source-preflight.json
python3 tests/unit/test_dock_client_packaging.py
```

Каждому запуску задавать новый путь отчёта: существующий файл не перезаписывается.
Для другой рабочей копии доступны `--root /path/to/checkout` и `--commit REV`.
Нужны Python 3.10+ и Git. Preflight не читает credentials, Hermes DB, transcripts,
browser profiles и `.dock/`; не запускает Node, Hermes, MCP, браузер или модель.

Отчёт содержит список build inputs с SHA-256, размером и режимом, digest этого
списка, сравнение с точным Git commit и runtime digest из буквального списка
`client/lib/session.mjs`. Правило выбора файлов общее с упаковщиком. Проверяются
содержимое, executable bit, новые и удалённые файлы; symlinks запрещены. Runtime
inputs должны полностью входить в упаковку. Секретные `.env*` и operator evidence
исключаются существующим правилом упаковки, содержимое исходников в отчёт не попадает.

`--require-clean` возвращает код 1 при расхождении build inputs с commit и сохраняет
отчёт для разбора. Отсутствующий обязательный файл останавливает проверку. Без этого
флага dirty-состав можно инвентаризировать, но поле `build_inputs_match_commit`
останется `false`. Изменение документации вне build inputs не делает runtime dirty.
После изменения исходников проверку нужно повторить. Общая реализация inventory
находится в `deploy/loginom-dock/client-source-inventory.py`; её используют preflight,
упаковщик и builder. Упаковщик теперь выпускает пофайловый manifest и SHA архива,
а `--source-clean` builder сверяет распакованные и staged inputs с Git objects.
Команды и границы доверия описаны в [инструкции выпуска](../../docs/loginom-dock/releasing.md).

Packaging suite создаёт временный Git-репозиторий из выбранных исходников,
фиксирует **только временную копию**, клонирует её и запускает полный клиентский
suite из изолированного staging. Зависимости используются из закреплённого
`client/node_modules`; Node должен совпадать с `client/.node-version`. При отсутствии
Node/dependencies проверка явно пропускается. Это доказывает независимость выбранных
imports/fixtures от `.dock/`, но не наличие этих исходников в основном Git HEAD.

## Базовая реальная задача

`goals/basic-graph.txt` — неизменённая очищенная цель прежней базовой задачи.
`__PACKAGE_PATH__` должен заменяться новым принадлежащим запуску путём; никаких
подсказок о порядке tools или fault injection в задание добавлять нельзя.
Использовать Python существующей установки Hermes,
Hermes **0.21.0**, существующее подключение **подписка ChatGPT / openai-codex / gpt-5.6-sol / low**.
Приёмка допускает macOS и Linux; разрешённые учётная запись, хранилище,
каталог и версии проверяются для каждого запуска. Linux-префлайт наследует
шесть переменных графической сессии сверх прежнего списка переменных ОС.
Обвязка также сохраняет существующие `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`,
`NO_PROXY` и их варианты в нижнем регистре. Их удаление может нарушить рабочее
подключение Hermes ещё до первого действия Dock; proxy не настраивается заново.
Не менять модель при ошибке. По умолчанию пути берутся из `~/.hermes` и
`~/.loginom-dock`; они переопределяются явными CLI-параметрами. `HERMES_HOME`
определяет только исходное подключение, запуск получает отдельный новый home.
Из существующего Hermes auth.json в защищённый private home переносится только
ChatGPT provider state; другие провайдеры, настройки и память не переносятся.
Токен должен быть действителен более 4200 секунд, чтобы изолированный прогон
не обновлял общий refresh token. В request/evidence credentials не включаются.
Правило от 7 сентября закрепило Sol/low; прежние frozen отчёты не пересчитываются.
Для новых Sol-прогонов используется штатный `hermes chat -q` с явными
`--reasoning low --max-turns N`: путь `-z` в Hermes 0.21.0 не передаёт эти
параметры конструктору агента. `hermes_runtime_guard.py` сохраняет auth guard,
проверяет фактические аргументы до создания агента и model/reasoning каждого
исходящего запроса до отправки. В доказательства попадают только параметры
политики и usage, без содержимого запросов. Новый маркер
`effective_model_policy` обязателен для новых отчётов; исторические доказательства
не переоцениваются как прошедшие эту дополнительную проверку.

`linux-browser-smoke.mjs --browsers <pinned-cache> [--headless]` проверяет только
запуск закреплённого браузера через source MCP и локальную in-memory страницу.
Запускать закреплённым Node. Без `--headless` используются графическая сессия
оператора и нативный viewport. Временный профиль удаляется после закрытия;
Loginom, архив и модель не запускаются. Эта проверка не заменяет сценарную приёмку.
Для headless-запуска от root внутри Docker тест отключает sandbox Chromium и
явно записывает `chromium_sandbox: disabled_for_container_smoke` в результат.
Это проверка совместимости системных библиотек; штатный sandbox проверяется
отдельно в графической сессии обычного пользователя.

```sh
~/.hermes/hermes-agent/venv/bin/python tools/loginom-acceptance/run.py \
  --preflight --output .dock/post-mvp-p0/live-preflight.json

~/.hermes/hermes-agent/venv/bin/python tools/loginom-acceptance/run.py \
  --run \
  --manifest-uri viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.05-agent.2-candidate/manifest.json \
  --manifest-sha256 290c59ed4af9d0861a158d4758ed849e5159a715ff7b1d4d659826b9df36d4b3
```

Вторая команда **реально запускает модель и изменяет Loginom**, создавая новый
пакет в `/user/data/packages/Dock-acceptance-<run-id>.lgp`. Приведён точный
staged candidate текущей итерации; новый catalog требует собственных URI/SHA
и проверки совместимости. Production pointer не переключается.

`--preflight` проверяет локальную версию Hermes, наличие существующего подключения,
Node, MCP/Playwright зависимости, установленный Chromium и source/runtime pins.
Он не запускает MCP, браузер или модель. Выбранные provider/model фиксируются явно
в CLI запуска; фактические identifiers проверяются по usage после завершения.
Подключение к провайдеру и работоспособность Loginom preflight сам по себе не доказывает.

`--run` сначала создаёт новый каталог с `request.json`, исходной целью, бюджетом
(по умолчанию 60 turns / 1200 секунд), точными pins и хешами harness. Затем
проверяет MCP initialize/list_tools, повторно сверяет исходники и запускает Hermes.
Перед моделью копируется закреплённый native skill из
`plugins/loginom-dock-hermes/skills/loginom/SKILL.md` в изолированный home и
загружается штатным `--skills loginom`. Его SHA связан с runtime pin и проверяется
после запуска. Это source-проверка skill, не доказательство установки plugin/hooks.
Одна команда означает одну попытку без автоматического перезапуска. Каждая попытка
сохраняется, даже при ошибке перед моделью; `EXPORTED_PENDING_AUDIT` не означает PASS.

Полученный run ID использовать в командах ниже, заменив `<run-id>`:

```sh
python3 tools/loginom-acceptance/audit.py \
  .dock/post-mvp-p0/runs/<run-id> \
  --output .dock/post-mvp-p0/runs/<run-id>/audit.json
python3 tools/loginom-acceptance/index-evidence.py \
  .dock/post-mvp-p0/runs --output .dock/post-mvp-p0/evidence-index.json
python3 -m unittest discover -s tools/loginom-acceptance -p 'test_*.py'
```

Аудитор читает только `request.json`, `scenario.txt`, `evidence.json`. SQLite Hermes,
сырой журнал и browser profile ему не нужны. Экспорт читает лишь tool replies и
function-call metadata из SQLite, очищает секреты и reasoning-поля до записи.
Hermes хранит собственное состояние в `private/hermes-home`; оно не копируется в
переносимые evidence или Git. stdout/stderr модели не сохраняются launcher-ом.

PASS требует точного исходного задания, подтверждённых model/catalog/runtime pins,
полного сопоставления вызовов и ответов, нужных component keys, точного графа/портов,
реальных save/close/reopen traces, checkpoint именно этого Save As и совпадения
квитанции с журналом. Старый snapshot, другой путь, пропавший ответ или текст
«готово» не достаточны. Последующее наблюдение проверяет полноту graph snapshot.
Аудитор также должен совпадать с hash, записанным до запуска. Индекс повторно
проверяет hashes audit inputs и сохраняет failed/incomplete/unavailable попытки.

Ограничения текущего аудитора: basic-graph и auto-link goals, source runtime,
без данных, исполнения и native lifecycle. Для `rename` пока
принимается только связанный с pending UI-ремонт с последующей успешной сверкой
исходной операции; перестройка после abandon требует отдельного proof. Файловые hashes защищают от повреждения, но не удостоверяют
источник evidence против недоверенного оператора.

## Сбои и восстановление

Только операторский launcher выбирает variant до начала задачи. Исходный goal
prompt остаётся прежним: никакого описания ожидаемого сбоя, tools или стратегии
recovery модель не получает. Fault wrappers не входят в runtime bundle.

| Variant / файл | Ограниченный эффект | Статус |
| --- | --- | --- |
| `lost_receipt` / `lost-receipt-client.mjs` | Один реальный успешный ответ браузера удерживается после подтверждения cleanup; page-local receipt сохраняется | Launcher и независимый аудит доступны |
| `rename` / `rename-client.mjs` | Прерывание после настоящего drop и отпускания мыши, до редактора имени | Launcher и аудит связанного UI-ремонта с последующей сверкой доступны |
| `partial_link` / `partial-link-client.mjs` | После настоящего Input_Add удаляется только новая связь через точное UI-подтверждение, новый порт остаётся | Launcher и аудит восстановления через complete_link доступны |
| `position` / `position-client.mjs` | Один настоящий drop сдвигается на 24px; исходные параметры и checkpoint сохраняются | Launcher и proof исходного смещения/явного завершения разбора доступны |

Общий `fault-launcher.mjs` сверяет точный executor SHA в preflight request,
действующих исходниках и окружении MCP; variant должен совпадать с request.
Допускается только конкретный `<run>/private/dock-state`, обычные директории без
symlink. Квитанция пишется один раз после redaction и содержит hash исходного и
изменённого browser code, реальный ответ, run ID и variant. Fault wrappers не
подменяют ответ на выдуманный и не выполняют recovery за модель.

Для проверки потери ответа добавить к прежней команде `run.py --run` параметр
`--fault lost_receipt`. URI/SHA candidate и бюджет указываются так же, как для
базовой задачи. Тот же `audit.py` выбирает только заявленный поддерживаемый
контракт: реальная квитанция должна совпасть с журналом и полученным агентом
результатом `inspect` либо `recover`, или должна быть подтверждена журналом
**до** следующего физического apply после наблюдения агента. Последний путь —
штатное автоматическое reconciliation внутри runtime. Успешный вызов recover сам по себе
недостаточен. Проверяется одна фактическая попытка создания источника и отсутствие
повторного запроса, правильный конечный граф и save/reopen.

```sh
~/.loginom-dock/current/runtime/node --test tools/loginom-acceptance/fault-wrappers.test.mjs
python3 tools/loginom-acceptance/index-legacy-evidence.py \
  .dock/agent-recovery-acceptance/runs \
  --output .dock/post-mvp-p0/legacy-evidence-index.json
```

Legacy index читает только request/result metadata и отдельные audit reports,
проверяет перечисленные в них hashes и сохраняет недоступные/неаудированные
попытки. Он не переносит SQLite, transcripts, reasoning и browser profiles.
`recorded_input_integrity=verified` означает сохранность перечисленных старым
аудитором файлов, а не новую приёмку; не перечисленные в отчёте зависимости
этим не проверяются. Разные прежние runtime pins не объединяются в текущий PASS.

## Знания при восстановлении

`--require-knowledge-recovery` добавляет заранее объявленную проверку полного
цикла к обычному контракту цели. Пример: добавить этот флаг вместе с
`--fault lost_receipt` к команде запуска выше. Goal prompt не изменяется.
Общее правило обращения к источникам поставляется клиентом в `dock_prepare`,
повторяется отдельным блоком ответа FAILED/AMBIGUOUS и описано в исходнике skill; публикация skill на сервер — отдельная операция.

Аудитор разрешает read-only `find/search/read/grep/glob/list/tree` в точных
корнях E2E, Help, исходного skill и подготовленного skill Dock. Запись в базу,
личная память и поиск без явного корня этим контрактом не допускаются.
Экспорт сохраняет очищенные ответы этих инструментов и сопоставляет каждый
вызов с ответом. Текст модели и скрытое рассуждение доказательствами не являются.

Дополнительный контракт требует наблюдаемого FAILED/AMBIGUOUS, затем поиска
в каждом из E2E и Help, чтения найденных файлов и успешного продолжения после
чтения. Ошибки чтения, одни ссылки из action catalog, поиск без чтения или чтение
только после завершения задачи не доказывают цикл. Обычные проверки точного
графа и save/close/reopen сохраняются. Порядок вызовов подтверждает получение
контекста перед продолжением; причинное влияние текста на внутреннее решение
модели автоматически не доказывается. Релевантность прочитанных источников
проверяется оператором по очищенным tool evidence и фактическому исправлению.

### Автоматическая доставка

`--require-delivered-context` проверяет отдельный контракт: ответ FAILED/AMBIGUOUS
содержит автоматический контекст клиента с фрагментами E2E и Help; E2E URI/SHA/commit
совпадают с action definition, hashes фрагментов корректны, тот же блок находится
в журнале, а успешное продолжение происходит после доставки. Обычные проверки
цели и save/reopen обязательны. Использовать, например, с `--fault lost_receipt`.

Этот флаг не заменяет `--require-knowledge-recovery`: прежний контракт по-прежнему
требует собственных вызовов поиска/чтения от модели. Автоматические чтения клиента
не записываются как вызовы агента. Можно включить оба флага, если проверяются оба
способа получения знаний. Успешный audit доставки не доказывает внутреннюю
причинность решения модели или совместимость текущей Help с pinned UI.

## Проверка источников

`sources/e2e.json` хранит 46 hashes pinned E2E blobs из карты источников.
`sources/ui-probes.json` содержит hashes, номера строк и минимальные локаторы
Mask/Lock/MessageBox с атрибуцией; полные байты этих assets не входят в Git.

```sh
python3 tools/loginom-acceptance/verify-sources.py \
  --e2e-root /path/to/e2e-tests \
  --ui-root .dock/post-mvp-p0/fresh-ui-sources \
  --fetch-ui-from-config ~/.loginom-dock/config.json \
  --output .dock/post-mvp-p0/source-probes.json
```

Fetch читает только три статических asset из целевого Loginom и сохраняет их
после совпадения SHA. `--ui-root` при fetch должен быть новым. Если байты уже
получены, опустить `--fetch-ui-from-config`. E2E checkout не переключается;
Git blobs и рабочие файлы сравниваются побайтно без запуска E2E/LFS filters.
Static probes не являются live hit-test или доказательством другого UI build.

## Оставшаяся работа P0

Оставшаяся работа P0:

- Просмотреть и зафиксировать MVP как отдельный набор исходников в основном Git.
- Перенести proof для rename repair после abandon. Auto-link goals и manual
  reopen перенесены; фактические frozen live-результаты перечислены в журнале
  реализации. Локальные тесты не заменяют live-приёмку.
- Повторить приёмку на окончательном чистом составе. Сохранять все прежние
  неудачные попытки: поздний диагностический пересчёт не заменяет исходные
  отчёты и не повышает их статус в evidence index.
- Подтвердить source-clean gate на окончательно зафиксированном MVP и VPS build.
  Сам gate и архивный manifest реализованы и проверены source-only tests.
  Полный UI body и domain fixtures проверяют разные
  слои; локальные mocks не доказывают drag, сохранение и reopen в Loginom.

### Приёмка частично созданной связи

Для той же basic-graph цели использовать `--fault partial_link` и при необходимости
`--require-delivered-context`. Аудитор проверяет действительный AMBIGUOUS после
удаления единственной новой связи, сохранение узлов/портов, единственный запрос
Input_Add и complete_link к сохранённому порту, с совпадением recovery receipt и
журнала. Вариант с ручным UI-ремонтом вместо complete_link пока не принимается
этим proof. Итоговый граф и save/reopen проверяются независимо.

### Смещение узла

`--fault position` проверяет реальный сдвиг drop на 24px без изменения исходного
checkpoint, единственный source apply и явное завершение разбора исходной
операции. Допускается успешная сверка исправленного положения либо подтверждённый
abandon после наблюдения: basic-graph goal не задаёт абсолютных координат.
Abandon не считается успехом исходного node.add. Точный состав сохранённого графа
проверяется отдельно; этот proof не заявляет проверку координат после reopen.

## Автоматические связи

`--goal auto-link-retain` и `--goal auto-link-remove` используют прежние goal-only
тексты без изменения. Они запускаются только без fault injection. В обоих случаях
node.add должен подтвердить одну реально возникшую штатную связь с первым входом,
не объявляя всю задачу выполненной; квитанция сверяется с журналом.

Для retain итог — два входа и связь с первым. Запрещены дальнейший ремонт и
повторное создание связи; наблюдения и сохранённый/reopened граф должны её хранить.
Для remove итог — три входа и связь с третьим. `auto_link_delete.py` доказывает
привязанный к наблюдению UI-клик подтверждения удаления одной связи, реальный
жест и последующее исчезновение ровно этой связи при сохранении узлов/портов.
Допускается последующее наблюдение или checkpoint до следующего apply; чужое
промежуточное изменение нельзя приписать подтверждению удаления.

Основной audit проверяет точный выбранный goal/hash, ожидаемый граф до/после
save/close/reopen и все прежние runtime/model/journal guards. Хеш импортируемого
proof также закрепляется до запуска. Наличие CLI не означает live PASS.

## Ручное повторное открытие

`--allow-manual-reopen` заранее разрешает дополнительный независимый proof после
AMBIGUOUS Save As: реальный save/close, пустая рабочая область с подтверждённым
cleanup, связанный abandon и наблюдаемые UI-жесты. Поддержаны два пути:
меню пакетов → открыть либо кнопка «Открыть пакет» начальной страницы; затем
ввод точного пути, подтверждение и наблюдение пакета в новой вкладке. Исходный Save As
остаётся AMBIGUOUS. Путь и граф сравниваются с исходным checkpoint; исходная
квитанция и abandon сверяются с журналом. Неподтверждённые действия не засчитываются.

Для воспроизведения добавить `--fault save_reopen --allow-manual-reopen` к базовой
команде. Новый operator wrapper прерывает код сразу после `saved_package_closed`,
не меняет квитанцию на фиктивную и не открывает пакет за агента. Он не входит
в клиентский runtime. Поддержаны только эти два UI-пути; другой путь потребует
собственного proof. Auto-link retain с ручным reopen пока не покрыт retain-proof.

Подтверждённый frozen run на подписке ChatGPT/Luna medium:
`20260905-125931-a3a46bef`, 28/28 PASS с `--require-delivered-context`.
Прежние FAIL (маршрут HomePage, timeout) и пользовательская остановка сохранены.
Полный журнал и SHA — в `docs/loginom-dock/implementation-status.md`.

## Исправление rename reconciliation

После выявленного live-багa inline-редактора новый runtime `a97afec8…`
прошёл rename-fault приёмку `20260905-132537-623287bf`: 35/35, подписка
ChatGPT/Luna medium. Открытый редактор не считается отсутствием созданного узла;
после Enter принимается journal-backed reconciliation в UI-ответе без
обязательного повторного inspect. Source proof `rename_effect.py` для пути
после abandon проверяет fill/Enter и сохранение портов; hash закрепляется до
старта. Отдельный live PASS after-abandon пока не заявлен.

Известный пробел экспорта: повторяющиеся tool_call_id и строковые local-tool
ответы в Hermes DB. `20260905-131822-165a251b` оставлен FAIL; молчаливая
дедупликация или трактовка строкового ответа как успеха недопустима.

## Экспорт после сжатия истории Hermes

Экспорт выполняется одной read-only транзакцией SQLite. `tool_call_id` в evidence
идентифицирует отдельное вхождение (исходный ID + строка + индекс), а
`provider_tool_call_id` сохраняет исходное значение. При одинаковом ID новые
времена остаются отдельными попытками. Подтверждённые копии после сжатия
(архивная исходная строка, тот же timestamp, граница `_compressed_summary`,
точное содержимое либо точный generic summary Hermes 0.21.0) записываются в
`storage_copies`. Конфликтующие ответы и неполное сопоставление дают FAIL;
самостоятельный строковый ответ не становится квитанцией успеха.

Тела assistant/system/summary и reasoning не читаются. Контракт generic summary
проверен по установленным Hermes `agent/context_compressor.py`, история — по
`hermes_state.py`/`run_agent.py`; другая схема хранения требует нового review.
Run 135148 подтвердил 24 копии и полное сопоставление, но сохранён как общий
33/34 FAIL из-за отдельного rename proof. Новый run `20260905-135741-5c45f2f3`
после исправления сравнения host metadata прошёл 34/34, включая
rename-after-abandon. Это заменяет прежние ограничения этого README на данный
путь и экспорт. Следующий объём P0 — review/фиксация и чистая поставка.

Для нового раздельного блока проверки используется `--require-verification`.
Контракт проверяет доставку каждого outcome proof и связь с журналом, отдельно
от обычной приёмки цели. Старые runs без этого флага не подтверждают новый блок.

### Explicit Xiaomi comparison (2026-09-06)

For the user-authorized full `--goal data-pipeline` comparison, pass
`--model-profile xiaomi-mimo`. The default remains `chatgpt-luna`. The isolated
run uses only the existing Hermes XIAOMI_API_KEY from its .env; it does not copy
other providers, personal MCP config, or subscription auth. Exact provider/model
identity must match `xiaomi` / `mimo-v2.5` in usage evidence. Fallback providers
are explicitly empty. All fixture, runtime pinning and domain gates still apply.

Use the subscription base URL from the existing Hermes Xiaomi credential-pool
entry associated with XIAOMI_API_KEY. Copy only that explicit XIAOMI_BASE_URL
into the isolated process environment. Do not substitute the normal metered API.

### Дубликаты и противоречия — подготовка приёмки

`run.py --goal duplicates-node-complete` использует три замороженных CSV из
`fixtures/duplicates/` и задачу `goals/duplicates-node-complete.txt`: 16 полных
node-операций, три доставки, checkpoint и явное save/reopen. Итоговая проверка:
`duplicates_node_acceptance.py --run-dir <каталог-прогона>`. Аудитор сверяет
исходные байты, все 10/8/0 строк, состав групп вместо номеров, роли до изменения
после открытия, GUID/связи, отсутствие UI-резерва и закреплённые версии.

Запуск требует явно выданного координатором слота Hermes, существующей подписки
ChatGPT `openai-codex / gpt-5.6-sol / low`, точного candidate URI/SHA, адреса
Loginom, аккаунта и storage directory. Здесь подготовлен runner; автономная
приёмка не объявляется завершённой по прямой Codex QA или модульным тестам.
Отдельный candidate-каталог для узла 12 должен быть подготовлен до этого запуска;
не переключать production-каталог и не подставлять другой провайдер/модель.
