# JSON в дерево: черновик требований

Component ID: `component.trees.JSONToTree`. Slug: `trees-jsontotree`. [Карточка](README.md) · [Реестр](../../registry.json) · [Шаблон подплана](../../templates/node-plan.md).

Черновик собран 2026-10-02 по справке и исходникам `5f772aea9`; каталог: компонент есть в текущей Help 7.4. Живое исследование, E2E и прогоны не выполнялись, обработчика нет. Это входные данные для подплана, а не назначение: перед назначением подплан переписывается по шаблону — этап 0 живого исследования, самостоятельный этап 1, приёмочный комплект и задание модели.

## Источники

- `trees-jsontotree:help01` — [JSON в дерево](https://help.loginom.ru/userguide/processors/data-trees/json-to-tree.html), Help 7.4, прочитано 2026-10-02.
- `trees-jsontotree:help02` — [Порт Дерево](https://help.loginom.ru/userguide/workflow/ports/mapping-trees.html), Help 7.4, прочитано 2026-10-02.

## Требования справки

| ID | Возможность | Предлагаемая независимая проверка | Источник |
| --- | --- | --- | --- |
| `trees-jsontotree:r01` | JSON-поле, auto schema, root auto/always-array/always-not-array | Один и несколько входных JSON, корневые object/array/scalar; exact схема и количество элементов. Противоречивую фразу Help про always-not-array проверить отдельным discovery case. | `trees-jsontotree:help01` |
| `trees-jsontotree:r02` | Однородные массивы, повторные ключи, null, пустые/отсутствующие узлы | Parser oracle сохраняет pairs, поэтому обнаруживает duplicate keys/type change, не теряя историю до проверки variant. | `trees-jsontotree:help01` |
| `trees-jsontotree:r03` | Ручная структура и strict on/off; известные/лишние/пропущенные поля | Strict даёт ошибку при несовместимой структуре, non-strict фиксирует диагностику; отсутствующий scalar=NULL, отсутствующие container/array не создаются. | `trees-jsontotree:help01` |
| `trees-jsontotree:r04` | Исключение корня только с одним child; не исключать массив/несколько children | Сравнить три формы; флаг не должен безусловно отрезать первый уровень. | `trees-jsontotree:help01` |
| `trees-jsontotree:r05` | Даты ISO8601/предустановленные/ручные шаблоны, Z и локаль сервера | Зафиксировать timezone и секунды/миллисекунды; независимо рассчитать UTC→local; явная опечатка года в Help-примере не переносится в expected. | `trees-jsontotree:help01` |
| `trees-jsontotree:r06` | Полная схема дерева: имена/метки, scalar/variant, data_kind, container/array, обязательность, порядок, ручные связи и автосвязывание по имени+типу, autosync on/off, исключения и восстановление связей; загрузка JSON/XSD, namespace/root/recursion0..3, раскрытие рекурсивных узлов и метки xsd:documentation. | Независимый typed-tree oracle сравнивает пути, флаги, порядок массивов, точные значения и отсутствие контейнеров отдельно от NULL примитива; обязательный корень нельзя оставить несвязанным. Загрузка схемы проверяется как замена старой структуры, Cancel её сохраняет. | `trees-jsontotree:help01`, `trees-jsontotree:help02` |
| `trees-jsontotree:r07` | JSON из файла/строки; XSD namespaces/root/recursion; смена данных меняет auto schema | Подтверждённый source artifact и схема каждой версии, сохранение после reopen; никакого переноса старой preview schema. | `trees-jsontotree:help01`, `trees-jsontotree:help02` |

## Предлагаемое разбиение на этапы

Разбиение — гипотеза до этапа 0. Каждый этап должен приниматься самостоятельно; общие изменения, нужные этапу, входят в его же карточку.

- `trees-jsontotree:s1` — Автоструктура и типизированное чтение. Требования: `trees-jsontotree:r01`, `trees-jsontotree:r02`.
- `trees-jsontotree:s2` — Ручная схема и строгая проверка. Требования: `trees-jsontotree:r03`, `trees-jsontotree:r04`. После: `trees-jsontotree:s1`.
- `trees-jsontotree:s3` — Загрузка схем, даты и полный mapping. Требования: `trees-jsontotree:r05`, `trees-jsontotree:r06`, `trees-jsontotree:r07`. После: `trees-jsontotree:s2`.

## Заметки черновика

Вход — таблица со строковым JSON-полем, выход — типизированное дерево. JSON number, integer вне безопасной JS-точности, Boolean, string, null, пустой объект/массив и отсутствующий узел имеют различную семантику. Массивы должны быть однородными; повторный ключ оставляет последнее значение, а смешанные типы повторного ключа дают variant. Обучение не требуется.

Основной JSON: {"id":1,"items":[{"sku":"A","qty":2},{"sku":"B","qty":0}],"active":false,"note":null}. Отдельные документы: {}, [], missing note, empty string, nested empty array, duplicate id same/different type, large integer 9007199254740993, Unicode keys, dateZ с известным timezone. Ожидания хранят дерево со schema и values отдельно; стандартный JSON parser с object_pairs_hook сохраняет повторения ключей. Для mixed arrays и trailing comma ожидается отказ. Integer и Boolean exact, дробные значения передаются oracle десятичным текстом; округлённый preview не доказательство. Два самостоятельных schema fixtures JSON/XSD позволяют не ждать XML handlers.

Узловые отказы: Невалидный JSON, неправильный root mode, mixed array, лишнее свойство при strict, несовпавший тип, потерянная схема. После частично выполненного parsing не публиковать старое дерево.
