# Условие

Устойчивый ID: `component.control.Condition`. Slug: `control-condition`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; статус `discovery_required`. Следующая карточка Multica — этап 0 отдельно: живое исследование, контракт и независимый комплект. Этап 1 — после решения владельца по нужным ему W (W1). Общие изменения всех этапов: W1, W2, W3; точный объём и условия — в подплане.

## Планируемый объём по этапам

- Этап 1: Табличные ветви и агрегированные условия.
- Этап 2: Переменные, деревья и полная таблица условий.
- Этап 3: Отладка, редактирование и описание.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/control/condition.html), `loginom-help@353e506b:data/processors/control/condition.md`.
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/condition/condition_list_settings.ts:18,164-178; tests/acceptance/wizards/condition/ports.ts` — источник требований, без переноса PASS.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; зарегистрированного обработчика нет.
