# Слияние

Устойчивый ID: `component.transform.JoinData`. Slug: `join`. Исторический подплан 09.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчик `transform.join_data` / `inner`, `left` реализован; реестр сохраняет историческое `accepted_scoped` и технические Desktop случаи V02, V65. Приёмки текущего standalone CLI нет: после прежних проверок изменена общая оболочка. Следующая карточка Multica — этап 0 подплана, перепроверка принятого объёма; статус `reverification_required`. Исторический PASS не переносится.

Принятый объём: Две таблицы, точные пары ключей одинакового типа, явные регистр и включение ключей справа.

Ограничения: Right/full/cross вне контракта. Неявного приведения типов ключей нет. Конфликты имён разрешаются явными mappings; оба входа обязаны иметь подтверждённое происхождение. Исторический wide-проход:40 полей каждого входа; это не доказательство произвольной ширины.

Общих изменений W в этом назначении нет; дефект общей оболочки требует отдельного решения владельца.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/transformation/join/) — `loginom-help@353e506b:data/processors/transformation/join/README.md`.
- [Обработчик](../../../../packages/loginom-runtime/client/lib/join-node.mjs) и [параметры](../../../../packages/loginom-runtime/client/lib/join-parameters.mjs) — база `loginom@dada8010e`.
- [исторический подплан 09](../../../../services/loginom-ai/docs/plans/loginom-dock/09-join.md) и [completion audit](../../../../services/loginom-ai/docs/plans/loginom-dock/09-completion-audit.md) — справка о прежних пределах, не приёмка текущего клиента.
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/joindata.ts; tests/toreview/acceptance/wizards/transform/joindata/case_sensitive.ts`; [Desktop результаты](../../../testing/loginom-ai-agent/scenario-debugging-results.md) — техническая серия без новой аналитической приёмки.
