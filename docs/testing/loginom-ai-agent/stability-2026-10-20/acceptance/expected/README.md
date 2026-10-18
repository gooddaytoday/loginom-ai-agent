## Демонстрационные эталоны для перефразировок

- [s1-revenue](../../../demo-2026-10-22/s1-revenue/expected-demo.json)
- [s2-customers](../../../demo-2026-10-22/s2-customers/expected-demo.json)
- [s3-reconcile](../../../demo-2026-10-22/s3-reconcile/expected-demo.json)
- [s4-branches](../../../demo-2026-10-22/s4-branches/expected-demo.json)
- [s5-pivot](../../../demo-2026-10-22/s5-pivot/expected-demo.json)
- [s6-abc](../../../demo-2026-10-22/s6-abc/expected-demo.json)

Каждые три перефразировки используют один исходный эталон. Не создавать копии
и не менять бизнес-условия ради другой формулировки.

Для n1–n6 записать `expected-demo.json` из независимого oracle до любого прогона.
Выход — `export_input`, со всеми итоговыми строками, типами полей и явно заданным
порядком. Личный `package_path` для будущего прогона формируется отдельно;
пример пути в эталоне не является готовым путём тестового аккаунта.
Формат проверяется вызовом `parseExpectedOutputs` из существующего
`scripts/node-acceptance/expected-outputs.mjs`. Исходные oracle D1 выводят
проверочный expected; их `nodes` и селектор выхода отличаются от демо-версии.
Для перефразировок использовать именно приведённые демо-эталоны.
