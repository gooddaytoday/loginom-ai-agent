# Заполнение пропусков

Устойчивый ID: `component.preprocessing.DataRecovery`. Slug: `missing-values`. Исторический подплан 14.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчик `preprocessing.data_recovery` / `impute` реализован; реестр сохраняет историческое `accepted_scoped` и технические Desktop случаи V02. Приёмки текущего standalone CLI нет: после прежних проверок изменена общая оболочка. Следующая карточка Multica — этап 0 подплана, перепроверка принятого объёма; статус `reverification_required`. Исторический PASS не переносится.

Принятый объём: Mean для непрерывных integer/real, заданная константа для дискретных string, явный max_nulls_percent и ordered=false.

Ограничения: Пустая строка, ноль и текст null не становятся NULL автоматически. Порог 0–100 и all-null могут оставить пропуски после исполнения; это не безусловный дефект. Числовая константа, медиана/мода, предыдущая строка, интерполяция, random/delete и переменные не реализованы.

Общих изменений W в этом назначении нет; дефект общей оболочки требует отдельного решения владельца.

Случай `one-in-120.csv` (120 строк) не помещается в generic cold-check; сохранить его полную независимую адресную проверку. Старый oracle содержит допуск real 1e-14: его перенос в общий comparator — отдельное W1 с решением владельца. Основной cold-check использует точно представимые core-значения; precision/skew остаются адресными случаями и не выдаются за generic PASS.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/preprocessing/imputation.html) — `loginom-help@353e506b:data/processors/preprocessing/imputation.md`.
- [Обработчик](../../../../packages/loginom-runtime/client/lib/missing-values-node.mjs) и [параметры](../../../../packages/loginom-runtime/client/lib/missing-values-parameters.mjs) — база `loginom@dada8010e`.
- [исторический подплан 14](../../../../services/loginom-ai/docs/plans/loginom-dock/14-missing-values.md) — справка о прежних пределах, не приёмка текущего клиента.
- E2E `e2e-tests@486caef44:tests/toreview/acceptance/wizards/preprocessing/data_recovery/{dataRecovery_methods,dataRecovery_misc,dataRecovery_random_seed}.ts`; [Desktop результаты](../../../testing/loginom-ai-agent/scenario-debugging-results.md) — техническая серия без новой аналитической приёмки.
