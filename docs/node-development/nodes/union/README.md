# Объединение

Устойчивый ID: `component.transform.UnionData`. Slug: `union`. Исторический подплан 10.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчик `transform.union_data` / `append_all` реализован; реестр сохраняет историческое `accepted_scoped` и технические Desktop случаи V27. Приёмки текущего standalone CLI нет: после прежних проверок изменена общая оболочка. Следующая карточка Multica — этап 0 подплана, перепроверка принятого объёма; статус `reverification_required`. Исторический PASS не переносится.

Принятый объём: Конкатенация 2–15 таблиц с сохранением дублей, полной картой полей и явными префиксами.

Ограничения: Главный вход 0 и присоединённые 1–14; tables обязаны идти последовательно и покрывать каждое поле входов. Типы сопоставляемых полей должны совпадать; отдельное поле задаётся main:null. DISTINCT не поддержан. Контракт 15 входов шире исторически проверенных live8; предел не повышает подтверждённое покрытие.

Общих изменений W в этом назначении нет; дефект общей оболочки требует отдельного решения владельца.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/transformation/union.html) — `loginom-help@353e506b:data/processors/transformation/union.md`.
- [Обработчик](../../../../packages/loginom-runtime/client/lib/union-node.mjs) и [параметры](../../../../packages/loginom-runtime/client/lib/union-parameters.mjs) — база `loginom@dada8010e`.
- [исторический подплан 10](../../../../services/loginom-ai/docs/plans/loginom-dock/10-union.md) и [completion audit](../../../../services/loginom-ai/docs/plans/loginom-dock/10-completion-audit.md) — справка о прежних пределах, не приёмка текущего клиента.
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/transform/uniondata/{uniondata,autolink}.ts`; [Desktop результаты](../../../testing/loginom-ai-agent/scenario-debugging-results.md) — техническая серия без новой аналитической приёмки.
