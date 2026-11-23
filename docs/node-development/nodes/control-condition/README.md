# Условие

Устойчивый ID: `component.control.Condition`. Slug: `control-condition`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Этап 1 — LAB-1557: native-проба ([discovery](discovery.md)), обработчик `control.condition`
(mode `ports`, `variable_branch`), сценарий `condition-variable`.

## Планируемый объём по этапам

- Этап 1, предложение: одно условие на переменной сценария, ветвь Detailed и «Иначе», табличный выход выбранной ветви, блокировка второй.
- Этап 2: условия на столбцах с агрегацией, несколько ветвей и приоритет, И/ИЛИ.
- Этап 3: деревья, отладка, смена типа поля, метка и заметка.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/control/condition.html), `loginom-help@353e506b:data/processors/control/condition.md`.
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/condition/condition_list_settings.ts:18,164-178; tests/acceptance/wizards/condition/ports.ts` — источник требований, без переноса PASS.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; зарегистрированного обработчика нет.
