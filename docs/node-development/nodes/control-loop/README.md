# Цикл

Устойчивый ID: `component.control.Loop`. Slug: `control-loop`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; статус `discovery_required`. Следующая карточка Multica — этап 0 отдельно: живое исследование, контракт и независимый комплект. Этап 1 — после решения владельца по нужным ему W (W1). Общие изменения всех этапов: W1, W2, W3, W4; точный объём и условия — в подплане.

## Планируемый объём по этапам

- Этап 1: Фиксированные итерации и табличный компонент.
- Этап 2: Группы, параллельность и ошибки.
- Этап 3: Постусловие и передача переменных.
- Этап 4: Деревья и собственная обученная конфигурация.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/control/loop.html), `loginom-help@353e506b:data/processors/control/loop.md`.
- E2E `e2e-tests@486caef44:bg/labels.ts:129 — метка Цикла; tests/toreview/acceptance/workflow/teach/teach_node.ts — общий lifecycle обучения; специализированного мастера в tests/acceptance/wizards не найдено` — источник требований, без переноса PASS.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; зарегистрированного обработчика нет.
