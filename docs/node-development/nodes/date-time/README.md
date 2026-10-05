# Дата и время

Устойчивый ID: `component.transform.DateTimeReform`. Slug: `date-time`. Исторический подплан 13.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчик `transform.date_time` / `calendar` реализован; реестр сохраняет историческое `accepted_scoped` и технические Desktop случаи B02, V27. Приёмки текущего standalone CLI нет: после прежних проверок изменена общая оболочка. Следующая карточка Multica — этап 0 подплана, перепроверка принятого объёма; статус `reverification_required`. Исторический PASS не переносится.

Принятый объём: 12 преобразований: year/quarter/month/day_of_month/hour, start/end года/квартала/месяца и date.

Ограничения: Вход уже datetime; строковый разбор и изменение часового пояса не выполняются. Нет ISO-недель и произвольных строковых форматов; несколько преобразований одного/разных полей допускаются. Явная выходная раскладка требует autosync=false; время точного чтения зависит от runtime, старые замеры не являются текущей гарантией.

Общих изменений W в этом назначении нет; дефект общей оболочки требует отдельного решения владельца.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/transformation/trans-datatime/) — `loginom-help@353e506b:data/processors/transformation/trans-datatime/README.md`.
- [Обработчик](../../../../packages/loginom-runtime/client/lib/date-time-node.mjs) и [параметры](../../../../packages/loginom-runtime/client/lib/date-time-parameters.mjs) — база `loginom@dada8010e`.
- [исторический подплан 13](../../../../services/loginom-ai/docs/plans/loginom-dock/13-date-time.md) — справка о прежних пределах, не приёмка текущего клиента.
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/transform/date_time_reform/datetimereform.ts; tests/toreview/issues/07k/07k5/7752.ts`; [Desktop результаты](../../../testing/loginom-ai-agent/scenario-debugging-results.md) — техническая серия без новой аналитической приёмки.
