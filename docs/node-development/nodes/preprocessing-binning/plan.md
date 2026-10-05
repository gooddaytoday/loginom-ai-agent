# Квантование: черновик требований

Component ID: `component.preprocessing.Binning`. Slug: `preprocessing-binning`. [Карточка](README.md) · [Реестр](../../registry.json) · [Шаблон подплана](../../templates/node-plan.md).

Черновик собран 2026-10-02 по справке и исходникам `5f772aea9`; каталог: компонент есть в текущей Help 7.4. Живое исследование, E2E и прогоны не выполнялись, обработчика нет. Это входные данные для подплана, а не назначение: перед назначением подплан переписывается по шаблону — этап 0 живого исследования, самостоятельный этап 1, приёмочный комплект и задание модели.

## Источники

- `preprocessing-binning:help1` — [Квантование](https://help.loginom.ru/userguide/processors/preprocessing/binning.html), Help 7.4, прочитано 2026-10-02.
- `preprocessing-binning:help2` — [Внешние диапазоны](https://help.loginom.ru/userguide/processors/preprocessing/binning/external-ranges.html), Help 7.4, прочитано 2026-10-02.
- `preprocessing-binning:help3` — [Структура результирующего набора](https://help.loginom.ru/userguide/processors/preprocessing/binning/calculated-columns.html), Help 7.4, прочитано 2026-10-02.
- `preprocessing-binning:help4` — [Параметры диапазонов квантования](https://help.loginom.ru/userguide/processors/preprocessing/binning/parameters-of-binning-ranges.html), Help 7.4, прочитано 2026-10-02.

## Требования справки

| ID | Возможность | Предлагаемая независимая проверка | Источник |
| --- | --- | --- | --- |
| `preprocessing-binning:r01` | Integer/Real/DateTime: Width/count/tiles/SD coefficients, auto/manual bounds, округление и открытые края. | Для каждого метода сверить интервалы, настройки и assignments; отдельная матрица Integer/Real/DateTime и недоступность String/Boolean/Variant без неявного преобразования. Train→новые данные→apply не пересчитывает старую модель. | `preprocessing-binning:help1` |
| `preprocessing-binning:r02` | Tiles из количества/сумм и пять правил совпадающих значений; manual editing, invert boundary type, histogram/label template. | Повторяющиеся boundary values, число интервалов/объёмы, ручная правка и отсутствие лишнего retrain. | `preprocessing-binning:help1` |
| `preprocessing-binning:r03` | External range mapping: identifier/type/index/bounds/label/quotas/open ends и приоритет полей над checkbox. | Собственная range table без готового Binning-предшественника; required/optional fields и defaults. | `preprocessing-binning:help2` |
| `preprocessing-binning:r04` | Выходная таблица: interval id/label/bounds/inclusivity/outside; ranges output с type codes и точечными интервалами. | Сверить оба outputs, NULL quotas для точек и специальные квоты «Оставить как есть». | `preprocessing-binning:help3`, `preprocessing-binning:help4` |

## Предлагаемое разбиение на этапы

Разбиение — гипотеза до этапа 0. Каждый этап должен приниматься самостоятельно; общие изменения, нужные этапу, входят в его же карточку.

- `preprocessing-binning:s1` — Внутренние интервалы и сохранённая модель. Требования: `preprocessing-binning:r01`, `preprocessing-binning:r02`.
- `preprocessing-binning:s2` — Внешние диапазоны и оба результата. Требования: `preprocessing-binning:r03`, `preprocessing-binning:r04`. После: `preprocessing-binning:s1`.

## Заметки черновика

Нового handler нет. Два outputs и динамические range inputs использовать через общую shell. Модель — интервалы либо настройки до расчёта: execution и retrain нельзя смешивать; сохранённые интервалы проверять на новом входе. По Help узел считается обученным после настройки; отсутствие рассчитанных интервалов означает расчёт при execution, наличие — применение сохранённых границ. Эти состояния фиксировать раздельно.

X=[-1,0,5,10,15,20,21], explicit ranges [0,10),[10,20] с закрытым внешним диапазоном. Проверить 0/5 в первом,10/15/20 во втором, outside codes -1/+1 для -1/21. Два одинаковых значения на границе плитки проверяют все пять tie policies отдельно.

Типовая матрица не сводится к числам: повторить граничный fixture для Integer и дробного Real, затем независимо для DateTime. Для DateTime зафиксировать календарные значения без преобразования в Unix epoch: 2026-01-01 00:00:00, 2026-01-01 12:00:00, 2026-01-02 00:00:00, 2026-01-02 12:00:00, 2026-01-03 00:00:00. Задать два внутренних диапазона [2026-01-01, 2026-01-02) и [2026-01-02, 2026-01-03] с явно сохранёнными типами границ; ожидаемая принадлежность [0,0,1,1,1] после согласования нумерации интервалов. Oracle сравнивает календарные значения и включённость границ, а не сериализацию handler; в обоих выходах сверить календарную семантику границ и код 2 в таблице диапазонов. Фактический способ представления границ в каждом выходе подтвердить при discovery и зафиксировать в expected, не считать числовое представление Unix epoch без основания. Настройку и сохранение поддержанного DateTime проверить для каждого внутреннего метода; при неоднозначной единице ширины/округлении сначала провести discovery. String/Boolean/Variant не объявлять допустимыми квантуемыми полями: Help перечисляет только Integer/Real/DateTime.

- `preprocessing-binning:help1` — [Квантование](https://help.loginom.ru/userguide/processors/preprocessing/binning.html), Help 7.4, прочитано 2026-10-02.
- `preprocessing-binning:help2` — [Внешние диапазоны](https://help.loginom.ru/userguide/processors/preprocessing/binning/external-ranges.html), Help 7.4, прочитано 2026-10-02.
- `preprocessing-binning:help3` — [Структура результирующего набора](https://help.loginom.ru/userguide/processors/preprocessing/binning/calculated-columns.html), Help 7.4, прочитано 2026-10-02.
- `preprocessing-binning:help4` — [Параметры диапазонов квантования](https://help.loginom.ru/userguide/processors/preprocessing/binning/parameters-of-binning-ranges.html), Help 7.4, прочитано 2026-10-02.
