# Импорт — XML файл

Устойчивый ID: `component.imports.Xml`. Slug: `imports-xml`. Номер исторического подплана не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; статус `discovery_required`. Следующая карточка Multica — этап 0 отдельно: живое исследование, контракт и независимые ожидания. Type/mode `imports.xml` / `xsd` — предложение. Этап 1 — после решения владельца по W1 и W2; W1; W2; W3 подробно описаны в подплане. Готовность реестра не повышалась.

Внешняя среда: сервер Loginom с независимо подготовленными XSD/XML и собственным каталогом загрузки; XML parser/XSD validator; этап 2 — контролируемый HTTP(S)/Basic-сервис, независимый Schematron validator и закреплённая server timezone. Если среда/компонент недоступны — Blocked, документальное покрытие сохраняется.

## Планируемый объём по этапам

- Этап 1 — Локальный XML и подключённый XSD, точные namespace/root, выбранные элементы/атрибуты, составные имена и дублирование значений родителя.
- Этап 2 — r03, r04, r05: XSD/Schematron, timezones/NULL, URL/Basic/bindings, label/comment/clone и persistence источников.

Файловые/внешние/переменные результаты требуют соответствующего независимого аудита; существующий cold-check покрывает только табличные выходы. CLI, UI, E2E и модельная приёмка при переработке документации не запускались.

## Источники

- [XML-файл](https://help.loginom.ru/userguide/integration/import/xml.html), Help 7.4, сверено 2026-10-05.
- [Набор XSD-схем](https://help.loginom.ru/userguide/integration/connections/list/schemes.html), Help 7.4, сверено 2026-10-05.
- Runtime `loginom@dada8010e`: [контракты](../../../../packages/loginom-runtime/client/lib/node-contracts.mjs), [диспетчер](../../../../packages/loginom-runtime/client/lib/node-support.mjs).
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/import_xml/connection.ts и import_fields_page.ts — подключение/поля; import_xml_page.ts — источник. E2E задают UI-проверки, полный oracle отдельный` — источники требований, не текущая приёмка.
