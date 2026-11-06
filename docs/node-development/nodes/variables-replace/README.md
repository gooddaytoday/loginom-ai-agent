# Замена (переменные)

Устойчивый ID: `component.variables.Replace`. Slug: `variables-replace`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Текущий срез v0.4.0

Зарегистрирован `variables.replace` / `exact`. Точные пары замен переменных integer/real/string/boolean, включая NULL; other=keep, строкам case_sensitive=true, числам precision=0; variable output 0.

Ограничения: Без regex, файлов правил, datetime, Variant и смены типа. Одно исходное значение заменяется один раз, без каскада.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [variables-replace-node.mjs](../../../../packages/loginom-runtime/client/lib/variables-replace-node.mjs):1–17; [variables-replace-parameters.mjs](../../../../packages/loginom-runtime/client/lib/variables-replace-parameters.mjs):1–36; [variables.replace.md](../../../../packages/product/skills/loginom-automation/references/nodes/variables.replace.md):1–37. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

## Планируемый объём по этапам

- Этап 1: Внутренние точные правила.
- Этап 2: Регулярные выражения и типы замены.
- Этап 3: Файлы правил и перенастройка.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/variables/variables-replace.html), `loginom-help@353e506b:data/processors/variables/variables-replace.md`.
- E2E `e2e-tests@486caef44:bg/labels.ts:195 — название компонента; специализированного мастера в tests/acceptance/wizards не найдено` — источник требований, без переноса PASS.
