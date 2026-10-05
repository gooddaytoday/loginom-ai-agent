# Выполнение узла

Устойчивый ID: `component.control.ExecNode`. Slug: `control-execnode`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; статус `discovery_required`. Следующая карточка Multica — этап 0 отдельно: живое исследование, контракт и независимый комплект. Этап 1 — после решения владельца по нужным ему W (W1). Общие изменения всех этапов: W1, W2, W3; точный объём и условия — в подплане.

## Планируемый объём по этапам

- Этап 1: Повторное использование табличного компонента.
- Этап 2: Все порты, видимость и ссылки пакетов.
- Этап 3: Независимая обученная конфигурация.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/control/execute-node.html), `loginom-help@353e506b:data/processors/control/execute-node.md`.
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/execution_node/execution_node.ts:17,91-115 — метка :sandbox` — источник требований, без переноса PASS.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; зарегистрированного обработчика нет.
