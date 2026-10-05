# Свёртка столбцов

Устойчивый ID: `component.transform.ColumnFlipping`. Slug: `collapse-columns`. Исторический подплан 16.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчик `transform.collapse_columns` / `unpivot` реализован; реестр сохраняет историческое `accepted_scoped` и технические Desktop случаи V37. Приёмки текущего standalone CLI нет: после прежних проверок изменена общая оболочка. Следующая карточка Multica — этап 0 подплана, перепроверка принятого объёма; статус `reverification_required`. Исторический PASS не переносится.

Принятый объём: Информационные и упорядоченные транспонируемые поля; ignore_empty=true/false; scalar/variant-выход.

Ограничения: Это unpivot столбцов, а не разбиение строки со списком. Входной variant не поддержан. Нативный путь полного точного чтения variant ограничен 50 строками × 8 полями и проверенным происхождением данных; тип и точность нельзя выводить по выборке. Оба списка ролей не пересекаются; служебные names/displaynames/values/datatypes запрещены в информационных именах.

Общих изменений W в этом назначении нет; дефект общей оболочки требует отдельного решения владельца.

Native Variant: максимум 50 строк × 8 полей и 1 MiB; проверяются subtype, OADate bytes и происхождение через сохранённый импорт. За пределами лимита нельзя объявлять полный точный Variant PASS или принимать отказ native за разрешение fallback.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/transformation/collapse-columns.html) — `loginom-help@353e506b:data/processors/transformation/collapse-columns.md`.
- [Обработчик](../../../../packages/loginom-runtime/client/lib/collapse-node.mjs) и [параметры](../../../../packages/loginom-runtime/client/lib/collapse-parameters.mjs) — база `loginom@dada8010e`.
- [исторический подплан 16](../../../../services/loginom-ai/docs/plans/loginom-dock/16-collapse-columns.md) — справка о прежних пределах, не приёмка текущего клиента.
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/columnflipping.ts`; [Desktop результаты](../../../testing/loginom-ai-agent/scenario-debugging-results.md) — техническая серия без новой аналитической приёмки.
