# JavaScript

Устойчивый ID: `component.programming.JavaScript`. Slug: `programming-javascript`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

На базе `loginom@dada8010e` обработчика нет, статус `discovery_required`. Следующая карточка Multica — этап 0 отдельно; этап 1 только после решения владельца по W1, W2, W3, W4. Активное назначение сначала сверяет Генератор; для JavaScript сообщение владельца об уже начатой разработке не заменяет stage/SHA/evidence.

## Планируемый объём по этапам

- Этап 1 — Код, фиксированные таблицы и базовый API.
- Этап 2 — Динамическая схема и typed variables.
- Этап 3 — Модули, Calc, сеть и File Storage.
- Этап 4 — Асинхронные отказы и platform boundaries.

Внешняя среда: Движок JavaScript сервера Loginom 7.4.2 и собственное файловое хранилище; для этапа 3 — ES6/CommonJS модули, HTTP ledger и изолированный FS-каталог; для этапа 4 — Windows/Linux. Её отсутствие — Blocked; готовность реестра этим PR не меняется.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/programming/java-script/), `loginom-help@353e506b:data/processors/programming/java-script/README.md`.
- `e2e-tests@486caef44` — источник требований, не результаты прогона.
- Runtime `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; контракт приёмки `scripts/node-acceptance/expected-outputs.mjs`.
