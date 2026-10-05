# Сглаживание: черновик требований

Component ID: `component.preprocessing.Smoothing`. Slug: `preprocessing-smoothing`. [Карточка](README.md) · [Реестр](../../registry.json) · [Шаблон подплана](../../templates/node-plan.md).

Черновик собран 2026-10-02 по справке и исходникам `5f772aea9`; каталог: компонент есть в текущей Help 7.4. Живое исследование, E2E и прогоны не выполнялись, обработчика нет. Это входные данные для подплана, а не назначение: перед назначением подплан переписывается по шаблону — этап 0 живого исследования, самостоятельный этап 1, приёмочный комплект и задание модели.

## Источники

- `preprocessing-smoothing:help1` — [Сглаживание](https://help.loginom.ru/userguide/processors/preprocessing/smoothing.html), Help 7.4, прочитано 2026-10-02.

## Требования справки

| ID | Возможность | Предлагаемая независимая проверка | Источник |
| --- | --- | --- | --- |
| `preprocessing-smoothing:r01` | Выбор continuous numeric полей, Lambda или связанный период сглаживания; исходные плюс smoothed поля. | Числовой oracle и обе связанные настройки; не принимать Lambda=0 только из теоретического описания, UI минимум 0.0625. | `preprocessing-smoothing:help1` |
| `preprocessing-smoothing:r02` | Пропуски HP и сохранение порядка/неизменных полей. | Interior/edge/all-null cases; точные статусы невозможного расчёта и сохранённая конфигурация. | `preprocessing-smoothing:help1` |
| `preprocessing-smoothing:r03` | Добеши order1..10, Койфлеты1..5, CDF9/7 без order; depth1..10. | Каждая family на собственном детерминированном ряду, малые длины и границы параметров. | `preprocessing-smoothing:help1` |
| `preprocessing-smoothing:r04` | Семь продолжений границ и предварительная линейная интерполяция NULL. | Симметричное/антисимметричное с/без крайней точки, нули, constant, periodic сравнить с независимым oracle. | `preprocessing-smoothing:help1` |

## Предлагаемое разбиение на этапы

Разбиение — гипотеза до этапа 0. Каждый этап должен приниматься самостоятельно; общие изменения, нужные этапу, входят в его же карточку.

- `preprocessing-smoothing:s1` — Ходрик–Прескотт. Требования: `preprocessing-smoothing:r01`, `preprocessing-smoothing:r02`.
- `preprocessing-smoothing:s2` — Три семейства вейвлетов. Требования: `preprocessing-smoothing:r03`, `preprocessing-smoothing:r04`. После: `preprocessing-smoothing:s1`.

## Заметки черновика

Нового handler нет. Использовать field-specific editor аналогично missing-values, общую scalar shell и ordered oracle. Узел принимает continuous integer/real; входная сортировка задаётся fixture, а не обязательным Sorting handler.

Непрерывный ряд [2,2,2,2,2,2,2,2] проверяет сохранение константы подходящими граничными режимами; ряд [1,2,NULL,4,5,6,7,8] проверяет разные NULL политики HP и wavelet. Для HP независимое решение системы минимума; для wavelet отдельная реализация с тем же extension convention.
