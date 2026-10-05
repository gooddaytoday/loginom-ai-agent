# Текстовый импорт

Устойчивый ID: `component.imports.Text`. Slug: `text-import`. Исторический подплан 03.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчик `imports.text` / `delimited` реализован; реестр сохраняет историческое `accepted_scoped` и технические Desktop случаи B02, B18, B27, B37, B47, B65, REFORM, V02, V27, V37, V65. Приёмки текущего standalone CLI нет: после прежних проверок изменена общая оболочка. Следующая карточка Multica — этап 0 подплана, перепроверка принятого объёма; статус `reverification_required`. Исторический PASS не переносится.

Принятый объём: CSV/TSV: проверенный исходный файл, source/format/columns, выходная схема и свежий результат.

Ограничения: Новый узел требует полных source/format/columns и проверенной доставки файла. Технические имена новых колонок — ASCII; source_name и label допускают Unicode. Не угадывать транслитерацию. Другие режимы текста, XLSX и автоматическое распознавание произвольных форматов не входят в этот handler.

Общих изменений W в этом назначении нет; дефект общей оболочки требует отдельного решения владельца.

## Источники

- [Справка](https://help.loginom.ru/userguide/integration/import/txt/) — `loginom-help@353e506b:data/integration/import/txt/README.md`.
- [Обработчик](../../../../packages/loginom-runtime/client/lib/text-import-node.mjs) и [параметры](../../../../packages/loginom-runtime/client/lib/text-import-procedure.mjs) — база `loginom@dada8010e`.
- [исторический подплан 03](../../../../services/loginom-ai/docs/plans/loginom-dock/03-text-import.md) и [completion audit](../../../../services/loginom-ai/docs/plans/loginom-dock/03-completion-audit.md) — справка о прежних пределах, не приёмка текущего клиента.
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/textimport.ts; tests/acceptance/wizards/imports/txt/{format_settings,auto_columns_setting}.ts`; [Desktop результаты](../../../testing/loginom-ai-agent/scenario-debugging-results.md) — техническая серия без новой аналитической приёмки.
