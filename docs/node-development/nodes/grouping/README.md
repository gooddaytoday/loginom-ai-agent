# Группировка

Устойчивый ID: `component.transform.GroupData`. Slug: `grouping`. Исторический подплан 07.

[Подплан](plan.md) · [реестр](../../registry.json).

## Текущий срез v0.4.0

Зарегистрирован `transform.group_data` / `aggregate`. Упорядоченные ключи и меры sum/count/min/max/avg/unique_count; measures=[] удаляет полные дубли ключей. unique_count поддерживает integer/string; NULL исключён из числа уникальных; пустая строка считается значением. Count включает NULL.

Ограничения: От 1 до 128 ключей, до 256 мер; одно поле не может быть ключом и мерой. Нет медианы и произвольных статистических тестов; SUM/AVG только integer/real.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [grouping-node.mjs](../../../../packages/loginom-runtime/client/lib/grouping-node.mjs):1–48; [grouping-parameters.mjs](../../../../packages/loginom-runtime/client/lib/grouping-parameters.mjs):1–57; [transform.group_data.md](../../../../packages/product/skills/loginom-automation/references/nodes/transform.group_data.md):1–6. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

### Прежнее состояние

Обработчик `transform.group_data` / `aggregate` реализован; реестр сохраняет историческое `accepted_scoped` и технические Desktop случаи B02, B18, B27, B37, B47, B65, V02, V27, V65. Приёмки текущего standalone CLI нет: после прежних проверок изменена общая оболочка. Следующая карточка Multica — этап 0 подплана, перепроверка принятого объёма; статус `reverification_required`. Исторический PASS не переносится.

Принятый объём: Упорядоченные ключи и меры sum/count/avg/min/max; согласованная схема результата.

Ограничения: Непустые ключи; меры могут быть пустыми; не более 128 ключей/256 мер. Одно поле не может быть и ключом, и мерой. unique_count для integer/string поддержан; нет медианы и произвольных статистических тестов. SUM/AVG только integer/real; аналитически правильный выбор агрегации остаётся ответственностью модели и независимого oracle.

Общих изменений W в этом назначении нет; дефект общей оболочки требует отдельного решения владельца.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/transformation/grouping.html) — `loginom-help@353e506b:data/processors/transformation/grouping.md`.
- [Обработчик](../../../../packages/loginom-runtime/client/lib/grouping-node.mjs) и [параметры](../../../../packages/loginom-runtime/client/lib/grouping-parameters.mjs) — база `loginom@dada8010e`.
- [исторический подплан 07](../../../../services/loginom-ai/docs/plans/loginom-dock/07-grouping.md) и [completion audit](../../../../services/loginom-ai/docs/plans/loginom-dock/07-completion-audit.md) — справка о прежних пределах, не приёмка текущего клиента.
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/transform/groupdata/{groupdata,setting_aggregatons,groupdata_flags_and_ctrl_vars,concat}.ts`; [Desktop результаты](../../../testing/loginom-ai-agent/scenario-debugging-results.md) — техническая серия без новой аналитической приёмки.
