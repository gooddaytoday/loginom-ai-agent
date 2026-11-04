# Разгруппировка

Устойчивый ID: `component.transform.UngroupData`. Slug: `transform-ungroupdata`. Исторического номера подплана нет.

[Подплан](plan.md) · [исследование](discovery.md) · [контракт](contract.md) ·
[приёмочный комплект](acceptance/README.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; статус `discovery_required`. В LAB-771 исследована семантика
заданных долей Loginom 7.4.2 и подготовлены контракт, fixtures и независимый
oracle. Native FullType остаётся `not_checked`: штатное скачивание собственного
сохранённого пакета не доставило файл. Этап 0 блокирован этим пробелом.
После его устранения и утверждения предложенных критериев — отдельное
назначение этапа 1. Старый W1 по допускам не нужен: база уже поддерживает
допуск, порядок и identity порта. Реестр этой карточкой не изменяется.

## Планируемый объём по этапам

- Этап 1 по решению владельца: только явно заданные опорные доли, округление
  и балансировка; два входа, чтение порта 0.
- Вычисляемые доли, сезонность и качество: отдельное последующее назначение.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/transformation/ungrouping.html), `loginom-help@353e506b:data/processors/transformation/ungrouping.md`.
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/ungroupdata/ungroup_settings.ts:11,20-121 — :sandbox; node_status.ts; assignment.ts` — источник требований, без переноса PASS.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; зарегистрированного обработчика нет.
