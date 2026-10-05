# Редактирование выбросов: черновик требований

Component ID: `component.preprocessing.Elimoutlier`. Slug: `preprocessing-elimoutlier`. [Карточка](README.md) · [Реестр](../../registry.json) · [Шаблон подплана](../../templates/node-plan.md).

Черновик собран 2026-10-02 по справке и исходникам `5f772aea9`; каталог: компонент есть в текущей Help 7.4. Живое исследование, E2E и прогоны не выполнялись, обработчика нет. Это входные данные для подплана, а не назначение: перед назначением подплан переписывается по шаблону — этап 0 живого исследования, самостоятельный этап 1, приёмочный комплект и задание модели.

## Источники

- `preprocessing-elimoutlier:help1` — [Редактирование выбросов](https://help.loginom.ru/userguide/processors/preprocessing/eliminate-outliers.html), Help 7.4, прочитано 2026-10-02.

## Требования справки

| ID | Возможность | Предлагаемая независимая проверка | Источник |
| --- | --- | --- | --- |
| `preprocessing-elimoutlier:r01` | Стандартное отклонение или IQR, раздельные множители для выбросов/экстремумов, выбор полей и ordered. | До модели зафиксировать SD/quartile convention и пограничное equality; проверить исходный RowID каждого flagged ряда. | `preprocessing-elimoutlier:help1` |
| `preprocessing-elimoutlier:r02` | Основной выход, выбросы и экстремальные строки. | Все три схемы и составы из одного execution; untouched поля сохранены. | `preprocessing-elimoutlier:help1` |
| `preprocessing-elimoutlier:r03` | Оставить/удалить/mean/median/most-probable/constant/ограничить; отдельная политика двух классов аномалий. | Каждый метод на малом fixture; применимость type×kind×ordered по Help, точные границы clip и строки delete. | `preprocessing-elimoutlier:help1` |

## Предлагаемое разбиение на этапы

Разбиение — гипотеза до этапа 0. Каждый этап должен приниматься самостоятельно; общие изменения, нужные этапу, входят в его же карточку.

- `preprocessing-elimoutlier:s1` — Выявление и независимые выходы. Требования: `preprocessing-elimoutlier:r01`, `preprocessing-elimoutlier:r02`.
- `preprocessing-elimoutlier:s2` — Все методы редактирования. Требования: `preprocessing-elimoutlier:r03`. После: `preprocessing-elimoutlier:s1`.

## Заметки черновика

Нового handler нет. Field-list editor и applicability checks брать из missing-values; три выхода привязать к одному выполнению через multi-output механизм filter. Не считать output outliers/extremes автоматически взаимно исключающимися до live проверки.

Самостоятельный numeric ряд из двадцати нулей и значений 10,100, плюс RowID и необрабатываемое поле. Статистику, threshold и классификацию заранее вычислить независимым oracle с подтверждённой формулой dispersion/quantile. Для replacement constant=-1 точные изменённые cells известны после фиксации принадлежности.
