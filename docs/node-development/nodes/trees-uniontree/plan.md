# Объединение (дерево): черновик требований

Component ID: `component.trees.UnionTree`. Slug: `trees-uniontree`. [Карточка](README.md) · [Реестр](../../registry.json) · [Шаблон подплана](../../templates/node-plan.md).

Черновик собран 2026-10-02 по справке и исходникам `5f772aea9`; каталог: компонент есть в текущей Help 7.4. Живое исследование, E2E и прогоны не выполнялись, обработчика нет. Это входные данные для подплана, а не назначение: перед назначением подплан переписывается по шаблону — этап 0 живого исследования, самостоятельный этап 1, приёмочный комплект и задание модели.

## Источники

- `trees-uniontree:help01` — [Объединение (дерево)](https://help.loginom.ru/userguide/processors/data-trees/union-tree.html), Help 7.4, прочитано 2026-10-02.
- `trees-uniontree:help02` — [Порт Дерево](https://help.loginom.ru/userguide/workflow/ports/mapping-trees.html), Help 7.4, прочитано 2026-10-02.

## Требования справки

| ID | Возможность | Предлагаемая независимая проверка | Источник |
| --- | --- | --- | --- |
| `trees-uniontree:r01` | Конкатенация: scalar roots/array roots, главное имя, дополнительные входы | Контейнер даёт один элемент, root array разворачивается; имя root от main; порядок input ports не теряется. | `trees-uniontree:help01` |
| `trees-uniontree:r02` | Объединение схем всех глубин, конфликты типов/array/container и metadata | Scalar missing=NULL, container missing=absent; suffix для несовместимого типа, metadata первого по порядку совместимого поля. | `trees-uniontree:help01` |
| `trees-uniontree:r03` | Первый активный порт и root-array flag от любого входа, включая inactive | Данные только первого active, схема всех; inactive main array делает output array даже если выбранный active root container. | `trees-uniontree:help01` |
| `trees-uniontree:r04` | Пустой active против inactive, все inactive, порядок портов и ошибки источника | Семантика пустого активного дерева и отсутствие active подтверждены отдельно; failure input не превращается в inactive. | `trees-uniontree:help01` |
| `trees-uniontree:r05` | Полная схема дерева: имена/метки, scalar/variant, data_kind, container/array, обязательность, порядок, ручные связи и автосвязывание по имени+типу, autosync on/off, исключения и восстановление связей; загрузка JSON/XSD, namespace/root/recursion0..3, раскрытие рекурсивных узлов и метки xsd:documentation. | Независимый typed-tree oracle сравнивает пути, флаги, порядок массивов, точные значения и отсутствие контейнеров отдельно от NULL примитива; обязательный корень нельзя оставить несвязанным. Загрузка схемы проверяется как замена старой структуры, Cancel её сохраняет. | `trees-uniontree:help02` |
| `trees-uniontree:r06` | Добавление/удаление входа, переключение режима, новое дерево и cold reopen | Фактические владельцы каждого порта, схемы и кратность сохраняются; число/индексы портов не угадываются. | `trees-uniontree:help01`, `trees-uniontree:help02` |

## Предлагаемое разбиение на этапы

Разбиение — гипотеза до этапа 0. Каждый этап должен приниматься самостоятельно; общие изменения, нужные этапу, входят в его же карточку.

- `trees-uniontree:s1` — Конкатенация и динамические входы. Требования: `trees-uniontree:r01`, `trees-uniontree:r02`.
- `trees-uniontree:s2` — Первый активный и неактивные схемы. Требования: `trees-uniontree:r03`, `trees-uniontree:r04`. После: `trees-uniontree:s1`. Среда: Независимый fixture с доказанными active/inactive tree ports.
- `trees-uniontree:s3` — Полные mappings и сохранение. Требования: `trees-uniontree:r05`, `trees-uniontree:r06`. После: `trees-uniontree:s2`.

## Заметки черновика

Главный и присоединяемый входы обязательные структурно, дополнительные tree inputs добавляются динамически. Неактивный порт отличается от отсутствующего/ошибочного: его схема участвует в выходе. Два режима: конкатенация активных деревьев и первый активный. Union схем действует в обоих режимах, включая неактивные источники.

Условия допуска `trees-uniontree:s2`: Независимый fixture с доказанными active/inactive tree ports.

Main user{tag:"A"}, второй client{tag:100}, третий root array [{tag:true},{tag:false}] создают четыре output records и три typed поля tag/tag_1/tag_2 с NULL в остальных. Дополнить inactive main схемой root array+extra, active second объектом; режим first-active выдаёт только его данные, но schema включает extra. Независимый oracle реализует спецификацию структурного union на готовом typed fixture; проверять schema и values отдельно. Для inactive fixtures не требуется готовый обработчик Условие: допускается диагностически подготовленный граф с независимым подтверждением активности.

Узловые отказы: Потеря схемы inactive порта, повторное включение первого дерева, implicit type coercion, привязка к чужому input. All-inactive не подтверждает successful output без указанной native семантики.
