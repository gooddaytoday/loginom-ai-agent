# Сортировка

Устойчивый ID: `component.transform.Sorting`. Slug: `sorting`. Исторический подплан 08.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчик `transform.sorting` / `keys` реализован; реестр сохраняет историческое `accepted_scoped` и технические Desktop случаи B02, B27, B37, B47, B65, V27, V65. Приёмки текущего standalone CLI нет: после прежних проверок изменена общая оболочка. Следующая карточка Multica — этап 0 подплана, перепроверка принятого объёма; статус `reverification_required`. Исторический PASS не переносится.

Принятый объём: Полный упорядоченный список ASC/DESC ключей и настройки сравнения строк.

Ограничения: Непустой список до 128 ключей. Для string/variant обязательный case_sensitive, для прочих типов он опускается. compare_with_locale — отдельный явный параметр; одинаковые ключи не гарантируют стабильность порядка строк. Переменные и непроверенные локали/variant-комбинации не считать принятыми по наличию схемы.

Общих изменений W в этом назначении нет; дефект общей оболочки требует отдельного решения владельца.

Порядок строк проверяет отдельный независимый адресный аудит сохранённого результата: unordered cold-check не обнаружит обратную сортировку. Локаль закрепляется отдельно; системный comparator не подменяет Loginom.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/transformation/sorting.html) — `loginom-help@353e506b:data/processors/transformation/sorting.md`.
- [Обработчик](../../../../packages/loginom-runtime/client/lib/sorting-node.mjs) и [параметры](../../../../packages/loginom-runtime/client/lib/sorting-parameters.mjs) — база `loginom@dada8010e`.
- [исторический подплан 08](../../../../services/loginom-ai/docs/plans/loginom-dock/08-sorting.md) и [completion audit](../../../../services/loginom-ai/docs/plans/loginom-dock/08-completion-audit.md) — справка о прежних пределах, не приёмка текущего клиента.
- E2E `e2e-tests@486caef44:tests/toreview/acceptance/wizards/sorting.ts; tests/acceptance/workflow/node_label/workflowAutoLabels.ts:363-379`; [Desktop результаты](../../../testing/loginom-ai-agent/scenario-debugging-results.md) — техническая серия без новой аналитической приёмки.
