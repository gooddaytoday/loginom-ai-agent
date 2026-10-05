# Сэмплинг: черновик требований

Component ID: `component.preprocessing.Sampling`. Slug: `preprocessing-sampling`. [Карточка](README.md) · [Реестр](../../registry.json) · [Шаблон подплана](../../templates/node-plan.md).

Черновик собран 2026-10-02 по справке и исходникам `5f772aea9`; каталог: компонент есть в текущей Help 7.4. Живое исследование, E2E и прогоны не выполнялись, обработчика нет. Это входные данные для подплана, а не назначение: перед назначением подплан переписывается по шаблону — этап 0 живого исследования, самостоятельный этап 1, приёмочный комплект и задание модели.

## Источники

- `preprocessing-sampling:help1` — [Сэмплинг](https://help.loginom.ru/userguide/processors/preprocessing/sampling.html), Help 7.4, прочитано 2026-10-02.

## Требования справки

| ID | Возможность | Предлагаемая независимая проверка | Источник |
| --- | --- | --- | --- |
| `preprocessing-sampling:r01` | Размер в строках/процентах; sequential начало/конец; random/uniform и размер группы. | Точный sequential результат, число строк, membership и fixed seed repeatability. | `preprocessing-sampling:help1` |
| `preprocessing-sampling:r02` | Seed заданный/всегда случайно/генерировать/копировать, поведение повторного запуска. | Не требовать одинаковые случайные результаты при different/always-random seed. | `preprocessing-sampling:help1` |
| `preprocessing-sampling:r03` | Stratified по нескольким полям; полнота уникальных значений включена/выключена. | При fullness=true все страты представлены либо явная ошибка при невозможном размере; при fullness=false не требовать присутствия всех страт. Независимый oracle проверяет размер и допустимость состава в обоих режимах. | `preprocessing-sampling:help1` |
| `preprocessing-sampling:r04` | Bias по полю/уникальному значению и положительному фактору, граница 10000 уникальных. | Размер/кратности заданного класса и отрицательные/нулевые параметры; вероятностные ожидания не подменять точным неподтверждённым списком. | `preprocessing-sampling:help1` |

## Предлагаемое разбиение на этапы

Разбиение — гипотеза до этапа 0. Каждый этап должен приниматься самостоятельно; общие изменения, нужные этапу, входят в его же карточку.

- `preprocessing-sampling:s1` — Последовательный и базовый случайный отбор. Требования: `preprocessing-sampling:r01`, `preprocessing-sampling:r02`.
- `preprocessing-sampling:s2` — Стратификация и смещение. Требования: `preprocessing-sampling:r03`, `preprocessing-sampling:r04`. После: `preprocessing-sampling:s1`.

## Заметки черновика

Нового handler нет. Реализовать самостоятельный sampling editor и single-table output на общей shell. Seed semantics не распространять на stratified/bias: Help гарантирует repeatability random/uniform.

RowID=1..20, Class=A для 1..10 и B для 11..20. Sequential first/last 5 →[1..5]/[16..20]. 25% →5 строк. Random/uniform same seed →тот же состав при тех же входных данных; stratified size1 при включённой полноте двух классов должен отказать; тот же size1 при выключенной полноте допускает отсутствие одного класса и не должен выдавать ошибку невозможности обеспечить полноту.
