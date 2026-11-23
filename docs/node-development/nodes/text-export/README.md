# Текстовый экспорт

Устойчивый ID: `component.exports.Text`. Slug: `text-export`. Исторический подплан 17.

[Подплан](plan.md) · [реестр](../../registry.json).

## Текущий срез v0.4.0

Зарегистрирован `exports.text` / `delimited`. delimited: UTF-8 и Windows-1251; CSV/TSV; delimiter ;/,/TAB; header none/names/labels; LF/CRLF; файловый sink. Windows-1251: BOM игнорируется, файл без BOM; символы вне CP1251 заменяются байтом 0x1A (SUB), требуется предупреждение о потере данных.

Ограничения: Windows-1251 выбирается явно; рекомендуемое bom=false. Замена символов вне кодировки — потеря данных, не транслитерация. LAB-723: точные байты CP1251 и переключение того же узла на UTF-8 подтверждены; замену символов вне CP1251 отдельным модельным прогоном не проверяли, native-наблюдение сохранено в discovery.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [text-export-node.mjs](../../../../packages/loginom-runtime/client/lib/text-export-node.mjs):1–203; [text-export-parameters.mjs](../../../../packages/loginom-runtime/client/lib/text-export-parameters.mjs):1–70; [exports.text.md](../../../../packages/product/skills/loginom-automation/references/nodes/exports.text.md):1–42. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

### Прежнее состояние

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
