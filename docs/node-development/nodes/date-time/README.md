# Дата и время

Устойчивый ID: `component.transform.DateTimeReform`. Slug: `date-time`. Исторический подплан 13.

[Подплан](plan.md) · [реестр](../../registry.json).

## Текущий срез v0.4.0

Зарегистрирован `transform.date_time` / `calendar`. calendar: year, quarter, month, day_of_month, hour, minute, second, year_start/end, quarter_start/end, month_start/end, date. ISO-операции в calendar: iso_year, iso_week, iso_week_start, day_of_week.

Ограничения: iso_week_end не поддержан из-за ограничения Loginom. LAB-716: minute/second на непустой таблице 3/3 PASS; отдельный date-time-minsec-empty не проверен — сценарий/fixture отсутствовал на принятом SHA.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [date-time-node.mjs](../../../../packages/loginom-runtime/client/lib/date-time-node.mjs):1–38; [date-time-parameters.mjs](../../../../packages/loginom-runtime/client/lib/date-time-parameters.mjs):1–46; [transform.date_time.md](../../../../packages/product/skills/loginom-automation/references/nodes/transform.date_time.md):1–28. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

### Прежнее состояние

Обработчик `transform.date_time` / `calendar` реализован; реестр сохраняет историческое `accepted_scoped` и технические Desktop случаи B02, V27. Приёмки текущего standalone CLI нет: после прежних проверок изменена общая оболочка. Следующая карточка Multica — этап 0 подплана, перепроверка принятого объёма; статус `reverification_required`. Исторический PASS не переносится.

Принятый объём: 12 преобразований: year/quarter/month/day_of_month/hour, start/end года/квартала/месяца и date.

Расширение v0.3.9 / LAB-707: в существующем `calendar` добавлены `minute` и
`second` — целые компоненты 0…59, NULL сохраняется. Выбор заменяет полный набор
преобразований только указанного поля; неуказанное второе поле сохраняется.
Native-параметры и точные значения подтверждены в [этапе 0](discovery.md).
[Задание](acceptance/minsec/task.md), [независимый oracle](acceptance/minsec/oracle.py)
и [ожидания](acceptance/minsec/expected.json) подготовлены до реализации.
Приёмочный статус определяется живыми прогонами точного SHA, не этим описанием.

Ограничения: Вход уже datetime; строковый разбор и изменение часового пояса не выполняются. ISO: iso_year/iso_week/iso_week_start/day_of_week поддержаны, iso_week_end не поддержан; нет произвольных строковых форматов; несколько преобразований одного/разных полей допускаются. Явная выходная раскладка требует autosync=false; время точного чтения зависит от runtime, старые замеры не являются текущей гарантией.

Общих изменений W в этом назначении нет; дефект общей оболочки требует отдельного решения владельца.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/transformation/trans-datatime/) — `loginom-help@353e506b:data/processors/transformation/trans-datatime/README.md`.
- [Обработчик](../../../../packages/loginom-runtime/client/lib/date-time-node.mjs) и [параметры](../../../../packages/loginom-runtime/client/lib/date-time-parameters.mjs) — база `loginom@dada8010e`.
- [исторический подплан 13](../../../../services/loginom-ai/docs/plans/loginom-dock/13-date-time.md) — справка о прежних пределах, не приёмка текущего клиента.
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/transform/date_time_reform/datetimereform.ts; tests/toreview/issues/07k/07k5/7752.ts`; [Desktop результаты](../../../testing/loginom-ai-agent/scenario-debugging-results.md) — техническая серия без новой аналитической приёмки.
