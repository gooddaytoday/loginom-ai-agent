# Локальные файлы по путям из prompt — дизайн #74

Дата: 2026-10-21. Задача: [#74](https://github.com/gooddaytoday/loginom-ai-agent/issues/74).
База исследования: ветка `loginom`, `72bfb4e45e3ede244121a3f3de589b3afb51b533`.
Статус: требования согласованы; реализация и живые проверки ещё не выполнены.

## Результат и границы

Пользователь Desktop или standalone CLI указывает в обычном prompt один или несколько локальных путей. Агент читает или передаёт выбранные файлы по назначению задачи без обязательного вложения в чат и без `--file`. Доступ определяется правами ОС и действующей политикой приложения, включая пути вне рабочего каталога.

Согласованные ограничения:

- Лимит новой загрузки — **16 MiB на файл**. Это существующий предел host/runtime, а не лимит чтения моделью. Старый предел attachment snapshot 10 MiB этим изменением не повышается.
- Один вызов регистрации принимает один файл. Несколько путей в одном prompt обрабатываются отдельными вызовами. Одинаковые basename в разных каталогах допустимы.
- Относительный путь разрешается от каталога текущей сессии; абсолютный — нативными средствами текущей ОС. Пробелы, кириллица, `#`, `%` и допустимые на этой ОС символы остаются буквальной частью пути. Не применять URL decode и shell expansion.
- Чтение и регистрация работают с байтами, не ограничиваются CSV. Допустимость формата проверяет конкретная операция Loginom; неподдерживаемый формат даёт явную ошибку.
- `.lgp` для редактирования, исправления или доработки загружается и открывается через `loginom-automation`. Для документации тот же локальный файл обрабатывает `package-docs` без browser/runtime upload.
- `.lgp` по-прежнему не включается автоматически в текст модели и не проходит обычный автоматический attachment admission.
- Новый маршрут локального `.lgp` не делает контрольного скачивания. Проверка исходных байтов, подтверждение загрузки и открытия обязательны; независимый SHA серверной копии не обещается.
- Существующие вложения, серверный `open_package(package_path)`, профильные запреты, cancellation/recovery и проверка серверной копии при обычной доставке данных сохраняются.
- Новые evals с настоящей моделью, подготовленными prompts и fixtures размещаются в `evals/`. Реализация проходит TDD. В этой задаче создаются только дизайн и план.

## Почему не новый файловый сервис

`Read` и `package_docs_run` уже читают локальные пути; `file-snapshot.ts` умеет ограниченное чтение regular file через открытый handle; host уже сохраняет байты и проверяет identity; runtime уже имеет artifact store, private transfer lease, upload и recovery. Недостающая часть — разрешённый backend-вход от выбранного моделью пути к существующей передаче байтов и подготовка локального пакета до открытия workspace.

Не добавляются файловый сервер, сканирование каталогов, глобальный registry, парсер путей всего prompt, классификатор намерения или универсальный механизм выбора верификатора. Модель выбирает файл и skill; backend разрешает конкретную операцию.

## Входы и ответственность

### Регистрация файла данных

Новый backend-owned tool `loginom_file_admit({ path: string })` доступен только в профиле automation после успешного `dock_prepare`. Он возвращает `source_path` — абсолютный путь выбранного источника — и существующий runtime artifact descriptor: `artifact_id`, `name`, `bytes`, `sha256`, `upload`.

Вызов разрешает регистрацию снимка, но сам не запускает browser и не загружает файл. Модель использует существующий `dock_artifact_deliver` и descriptor. Повторное перечисление доступных artifacts уже есть в `dock_action_describe({})`; новый list tool не нужен. `.lgp` через этот tool отклоняется с указанием `dock_prepare.local_package_path`.

Backend применяет один общий helper для этого tool и подготовки локального пакета:

1. Проверяет непустой нативный путь и разрешает его от session directory.
2. Применяет `read` и, где необходимо, `external_directory` к запрошенному и каноническому пути. Явный deny в объединённой agent/session policy проверяется до ранее выданного allow-always. Отказ сохраняет `metadata.permissionDenied` и корректный код выхода CLI.
3. Читает regular file через существующий bounded snapshot с явным пределом 16 MiB. Каталог, special file, отсутствующий/недоступный файл, превышение размера и обнаруженное изменение во время чтения завершают этот вызов до upload.
4. Передаёт host только разрешённые байты и имя; произвольный OS path не становится полномочием host/runtime. Helper вызывается после `tool.execute.before` hooks, чтобы проверять фактические аргументы.

`--auto` может отвечать на запрос разрешения, но не обходить deny. В неинтерактивном CLI сохраняется существующая политика отказа от неразрешённых asks; требование no-attachments не означает скрытое разрешение всего диска.

### Identity, имена и несколько файлов

Для явной регистрации используется отдельная identity на основе session/tool-call, а не исходная immutable группа вложений сообщения. Host повторно использует `inputStore`, runtime — `artifactStore`; один вызов создаёт одну запись. Несколько вызовов не перезаписывают immutable attachment manifest. У разных источников с одинаковым basename разные artifact IDs и серверные destination.

Только имя передаваемой копии приводится к ограничениям серверного хранилища с сохранением расширения; исходный путь остаётся неизменным и возвращается рядом с descriptor. Для destination сохраняется `overwrite: reject`. Нет перезаписи пользовательского файла или другого server artifact.

Повтор той же операции использует прежний снимок и operation ID, не перечитывает изменившийся исходник. После утраты runtime требуется явная новая регистрация. Ошибка одного источника не удаляет успешные регистрации других и не позволяет объявить всю задачу выполненной.

### Локальный пакет для редактирования

Расширяется существующий `dock_prepare`:

```ts
{ intent: "open_package", package_path: string }       // прежний серверный путь
{ intent: "open_package", local_package_path: string } // новый локальный путь
```

Для `open_package` требуется ровно один из этих источников. `local_package_path` недопустим при других intent. Это аргумент backend tool, не путь для произвольного чтения browser/runtime.

Backend вызывает общий permission/snapshot helper и передаёт private package source в уже существующий prepare. Только этот явный маршрут допускает `.lgp`; запрет automatic attachment admission не снимается. `prepare` остаётся единственной точкой запуска runtime — общий registration tool не получает нового права запуска.

После существующего loginBrowser, до открытия пакета, runtime устанавливает реальный storage binding к authenticated origin/document/account/build и разрешённому каталогу. Выделяется только необходимая часть существующей подготовки. Не создаётся пустой draft, фиктивный workspace identity или публичное состояние «подготовлен для файлов».

Далее переиспользуется цепочка artifact snapshot → `stageTransfer` → проверка lease → `setInputFiles` → native upload. Существующий upload receipt имеет `AMBIGUOUS / UPLOAD_SERVER_VERIFICATION_REQUIRED`; одного пустого input и отсутствия loader недостаточно, чтобы заменить его на success.

Private завершение для пакета должно подтвердить в пределах исходного deadline:

- тот же sender, document/account и каталог назначения;
- завершение native upload, отсутствие конфликта и ожидающей операции;
- свежую точную строку созданного файла: destination/name, тип file и ожидаемый размер;
- запись завершения и очистку transfer lease/pending по правилам существующего journal.

После этого открывается **destination из подтверждённой операции**, а не повторно придуманный путь. Успешный `open_package` подтверждает фактический открытый пакет и только тогда устанавливает workspaceReady.

В receipt SHA относится к источнику (`source_sha256`), а не к независимому чтению серверной копии. Гарантия: «передан проверенный снимок выбранного файла, загрузка подтверждена, пакет открыт по подтверждённому пути». Публичный флаг `verify_remote: false` не нужен. Для обычного `dock_artifact_deliver` существующий download/readback остаётся прежним.

После успешной загрузки и неудачного открытия retry может только продолжить разрешённое открытие того же destination. Неизвестный результат загрузки, смена owner или конфликт не разрешают повторную отправку. Новый явный запрос после recovery — отдельная операция.

**Ранняя проверка предположения:** на настоящем Loginom пройти authenticated home → upload fixture `.lgp` → подтверждение native completion/строки → open exact destination без draft, download и повторной отправки. Проверить также конфликт `reject` и задержанный/неудачный upload. Это первый runtime этап реализации. Если текущие observations не различают завершение и неопределённость, сначала найти более точное read-only native подтверждение; не возвращать фиктивный success и не добавлять контрольное скачивание молча.

## Выбор skill

Обновляются существующие описания `loginom-automation`, `package-docs` и bootstrap guidance. Intent определяется задачей, а не расширением файла:

| Prompt | Поведение |
| --- | --- |
| «Исправь расчёт в `/.../sales.lgp`» | automation → prepare local package → изменение и сохранение |
| «Создай документацию к `/.../sales.lgp`» | docs → локальный package_docs_run → реальный документ |
| «Используй `/a/sales.csv` и `/b/sales.csv`» | automation → две регистрации → работа с обоими artifacts |
| «Прочитай значение из `/.../note.txt`» | обычный Read, без запуска Loginom |

Инструкции не предлагают обязательное вложение/`--file` для доступного по политике локального файла. Ошибка доступа сообщает причину и путь. Ошибка формата относится к выбранной операции.

Backend продолжает ограничивать catalog и выполнение по текущему task profile. Docs не получает registration, prepare/upload и обход через custom tool с совпадающим ID. Следующий настоящий запрос пользователя начинает новый task в default; переключения docs → edit и edit → docs проверяются в одной сессии. Глобально запрещать обычное явное чтение `.lgp` не требуется: сохраняется именно запрет автоматического включения его содержимого.

## Проверки

### Поведение без модели

- Snapshot: точные бинарные байты, граница 16 MiB, отказ выше границы, прежний default 10 MiB, regular-file ошибки.
- Policy: внутренний/внешний/относительный путь, explicit deny до allow-always, symlink alias, CLI permission marker, отсутствие admission при отказе.
- Host/runtime: identity повторов, одинаковый basename, safe destination name, mutation исходника после snapshot, private package-only допуск `.lgp`, отсутствие general runtime startup.
- Package prepare: проверенный upload/open, отсутствие download, конфликт/неизвестный исход/cancel/owner change, cleanup; существующая data verification не ослаблена.
- Routing boundary: catalog и фактический запрет вызова в docs/default, автоматический `.lgp` attachment exclusion, следующий user task и сохранение старых вложений.

Проверяются наблюдаемые результаты, не количество вызовов внутренних helper. Новое поведение добавляется отдельными RED → GREEN → REFACTOR циклами.

### Настоящая модель и подготовленные prompts в evals/

Применяется [точный loginom-eval-case skill](/home/kiselev/git/agent-validation/.agents/skills/loginom-eval-case/SKILL.md). Пользователь переопределил каталог `agent-validation/sources` на `evals/`; требование native paths также намеренно заменяет basename-only входы и допускает одинаковый basename разных файлов. Исторические attachment cases сохраняют свой контракт.

**Два сценарных evals:** `evals/tasks/local-path-scenarios/csv-two-paths/` и `local-lgp-edit/`. У каждого настоящие `task.json`, `SPEC.md`, `reference.lgp`, независимый oracle, graph acceptance и provenance. Первый использует два разных `sales.csv` из вложенных каталогов; результат должен отличать обработку обоих файлов от любого одного. Второй изменяет существующий локальный `.lgp`; числовой результат и граф должны доказывать изменение исходного пакета, а не создание несвязанного нового.

Существующий eval harness получает узкое `input_mode: "paths"`; отсутствие поля сохраняет attachment-mode. В paths-mode вложенные пути сохраняются, `{{INPUT_ROOT}}` подставляется в подготовленный prompt, `--file`/file parts отсутствуют. Входы текущей попытки размещаются отдельно от session directory и получают только собственный read-only sandbox mount и scoped app permission. Corpus, oracle, SPEC, reference, Git и чужие attempts остаются недоступны агенту. Семантика paths-mode входит в hash входов; старые hashes не меняются из-за default-поля.

**Два одноходовых routing evals:** `lgp-docs` и `text-read`; канонические prompts, inputs и ожидаемые факты находятся в `evals/cases/local-file-routing/`. Их результат — настоящий Markdown-документ с верными фактами пакета и точный ответ из TXT соответственно. Применяются существующие возможности real-model skills-acceptance запуска/сбора evidence; пакетный judge и `output_mode: diagnostic` для документов не используются. Не создаётся фиктивный `reference.lgp`, новый модельный судья текста или общий framework непакетных результатов.

В `script/skills-acceptance.ts` добавляется необязательный `--corpus`; его default и исторические repo-relative fixtures сохраняются. Явный corpus использует fixtures относительно собственного каталога. Остаётся схема `loginom-skills-routing.v1`; в `run.mjs`/`desktop.mjs` добавляются только native-path inputs, TXT binding, scoped permission и проверки содержимого. Входы передаются text-only, actual document извлекается из существующего evidence workspace. Небольшой oracle сверяет факты в Markdown; Read требует завершённого `read` и ожидаемого значения ответа. Нового launcher, profile lifecycle или output mode не требуется.

Для явно выбранного нового корпуса default — одна попытка на case, исторический default без `--corpus` остаётся прежним. Это исключает скрытый тройной платный прогон при подготовке новых evals; отдельный повтор не является шагом создания эталона.

**Два перехода E2E:** docs → edit и edit → docs в одной сессии на существующем Desktop/CLI skills-acceptance. Prompts и fixtures также лежат в этом корпусе `evals/`. В edit → docs источник второго хода — реально сохранённая и выгруженная изменённая локальная копия. Эта выгрузка нужна пользователю для документации и не является контрольным скачиванием при исходном upload.

Используются существующие transition IDs внутри нового corpus: `scenario-after-docs` и `docs-after-build`. `turns.mjs` сохраняет attachment default и допускает явный `created-lgp-path`; существующий bridge получения сохранённого пакета и проверка Session ID переиспользуются. Acceptance runner остаётся Linux x64: installed CLI image/Docker и изолированный Electron с настоящим backend; это отдельное свидетельство от bubblewrap scenario evals и не проверка всех installer-форматов.

Для всех checks сохраняются applied skill activations и tool results, а не заявления модели; отсутствие attachments; соответствие source → artifact → destination; исходные/итоговые hashes; фактические outputs. Docs-turn не начинает новую browser/upload операцию; отдельный docs-case не запускает runtime. CLI и Desktop проверяются отдельно, Windows paths — на Windows, а не строковой симуляцией под Linux.

Reference cases готовятся по skill: independent oracle до модели, максимум три попытки построения, проверка графа, холодный rerun, обычная positive/foreign-negative calibration для новых scenario IDs. Не запускать live `--repeat`. Не коммитить сгенерированные кейсы в рамках skill. Черновики находятся вне принятого корпуса; attempts, profiles и временные конфиги — в `/home/kiselev/storage/tmp/`.

Модель построения reference берётся из конфигурации skill (наблюдалась `openai/gpt-6.1-sol`, `xhigh`), модель judge — из текущего repository pin (`gpt-6-sol`, `xhigh`); это разные роли. Для acceptance фиксируются фактически использованные candidate SHA, модель и variant. Нужен установленный candidate CLI/desktop с изменением #74, не произвольный текущий бинарник. Сохраняются isolated endpoint, чистый профиль, фильтрация child env и подтверждённый cleanup; инфраструктурный отказ не считается аналитической ошибкой и не снимается удалением writer guard.

## Основные файлы и порядок

1. Agent `util/file-snapshot.ts`, новый общий local-file helper и `session/tools.ts`: policy, snapshot и model-facing входы.
2. Host `src/host-port.ts`, `src/inputs.ts`, private adapter/IPC; runtime `managed-entry.mjs`, `bridge.mjs`, workspace preparation, `artifacts.mjs`, `artifact-delivery.mjs`, `executor.mjs`: reuse admission и package upload/open.
3. Product skills, bootstrap guidance и owning AGENTS: снять attachment-only ограничение только для разрешённого backend local-path route.
4. Evals `src/task.ts`, `run.ts`, `cli.ts`, `sandbox.ts` и существующий skills-acceptance: native paths, реальные outputs, corpus, evidence.
5. Детерминированные проверки, live gate, новые references/evals и Desktop/CLI E2E. Изменения public Protocol/HTTP API не планируются; generated SDK не редактируется.

## Checkpoint

- 2026-10-21: дизайн по #74 согласован с правками пользователя; product база `72bfb4e45`.
- Лимит 16 MiB, несколько путей, local `.lgp` edit и docs routing включены.
- Контрольное скачивание нового local `.lgp` исключено; native completion ещё не проверено живьём.
- Новые real-model cases запланированы в `evals/` по указанному skill; корпус и эталоны пока не созданы.
- Код, unit/e2e tests, model runs и calibration в этой planning-задаче не запускались.
- Независимое spec review: Approved; технические предположения не считаются живой проверкой.
- Следующий шаг: [подробный план реализации](../plans/2026-10-21-local-file-paths.md).
