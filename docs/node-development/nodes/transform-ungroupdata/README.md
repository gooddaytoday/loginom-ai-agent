# Разгруппировка

Устойчивый ID: `component.transform.UngroupData`. Slug: `transform-ungroupdata`. Исторического номера подплана нет.

[Подплан](plan.md) · [исследование](discovery.md) · [контракт](contract.md) ·
[приёмочный комплект](acceptance/README.md) · [реестр](../../registry.json).

## Текущий срез v0.4.0

Зарегистрирован `transform.ungroup_data` / `shares`. Распределение итогов входа 0 по явно заданным долям входа 1; rounding none/precision/multiple, balance none/last/proportional/equal; выход 0.

Ограничения: Без вычисляемых весов, сезонности, переменных и чтения порта 1. Один итог на группу; NULL-доли пропускаются, NULL-итоги и отсутствующие группы не дают строк.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [ungroup-node.mjs](../../../../packages/loginom-runtime/client/lib/ungroup-node.mjs):1–62; [ungroup-parameters.mjs](../../../../packages/loginom-runtime/client/lib/ungroup-parameters.mjs):1–44; [transform.ungroup_data.md](../../../../packages/product/skills/loginom-automation/references/nodes/transform.ungroup_data.md):1–13. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

## Планируемый объём по этапам

- Этап 1 по решению владельца: только явно заданные опорные доли, округление
  и балансировка; два входа, чтение порта 0.
- Вычисляемые доли, сезонность и качество: отдельное последующее назначение.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/transformation/ungrouping.html), `loginom-help@353e506b:data/processors/transformation/ungrouping.md`.
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/ungroupdata/ungroup_settings.ts:11,20-121 — :sandbox; node_status.ts; assignment.ts` — источник требований, без переноса PASS.
