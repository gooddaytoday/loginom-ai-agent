# Формирование XML: черновик требований

Component ID: `component.integration.DataToXml`. Slug: `integration-datatoxml`. [Карточка](README.md) · [Реестр](../../registry.json) · [Шаблон подплана](../../templates/node-plan.md).

Черновик собран 2026-10-02 по справке и исходникам `5f772aea9`; каталог: компонент есть в текущей Help 7.4. Живое исследование, E2E и прогоны не выполнялись, обработчика нет. Это входные данные для подплана, а не назначение: перед назначением подплан переписывается по шаблону — этап 0 живого исследования, самостоятельный этап 1, приёмочный комплект и задание модели.

## Источники

- `integration-datatoxml:help-01` — [Формирование XML](https://help.loginom.ru/userguide/processors/integration/xml-generation.html), Help 7.4, прочитано 2026-10-02.
- `integration-datatoxml:help-02` — [Набор XSD-схем](https://help.loginom.ru/userguide/integration/connections/list/schemes.html), Help 7.4, прочитано 2026-10-02.

## Требования справки

| ID | Возможность | Предлагаемая независимая проверка | Источник |
| --- | --- | --- | --- |
| `integration-datatoxml:r01` | XSD root, ручные/автоматические соответствия по типу/метке и удаление связей. | Три item попадают в правильные XML-пути; одноимённые листья разных ветвей и incompatible type не связываются произвольно. | `integration-datatoxml:help-01` |
| `integration-datatoxml:r02` | Один документ на весь набор / на строку / на значение поля идентификатора. | Для 3 строк ожидается 1/3/2 документа; групповые ID=A,B. Для row-ID начало нумерации закрепить discovery, Help не указывает базу. | `integration-datatoxml:help-01` |
| `integration-datatoxml:r03` | Пустой вход, повторный/NULL ID и сохранение порядка внутри XML. | На пустом входе во всех режимах ровно 0 строк; mixed ID fixture устанавливает правило NULL без его подмены пустой строкой. | `integration-datatoxml:help-01` |
| `integration-datatoxml:r04` | Отступы, переносы, экранирование атрибутов/кавычек; три политики timezone. | Parser подтверждает спецсимволы, byte check — escaping; Date/DateTime на pinned zone проверяются отдельно. | `integration-datatoxml:help-01` |
| `integration-datatoxml:r05` | Управляющие переменные и сохранение полного schema/mapping. | После reopen все bindings и режим идентификации те же; переменная меняет только назначенный параметр, результат привязан к новому execution. | `integration-datatoxml:help-01` |

## Предлагаемое разбиение на этапы

Разбиение — гипотеза до этапа 0. Каждый этап должен приниматься самостоятельно; общие изменения, нужные этапу, входят в его же карточку.

- `integration-datatoxml:s1` — Соответствие XSD и все виды группирования документов. Требования: `integration-datatoxml:r01`, `integration-datatoxml:r02`.
- `integration-datatoxml:s2` — Типы, форматирование и переменные. Требования: `integration-datatoxml:r03`, `integration-datatoxml:r04`, `integration-datatoxml:r05`. После: `integration-datatoxml:s1`.

## Заметки черновика

Таблица + XSD connection + необязательные управляющие переменные → таблица XML-документов и ID; это не файл экспорта.

Вход 3 строки: group=A,item=10; A,20; B,5. Независимая XSD задаёт Order/Item, атрибуты и дату; XML parser проверяет содержимое каждого документа и ручной список ID. Ни imports-xml, ни exports-xml не нужны.

Использовать `node-procedure.mjs`, `port-mapping-procedure.mjs`, `node-output-procedure.mjs`, `table-output-pages.mjs` и `table-output-values.mjs`; каждый выход проверять отдельно по настроенной строгой схеме; количество портов само по себе не требует dynamic-schema policy.

Не считать XML строку успешно построенной до парсинга и проверки каждой группы. При ошибке настройки закрывать только свой мастер; не удалять XSD или сторонние связи.
