# Дополнение данных

Устойчивый ID: `component.transform.EnrichData`. Slug: `transform-enrichdata`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Текущий срез v0.4.0

Зарегистрирован `transform.enrich_data` / `left`. Левое обогащение основного входа 0 одним или двумя справочниками 1/2; составные ключи, префиксы; NULL совпадает с NULL, дубликаты расширяют все сочетания.

Ограничения: Без других join, третьего справочника, конверсий и переменных; пропуск настроек сохраняет их только при неизменных источниках. Для точного порядка нужен полный output mapping autosync=false.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [enrich-node.mjs](../../../../packages/loginom-runtime/client/lib/enrich-node.mjs):1–39; [enrich-parameters.mjs](../../../../packages/loginom-runtime/client/lib/enrich-parameters.mjs):1–87; [transform.enrich_data.md](../../../../packages/product/skills/loginom-automation/references/nodes/transform.enrich_data.md):1–46. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

### Прежнее состояние

Статус подплана `ready_for_development`: этап 0 LAB-769 подготовил [живое исследование](discovery.md), контракт и [приёмочное предложение](acceptance/README.md). Обработчика runtime пока нет. Этап 1 — только после утверждения предложенных критериев и отдельного назначения. Аддитивная регистрация динамических входов обязательна; общие алгоритмы не меняются. Реестр готовности не повышен.

## Планируемый объём по этапам

- Этап 1: Многостороннее LEFT enrichment.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/transformation/enrich-data.html), `loginom-help@353e506b:data/processors/transformation/enrich-data.md`.
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/enrichdata.ts; tests/acceptance/wizards/enrichdata/enrichdata_helpers.ts:31,51-52; sEnrichdata.ts` — источник требований, без переноса PASS.
