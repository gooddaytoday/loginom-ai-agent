# Квантование

ID `component.preprocessing.Binning`, slug `preprocessing-binning`.

## Текущий срез v0.4.0

Зарегистрирован `preprocessing.binning` / `internal`, `apply`. internal: обучение на текущем входе; count/width с явными пределами, frequency с ties-next; apply: сохранённые интервалы без Train; порты 0/1.

Ограничения: Только Integer/Real; без автоматических пределов, округления, открытых концов, СКО и ручной правки интервалов. Apply требует existing узел с сохранёнными интервалами, parameters={}, inputs=[], mappings=[], finish=execute; без Train и коммита draft. При отсутствии интервалов нужен internal.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [binning-node.mjs](../../../../packages/loginom-runtime/client/lib/binning-node.mjs):1–52; [binning-parameters.mjs](../../../../packages/loginom-runtime/client/lib/binning-parameters.mjs):1–31; [preprocessing.binning.md](../../../../packages/product/skills/loginom-automation/references/nodes/preprocessing.binning.md):1–28. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

[LAB-1046: checkpoint новых режимов](plan.md#7-lab-1046-расширения-v040-checkpoint-этапа-0) ·
[комплект предложений и оставшиеся проверки](acceptance/modes/README.md).
Этап 0 расширений не завершён: остановка после двух восстановлений сеанса.

[Подплан](plan.md) · [discovery LAB-645](discovery.md) ·
[критерии и задания](acceptance/task.md) · [независимый oracle](acceptance/oracle.py).

Этап 0 подготовлен на `v039@3377e6b164bcf509a050fb1536bae8dbf8bece39`, Loginom
7.4.2 Enterprise. Подплан `ready_for_development` для предложенного числового среза.
Критерии утверждает владелец до отдельного назначения этапа 1.

Предложение этапа 1: count/width с явными пределами, frequency по числу строк
(совпадения в следующий интервал), Integer/Real, оба выхода, сохранённая модель/apply.
DateTime, автопределы, SD, суммы, остальные tie policies и внешние интервалы — следующие
срезы. Произвольная ручная правка интервалов не подменяется крайними пределами count.

В базе уже есть обучение/apply-образец и cold-check с ordered/output_port/tolerance;
новый механизм проверки не требуется. Runtime-регистрации в docs-PR отсутствуют.
