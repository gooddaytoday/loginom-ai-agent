# Локальные файлы по путям из prompt — дизайн #74

Дата ревизии: 2026-10-21. Задача: [#74](https://github.com/gooddaytoday/loginom-ai-agent/issues/74). Проверенная база дизайна: `loginom@72bfb4e45e3ede244121a3f3de589b3afb51b533`.

Этот документ — каноническое описание поведения с решениями владельца после внешнего ревью. [План](../plans/2026-10-21-local-file-paths.md) определяет порядок работ и проверки; фактический статус указан в checkpoint ниже.

## Результат и границы

Пользователь Desktop или standalone CLI указывает в обычном prompt один или несколько локальных путей. Агент читает либо передаёт файлы по назначению задачи без обязательного вложения в чат и без `--file`. Доступ ограничивают ОС и политика приложения, включая пути вне каталога сессии.

- Новая загрузка ограничена **16 MiB на файл** — существующий предел host/runtime. Default старого attachment snapshot остаётся **10 MiB**; это не новый предел обычного Read или документации.
- Один вызов регистрации принимает один файл. Несколько путей обрабатываются отдельными вызовами; одинаковый basename в разных каталогах допустим. Ошибка одного файла не стирает успешные регистрации остальных и не позволяет объявить всю задачу выполненной.
- Относительные пути разрешаются от каталога сессии; абсолютные — нативно для текущей ОС. Пробелы, кириллица, `#`, `%` и допустимые символы пути читаются буквально, без URL decode и shell expansion.
- Источник читается как байты. Допустимость формата определяет операция Loginom, а не общий CSV-only фильтр регистрации.
- Изменение `.lgp` относится к `loginom-automation`; документация по тому же пути — к `package-docs`. Обычное чтение TXT не запускает Loginom.
- Автоматическое включение `.lgp` в текст модели и ordinary attachment admission по-прежнему запрещено. Это не запрещает явную обработку приложенного пакета через разрешённый путь.
- Сохраняются существующие attachments, серверный `open_package(package_path)`, профильные ограничения и cancellation/recovery. Обычный data delivery сохраняет свою проверку серверной копии.
- Новый маршрут локального `.lgp` проектируется без контрольного скачивания. Независимый SHA серверной копии не обещается.

## Общая авторизация локального пути

Один helper авторизации используется в `package_docs_run`, `loginom_file_admit` и `local_package_path`. Он переносит существующую проверку вложения из `packages/agent/src/tool/package-docs.ts:51–77`, а не создаёт её вторую копию:

1. Разрешить requested path от session directory и проверить для него явный `read`/`external_directory` deny объединённой agent/session policy до realpath и формирования файловой ошибки. Так известный запрет сохраняет свою причину, даже если путь недоступен ОС.
2. Получить canonical path через realpath и проверить явный deny также для него. Обе проверки предшествуют учёту attachment и прежнего allow-always.
3. Рассматривать только видимые исходные сообщения пользователя своей сессии с учётом revert; исключить compaction replay. Вложение — принадлежащий такому сообщению file part с `file:` URL без query и fragment; его realpath должен совпасть с canonical path источника.
4. Подходящее вложение разрешает чтение без повторного запроса. В частности, приложенный внешний `.lgp` можно править в неинтерактивном CLI через `local_package_path`. При явном deny вложение не даёт обхода.
5. Для неприложенного файла применить обычные разрешения и запросы доступа. Сохранить typed rejection, `metadata.permissionDenied` и соответствующий код выхода CLI.

Backend вызывает helper после `tool.execute.before`, чтобы проверять фактические аргументы. Для двух путей загрузки общий snapshot helper затем читает **canonical/realpath**, используя существующий bounded regular-file reader. `package_docs_run` использует авторизацию без навязывания нового snapshot/лимита. Host получает разрешённые байты и имя, а не право читать произвольный OS path.

### Ошибки

Все три входа сообщают **причину и путь**: файл отсутствует, путь указывает на каталог/special file, нет доступа, превышен размер или обнаружено изменение во время чтения. Отсутствие admission само по себе не считается достаточной проверкой ошибки.

Подсказка «приложите файл — `--file` в CLI, вложение в Desktop/TUI» даётся **только при отклонении запроса разрешения**: обычного ask или автоотказа неинтерактивного CLI. Для отсутствующего файла, каталога, special file, ошибки прав ОС (включая EACCES) и других файловых ошибок подсказки нет: вложение не устраняет причину, а `--file` читает файл с теми же правами ОС. При **явном запрете в настройках** подсказки также нет. Причина и путь сохраняются во всех ветках. Существующий `--file` hint для permission rejection, его tests и `permission-refusal-with-file-hint` в routing corpus сохраняются; текст дополняется, а не заменяется.

Правило относится и к запросу разрешения самого инструмента, и к запросам доступа к пути. Источник подсказки — отклонённый запрос, а не сам факт неудачного чтения файла; typed error и `permissionDenied` сохраняются.

### Известное ограничение permissions

В `Permission.ask` прежний allow-always с шаблоном `*` может перекрыть policy deny: `permission/index.ts:28–37` выбирает последнее совпадение, а строка 73 передаёт `approved` после `ruleset`. Новый precheck закрывает это только для новых входов и `package_docs_run`. Обычный `Read` сохраняет прежнее поведение; исправление общего permission engine не входит в #74. Это ограничение подтверждено чтением кода, не новым тестовым прогоном.

## Регистрация, identity и имя копии

Backend-owned `loginom_file_admit({ path: string })` доступен только в automation после успешного `dock_prepare`. Ответ содержит абсолютный `source_path` выбранного источника и existing descriptor (`artifact_id`, `name`, `bytes`, `sha256`, `upload`). Tool регистрирует снимок; доставку выполняет существующий `dock_artifact_deliver`. Список artifacts уже возвращает `dock_action_describe({})`. `.lgp` направляется в `dock_prepare.local_package_path`, а не в generic data admission.

Identity регистрации создаёт backend:

```ts
JSON.stringify(["local-file", ctx.messageID, ctx.callID])
```

`messageID` принадлежит сообщению **ассистента**, не `taskMessageID`: одинаковые provider call IDs в разных ходах не должны конфликтовать. Используются существующие `inputStore` и `artifactStore`; группы local calls не смешиваются с immutable attachment-группой. Не добавляются таблица повторов или постоянный registry. Новый вызов модели — новая регистрация и новое чтение файла. После повторной подготовки runtime прежние `artifact_id` недействительны: skill требует зарегистрировать локальные файлы заново.

Нормализация имени server copy находится **только в `packages/loginom-host/src/inputs.ts`**, при формировании имени с существующим identity/index prefix. На `_` заменяется объединённый набор `\ / : < > " | ? * % #`, управляющие `U+0000–U+001F/U+007F`, конечные точки и пробелы. Расширение сохраняется, в том числе при ограничении длины; original path и bytes не меняются. В этом же файле нужно согласовать раннюю проверку controls со стадией нормализации, иначе до неё такие имена не доходят. Downstream validators не ослабляются. Правка действует и на вложения.

Основания: `artifacts.mjs:11–13`, `text-import-procedure.mjs:61–63`, `imports-excel-parameters.mjs:23–24`, `storage-policy.mjs:6–12`. Сейчас `%` может пройти upload, но сорвать import; `#` — сорвать open/save. Identity/index различает разные источники даже после совпавшей нормализации имён. Первоначальный upload сохраняет `overwrite: reject`.

Существующий ранний `[]` в Host standalone admit (`host-port.ts:352–355`) не меняется, новые тесты «точного повтора» не добавляются. У `adapter.admit` нет найденного production caller, однако есть вызов в `script/parallel-calls-live.ts:78`; утверждение «никем не вызывается» неверно.

## Подготовка локального пакета

Backend-обёртка `loginom_dock_prepare` принимает для `intent: open_package` ровно один источник: существующий серверный `package_path` либо новый `local_package_path`. Последний несовместим с `workflow_ref` и другими intent. Runtime MCP schema не получает OS path: backend авторизует источник, снимает snapshot и передаёт private package input; host превращает его в artifact/grant pair. Только этот явный маршрут допускает `.lgp`; общий attachment deny сохраняется. Runtime по-прежнему запускается только через prepare.

После существующего loginBrowser, до открытия пакета, private маршрут получает настоящий storage binding authenticated origin/document/account/build и разрешённого каталога. Затем переиспользует snapshot → `stageTransfer` → lease verification → `setInputFiles` → native upload. В основном варианте не нужны пустой draft, фиктивный workspace identity, второй browser или публичный флаг отключения проверки.

Текущий upload receipt `AMBIGUOUS / UPLOAD_SERVER_VERIFICATION_REQUIRED` нельзя переименовать в success. Private package finish подтверждает завершение upload, тот же sender/owner/catalog и свежую точную строку файла с ожидаемыми name/path/type/size; затем сохраняет завершение и освобождает lease/pending. Точный размер **уже** возвращается из native `FileStore` в `workspace-ui.mjs:2959–2981`; разбор форматированного UI размера не нужен. Ошибку вспомогательного отчёта следует отделять от результата операции; durable journal/ownership/cleanup остаются обязательными для безопасного продолжения.

Открывается destination подтверждённого upload. `source_sha256` относится к переданному снимку, не к скачанной серверной копии. `workspaceReady` подтверждается для фактически открытого пакета. Второй запрос открыть B при уже подготовленном workspace A требует нового `operation_id`, корректных квитанций и сохранения проверок чужих workflow; прежнее READY не доказывает готовность B.

Если upload завершён, а open упал, результат содержит `next_step` на **существующий** `dock_prepare` с `intent: open_package` и `package_path`, равным подтверждённому destination. Пакет нельзя объявить открытым. Повтор `dock_prepare(local_package_path)` — новый вызов и новая загрузка; отдельного состояния автоматического повтора нет. При неизвестном исходе upload действуют прежние recovery правила, без подсказки открыть неподтверждённый путь.

### Время и точка решения

Текущие границы: runtime call — 105 с (`call-timeout.mjs`, `managed-entry.mjs:228–232`), Host IPC — 105 + 15 = около 120 с (`host-port.ts:457`), adapter — не меньше 180 с (`adapter.ts:88`). Внутри нужны binding/переход в «Файлы», upload (до 35 с), проверка строки, open (внутренний timeout до 125 с; есть и проверка geometry). Максимумы стадий нельзя просто сложить и считать, что внешний вызов их дождётся: возможен `LOGINOM_CALL_UNCERTAIN`.

Ранняя проба измеряет стадии и полный маршрут из home, а также при готовом workspace A. Реализация должна уложиться в общий бюджет; если этого недостаточно, бюджет расширяется согласованно во всех участвующих слоях, с проверкой cancellation/cleanup, а не только в adapter.

Если доступное read-only наблюдение не доказывает завершение upload, **остановить развитие этого механизма** и представить владельцу варианты с оценкой изменений, времени и рисков: контрольное скачивание через существующую проверку либо маршрут через черновик и существующую доставку. Не добавлять новые слои верификации и не менять основной вариант молча. Задача этой ревизии — зафиксировать точку решения, не принять альтернативу заранее.

## Skill: выбор задачи и сохранение

Модель выбирает intent; существующий trusted skill/profile механизм и Host границы остаются авторитетными. Новый настоящий запрос пользователя начинает task в default. Docs не получает регистрацию/prepare/upload и не обходит запрет через custom tool с совпадающим ID. Нового классификатора намерения нет.

Правило сохранения добавляется в `loginom-automation` и не требует нового runtime кода сохранения:

- Если пользователь **не указал путь**, сохранить изменения в ту собственную загруженную копию, которая открыта: `/<user>/<identity>-0-<имя>.lgp`. Для замены именно этой копии разрешён `conflict_policy: replace`. Это не разрешение перезаписывать чужие файлы или повторно загружать поверх них.
- Если путь указан, сохранять туда по существующим правилам перезаписи.
- В итоговом ответе назвать **полный подтверждённый серверный путь** и прямо сообщить: **локальный файл не изменён**.

Это совместимо с существующим Save/conflict handling и совпадающими product каталогами inputs/packages (`managed-entry.mjs:141`). Правило skill «для документации нужен локальный `.lgp`, автоматического скачивания сохранённого серверного пакета нет» (`SKILL.md:121–124`) сохраняется. Получение изменённой copy тестовым harness для следующего хода не добавляет такое поведение продукту.

## Проверки и размещение кейсов

### Проверки без модели и ранний главный путь

Проверяются реальные bytes, новый явный предел snapshot, canonical read, тексты missing/directory/access ошибок, typed deny, attachment authorization без повторного ask и deny поверх attachment/allow-always. Existing default-limit/special-file tests переиспользуются. Проверяются раздельные local identities между сообщениями ассистента, несколько файлов, `%/#/:/?` в basename и неизменность источников.

Runtime проверки покрывают private `.lgp` route, native completion, общий deadline, ready workspace → B, actual `next_step` после open failure, unknown/conflict/owner change/cancel и прежнюю data verification. После задачи регистрации и минимальных инструкций для данных выполняется ранний standalone CLI прогон с `run --auto`: два внешних CSV с пробелами/кириллицей в путях → upload/import/правильный результат, отдельно missing path с понятной ошибкой. Без `--auto` или явного разрешения каталога неинтерактивный CLI отклоняет запрос доступа; автоодобрение не отменяет configured deny. Dev bundle допустим; это source evidence, не installed acceptance. Проба `.lgp` может идти параллельно.

### Существующий routing corpus

Все проверки выбора skill и переходов остаются в `packages/agent/test/cli/package-docs-routing/cases.json`, fixtures — с существующим repo-relative root. Runner `skills-acceptance` не получает `--corpus`, второго root, `expected.json` или специального default repeat. Целевые запуски CLI/Desktop используют явный **`--repeat 1`**.

- Переиспользовать `docs-local-path` и `docs-external-unicode-path`; новый `lgp-docs` дублировал бы их. Сохранить разные ожидания external case: Desktop разрешает доступ, CLI ожидает отказ с `--file` hint.
- Добавить новые IDs `scenario-create-path`, `text-read`, `edit-after-docs`, `docs-after-edit`; существующие `scenario-after-docs`, `docs-after-build` и их ветки `turns.mjs:8–17` не менять.
- `scenario-create-path` — вариант существующего создания сценария с внешним CSV в prompt без attachment. На **Desktop и CLI** обязателен полный путь `loginom_file_admit` → `dock_artifact_deliver` → import → проверенный результат.
- Для внешнего `.lgp` переиспользовать `external-text-path` с optional case key `fixture`, default — `lgp`. Оба перехода задают `fixture: "edit_lgp"` и используют исходную edit-фикстуру задачи 7 с `amount`/`amount_double`; прежний `fixtures.lgp` (`nested.lgp`) не подходит для правки и не меняется. CLI и Desktop выбирают один и тот же ключ, сохраняя его для setup/turns; исходные bytes обоих переходов совпадают с source package `local-lgp-edit`, а не с изменённым reference. `csv-path` и `created-lgp-path` нужны там, где старые kinds создают вложение. Для TXT нужен явный текстовый fixture/путь; не менять смысл старого `.lgp` case ради названия kind.
- Оба перехода — настоящие user turns в одной Session. В edit → docs harness получает реально сохранённую изменённую copy в каталог сессии; prompt указывает её путь через `{{created_lgp}}`. Поэтому этому docs-ходу не нужно разрешение внешнего каталога. Для совместимости существующего bridge transition prompts явно задают итоговый `{{server_package}}`; правило сохранения без заданного пути проверяется отдельным целевым CLI запросом, без нового runner.
- Сценарные ходы CLI уже используют `--auto` (`run.mjs:147`); дополнительных правил доступа им не нужно. Scoped-разрешение только на собственные input path/catalog требуется несценарным `text-read` и ходу документации в `edit-after-docs`. Desktop использует существующее одобрение запроса. Старый external docs refusal case не меняется. Applied activation и реальные tool results важнее заявления модели. Для документа после правки достаточно 1–3 точных фактов, например формулы `amount*3`; без разбора таблиц и нового judge/module при достаточности существующего общего модуля. `text-read` проверяет точное значение ответа и completed Read.

### Только два сценарных eval в evals/

По [loginom-eval-case](/home/kiselev/git/agent-validation/.agents/skills/loginom-eval-case/SKILL.md) готовятся `evals/tasks/local-path-scenarios/csv-two-paths/` и `local-lgp-edit/`: настоящие reference, SPEC, независимый oracle, graph checks и provenance. Отдельного routing corpus в `evals/` нет.

`input_mode: "paths"` сохраняет вложенные пути внутри **каталога текущей попытки**, например `data/Первый #1/sales.csv`, допускает одинаковые basename разных относительных путей, подставляет `{{INPUT_ROOT}}` и передаёт пустой `files`. Метка режима входит в hash; старый attachment default/hash сохраняется. Входные hashes сравниваются до и после попытки. Read-only гарантия входам не приписывается: существующий workspace mount доступен для записи. Дополнительный input root, `--ro-bind`, per-attempt scoped policy и изменение `sandbox.ts` не нужны. Внешние пути покрываются другими перечисленными проверками. Правило basename в `evals/AGENTS.md` уточняется при реализации.

References строятся task-local копиями `run_attempt.sh` и `prepare_attempt.ts` skill. Копия подготовителя сохраняет вложенные paths, подставляет root и пишет пустой `files.txt`: существующий shell уже не добавляет `--file` при пустом списке (`run_attempt.sh:62–65`). Candidate CLI/WORK_ROOT задаются task-local env через `LOGINOM_EVAL_CASE_ENV`. Сохраняются layout evidence и соседние зависимости scripts. Для двух `sales.csv` адаптируются task-local `collect_artifacts.py` (однозначное сопоставление по relative source → descriptor/destination и SHA, а не basename) и `validate_collection.ts` (duplicate basename допускается только в paths-mode). Установленный skill не меняется. Adapter вокруг `runAttempt`, экспорт `prepareProfile` и искусственный Task не нужны.

Oracle рассчитывается до модели; reference строится максимум за три попытки, проходит graph/result checks, cold rerun и ordinary positive/foreign-negative calibration двух новых IDs. Модель/variant reference берутся из актуальной skill config, judge — из repository pin; роли не смешиваются. Сгенерированные cases не коммитятся автоматически skill. Запрет живого benchmark `--repeat` при создании эталонов не относится к отдельному согласованному skills-acceptance `--repeat 1`.

Временные scripts/configs, profiles и evidence создаются под `/home/kiselev/storage/tmp/`; тестовые fixtures в переносимом коде используют `os.tmpdir()`. Candidate SHA/model/variant и cleanup фиксируются, секреты в отчёты не попадают. Не путать reference authoring по skill, ранний source smoke и installed/sandbox acceptance; у них разные свидетельства. Неизолированный fallback benchmark и удаление writer guard не разрешаются.

## Checkpoint

- 2026-10-21: ревизия по внешнему ревью и согласованным решениям владельца; база `72bfb4e45` проверена чтением кода.
- Уточнение владельца: hint только при permission request rejection/CLI автоотказе; файловые ошибки и configured deny — без hint.
- Удалены точные повторы, второй routing corpus, новые mounts и reference adapter; runtime IDs после prepare обновляются регистрацией.
- Переходы выбирают fixture edit_lgp, default lgp сохранён; ранний CLI и scenario turns используют --auto, scoped allow только для двух несценарных входов.
- Задачи 1–3 выполнены по TDD: common path authorization/data registration и private local-package upload/open без download; [evidence](../../testing/loginom-ai-agent/local-file-paths.md).
- Native source IPC: A → B в одном document, отдельные operation/workflow, граф A сохранён; 6,9/6,3 с после ограничения всех private read/navigation/upload общим deadline. ACK/exit0 и удаление собственного стенда подтверждены.
- Независимое ревью задачи 3 Approved; изменённые attribution entries проверены, общий verifier имеет прежний README hash mismatch. Source-проверки не подтверждают installed acceptance.
- По просьбе владельца работа приостановлена: задача 4 (skill/save instructions) внесена частично и сохранена в checkpoint; полный regression после изоляции тестовой фикстуры ещё не повторён.
- Задачи 5–8 не начаты: paths-mode, routing corpus, два scenario eval и installed/model acceptance. Точная команда продолжения и состояние задачи 4 — в checkpoint плана; поведение дизайна не сужено.
