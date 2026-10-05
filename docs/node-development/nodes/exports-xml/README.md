# Экспорт — XML файл

Устойчивый ID: `component.exports.Xml`. Slug: `exports-xml`. Номер исторического подплана не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; статус `discovery_required`. Следующая карточка Multica — этап 0 отдельно: живое исследование, контракт и независимые ожидания. Type/mode `exports.xml` / `xsd` — предложение. Этап 1 — после решения владельца по W1, W2 и W3; W1; W2; W3; W4 подробно описаны в подплане. Готовность реестра не повышалась.

Внешняя среда: сервер Loginom с набором XSD, собственный каталог экспорта; независимый XML parser и XSD validator; server timezone закреплена до проверки этапа 2. Если среда/компонент недоступны — Blocked, документальное покрытие сохраняется.

## Планируемый объём по этапам

- Этап 1 — Один XSD root, явные и автоматические совместимые field→element/attribute связи, новый XML; BOM и флаги форматирования/escaping по наблюдённому контракту.
- Этап 2 — r03, r04: временная зона Date/DateTime, управляющие bindings, NULL/empty/пустой XML и замена собственного файла.

Файловые/внешние/переменные результаты требуют соответствующего независимого аудита; существующий cold-check покрывает только табличные выходы. CLI, UI, E2E и модельная приёмка при переработке документации не запускались.

## Источники

- [XML-файл](https://help.loginom.ru/userguide/integration/export/xml.html), Help 7.4, сверено 2026-10-05.
- [Набор XSD-схем](https://help.loginom.ru/userguide/integration/connections/list/schemes.html), Help 7.4, сверено 2026-10-05.
- Runtime `loginom@dada8010e`: [контракты](../../../../packages/loginom-runtime/client/lib/node-contracts.mjs), [диспетчер](../../../../packages/loginom-runtime/client/lib/node-support.mjs).
- E2E `e2e-tests@486caef44:tests/toreview/acceptance/wizards/export_xml/export_xml.ts:21 — :toreview; test.skip:806 (escaping), :1002 (ручной mapping); это требования для перепроверки, не PASS` — источники требований, не текущая приёмка.
