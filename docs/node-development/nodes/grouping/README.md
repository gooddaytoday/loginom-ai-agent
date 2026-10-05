# Группировка

Устойчивый ID: `component.transform.GroupData`. Slug: `grouping`. Исторический подплан 07.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчик `transform.group_data` / `aggregate` реализован; реестр сохраняет историческое `accepted_scoped` и технические Desktop случаи B02, B18, B27, B37, B47, B65, V02, V27, V65. Приёмки текущего standalone CLI нет: после прежних проверок изменена общая оболочка. Следующая карточка Multica — этап 0 подплана, перепроверка принятого объёма; статус `reverification_required`. Исторический PASS не переносится.

Принятый объём: Упорядоченные ключи и меры sum/count/avg/min/max; согласованная схема результата.

Ограничения: Непустые ключи и меры; не более 128 ключей/256 мер. Одно поле не может быть и ключом, и мерой. Нет медианы, distinct count и произвольных статистических тестов в этом контракте. SUM/AVG только integer/real; аналитически правильный выбор агрегации остаётся ответственностью модели и независимого oracle.

Общих изменений W в этом назначении нет; дефект общей оболочки требует отдельного решения владельца.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/transformation/grouping.html) — `loginom-help@353e506b:data/processors/transformation/grouping.md`.
- [Обработчик](../../../../packages/loginom-runtime/client/lib/grouping-node.mjs) и [параметры](../../../../packages/loginom-runtime/client/lib/grouping-parameters.mjs) — база `loginom@dada8010e`.
- [исторический подплан 07](../../../../services/loginom-ai/docs/plans/loginom-dock/07-grouping.md) и [completion audit](../../../../services/loginom-ai/docs/plans/loginom-dock/07-completion-audit.md) — справка о прежних пределах, не приёмка текущего клиента.
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/transform/groupdata/{groupdata,setting_aggregatons,groupdata_flags_and_ctrl_vars,concat}.ts`; [Desktop результаты](../../../testing/loginom-ai-agent/scenario-debugging-results.md) — техническая серия без новой аналитической приёмки.
