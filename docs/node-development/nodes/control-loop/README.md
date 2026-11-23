# Цикл

Устойчивый ID: `component.control.Loop`. Slug: `control-loop`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Этап 1 принят в `v040` (#1133): `control.loop` / `group_rows` по одной строке,
тело — Подмодель с табличной границей; `loop-pages-offline` 3/3 и независимо 3/3
по назначению LAB-1691. [Native-проба этапа 1](discovery.md) описывает исходные
наблюдения и отличает HTTP-ошибки REST от исключений тела.

Для этапа 2 выполнена [native-проба FOR и Input_Var](discovery-for.md)
(LAB-1691, 15.11.2026, `v040@1f62bea68436ff96d3861fe2e7e6a44eb217b6cf`).
FOR с Page=0,1,2 и Skip=0,2,4, REST, идентификаторы и Save/cold обоих FOR
подтверждены вручную; фиксированное число групп и ключи проверены в отдельных
точках. Предложены [два задания с эталонами](acceptance/README.md#этап-2-предложение-for)
и [срез/оценка/вопросы владельцу](plan.md). FOR реализуется в LAB-1737: mode `for`, count literal, выбор по GUID входа и
native ID определения, identifiers false/true. Модельная приёмка — отдельные
`loop-for-offline` и `loop-for-rest`; результаты привязаны к SHA.

## Планируемый объём по этапам

- Этап 1, принят: групповая обработка по одной строке над Подмоделью с табличной границей; тело — REST GET по limit/skip (httpbin) или Калькулятор без сети.
- Этап 2: FOR с переменной входа Подмодели и identifiers, затем fixed group count и group keys; 4 цикла с текущей пробой.
- Этап 3: постусловие и сопоставление переменных — загрузка страниц до пустой.
- Этап 4: параллельность, ошибки, внешние компоненты, переобучение, деревья.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/control/loop.html), `loginom-help@353e506b:data/processors/control/loop.md`.
- E2E `e2e-tests@486caef44:bg/labels.ts:129 — метка Цикла; tests/toreview/acceptance/workflow/teach/teach_node.ts — общий lifecycle обучения; специализированного мастера в tests/acceptance/wizards не найдено` — источник требований, без переноса PASS.
- Runtime `v040@1f62bea6`: `client/lib/loop-node.mjs`, `loop-procedure.mjs`, `loop-readback.mjs`; места расширения этапа 2 — в `discovery-for.md`.
