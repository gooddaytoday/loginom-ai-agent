# Импорт — Excel файл

Устойчивый ID: `component.imports.Excel`. Slug: `imports-excel`. Номер исторического подплана не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; статус `discovery_required`. Следующая карточка Multica — этап 0 отдельно: живое исследование, контракт и независимые ожидания. Type/mode `imports.excel` / `xlsx` — предложение. Этап 1 — после решения владельца по W1; W1; W2; W3 подробно описаны в подплане. Готовность реестра не повышалась.

Внешняя среда: сервер Loginom 7.4.2 Linux/Windows с доступным Excel importer, собственная загрузка xlsx; независимый writer/reader книги; этап 2 — Windows для xls и контролируемый HTTP(S)/Basic-сервис. Если среда/компонент недоступны — Blocked, документальное покрытие сохраняется.

## Планируемый объём по этапам

- Этап 1 — Одна xlsx-книга, один лист или named range, A1/R1C1 диапазон, заголовки/пустые строки, вручную закреплённые типы; автоопределение Нет.
- Этап 2 — r04, r05, r06, r07: три политики и same-node A/B→B/C, несколько файлов/маски/параллельность, provenance/mtime, URL/Basic, xlsm/xls, метки/clone; допуск W2 до реализации.

Файловые/внешние/переменные результаты требуют соответствующего независимого аудита; существующий cold-check покрывает только табличные выходы. CLI, UI, E2E и модельная приёмка при переработке документации не запускались.

## Источники

- [Excel-файл](https://help.loginom.ru/userguide/integration/import/excel/), Help 7.4, сверено 2026-10-05.
- [Примеры импорта из Excel-файла](https://help.loginom.ru/userguide/integration/import/excel/excel-examples.html), Help 7.4, сверено 2026-10-05.
- Runtime `loginom@dada8010e`: [контракты](../../../../packages/loginom-runtime/client/lib/node-contracts.mjs), [диспетчер](../../../../packages/loginom-runtime/client/lib/node-support.mjs).
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/imports/excel/auto_columns_settings.ts:25,152-154,161 — три политики; add_multifile.ts:18,128 — несколько файлов. tests/toreview/acceptance/wizards/import_excel/ — отдельный карантин` — источники требований, не текущая приёмка.
