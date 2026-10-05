# Python

Устойчивый ID: `component.programming.Python`. Slug: `programming-python`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

На базе `loginom@dada8010e` обработчика нет, статус `discovery_required`. Следующая карточка Multica — этап 0 отдельно; этап 1 только после решения владельца по необходимым ему W; полный перечень по всем этапам: W1, W2, W3, W4.

## Планируемый объём по этапам

- Этап 1 — Код и фиксированные порты в отдельном процессе.
- Этап 2 — Динамические поля и pandas.
- Этап 3 — Окружения, модули и два execution modes.
- Этап 4 — Отказы, остановка и версии.

Внешняя среда: Установленный и разрешённый администратором Python той же разрядности, что сервер Loginom; на Linux отдельный процесс, версия/путь закрепляются на этапе 0. Этап 2 — pinned pandas/numpy; этап 3 — Windows in-process и Linux venv/Docker/Podman fixtures. Её отсутствие — Blocked; готовность реестра этим PR не меняется.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/programming/python/), `loginom-help@353e506b:data/processors/programming/python/README.md`.
- `e2e-tests@486caef44` — источник требований, не результаты прогона.
- Runtime `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; контракт приёмки `scripts/node-acceptance/expected-outputs.mjs`.
