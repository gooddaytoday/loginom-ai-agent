# Соединение (переменные)

Устойчивый ID: `component.variables.ColunionDataVar`. Slug: `variables-coluniondatavar`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Текущий срез v0.4.0

Зарегистрирован `variables.column_union` / `append_variables`. Два разных набора переменных, automatic mapping, integer/real/string/boolean и typed NULL, максимум 128; сначала вход 0, затем 1; native имена коллизий.

Ограничения: Без ручных mappings, преобразований типов, управляющего и третьего входов; читать фактические имена результата.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [variables-coluniondatavar-node.mjs](../../../../packages/loginom-runtime/client/lib/variables-coluniondatavar-node.mjs):1–35; [variables-coluniondatavar-parameters.mjs](../../../../packages/loginom-runtime/client/lib/variables-coluniondatavar-parameters.mjs):1–50; [variables.column_union.md](../../../../packages/product/skills/loginom-automation/references/nodes/variables.column_union.md):1–32. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

### Прежнее состояние

Статус подплана `ready_for_development`: [живое исследование](discovery.md),
[контракт-предложение](contract.md) и [приёмочный комплект](acceptance/README.md)
подготовлены в LAB-838. модельный PASS не заявляется.
Этап 1 назначается отдельно после W1 и утверждения критериев: два исходных
входа → один выход, простые типы/NULL, automatic mapping. W2/динамические
порты и новые преобразования типов исключены из среза v0.4.0.

## Планируемый объём по этапам

- Этап 1: Два набора и коллизии имён.
- Этап 2: Дополнительные порты и перенастройка.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/variables/variables-union.html), `loginom-help@353e506b:data/processors/variables/variables-union.md`.
- E2E `e2e-tests@486caef44:bg/labels.ts:201 — название компонента; специализированного мастера в tests/acceptance/wizards не найдено` — источник требований, без переноса PASS.
