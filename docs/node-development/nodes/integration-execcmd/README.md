# Выполнение программы

Устойчивый ID: `component.integration.ExecCmd`. Slug: `integration-execcmd`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

На базе `loginom@dada8010e` обработчика нет, статус `discovery_required`. Следующая карточка Multica — этап 0 отдельно; этап 1 только после решения владельца по необходимым ему W; полный перечень по всем этапам: W1, W2.

## Планируемый объём по этапам

- Этап 1 — Команда и независимое доказательство exit.
- Этап 2 — Timeout, cwd и восстановление.

Внешняя среда: Сервер Loginom 7.4.2 на Windows x64 с разрешённым администратором ExecCmd и выделенным каталогом fixture-программ; Linux x64 — только машина исполнителя. На Linux-сервере компонент отсутствует. Её отсутствие — Blocked; готовность реестра этим PR не меняется.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/integration/exec-program.html), `loginom-help@353e506b:data/processors/integration/exec-program.md`.
- `e2e-tests@486caef44` — источник требований, не результаты прогона.
- Runtime `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; контракт приёмки `scripts/node-acceptance/expected-outputs.mjs`.
