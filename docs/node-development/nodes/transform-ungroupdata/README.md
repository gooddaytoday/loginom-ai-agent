# Разгруппировка

Устойчивый ID: `component.transform.UngroupData`. Slug: `transform-ungroupdata`. Исторического номера подплана нет.

[Подплан](plan.md) · [исследование](discovery.md) · [контракт](contract.md) ·
[приёмочный комплект](acceptance/README.md) · [реестр](../../registry.json).

## Текущий срез v0.4.0

Зарегистрирован `transform.ungroup_data` в режимах `shares`, `computed`, `seasonal`. Shares распределяет итоги входа 0 по явно заданным долям входа 1; rounding none/precision/multiple, balance none/last/proportional/equal; выход 0. Computed рассчитывает доли по опорным весам, читает оба выхода (второй пуст). Seasonal использует порядковые даты обоих входов и отдельные настройки сезонности, читает детали и показатели качества/индексы.

Сезонные края по решению `v040-scope-expansion`: zero — четыре строки деталей с нулевыми значениями/трендом, единичными индексами, кодом 6 «Исключено» и качеством 1; полностью NULL-опора — оба выхода пусты при полной схеме. Это наблюдённые expected для фиксированных входов, не формула произвольного estimator. Пустая опора или пустые итоги требуют явного отказа с причиной, без экспорта и заявления об успешном распределении.

Ограничения: сезонная приёмка ограничена постоянной опорой, годом ×1 и 12 индексами; доверительные границы исключаются только по просьбе пользователя. Произвольная непостоянная опора не имеет независимого oracle. Переменные не поддержаны. В shares один итог на группу; NULL-доли пропускаются, NULL-итоги и отсутствующие группы не дают строк.

Источник: `ungroup-node.mjs`, `ungroup-parameters.mjs`, `ungroup-mappings.mjs` в `packages/loginom-runtime/client/lib/` и [справка узла](../../../../packages/product/skills/loginom-automation/references/nodes/transform.ungroup_data.md). Сценарии и границы доказательства — [сезонный комплект](acceptance/seasonal-proposal.md). Регистрация не заменяет живую приёмку точного SHA.

## Исторические материалы и план расширений

## Планируемый объём по этапам

- Этап 1 по решению владельца: только явно заданные опорные доли, округление
  и балансировка; два входа, чтение порта 0.
- Вычисляемые доли и ограниченная сезонность реализованы последующими назначениями; исторические предложения не отменяют текущий срез выше.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/transformation/ungrouping.html), `loginom-help@353e506b:data/processors/transformation/ungrouping.md`.
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/ungroupdata/ungroup_settings.ts:11,20-121 — :sandbox; node_status.ts; assignment.ts` — источник требований, без переноса PASS.
