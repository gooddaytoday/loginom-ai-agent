# Калькулятор

Устойчивый ID: `component.transform.Calculator`. Slug: `calculator`. Исторический подплан 04.

[Подплан](plan.md) · [реестр](../../registry.json).

## Текущий срез v0.4.0

Зарегистрирован `transform.calculator` / `expression`. Упорядоченные выражения Loginom; новые поля и явная замена существующих; scalar-выход.

Выражения принимают необязательные флаги `intermediate` (не выход) и `cached`; незаданные сохраняются. Ограничения: Язык выражений Loginom; JavaScript-режим не реализован. Типы integer/real/string/boolean/datetime; до 128 выражений, формула до 2048 символов. Поддержка выражений не доказывает правильность аналитической формулы; деление на ноль/NULL и агрегации проверяются независимо.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [calculator-node.mjs](../../../../packages/loginom-runtime/client/lib/calculator-node.mjs):1–499; [calculator-parameters.mjs](../../../../packages/loginom-runtime/client/lib/calculator-parameters.mjs):1–120; [transform.calculator.md](../../../../packages/product/skills/loginom-automation/references/nodes/transform.calculator.md):1–41. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

### Прежнее состояние

Обработчик `transform.calculator` / `expression` реализован и принят в прежнем процессе (Hermes, 45/45, Loginom 7.4.2); Desktop технически прошёл случаи B18, B27, B47, B65, V65. Приёмки текущего standalone CLI нет: после прежней приёмки изменена общая оболочка узлов. Следующий шаг — этап 0 подплана, перепроверка.

Принятый объём: упорядоченные выражения языка Loginom; новые поля и явная замена существующих; integer, real, string, boolean, datetime; до 128 выражений, формула до 2048 символов; изменение существующего узла с сохранением незапрошенных свойств; входной и выходной mapping.

Ограничения: JavaScript-режим и промежуточные выражения не реализованы. Поддержка выражений не доказывает правильность аналитической формулы.

Для обычного входа переменных добавлено раздельное чтение Fields/Variables
в режиме expression и сверка с W1 mapping. Приёмочные сценарии Var.Amount
для начального значения и изменения источника зарегистрированы как
`calculator-vars` и `calculator-vars-update`; результаты приёмки — в LAB-853.

Для v0.4.0 подготовлено [исследование обычного входа переменных и Var.*](discovery-variables.md)
и [предложение приёмки, LAB-837](plan.md#7-var-от-переменных-сценария--предложение-v040-lab-837).
Runtime этапом 0 не меняется; критерии ожидают решения владельца.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/transformation/calc/).
- [Обработчик](../../../../packages/loginom-runtime/client/lib/calculator-node.mjs) и [параметры](../../../../packages/loginom-runtime/client/lib/calculator-parameters.mjs).
- [Историческая постановка 04](../../../../services/loginom-ai/docs/plans/loginom-dock/04-calculator.md) и [проверка требований](../../../../services/loginom-ai/docs/plans/loginom-dock/04-completion-audit.md) — справка, не подтверждение текущего клиента.
- [Desktop результаты](../../../testing/loginom-ai-agent/scenario-debugging-results.md) — техническая серия, аналитика не проверялась.
