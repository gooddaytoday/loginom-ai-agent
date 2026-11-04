# Соединение (переменные)

Устойчивый ID: `component.variables.ColunionDataVar`. Slug: `variables-coluniondatavar`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Статус подплана `ready_for_development`: [живое исследование](discovery.md),
[контракт-предложение](contract.md) и [приёмочный комплект](acceptance/README.md)
подготовлены в LAB-838. Обработчика пока нет; модельный PASS не заявляется.
Этап 1 назначается отдельно после W1 и утверждения критериев: два исходных
входа → один выход, простые типы/NULL, automatic mapping. W2/динамические
порты и новые преобразования типов исключены из среза v0.4.0.

## Планируемый объём по этапам

- Этап 1: Два набора и коллизии имён.
- Этап 2: Дополнительные порты и перенастройка.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/variables/variables-union.html), `loginom-help@353e506b:data/processors/variables/variables-union.md`.
- E2E `e2e-tests@486caef44:bg/labels.ts:201 — название компонента; специализированного мастера в tests/acceptance/wizards не найдено` — источник требований, без переноса PASS.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; зарегистрированного обработчика нет.
