# Исторические источники и происхождение

Это оглавление адаптированных исторических документов внутри нового репозитория. Текущие задания выполняются по [основному регламенту](../README.md); прежние команды запуска, аккаунты, маршруты памяти и разрешения описывают прошлые проверки.

Исходный ZIP остаётся неизменным вне Git. [provenance.json](../provenance.json) содержит имя/контрольную сумму архива, исходную запись, hash оригинала, актуальное расположение и hash адаптированного документа. Замена ссылок не переносит прежний PASS на текущий runtime.

Два связанных старых документа, включённых через ссылки уже перенесённого кода,
также получили актуальную навигацию. Их оригиналы закреплены отдельными
`related_documents` с Git-ревизией и hash; они не выдаются за файлы исходного ZIP.

Материалы, совпавшие с уже перенесёнными документами, переиспользуются. Отличия только в навигационном баннере объединены. Существенно отличающиеся версии и отсутствующие документы сохранены в supplements; ни одна из исходных записей не отброшена.

## Подпланы и текущие точки входа

| № | Узел | Рабочий подплан | Исторический источник |
| --- | --- | --- | --- |
| 03 | Текстовый импорт | [План](../nodes/text-import/plan.md) | [История](../../../services/loginom-ai/docs/plans/loginom-dock/03-text-import.md) |
| 04 | Калькулятор | [План](../nodes/calculator/plan.md) | [История](../../../services/loginom-ai/docs/plans/loginom-dock/04-calculator.md) |
| 05 | Параметры полей | [План](../nodes/field-parameters/plan.md) | [История](../../../services/loginom-ai/docs/plans/loginom-dock/05-field-parameters.md) |
| 06 | Фильтр строк | [План](../nodes/row-filter/plan.md) | [История](../../../services/loginom-ai/docs/plans/loginom-dock/06-row-filter.md) |
| 07 | Группировка | [План](../nodes/grouping/plan.md) | [История](../../../services/loginom-ai/docs/plans/loginom-dock/07-grouping.md) |
| 08 | Сортировка | [План](../nodes/sorting/plan.md) | [История](../../../services/loginom-ai/docs/plans/loginom-dock/08-sorting.md) |
| 09 | Слияние | [План](../nodes/join/plan.md) | [История](../../../services/loginom-ai/docs/plans/loginom-dock/09-join.md) |
| 10 | Объединение | [План](../nodes/union/plan.md) | [История](../../../services/loginom-ai/docs/plans/loginom-dock/10-union.md) |
| 11 | Замена | [План](../nodes/replacement/plan.md) | [История](../../../services/loginom-ai/docs/plans/loginom-dock/11-replacement.md) |
| 12 | Дубликаты и противоречия | [План](../nodes/duplicates/plan.md) | [История](../../../services/loginom-ai/docs/plans/loginom-dock/12-duplicates.md) |
| 13 | Дата и время | [План](../nodes/date-time/plan.md) | [История](../../../services/loginom-ai/docs/plans/loginom-dock/13-date-time.md) |
| 14 | Заполнение пропусков | [План](../nodes/missing-values/plan.md) | [История](../../../services/loginom-ai/docs/plans/loginom-dock/14-missing-values.md) |
| 16 | Свёртка столбцов | [План](../nodes/collapse-columns/plan.md) | [История](../../../services/loginom-ai/docs/plans/loginom-dock/16-collapse-columns.md) |
| 17 | Текстовый экспорт | [План](../nodes/text-export/plan.md) | [История](../../../services/loginom-ai/docs/plans/loginom-dock/17-text-export.md) |
| 15 | Кросс-таблица | [План](../nodes/transform-crosstable/plan.md) | [История](../../../services/loginom-ai/docs/plans/loginom-dock/15-cross-table.md) |

## Подтверждения и прежняя организация

- [03-completion-audit](../../../services/loginom-ai/docs/plans/loginom-dock/03-completion-audit.md).
- [04-completion-audit](../../../services/loginom-ai/docs/plans/loginom-dock/04-completion-audit.md).
- [05-completion-audit](../../../services/loginom-ai/docs/plans/loginom-dock/05-completion-audit.md).
- [06-completion-audit](../../../services/loginom-ai/docs/plans/loginom-dock/06-completion-audit.md).
- [07-completion-audit](../../../services/loginom-ai/docs/plans/loginom-dock/07-completion-audit.md).
- [08-completion-audit](../../../services/loginom-ai/docs/plans/loginom-dock/08-completion-audit.md).
- [09-completion-audit](../../../services/loginom-ai/docs/plans/loginom-dock/09-completion-audit.md).
- [10-completion-audit](../../../services/loginom-ai/docs/plans/loginom-dock/10-completion-audit.md).
- [node11-branch-acceptance-2026-09-13](../../../services/loginom-ai/docs/loginom-dock/node11-branch-acceptance-2026-09-13.json).
- [node12-branch-acceptance-2026-09-13](../../../services/loginom-ai/docs/loginom-dock/node12-branch-acceptance-2026-09-13.json).
- [node13-branch-acceptance-2026-09-14](../../../services/loginom-ai/docs/loginom-dock/node13-branch-acceptance-2026-09-14.json).
- [node14-branch-acceptance-2026-09-14](../../../services/loginom-ai/docs/loginom-dock/node14-branch-acceptance-2026-09-14.json).
- [node16-branch-acceptance-2026-09-14](../../../services/loginom-ai/docs/loginom-dock/node16-branch-acceptance-2026-09-14.json).
- [node17-branch-acceptance-2026-09-14](../../../services/loginom-ai/docs/loginom-dock/node17-branch-acceptance-2026-09-14.json).
- [rc-combined-verification-2026-09-14](../../../services/loginom-ai/docs/loginom-dock/releases/rc-combined-verification-2026-09-14.md).
- [accepted-node-cleanup-2026-09-13](../../../services/loginom-ai/docs/loginom-dock/accepted-node-cleanup-2026-09-13.md).
- [node-workflow-runbook](../../../services/loginom-ai/docs/plans/loginom-dock/node-workflow-runbook.md).
- [four-stream-node-roadmap](../../../services/loginom-ai/docs/plans/loginom-dock/four-stream-node-roadmap.md).
- [shared-project-memory](../../../services/loginom-ai/docs/loginom-dock/shared-project-memory.md).

## Дополнения к уже перенесённой истории

- [docs/loginom-dock/agent-handoff.md](supplements/docs/loginom-dock/agent-handoff.md) — сохранена отличающаяся версия.
- [docs/loginom-dock/implementation-status.md](supplements/docs/loginom-dock/implementation-status.md) — сохранена отличающаяся версия.
- [docs/loginom-dock/migration-2026-09-24.md](supplements/docs/loginom-dock/migration-2026-09-24.md) — добавлен отсутствовавший документ.
- [docs/loginom-dock/operations.md](supplements/docs/loginom-dock/operations.md) — сохранена отличающаяся версия.
- [docs/loginom-dock/releases/landing-ai-2026-09-17.md](supplements/docs/loginom-dock/releases/landing-ai-2026-09-17.md) — добавлен отсутствовавший документ.
- [docs/loginom-dock/releases/landing-architect-2026-09-17.md](supplements/docs/loginom-dock/releases/landing-architect-2026-09-17.md) — добавлен отсутствовавший документ.
- [docs/loginom-dock/releases/rc9-release-2026-09-18.md](supplements/docs/loginom-dock/releases/rc9-release-2026-09-18.md) — сохранена отличающаяся версия.

## Значение ссылок в исторических JSON

`historical-ref:ref-*` ссылается на [каталог исходных идентичностей](references.json). Поле resolved_path в каталоге служит только навигацией к текущему файлу; исторический hash в отчёте связан с прежним исходником, а не с этим файлом. Исходное написание можно восстановить из закреплённой записи ZIP.

`unavailable:artifact-*` ссылается на [неперенесённые материалы](unavailable.md) и их [JSON-каталог](unavailable.json). Новый локальный адрес отсутствует. Это не доказательство удаления каждого такого файла: часть могла оставаться во внешней старой среде. Отдельно подтверждённое удаление диагностики описано в отчёте очистки.

Имена компонентов, серверные адреса и viking:// URI сохранены как идентификаторы соответствующих систем. Исторический Peer старого проекта не является настройкой памяти нового проекта.
