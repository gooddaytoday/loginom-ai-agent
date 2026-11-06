# Фильтр строк

Устойчивый ID: `component.transform.FilterData`. Slug: `row-filter`. Исторический подплан 06.

[Подплан](plan.md) · [реестр](../../registry.json).

## Текущий срез v0.4.0

Зарегистрирован `transform.filter_data` / `conditions`, `row_number`. conditions и row_number; выходы подходящих/неподходящих строк.

Ограничения: Scalar-условия, integer/string переменные (scalar/list), row_number; Variant не поддержан. Для строк явный case_sensitive. Execute допускает чтение хотя бы одного выбранного выхода 0/1; при приёмке обоих заявленных выходов проверить оба. Исторический новый узел на 1000 полях встречал UI_SCAN_LIMIT; текущая максимальная live-ширина этой инвентаризацией не подтверждена.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [filter-node.mjs](../../../../packages/loginom-runtime/client/lib/filter-node.mjs):1–88; [filter-parameters.mjs](../../../../packages/loginom-runtime/client/lib/filter-parameters.mjs):1–106; [transform.filter_data.md](../../../../packages/product/skills/loginom-automation/references/nodes/transform.filter_data.md):1–31. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

### Прежнее состояние

Обработчик `transform.filter_data` / `conditions`, `row_number` реализован; реестр сохраняет историческое `accepted_scoped` и технические Desktop случаи B27, V37. Приёмки текущего standalone CLI нет: после прежних проверок изменена общая оболочка. Следующая карточка Multica — этап 0 подплана, перепроверка принятого объёма; статус `reverification_required`. Исторический PASS не переносится.

Принятый объём: OR между группами, AND внутри; scalar-условия и два выхода true/false.

Ограничения: Переменные integer/string (scalar/list) поддержаны; Variant не поддержан. Строковые сравнения требуют явного case_sensitive. Execute допускает чтение хотя бы одного выбранного выхода 0/1; при приёмке обоих заявленных выходов проверить оба. Исторический новый узел на 1000 полях встречал UI_SCAN_LIMIT; текущая максимальная live-ширина этой инвентаризацией не подтверждена.

Общих изменений W в этом назначении нет; дефект общей оболочки требует отдельного решения владельца.

Cold-check открывает только порт 0 (`cold-check.mjs:221`); `expected.json` не принимает индекс порта (`expected-outputs.mjs:10-14`). Порт 1, полнота разделения и принадлежность обоих результатов одному исполнению проверяются отдельным независимым аудитом после нового открытия. Если нужен общий cold-check обоих портов — W1 (порт в ожидании и адресное чтение), только после решения владельца.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/transformation/row-filter/) — `loginom-help@353e506b:data/processors/transformation/row-filter/README.md`.
- [Обработчик](../../../../packages/loginom-runtime/client/lib/filter-node.mjs) и [параметры](../../../../packages/loginom-runtime/client/lib/filter-parameters.mjs) — база `loginom@dada8010e`.
- [исторический подплан 06](../../../../services/loginom-ai/docs/plans/loginom-dock/06-row-filter.md) и [completion audit](../../../../services/loginom-ai/docs/plans/loginom-dock/06-completion-audit.md) — справка о прежних пределах, не приёмка текущего клиента.
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/transform/filterdata/{operators_and_or,conditions_boolean,empty_input,err_msgs}.ts`; [Desktop результаты](../../../testing/loginom-ai-agent/scenario-debugging-results.md) — техническая серия без новой аналитической приёмки.
