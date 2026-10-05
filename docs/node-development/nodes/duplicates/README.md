# Дубликаты и противоречия

Устойчивый ID: `component.research.Duplicates`. Slug: `duplicates`. Исторический подплан 12.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчик `research.duplicates` / `mark` реализован; реестр сохраняет историческое `accepted_scoped` и технические Desktop случаи V02. Приёмки текущего standalone CLI нет: после прежних проверок изменена общая оболочка. Следующая карточка Multica — этап 0 подплана, перепроверка принятого объёма; статус `reverification_required`. Исторический PASS не переносится.

Принятый объём: Полные роли input_fields/output_fields и четыре служебных поля Duplicate, DuplicateGroup, Contradiction, ContradictionGroup.

Ограничения: Все строки сохраняются; Duplicate=false удалит все помеченные копии, а не оставит одного представителя. Mapping overrides запрещены; роли полей задаются полностью, служебные имена/метки зарезервированы. Код допускает пять scalar-типов, но исторически приняты integer/string; bool/real/datetime и NULL в ключах требуют отдельного аналитического подтверждения.

Общих изменений W в этом назначении нет; дефект общей оболочки требует отдельного решения владельца.

Числовые номера групп могут измениться после reopen; отдельный независимый аудит сравнивает группы по составу RowID. Cold-check сравнивает числа точно: до прогона переподтвердить детерминированность нумерации на fixture; не снимать её проверку и не подгонять expected по текущему output.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/scrutiny/duplicates.html) — `loginom-help@353e506b:data/processors/scrutiny/duplicates.md`.
- [Обработчик](../../../../packages/loginom-runtime/client/lib/duplicates-node.mjs) и [параметры](../../../../packages/loginom-runtime/client/lib/duplicates-parameters.mjs) — база `loginom@dada8010e`.
- [исторический подплан 12](../../../../services/loginom-ai/docs/plans/loginom-dock/12-duplicates.md) — справка о прежних пределах, не приёмка текущего клиента.
- E2E `e2e-tests@486caef44:tests/acceptance/workflow/node_label/workflowAutoLabels.ts:462-480 (метки); отдельного числового oracle мастера не найдено`; [Desktop результаты](../../../testing/loginom-ai-agent/scenario-debugging-results.md) — техническая серия без новой аналитической приёмки.
