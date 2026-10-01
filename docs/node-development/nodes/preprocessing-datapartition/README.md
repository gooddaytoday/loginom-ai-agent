# Разбиение на множества

[Подплан](plan.md) · [Данные и oracle](acceptance/README.md) · [Общий маршрут](../../three-node-plans.md).

Component ID: `component.preprocessing.DataPartition`.
Runtime type: `preprocessing.data_partition`; candidate handler зарегистрирован.
Подготовка: **documentation_complete**, 2026-10-01. Полный runtime-контракт:
**discovery_required**; полный candidate контракт ещё исследуется, приёмка NOT_RUN.

Объём: все пять методов, строки/проценты, приоритет и положение тестового множества,
фиксированный/случайный seed, три выходные таблицы. Исторический подплан подготовлен по Help; native/public discovery и ограничения
записаны в [discovery.md](discovery.md). Маленькие CSV и independent oracle изолированы
от business CLI. Partial random/stratified PASS не является полной приёмкой.
