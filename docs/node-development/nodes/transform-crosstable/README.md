# Кросс-таблица

Устойчивый ID: `component.transform.CrossTable`. Slug: `transform-crosstable`. Исторический подплан 15.

[Подплан исследования и реализации](plan.md) · [реестр](../../registry.json) · [один узел](../../workflow/single-node.md).

## Текущее состояние

Обработчик `transform.cross_table` зарегистрирован в публичном Dock API: ключи строк, одно дискретное
измерение колонок, числовые факты Sum/Min/Max/Avg. Подсчёт строк — сумма подготовленного Quantity=1.
Native fixed сохраняет полный набор категорий при настройке; новые категории идут в «Прочие»,
передача явного подмножества отклоняется по решению владельца.

**Принят в проверенном объёме и интегрирован в `loginom` 30.09.2026.** Автономная
CLI-приёмка LOG-29 и независимый PASS LOG-36 относятся к SHA
`f0b38a68f89b9327a6bec9d38e458faa101b4b41`: Fixed/Sum/Min/Max/Avg, публичный
Sliding 9→7 и C→D (9→9), повторное чтение с исходной операцией, сохранение,
cold Execute, граф и cleanup. [PR #15](https://github.com/gooddaytoday/loginom-ai-agent/pull/15)
слит, merge `bacebd5696f040c6e49aa37881cf12335d512cf7`.

Доказательства и границы принятого scope — в [подплане](plan.md). Исторический
Mac Sliding FAIL на `1e994aa50` сохранён; его исправление подтверждено серверной
CLI-матрицей, установленный Desktop/Mac/Windows повторно не сертифицирован.
Большие CSV и дополнительные исследовательские крайние случаи остаются вне
подтверждённого scope. Выпуск не подтверждён.

## Источники

- [Подплан и покрытие](plan.md).
- [Текущий обработчик](../../../../packages/loginom-runtime/client/lib/crosstable-node.mjs).
- [Историческая постановка 15](../../../../services/loginom-ai/docs/plans/loginom-dock/15-cross-table.md).
- [Сохранённый независимый Sliding FAIL](acceptance/sliding/SLIDING-FAILURE.md).
