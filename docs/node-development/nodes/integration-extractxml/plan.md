# Разбор XML: черновик требований

Component ID: `component.integration.ExtractXml`. Slug: `integration-extractxml`. [Карточка](README.md) · [Реестр](../../registry.json) · [Шаблон подплана](../../templates/node-plan.md).

Черновик собран 2026-10-02 по справке и исходникам `5f772aea9`; каталог: компонент есть в текущей Help 7.4. Живое исследование, E2E и прогоны не выполнялись, обработчика нет. Это входные данные для подплана, а не назначение: перед назначением подплан переписывается по шаблону — этап 0 живого исследования, самостоятельный этап 1, приёмочный комплект и задание модели.

## Источники

- `integration-extractxml:help-01` — [Разбор XML](https://help.loginom.ru/userguide/processors/integration/extracting-xml.html), Help 7.4, прочитано 2026-10-02.
- `integration-extractxml:help-02` — [Набор XSD-схем](https://help.loginom.ru/userguide/integration/connections/list/schemes.html), Help 7.4, прочитано 2026-10-02.

## Требования справки

| ID | Возможность | Предлагаемая независимая проверка | Источник |
| --- | --- | --- | --- |
| `integration-extractxml:r01` | Выбор XML-столбца, XSD root и полей; весь набор / каждая строка / поле ID. | Проверить объём 3 item и принадлежность документу; row-ID начинается с 0. Для режима весь набор использовать ровно один документ. После явного изменения XSD/выбора полей фиксировать strict schema обоих выходов; данные сами не разрешают изменение схемы. | `integration-extractxml:help-01` |
| `integration-extractxml:r02` | Остановка при первой ошибке либо продолжение; codes, необязательные ID и описание ошибки. | В последовательности good/bad/good при продолжении обрабатывается третий документ; при stop фиксируется предел обработки. Ошибка во втором порту не теряется. | `integration-extractxml:help-01` |
| `integration-extractxml:r03` | Разэкранирование XML-сущностей, строгая XSD и ускоренный разбор. | Escaped XML проходит только с флагом, malformed/type-invalid различаются; выключенная строгая проверка не доказывает валидность. | `integration-extractxml:help-01` |
| `integration-extractxml:r04` | Дублирование единичных значений, составные метки, timezone/default-zone. | Для двух дочерних строк сверить родительское поле с duplication on/off; zoned/naive даты проверяет независимый parser в pinned zone. | `integration-extractxml:help-01` |
| `integration-extractxml:r05` | Пустой набор, NULL/пустая XML-строка, управляющие переменные и сохранение. | Пустой набор даёт 0 строк; invalid cell даёт документированный error, а не произвольный пропуск. Оба выходных schema сохраняются после reopen. | `integration-extractxml:help-01` |

## Предлагаемое разбиение на этапы

Разбиение — гипотеза до этапа 0. Каждый этап должен приниматься самостоятельно; общие изменения, нужные этапу, входят в его же карточку.

- `integration-extractxml:s1` — Разбор, идентификация и два выхода. Требования: `integration-extractxml:r01`, `integration-extractxml:r02`.
- `integration-extractxml:s2` — Валидация, escaping, время и переменные. Требования: `integration-extractxml:r03`, `integration-extractxml:r04`, `integration-extractxml:r05`. После: `integration-extractxml:s1`.

## Заметки черновика

Таблица с XML-строками + XSD connection + необязательные переменные → таблица данных и таблица ошибок/кодов; второй порт обязателен для приёмочного oracle.

Три независимо записанные XML-строки: корректный Order с 2 Item, malformed XML, корректный Order с 1 Item; request IDs 7,8,9. XSD/parser отдельно дают 3 успешные item-строки и ошибку ID8. Отдельный escape-документ и пустой набор.

Использовать `node-procedure.mjs`, `port-mapping-procedure.mjs`, `node-output-procedure.mjs`, `table-output-pages.mjs` и `table-output-values.mjs`; каждый выход проверять отдельно по настроенной строгой схеме; количество портов само по себе не требует dynamic-schema policy.

Схема обоих выходов определяется выбранными XSD root/полями и параметрами мастера; изменение этих настроек требует явного configure со строгим readback. Число документов/строк и дублирование родителей не являются динамической схемой. Поэтому CrossTable dynamic-schema не является prerequisite; несовпадающий с настройками output schema отклоняется.

Partial success не прятать: сравнивать данные и log каждого документа. Повтор read не должен переисполнять upstream источник с внешним эффектом.
