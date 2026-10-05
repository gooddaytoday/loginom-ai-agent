# Конечные классы: черновик требований

Component ID: `component.preprocessing.CoarseClasses`. Slug: `preprocessing-coarseclasses`. [Карточка](README.md) · [Реестр](../../registry.json) · [Шаблон подплана](../../templates/node-plan.md).

Черновик собран 2026-10-02 по справке и исходникам `5f772aea9`; каталог: компонент есть в текущей Help 7.4. Живое исследование, E2E и прогоны не выполнялись, обработчика нет. Это входные данные для подплана, а не назначение: перед назначением подплан переписывается по шаблону — этап 0 живого исследования, самостоятельный этап 1, приёмочный комплект и задание модели.

## Источники

- `preprocessing-coarseclasses:help1` — [Конечные классы](https://help.loginom.ru/userguide/processors/preprocessing/coarse-classes.html), Help 7.4, прочитано 2026-10-02.
- `preprocessing-coarseclasses:help2` — [Настройка внешнего разбиения](https://help.loginom.ru/userguide/processors/preprocessing/coarse-classes/configure-external-binning.html), Help 7.4, прочитано 2026-10-02.
- `preprocessing-coarseclasses:help3` — [Настройка назначений столбцов](https://help.loginom.ru/userguide/processors/preprocessing/coarse-classes/configure-column-usage-types.html), Help 7.4, прочитано 2026-10-02.
- `preprocessing-coarseclasses:help4` — [Настройка конечных классов](https://help.loginom.ru/userguide/processors/preprocessing/coarse-classes/configure-coarse-classes.html), Help 7.4, прочитано 2026-10-02.

## Требования справки

| ID | Возможность | Предлагаемая независимая проверка | Источник |
| --- | --- | --- | --- |
| `preprocessing-coarseclasses:r01` | Роли unused/input/output, event value; continuous prebin/count/inclusivity, discrete initial classes. | Сверить роли и 3 output schemas; исходные поля неизменны, class id начинается с 0. | `preprocessing-coarseclasses:help1`, `preprocessing-coarseclasses:help3` |
| `preprocessing-coarseclasses:r02` | Минимальная доля, максимум классов, равномерность; WoE/IV, значимость, counts/fractions. | Разные ограничения на одном fixture; независимые totals и model statistics, не только class labels. | `preprocessing-coarseclasses:help1`, `preprocessing-coarseclasses:help3` |
| `preprocessing-coarseclasses:r03` | Continuous ColumnName/UpperBound/IncludeUpperBound и discrete UniqueValue/ClassNumber. | Строго возрастающие границы и постоянная inclusivity; повтор category, NULL, неверные поля; нет зависимости от Binning. | `preprocessing-coarseclasses:help2` |
| `preprocessing-coarseclasses:r04` | Merge previous/next, split boundary, freeze/unfreeze, Apply/Cancel, IV versus class count. | Сохранить ручные границы; frozen apply/retrain сохраняет разделение и обновляет только статистику. | `preprocessing-coarseclasses:help3`, `preprocessing-coarseclasses:help4` |
| `preprocessing-coarseclasses:r05` | Табличная/диаграммная детализация, доли/количества и фильтр/сортировка входных полей. | Представления согласованы с тройным output; изменение вида не меняет модель. | `preprocessing-coarseclasses:help4` |

## Предлагаемое разбиение на этапы

Разбиение — гипотеза до этапа 0. Каждый этап должен приниматься самостоятельно; общие изменения, нужные этапу, входят в его же карточку.

- `preprocessing-coarseclasses:s1` — Автоматическое построение и три выхода. Требования: `preprocessing-coarseclasses:r01`, `preprocessing-coarseclasses:r02`.
- `preprocessing-coarseclasses:s2` — Внешнее разбиение. Требования: `preprocessing-coarseclasses:r03`. После: `preprocessing-coarseclasses:s1`.
- `preprocessing-coarseclasses:s3` — Ручная корректировка и заморозка. Требования: `preprocessing-coarseclasses:r04`, `preprocessing-coarseclasses:r05`. После: `preprocessing-coarseclasses:s1`.

## Заметки черновика

Нового handler нет. Основа — training lifecycle, three-output reader и optional range input. WoE/IV oracle вычислять независимо от UI; frozen поля сохраняют разбиение при переобучении и обновляют статистику.

20 строк, binary target: класс A содержит 2 events/8 non-events, B —8/2. Фиксированное внешнее разбиение A/B позволяет вручную проверить counts/fractions и WoE/IV после фиксации знака и обработки нулевых частот. Отдельно numeric границы 10/20 и категориальные NULL/empty.

- `preprocessing-coarseclasses:help1` — [Конечные классы](https://help.loginom.ru/userguide/processors/preprocessing/coarse-classes.html), Help 7.4, прочитано 2026-10-02.
- `preprocessing-coarseclasses:help2` — [Настройка внешнего разбиения](https://help.loginom.ru/userguide/processors/preprocessing/coarse-classes/configure-external-binning.html), Help 7.4, прочитано 2026-10-02.
- `preprocessing-coarseclasses:help3` — [Настройка назначений столбцов](https://help.loginom.ru/userguide/processors/preprocessing/coarse-classes/configure-column-usage-types.html), Help 7.4, прочитано 2026-10-02.
- `preprocessing-coarseclasses:help4` — [Настройка конечных классов](https://help.loginom.ru/userguide/processors/preprocessing/coarse-classes/configure-coarse-classes.html), Help 7.4, прочитано 2026-10-02.
