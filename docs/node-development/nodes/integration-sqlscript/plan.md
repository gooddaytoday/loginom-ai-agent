# SQL-скрипт: черновик требований

Component ID: `component.integration.SqlScript`. Slug: `integration-sqlscript`. [Карточка](README.md) · [Реестр](../../registry.json) · [Шаблон подплана](../../templates/node-plan.md).

Черновик собран 2026-10-02 по справке и исходникам `5f772aea9`; каталог: компонент есть в текущей Help 7.4. Живое исследование, E2E и прогоны не выполнялись, обработчика нет. Это входные данные для подплана, а не назначение: перед назначением подплан переписывается по шаблону — этап 0 живого исследования, самостоятельный этап 1, приёмочный комплект и задание модели.

## Источники

- `integration-sqlscript:help-01` — [SQL-скрипт](https://help.loginom.ru/userguide/processors/integration/sql-script.html), Help 7.4, прочитано 2026-10-02.
- `integration-sqlscript:help-02` — [Подключения](https://help.loginom.ru/userguide/integration/connections/), Help 7.4, прочитано 2026-10-02.

## Требования справки

| ID | Возможность | Предлагаемая независимая проверка | Источник |
| --- | --- | --- | --- |
| `integration-sqlscript:r01` | Однократное и построчное выполнение, отсутствие входа; параметры/макросы и конфликт имён. | Без таблицы один INSERT, с таблицей по строке; одинаковое имя в variable и column выбирает column. Пустой подключённый input квалифицировать отдельно. | `integration-sqlscript:help-01` |
| `integration-sqlscript:r02` | Разбиение на команды и driver-enforced split; DDL/DML без возвращаемого курсора. | Два INSERT выполняются в нужном порядке; неподдерживаемая multi-command конструкция даёт отказ либо установленный driver режим, без вырезания команд. | `integration-sqlscript:help-01` |
| `integration-sqlscript:r03` | Транзакции: 0 управляет скрипт, -1 весь набор, 1 каждая строка, N>0 блок. | При ошибке строки2 ожидаемые commits различаются: весь набор откатывается; row-mode сохраняет строку1; block-mode откатывает текущий блок. Реальное состояние проверять отдельным соединением. | `integration-sqlscript:help-01` |
| `integration-sqlscript:r04` | Ignore-errors только при row transaction; timeout по строке, а при split по всем командам. | Row-mode с ignore продолжается после строки2; другие режимы не обещают продолжение. Задержка доказывает область timeout; выход ошибок содержит номер и причину. | `integration-sqlscript:help-01` |
| `integration-sqlscript:r05` | Провайдерные SQL/transaction особенности и восстановление соединения. | Для SQLite/PostgreSQL проверить собственный незавершённый transaction и ROLLBACK; Firebird/Oracle применяют корректные blocks, ограничения MySQL/MS SQL фиксируются отдельно. | `integration-sqlscript:help-01` |

## Предлагаемое разбиение на этапы

Разбиение — гипотеза до этапа 0. Каждый этап должен приниматься самостоятельно; общие изменения, нужные этапу, входят в его же карточку.

- `integration-sqlscript:s1` — Одиночный и построчный скрипт на PostgreSQL. Требования: `integration-sqlscript:r01`, `integration-sqlscript:r02`.
- `integration-sqlscript:s2` — Транзакции и контролируемые отказы. Требования: `integration-sqlscript:r03`, `integration-sqlscript:r04`. После: `integration-sqlscript:s1`.
- `integration-sqlscript:s3` — Диалекты и восстановление состояния. Требования: `integration-sqlscript:r05`. После: `integration-sqlscript:s2`. Среда: Отдельные принятые подключения провайдеров.

## Заметки черновика

Connection + необязательная таблица и переменные → таблица ошибок: номер строки, код завершения, сообщение. Скрипт не предназначен для возврата SELECT курсора; при конфликте имён поле таблицы приоритетнее переменной.

Специальные ветви Help: MS SQL через ODBC/Linux — большой SELECT может помешать последующим командам; SQLite хранит незавершённую транзакцию в соединении; Firebird не поддерживает SET TRANSACTION из скрипта, multi-command требует EXECUTE BLOCK, DDL — EXECUTE IMMEDIATE/autonomous transaction; MySQL подставляет параметры текстом и может не остановиться после SELECT; Oracle — BEGIN..END и EXECUTE IMMEDIATE для DDL; PostgreSQL — Simple Query и явное разрешение failed transaction. Остальные подключения не объявляются поддержанными без проверки скрипта.

Отдельная БД Ledger с входными id=1,2,3; строка2 вызывает UNIQUE/NOT NULL ошибку. Независимый SQL-клиент проверяет committed строки, состояние транзакции и схему. Каждая политика получает чистую БД/схему.

0/-1/1/N имеют разную атомарность. После неизвестного commit сначала независимая сверка; не выполнять скрипт повторно, не COMMIT чужую/неизвестную транзакцию. Собственный rollback фиксируется отдельным доказательством.
