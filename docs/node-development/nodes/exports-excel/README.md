# Экспорт — Excel файл

Устойчивый ID: `component.exports.Excel`. Slug: `exports-excel`. Номер исторического подплана не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Текущий срез v0.4.0

Зарегистрирован `exports.excel` / `xlsx`. Новая XLSX-книга, один именованный лист; header none/names/labels; overwrite reject; output.file_artifacts, без табличных выходов.

Ограничения: Без append, XLS и числового форматирования; live names/none/empty отдельно не подтверждены.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [exports-excel-node.mjs](../../../../packages/loginom-runtime/client/lib/exports-excel-node.mjs):1–158; [exports-excel-parameters.mjs](../../../../packages/loginom-runtime/client/lib/exports-excel-parameters.mjs):1–36; [exports.excel.md](../../../../packages/product/skills/loginom-automation/references/nodes/exports.excel.md):1–14. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

### Прежнее состояние


Внешняя среда: сервер Loginom с доступным штатным Excel exporter, собственный каталог экспорта; независимый XLSX reader, а для этапа .xls — квалифицированный XLS reader и подходящий серверный build. Если среда/компонент недоступны — Blocked, документальное покрытие сохраняется.

## Планируемый объём по этапам

- Этап 1 — Новая xlsx-книга, один явно названный лист, фиксированный путь; варианты заголовка без строки / имена / метки; небольшой полный лист.
- Этап 2 — xls из r01, r03 (числовой формат) и r04 (bindings, существующий файл/лист, активация); каждую платформу подтвердить отдельно.

Файловый результат проверяет независимый OOXML oracle; текущий stock cold-check привязан к текстовому экспорту. UI discovery на 7.4.2 выполнено; CLI/E2E/модельная приёмка не запускались. Offline-квалификация oracle не является приёмкой узла.

## Источники

- [Excel-файл](https://help.loginom.ru/userguide/integration/export/excel.html), Help 7.4, сверено 2026-10-05.
- Runtime `loginom@dada8010e`: [контракты](../../../../packages/loginom-runtime/client/lib/node-contracts.mjs), [диспетчер](../../../../packages/loginom-runtime/client/lib/node-support.mjs).
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/export_excel/export_excel_file_variations.ts:22-28 — форматы/пути, рядом export_excel_ports.ts и export_excel_node_states.ts; обратный импорт из E2E не является независимым oracle` — источники требований, не текущая приёмка.
