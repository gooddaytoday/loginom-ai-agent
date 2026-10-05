# Слияние (дерево): черновик требований

Component ID: `component.trees.JoindataTree`. Slug: `trees-joindatatree`. [Карточка](README.md) · [Реестр](../../registry.json) · [Шаблон подплана](../../templates/node-plan.md).

Черновик собран 2026-10-02 по справке и исходникам `5f772aea9`; каталог: компонент есть в текущей Help 7.4. Живое исследование, E2E и прогоны не выполнялись, обработчика нет. Это входные данные для подплана, а не назначение: перед назначением подплан переписывается по шаблону — этап 0 живого исследования, самостоятельный этап 1, приёмочный комплект и задание модели.

## Источники

- `trees-joindatatree:help01` — [Слияние (дерево)](https://help.loginom.ru/userguide/processors/data-trees/join-tree.html), Help 7.4, прочитано 2026-10-02.
- `trees-joindatatree:help02` — [Порт Дерево](https://help.loginom.ru/userguide/workflow/ports/mapping-trees.html), Help 7.4, прочитано 2026-10-02.

## Требования справки

| ID | Возможность | Предлагаемая независимая проверка | Источник |
| --- | --- | --- | --- |
| `trees-joindatatree:r01` | Включение в container с root attached целиком/пропущенным | Main {id:1}, attached Details{active:true}: отдельные expected для вложения Details и добавления active. | `trees-joindatatree:help01` |
| `trees-joindatatree:r02` | Ограничения receiver и attached root, конфликты names в container | Нельзя receiver array/внутри array; skip-root несовместим с root-array. Одинаковые child names получают _1/_2, исходное значение main не теряется. | `trees-joindatatree:help01` |
| `trees-joindatatree:r03` | Включение в array: attached container как один элемент, attached array как все элементы | Число output items равно сумме, порядок и identity источников подтверждены; receiver должен быть array+container и не nested inside array. | `trees-joindatatree:help01` |
| `trees-joindatatree:r04` | Рекурсивное объединение схем, scalar NULL и отсутствие container/array | Недостающий scalar становится NULL; нет контейнера/массива — отсутствует. Конфликт type/container/array создаёт отдельное suffix поле; labels/kind/usage берутся из main при совместимости. | `trees-joindatatree:help01` |
| `trees-joindatatree:r05` | Полная схема дерева: имена/метки, scalar/variant, data_kind, container/array, обязательность, порядок, ручные связи и автосвязывание по имени+типу, autosync on/off, исключения и восстановление связей; загрузка JSON/XSD, namespace/root/recursion0..3, раскрытие рекурсивных узлов и метки xsd:documentation. | Независимый typed-tree oracle сравнивает пути, флаги, порядок массивов, точные значения и отсутствие контейнеров отдельно от NULL примитива; обязательный корень нельзя оставить несвязанным. Загрузка схемы проверяется как замена старой структуры, Cancel её сохраняет. | `trees-joindatatree:help02` |
| `trees-joindatatree:r06` | Смена типа receiver, filters подходящих узлов, output mapping и roundtrip | После смены режима нельзя применить старую неподходящую target identity; сохранённые mappings воспроизводят expected на новом execution. | `trees-joindatatree:help01`, `trees-joindatatree:help02` |

## Предлагаемое разбиение на этапы

Разбиение — гипотеза до этапа 0. Каждый этап должен приниматься самостоятельно; общие изменения, нужные этапу, входят в его же карточку.

- `trees-joindatatree:s1` — Контейнер и включение корня. Требования: `trees-joindatatree:r01`, `trees-joindatatree:r02`.
- `trees-joindatatree:s2` — Массив и объединение схем. Требования: `trees-joindatatree:r03`, `trees-joindatatree:r04`. После: `trees-joindatatree:s1`.
- `trees-joindatatree:s3` — Выходные mappings и сохранение. Требования: `trees-joindatatree:r05`, `trees-joindatatree:r06`. После: `trees-joindatatree:s2`.

## Заметки черновика

Два обязательных tree inputs: main и attached; один tree output. Это структурное включение дерева в контейнер/массив, не табличное слияние по ключам. Старое initial_scope в реестре является предложением и не доказывает join keys. Receiver не находится внутри массива; контейнерный receiver сам не массив. Типовые конфликты схем создают суффиксы, одинаковые поля сохраняют metadata main.

Четыре независимых пары деревьев покрывают контейнер+skip on/off и массив+attached container/array. Конфликт: main value real=1.5, attached value integer=2; ожидать отдельное typed поле с native suffix, не implicit coercion. Для main items[{id:1}], attached[{id:2,extra:3},{id:3,child:{x:true}}] oracle строит unified schema отдельно от data: NULL extra у первого, child отсутствует у первых двух. Порядок именования suffix и порядок элементов устанавливаются перед acceptance, сравниваются exact. Сторонние ветви main сохраняются.

Узловые отказы: Receiver внутри массива, invalid skip/root array, несовпавшие владельцы входов, потеря suffix данных, mandatory root mapping; ошибки не исправлять преобразованием receiver без исходного намерения.
