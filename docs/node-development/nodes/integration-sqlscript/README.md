# SQL-скрипт

Устойчивый ID: `component.integration.SqlScript`. Slug: `integration-sqlscript`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

На базе `loginom@dada8010e` обработчика нет, статус `discovery_required`. Следующая карточка Multica — этап 0 отдельно; этап 1 только после решения владельца по необходимым ему W; полный перечень по всем этапам: W1, W2, W3.

## Планируемый объём по этапам

- Этап 1 — Одиночный и построчный скрипт на PostgreSQL.
- Этап 2 — Транзакции и контролируемые отказы.
- Этап 3 — Диалекты и восстановление состояния.

Внешняя среда: Выделенная PostgreSQL БД с принятым подключением Loginom и независимым SQL-клиентом проверяющего; schema Ledger отдельная для каждой политики. Дальнейшие этапы — SQLite/Firebird/Oracle/MySQL/MS SQL с закреплёнными драйверами. Её отсутствие — Blocked; готовность реестра этим PR не меняется.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/integration/sql-script.html), `loginom-help@353e506b:data/processors/integration/sql-script.md`.
- `e2e-tests@486caef44` — источник требований, не результаты прогона.
- Runtime `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; контракт приёмки `scripts/node-acceptance/expected-outputs.mjs`.
