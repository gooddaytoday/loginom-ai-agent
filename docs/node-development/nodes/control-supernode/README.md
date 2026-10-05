# Подмодель

Устойчивый ID: `component.control.SuperNode`. Slug: `control-supernode`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; статус `discovery_required`. Следующая карточка Multica — этап 0 отдельно: живое исследование, контракт и независимый комплект. Этап 1 — после решения владельца по нужным ему W (W1). Общие изменения всех этапов: W1, W2, W3; точный объём и условия — в подплане.

## Планируемый объём по этапам

- Этап 1: v1: внутренний граф 1→1, один уровень.
- Этап 2: Несколько табличных портов и структура графа.
- Этап 3: Переменные, деревья и расширенный lifecycle.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/control/supernode.html), `loginom-help@353e506b:data/processors/control/supernode.md`.
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/control/supernode/supernode_saving_settings.ts:13,88; associated_port_displayname.ts; tests/toreview/acceptance/workflow/supernode/compose.ts и expand.ts — :toreview` — источник требований, без переноса PASS.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; зарегистрированного обработчика нет.
