# Калькулятор (дерево): черновик требований

Component ID: `component.trees.CalculatorTree`. Slug: `trees-calculatortree`. [Карточка](README.md) · [Реестр](../../registry.json) · [Шаблон подплана](../../templates/node-plan.md).

Черновик собран 2026-10-02 по справке и исходникам `5f772aea9`; каталог: компонент есть в текущей Help 7.4. Живое исследование, E2E и прогоны не выполнялись, обработчика нет. Это входные данные для подплана, а не назначение: перед назначением подплан переписывается по шаблону — этап 0 живого исследования, самостоятельный этап 1, приёмочный комплект и задание модели.

## Источники

- `trees-calculatortree:help01` — [Калькулятор (дерево)](https://help.loginom.ru/userguide/processors/data-trees/calculator-tree/), Help 7.4, прочитано 2026-10-02.
- `trees-calculatortree:help02` — [Калькулятор (дерево) — JavaScript](https://help.loginom.ru/userguide/processors/data-trees/calculator-tree/javascript.html), Help 7.4, прочитано 2026-10-02.
- `trees-calculatortree:help03` — [Функции дерева](https://help.loginom.ru/userguide/processors/func/calc-func/data-tree.html), Help 7.4, прочитано 2026-10-02.
- `trees-calculatortree:help04` — [Порт Дерево](https://help.loginom.ru/userguide/workflow/ports/mapping-trees.html), Help 7.4, прочитано 2026-10-02.
- `trees-calculatortree:help05` — [Внешние модули JS](https://help.loginom.ru/userguide/processors/programming/java-script/external-modules.html), Help 7.4, прочитано 2026-10-02.

## Требования справки

| ID | Возможность | Предлагаемая независимая проверка | Источник |
| --- | --- | --- | --- |
| `trees-calculatortree:r01` | Создать/клонировать/заменить/переставить/удалить выражения; path/name/label/type/description | Вход Price=2,Qty=3 даёт Total=6; replacement меняет только нужный path, reorder зависимых выражений проверяет сохранённый смысл. | `trees-calculatortree:help01` |
| `trees-calculatortree:r02` | JavaScript expression или function-body return, scalar/variant/undefined, встроенные функции | Синтаксис/тип результата проверяются; не использовать табличный calculator parser. Invalid code возвращает native диагностику. | `trees-calculatortree:help01`, `trees-calculatortree:help02` |
| `trees-calculatortree:r03` | Абсолютные $Root и относительные Parent/$Parent/$Index, arrays и ItemIndex/ItemCount/Location/DisplayName | Две строки массива с разными Qty выявляют смешение контекстов; index0/1, count2, path/label сверяются независимо. | `trees-calculatortree:help02`, `trees-calculatortree:help03` |
| `trees-calculatortree:r04` | Входные переменные this.Var, одинаковое имя node/variable, ссылки на другие выражения | Имя узла приоритетно без префикса; this.Var однозначен; cycles и исчезнувший path дают отказ, а не чужое значение. | `trees-calculatortree:help01`, `trees-calculatortree:help02` |
| `trees-calculatortree:r05` | Intermediate/Cache, новые контейнеры, взаимные references и изменившийся source | Intermediate отсутствует в выходе, но доступен вычислениям; cache не переносит старое значение через новый execution без native правила. | `trees-calculatortree:help01`, `trees-calculatortree:help02` |
| `trees-calculatortree:r06` | CommonJS require, JSON module, относительный/абсолютный путь, require.resolve/cache; запрет ES6/Promise | Изолированный stateless fixture модуля и сохранённый/несохранённый пакет; не передавать state через cache из-за пула интерпретаторов. | `trees-calculatortree:help02`, `trees-calculatortree:help05` |
| `trees-calculatortree:r07` | Полная схема дерева: имена/метки, scalar/variant, data_kind, container/array, обязательность, порядок, ручные связи и автосвязывание по имени+типу, autosync on/off, исключения и восстановление связей; загрузка JSON/XSD, namespace/root/recursion0..3, раскрытие рекурсивных узлов и метки xsd:documentation. | Независимый typed-tree oracle сравнивает пути, флаги, порядок массивов, точные значения и отсутствие контейнеров отдельно от NULL примитива; обязательный корень нельзя оставить несвязанным. Загрузка схемы проверяется как замена старой структуры, Cancel её сохраняет. | `trees-calculatortree:help04` |
| `trees-calculatortree:r08` | Preview/console ошибок, метки/комментарии, save/reopen; представительные семейства встроенных функций | Preview не заменяет execution. Date/string/math/Boolean/tree functions проходят по одному независимому fixture; передаваемый код не ограничивать искусственным списком пяти функций. | `trees-calculatortree:help01`, `trees-calculatortree:help02`, `trees-calculatortree:help03` |

## Предлагаемое разбиение на этапы

Разбиение — гипотеза до этапа 0. Каждый этап должен приниматься самостоятельно; общие изменения, нужные этапу, входят в его же карточку.

- `trees-calculatortree:s1` — Скалярные выражения и replacement. Требования: `trees-calculatortree:r01`, `trees-calculatortree:r02`.
- `trees-calculatortree:s2` — Иерархия, массивы и переменные. Требования: `trees-calculatortree:r03`, `trees-calculatortree:r04`, `trees-calculatortree:r05`. После: `trees-calculatortree:s1`.
- `trees-calculatortree:s3` — CommonJS и полная конфигурация. Требования: `trees-calculatortree:r06`, `trees-calculatortree:r07`, `trees-calculatortree:r08`. После: `trees-calculatortree:s2`. Среда: Разрешённый доступ к собственным CommonJS/JSON fixtures в файловом хранилище.

## Заметки черновика

- `trees-calculatortree:help01` — [Калькулятор (дерево)](https://help.loginom.ru/userguide/processors/data-trees/calculator-tree/) (Help 7.4, прочитано 2026-10-02).
- `trees-calculatortree:help02` — [Калькулятор (дерево) — JavaScript](https://help.loginom.ru/userguide/processors/data-trees/calculator-tree/javascript.html) (Help 7.4, прочитано 2026-10-02).
- `trees-calculatortree:help03` — [Функции дерева](https://help.loginom.ru/userguide/processors/func/calc-func/data-tree.html) (Help 7.4, прочитано 2026-10-02).
- `trees-calculatortree:help04` — [Порт Дерево](https://help.loginom.ru/userguide/workflow/ports/mapping-trees.html) (Help 7.4, прочитано 2026-10-02).
- `trees-calculatortree:help05` — [Внешние модули JS](https://help.loginom.ru/userguide/processors/programming/java-script/external-modules.html) (Help 7.4, прочитано 2026-10-02).

Обязательный tree input, необязательные typed variables, tree output. Код выражений — JavaScript, не язык табличного expression-калькулятора. Выражение создаёт/заменяет leaf по абсолютному path, может быть intermediate/cached. References case-sensitive; имена уникальны внутри parent, arrays индексируются с0. Обучение отсутствует.

Условия допуска `trees-calculatortree:s3`: Разрешённый доступ к собственным CommonJS/JSON fixtures в файловом хранилище.

Дерево Order с Items[(Price=2,Qty=3),(Price=5,Qty=0)] и Discount=1: per-item Total=6/0, aggregate=6, variable Discount=2 отдельно проверяет this.Var. Сгенерировать поля index/count/path/displayname с точными expected. Использовать intermediate массив и cached значение в нескольких выражениях, затем заменить Qty=4 и проверить новый execution. Independent oracle вычисляет арифметику и paths, не исполняет handler. CommonJS fixture exports add(a,b), отдельный JSON файл с rate; запрещены сеть/побочные внешние операции. Для Date — зафиксированный timestamp/timezone, для real atol=1e-10; неподдержанная Int64 точность JS явно отражается как ограничение, не маскируется.

Узловые отказы: Syntax/reference/type errors, cycle, out-of-range index, неоднозначный path, missing module, Promise/ES6 import. Read error console до cleanup; не переписывать JavaScript автоматически ради успешного выполнения.
