# Замена

Устойчивый ID: `component.transform.Replace`. Slug: `replacement`. Исторический подплан 11.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчик `transform.replace_columns` / `exact` реализован; реестр сохраняет историческое `accepted_scoped` и технические Desktop случаи V37. Приёмки текущего standalone CLI нет: после прежних проверок изменена общая оболочка. Следующая карточка Multica — этап 0 подплана, перепроверка принятого объёма; статус `reverification_required`. Исторический PASS не переносится.

Принятый объём: Внутренняя exact-таблица для string/integer/real, replace/add и фактический признак _Replaced.

Ограничения: Нет regex, внешней таблицы, Boolean/datetime и неточного числового сравнения. real other.mode=value поддерживает максимум 2 десятичных знака; точные пары не имеют этого общего ограничения. String не длиннее 2048 символов без NUL/CR/LF; non-ASCII case-insensitive ключи отклоняются; большие Int64 передавать десятичной строкой.

Общих изменений W в этом назначении нет; дефект общей оболочки требует отдельного решения владельца.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/transformation/substitution/) — `loginom-help@353e506b:data/processors/transformation/substitution/README.md`.
- [Обработчик](../../../../packages/loginom-runtime/client/lib/replacement-node.mjs) и [параметры](../../../../packages/loginom-runtime/client/lib/replacement-parameters.mjs) — база `loginom@dada8010e`.
- [исторический подплан 11](../../../../services/loginom-ai/docs/plans/loginom-dock/11-replacement.md) — справка о прежних пределах, не приёмка текущего клиента.
- E2E `e2e-tests@486caef44:tests/toreview/acceptance/wizards/replace/{replace,replace_datasets}.ts; tests/toreview/acceptance/mapping/mapping_replace.ts`; [Desktop результаты](../../../testing/loginom-ai-agent/scenario-debugging-results.md) — техническая серия без новой аналитической приёмки.
