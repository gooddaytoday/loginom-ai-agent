# Текстовый экспорт

Устойчивый ID: `component.exports.Text`. Slug: `text-export`. Исторический подплан 17.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчик `exports.text` / `delimited` реализован; реестр сохраняет историческое `accepted_scoped` и технические Desktop случаи V65. Приёмки текущего standalone CLI нет: после прежних проверок изменена общая оболочка. Следующая карточка Multica — этап 0 подплана, перепроверка принятого объёма; статус `reverification_required`. Исторический PASS не переносится.

Принятый объём: Один табличный вход → проверенный CSV/TSV UTF-8; назначение в разрешённом хранилище, явный формат и overwrite.

Ограничения: Нет табличного выхода: mappings=[], read.ports=[], sample_rows=0; результат — file_artifacts. UTF-8; разделители «;», «,» или табуляция; заголовок none/names/labels, BOM, LF/CRLF, десятичная точка/запятая, двойная кавычка. Форматы NULL, даты, времени и Boolean ограничены валидатором. Файл не больше 16 MiB; replace требует явный destination в каждом запросе. Старое ограничение /test-2 не является текущей политикой: путь проверяет storage-policy.

Общее изменение W1 — независимая файловая приёмка после reopen: текущий cold-check читает табличный output 0. Владелец выбирает отдельный файловый cold-аудит либо расширение общего verifier; до решения W1 не реализовывать.

Generic cold-check не поддерживает file_artifacts: ожидает columns/rows (`expected-outputs.mjs:10-14`) и открывает табличный output 0 (`cold-check.mjs:221`), которого у exports.text нет. Это ограничение этапа 0: файловый oracle и новое открытие требуют W1, согласованного владельцем. Табличный upstream cold-check не доказывает файл; модельный exit 0 и старый файл также не доказывают экспорт.

## Источники

- [Справка](https://help.loginom.ru/userguide/integration/export/txt-csv.html) — `loginom-help@353e506b:data/integration/export/txt-csv.md`.
- [Обработчик](../../../../packages/loginom-runtime/client/lib/text-export-node.mjs) и [параметры](../../../../packages/loginom-runtime/client/lib/text-export-parameters.mjs) — база `loginom@dada8010e`.
- [исторический подплан 17](../../../../services/loginom-ai/docs/plans/loginom-dock/17-text-export.md) — справка о прежних пределах, не приёмка текущего клиента.
- E2E `e2e-tests@486caef44:tests/acceptance/workflow/node_label/workflowAutoLabels.ts:912-929 (метки); сценариев ExportTextFile мастера по этому селектору не найдено`; [Desktop результаты](../../../testing/loginom-ai-agent/scenario-debugging-results.md) — техническая серия без новой аналитической приёмки.
