# Подмодель

Устойчивый ID: `component.control.SuperNode`. Slug: `control-supernode`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет. Комплект этапа 0 — `ready_for_development` (LAB-1543):
[живое исследование](discovery.md), [критерии и oracle](acceptance/README.md),
предложения карточки типа, параметров и навыка. **Допуск этапа 1 blocked**:
нужно утвердить общий W1 (навигация и ownership внутреннего графа) и критерии.
Модельных прогонов, Execute/read и cold PASS пока нет. Реестр не менялся.

## Планируемый объём по этапам

- Этап 1, предложение: внутренний граф 1→1, один уровень, создание Калькулятора внутри, вход/выход, внешний результат и смена источника. Перенос готовых узлов отложен.
- Этап 2: Несколько табличных портов и структура графа.
- Этап 3: Переменные, деревья и расширенный lifecycle.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/control/supernode.html), `loginom-help@353e506b:data/processors/control/supernode.md`.
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/control/supernode/supernode_saving_settings.ts:13,88; associated_port_displayname.ts; tests/toreview/acceptance/workflow/supernode/compose.ts и expand.ts — :toreview` — источник требований, без переноса PASS.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; зарегистрированного обработчика нет.
