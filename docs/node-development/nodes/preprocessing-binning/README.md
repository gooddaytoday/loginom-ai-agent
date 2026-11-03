# Квантование

ID `component.preprocessing.Binning`, slug `preprocessing-binning`.

[Подплан](plan.md) · [discovery LAB-645](discovery.md) ·
[критерии и задания](acceptance/task.md) · [независимый oracle](acceptance/oracle.py).

Этап 0 подготовлен на `v039@3377e6b164bcf509a050fb1536bae8dbf8bece39`, Loginom
7.4.2 Enterprise. Подплан `ready_for_development` для предложенного числового среза.
Критерии утверждает владелец до отдельного назначения этапа 1.
Обработчика нет; implementation/analytical/standalone/integration/release не повышены.

Предложение этапа 1: count/width с явными пределами, frequency по числу строк
(совпадения в следующий интервал), Integer/Real, оба выхода, сохранённая модель/apply.
DateTime, автопределы, SD, суммы, остальные tie policies и внешние интервалы — следующие
срезы. Произвольная ручная правка интервалов не подменяется крайними пределами count.

В базе уже есть обучение/apply-образец и cold-check с ordered/output_port/tolerance;
новый механизм проверки не требуется. Runtime-регистрации в docs-PR отсутствуют.
