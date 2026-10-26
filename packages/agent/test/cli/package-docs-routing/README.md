# Живая проверка выбора product skills

`cases.json` содержит 24 естественных русских запроса: 11 docs, 7 scenario,
6 default. Это собственный продуктовый corpus. Near-miss corpus, общий judge
prompt и harness соседней сессии остаются в её владении.

Ожидания в JSON — критерии будущего прогона, а не выполненная приёмка. Scripted
provider не доказывает выбор модели. Положительный docs-результат требует
реального документа, проверки его фактов и сохранения SHA исходного `.lgp`.
Для docs/default должны отсутствовать браузерные действия. Help-ответы остаются
в default, обычные вопросы выполняются и без настроенного Loginom.

## Подготовка одного запуска

Использовать отдельные HOME, profile, workspace, results и серверный namespace.
Файлы fixtures адресуются относительно корня репозитория; скопировать их в
собственный snapshot и сохранить SHA каждого файла и `cases.json`.
`local_lgp` находится внутри workspace. `unicode_lgp` находится снаружи workspace
в собственном input-каталоге; имя содержит пробелы, кириллицу и расширение `.LGP`.
`missing_lgp` — абсолютный путь, который точно не существует. `server_package`
указывает только на пакет этого запуска в собственном серверном namespace.
Перед передачей запроса подставить bindings; строк `{{...}}` в запросе не остаётся.

Вложения отправляются настоящими file parts: Desktop attachment, CLI `--file`,
TUI paste/`@`. Текстовая ссылка сама не становится вложением. Внешний текстовый
путь должен вызвать штатный запрос разрешения в Desktop/TUI и отказ с подсказкой
`--file` в неинтерактивном run. Для этого случая сохраняется штатное ask на
external_directory; `--auto` не используется. Проверять фактический session
directory для результата, сохраняя расположение и SHA оригинала отдельно.

Setup/followup выполняются настоящими пользовательскими сообщениями в одной
сессии. Setup строит собственный пакет или документ; в переходах документации
прикладывается именно сохранённый локальный `.lgp` этого построения. Не заменять
историю готовыми grants, синтетическими ответами или прямыми записями в БД.
В составном запросе сначала заканчивается построение; документация начинается
после получения локального файла новым сообщением пользователя.

## Прогон и доказательства

Закрепить source/binary/resources/skill digests, model ID/variant, параметры,
effective config, catalog и snapshot задач. Каждый кейс выполнить три раза
на основной модели отдельно в Linux Desktop и CLI run. Короткий smoke второй
модели и TUI выполняется дополнительно. Смена модели или параметров требует
новой серии; несовпадающие условия не объединять в сравнение.

Сохранять реальные applied activations, tool calls, permission requests,
process observations с границей точности, upload/admission и документы. Для
setup/followup записывать также их результаты и session/message IDs. Отказ
внешнего сервиса и незавершённый setup означают неполный кейс, а не успех.
Для отсутствующего входа проверять запрос файла и отсутствие итогового отчёта.
Для unconfigured arithmetic не добавлять Loginom API key; модельный доступ
настраивается в собственном профиле отдельно.

Slash-команды `/package-docs` и `/loginom-automation`, same-task denial и
TUI discovery проверяются отдельными механическими smoke: явная команда не
входит в эти 20 естественных запросов. Пара baseline/candidate через закреплённый
evals harness также выполняется отдельно по этапу 7 канонического плана.

## Локальные пути #74

Новые IDs: `scenario-create-path`, `text-read`, `edit-after-docs`, `docs-after-edit`. Внешние CSV/TXT и исходный `.lgp` передаются текстовыми путями; после правки bridge копирует actual saved package внутрь workspace для документации. Оба перехода задают `fixture: "edit_lgp"`: подтверждённый автономный [source](fixtures/edit-source.lgp) с `amount_double = amount*2`, созданный через UI и доработанный настоящим candidate CLI. SHA, исходные GUID, oracle `20/40/50` и cold rerun записаны в [provenance](fixtures/edit-source.provenance.json). Те же bytes подготовлены для входа `local-lgp-edit`; изменённый reference и живые edit transitions ещё не приняты. Старый default `lgp` и прежние cases сохранены.
Для #74 выбрать также existing `docs-local-path,docs-external-unicode-path` и запускать Desktop/CLI с явным `--repeat 1`; default runner остаётся 3. Scenario CLI turns уже используют `--auto`; scoped external-directory allow применяется только к `text-read` и docs-ходу `edit-after-docs`. Existing external docs CLI case сохраняет отказ с `--file` hint. Desktop одобряет запросы по источнику текущего хода; evidence хранит все решения.
Verifiers проверяют admit → delivery → импорт CSV, SHA исходного `.lgp`, сохранение GUID/портов связей и результат amount*3. Для документа после правки проверяются источник extract/emit и точные факты Markdown; для Read — точное значение ответа. Unit checks не являются installed/model acceptance; [канонический план](../../../../../docs/superpowers/plans/2026-10-21-local-file-paths.md) разделяет подготовку fixture и живые прогоны. Desktop temp roots учитывают TMPDIR; при локальном запуске задавать `/home/kiselev/storage/tmp`.
