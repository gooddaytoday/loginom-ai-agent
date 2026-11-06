# Слияние

Устойчивый ID: `component.transform.JoinData`. Slug: `join`. Исторический подплан 09.

[Подплан](plan.md) · [реестр](../../registry.json).

## Текущий срез v0.4.0

Зарегистрирован `transform.join_data` / `inner`, `left`, `right`, `full`, `difference`. inner/left/right/full/difference; одинаковые типы ключей; явные пары ключей, регистр и включение ключей справа.

Ограничения: Cross join и неявное приведение типов ключей не поддержаны; конфликты имён — явными mappings.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [join-node.mjs](../../../../packages/loginom-runtime/client/lib/join-node.mjs):1–65; [join-parameters.mjs](../../../../packages/loginom-runtime/client/lib/join-parameters.mjs):1–48; [transform.join_data.md](../../../../packages/product/skills/loginom-automation/references/nodes/transform.join_data.md):1–25. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

### Прежнее состояние

Обработчик `transform.join_data` / `inner`, `left`, `right`, `full`, `difference` реализован; реестр сохраняет историческое `accepted_scoped` и технические Desktop случаи V02, V65. Приёмки текущего standalone CLI нет: после прежних проверок изменена общая оболочка. Следующая карточка Multica — этап 0 подплана, перепроверка принятого объёма; статус `reverification_required`. Исторический PASS не переносится.

Принятый объём: Две таблицы, точные пары ключей одинакового типа, явные регистр и включение ключей справа.

Ограничения: Cross join вне контракта; inner/left/right/full/difference поддержаны. Неявного приведения типов ключей нет. Конфликты имён разрешаются явными mappings; оба входа обязаны иметь подтверждённое происхождение. Исторический wide-проход:40 полей каждого входа; это не доказательство произвольной ширины.

Общих изменений W в этом назначении нет; дефект общей оболочки требует отдельного решения владельца.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/transformation/join/) — `loginom-help@353e506b:data/processors/transformation/join/README.md`.
- [Обработчик](../../../../packages/loginom-runtime/client/lib/join-node.mjs) и [параметры](../../../../packages/loginom-runtime/client/lib/join-parameters.mjs) — база `loginom@dada8010e`.
- [исторический подплан 09](../../../../services/loginom-ai/docs/plans/loginom-dock/09-join.md) и [completion audit](../../../../services/loginom-ai/docs/plans/loginom-dock/09-completion-audit.md) — справка о прежних пределах, не приёмка текущего клиента.
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/joindata.ts; tests/toreview/acceptance/wizards/transform/joindata/case_sensitive.ts`; [Desktop результаты](../../../testing/loginom-ai-agent/scenario-debugging-results.md) — техническая серия без новой аналитической приёмки.
