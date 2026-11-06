# Сглаживание

Component ID: `component.preprocessing.Smoothing`, slug `preprocessing-smoothing`.
Предложение runtime: `preprocessing.smoothing`, mode `hodrick_prescott`.

## Текущий срез v0.4.0

Зарегистрирован `preprocessing.smoothing` / `hodrick_prescott`. Ходрик–Прескотт; Lambda или period; integer/real; сохранение исходных полей, NULL и порядка; добавление real _S.

Ограничения: Вейвлеты и переменные не поддержаны. LAB-676: all-NULL даёт native NODE_EXECUTION_FAILED («Ошибка в алгоритме сглаживания»), достоверного CSV нет; диагностика вне критерия PASS.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [smoothing-node.mjs](../../../../packages/loginom-runtime/client/lib/smoothing-node.mjs):1–30; [smoothing-parameters.mjs](../../../../packages/loginom-runtime/client/lib/smoothing-parameters.mjs):1–35; [preprocessing.smoothing.md](../../../../packages/product/skills/loginom-automation/references/nodes/preprocessing.smoothing.md):1–25. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

[Подплан](plan.md) · [исследование](discovery.md) ·
[приёмочный комплект](acceptance/README.md) · [реестр](../../registry.json).

Этап 0 LAB-642: `ready_for_development` на базе v039@3377e6b164bcf509a050fb1536bae8dbf8bece39.
На стенде Loginom 7.4.2 подтверждены компонент, мастер, порты и HP-числа.
Критерии — предложение для утверждения владельцем до отдельной карточки этапа 1.
Обработчика и модельной приёмки пока нет; implementation/integration/release
не повышаются. Runtime-код в docs-PR не изменён.

Этап 1 — HP для выбранных continuous integer/real полей, lambda либо период,
NULL, порядок, повторное выполнение прежнего узла, сохранение и cold reopen.
Этап 2 — вейвлеты отдельным назначением с собственным oracle.
Старые W2/W3 уже доступны в базе: tolerance, ordered и output_port.
Для фиксированного порядка полей применяется существующий mappings с autosync=false.

[Loginom Help](https://help.loginom.ru/userguide/processors/preprocessing/smoothing.html).
