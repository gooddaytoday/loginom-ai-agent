# Цикл

Устойчивый ID: `component.control.Loop`. Slug: `control-loop`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет. Этап 0 по документам (LAB-1554): [подплан, редакция 2](plan.md),
[комплект «предл.»](acceptance/README.md), вопросы native-пробы — раздел 5 подплана.
Native-пробы, прогонов и cold PASS нет. Предусловие этапа 1 — принятый этап 1 Подмодели
(NW1 #1078 и `control.supernode`). Реестр не менялся.

## Планируемый объём по этапам

- Этап 1, предложение: групповая обработка по одной строке над Подмоделью с табличной границей; тело — REST GET по limit/skip (httpbin) или Калькулятор без сети.
- Этап 2: фиксированное число итераций с переменной цикла — нужна граница переменных Подмодели.
- Этап 3: постусловие и сопоставление переменных — загрузка страниц до пустой.
- Этап 4: параллельность, ошибки, внешние компоненты, переобучение, деревья.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/control/loop.html), `loginom-help@353e506b:data/processors/control/loop.md`.
- E2E `e2e-tests@486caef44:bg/labels.ts:129 — метка Цикла; tests/toreview/acceptance/workflow/teach/teach_node.ts — общий lifecycle обучения; специализированного мастера в tests/acceptance/wizards не найдено` — источник требований, без переноса PASS.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; зарегистрированного обработчика нет.
