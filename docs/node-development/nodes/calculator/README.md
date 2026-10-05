# Калькулятор

Устойчивый ID: `component.transform.Calculator`. Slug: `calculator`. Исторический подплан 04.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчик `transform.calculator` / `expression` реализован и принят в прежнем процессе (Hermes, 45/45, Loginom 7.4.2); Desktop технически прошёл случаи B18, B27, B47, B65, V65. Приёмки текущего standalone CLI нет: после прежней приёмки изменена общая оболочка узлов. Следующий шаг — этап 0 подплана, перепроверка.

Принятый объём: упорядоченные выражения языка Loginom; новые поля и явная замена существующих; integer, real, string, boolean, datetime; до 128 выражений, формула до 2048 символов; изменение существующего узла с сохранением незапрошенных свойств; входной и выходной mapping.

Ограничения: JavaScript-режим, промежуточные выражения и порт переменных не реализованы. Поддержка выражений не доказывает правильность аналитической формулы.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/transformation/calc/).
- [Обработчик](../../../../packages/loginom-runtime/client/lib/calculator-node.mjs) и [параметры](../../../../packages/loginom-runtime/client/lib/calculator-parameters.mjs).
- [Историческая постановка 04](../../../../services/loginom-ai/docs/plans/loginom-dock/04-calculator.md) и [проверка требований](../../../../services/loginom-ai/docs/plans/loginom-dock/04-completion-audit.md) — справка, не подтверждение текущего клиента.
- [Desktop результаты](../../../testing/loginom-ai-agent/scenario-debugging-results.md) — техническая серия, аналитика не проверялась.
