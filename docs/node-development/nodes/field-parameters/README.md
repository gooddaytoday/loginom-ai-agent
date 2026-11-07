# Параметры полей

Устойчивый ID: `component.transform.ReformColumns`. Slug: `field-parameters`. Исторический подплан 05.

[Подплан](plan.md) · [реестр](../../registry.json).

## Текущий срез v0.4.0

Зарегистрирован `transform.reform_columns` / `scalar`. Изменение имени/метки/типа/вида/назначения/исключения; явный порядок полей.

Ограничения: Пять scalar-типов; циклический обмен имён одним запросом (через временное имя, которого нет в результате) входит в контракт, конверсии из неподдержанных типов — нет. Для continuous → string/boolean требуется явно задать дискретный вид. Выбор поля по точному имени/identity, не по потенциально одинаковой метке; максимум 128 изменений.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [reform-node.mjs](../../../../packages/loginom-runtime/client/lib/reform-node.mjs):1–49; [reform-parameters.mjs](../../../../packages/loginom-runtime/client/lib/reform-parameters.mjs):1–56; [transform.reform_columns.md](../../../../packages/product/skills/loginom-automation/references/nodes/transform.reform_columns.md):1–20. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

### Прежнее состояние

Обработчик `transform.reform_columns` / `scalar` реализован; реестр сохраняет историческое `accepted_scoped` и технические Desktop случаи REFORM. Приёмки текущего standalone CLI нет: после прежних проверок изменена общая оболочка. Следующая карточка Multica — этап 0 подплана, перепроверка принятого объёма; статус `reverification_required`. Исторический PASS не переносится.

Принятый объём: Изменение имени/метки/типа/вида/назначения/исключения; явный порядок полей.

Ограничения: Пять scalar-типов; циклические переименования и конверсии из неподдержанных типов не входят в контракт. Для continuous → string/boolean требуется явно задать дискретный вид. Выбор поля по точному имени/identity, не по потенциально одинаковой метке; максимум 128 изменений.

Общих изменений W в этом назначении нет; дефект общей оболочки требует отдельного решения владельца.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/transformation/fields-features.html) — `loginom-help@353e506b:data/processors/transformation/fields-features.md`.
- [Обработчик](../../../../packages/loginom-runtime/client/lib/reform-node.mjs) и [параметры](../../../../packages/loginom-runtime/client/lib/reform-parameters.mjs) — база `loginom@dada8010e`.
- [исторический подплан 05](../../../../services/loginom-ai/docs/plans/loginom-dock/05-field-parameters.md) и [completion audit](../../../../services/loginom-ai/docs/plans/loginom-dock/05-completion-audit.md) — справка о прежних пределах, не приёмка текущего клиента.
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/reform_columns/{reform_columns_change_field,reform_columns_convert_types,reform_columns_exclude,reform_columns_errors,reform_columns_cache}.ts`; [Desktop результаты](../../../testing/loginom-ai-agent/scenario-debugging-results.md) — техническая серия без новой аналитической приёмки.
