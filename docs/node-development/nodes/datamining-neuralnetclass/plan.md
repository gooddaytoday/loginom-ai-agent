# Нейросеть (классификация): черновик требований

Component ID: `component.dataMining.NeuralnetClass`. Slug: `datamining-neuralnetclass`. [Карточка](README.md) · [Реестр](../../registry.json) · [Шаблон подплана](../../templates/node-plan.md).

Черновик собран 2026-10-02 по справке и исходникам `5f772aea9`; каталог: компонент есть в текущей Help 7.4. Живое исследование, E2E и прогоны не выполнялись, обработчика нет. Это входные данные для подплана, а не назначение: перед назначением подплан переписывается по шаблону — этап 0 живого исследования, самостоятельный этап 1, приёмочный комплект и задание модели.

## Источники

- `datamining-neuralnetclass:help01` — [Нейросеть (классификация)](https://help.loginom.ru/userguide/processors/datamining/neural-network-classification.html), Help 7.4, прочитано 2026-10-02.
- `datamining-neuralnetclass:help02` — [Нейросеть (классификация) — Сводка](https://help.loginom.ru/userguide/processors/datamining/neural-network-classification/report.html), Help 7.4, прочитано 2026-10-02.
- `datamining-neuralnetclass:help03` — [Нормализация непрерывных данных](https://help.loginom.ru/userguide/processors/normalization/normalization-continuous.html), Help 7.4, прочитано 2026-10-02.
- `datamining-neuralnetclass:help04` — [Нормализация дискретных данных](https://help.loginom.ru/userguide/processors/normalization/normalization-discrete.html), Help 7.4, прочитано 2026-10-02.
- `datamining-neuralnetclass:help05` — [Валидация моделей](https://help.loginom.ru/userguide/processors/validation.html), Help 7.4, прочитано 2026-10-02.
- `datamining-neuralnetclass:help06` — [Нейросеть (классификация) — Выход нейросети](https://help.loginom.ru/userguide/processors/datamining/neural-network-classification/output-set.html), Help 7.4, прочитано 2026-10-02.

## Требования справки

| ID | Возможность | Предлагаемая независимая проверка | Источник |
| --- | --- | --- | --- |
| `datamining-neuralnetclass:r01` | Роли, типы, нормализация и построение минимальной сети без скрытых слоёв | Схема, RowID и сохранённые параметры; holdout исключён из обучения; модель имеет отдельную идентичность. | `datamining-neuralnetclass:help01` |
| `datamining-neuralnetclass:r02` | Обучение, применение сохранённой модели к новым данным, явное переобучение после изменения параметров/источника, сохранение и холодное открытие. | На фиксированном обучающем входе сохранить модель; отдельно применить к holdout. Подмена параметров, модели или источника должна нарушить проверку происхождения. Применение не должно скрыто переобучать модель. | `datamining-neuralnetclass:help01` |
| `datamining-neuralnetclass:r03` | 0/1/2 скрытых слоя; число нейронов >=1; рестарты >=1; регуляризация 0..100 (все пресеты и ручное значение) | Матрица активных полей и фактически сохранённая структура; обучение ограниченных малых сетей, без обещания одинаковых весов между оптимизаторами. | `datamining-neuralnetclass:help01` |
| `datamining-neuralnetclass:r04` | Продолжить обучение; порог изменения весов; максимум эпох | Continue использует последнюю модель и игнорирует рестарты; обычное обучение начинает новый fit; остановка/несходимость явно отражены. | `datamining-neuralnetclass:help01` |
| `datamining-neuralnetclass:r05` | Нормализация: нет; min/max, [-1;1], [0;1], абсолютная, стандартизация, отношение (min/max/mean/sum/несмещённое SD/заданный делитель); контроль диапазона нет/ошибка/винсоризация, обученный и ручной диапазон. Дискретная: индикатор с/без опорной категории, отклонение, простая, разность/обратная разность, Гельмерт/обратный Гельмерт, индекс; опорная категория первая/последняя/редкая/частая/явная. | На скалярном ряду и трёх категориях независимо вычислить преобразованные значения; проверить обратное преобразование и новую категорию/выход за обученный диапазон. Выбор недоступного для данного поля метода должен давать явный отказ; матрицу доступности закрепить до модели. | `datamining-neuralnetclass:help03`, `datamining-neuralnetclass:help04` |
| `datamining-neuralnetclass:r06` | Случайное, последовательное и по Boolean-столбцу разбиение; размеры в строках/процентах, перестановка train/unused/test; фиксированный seed и случайный seed. Без валидации, K-fold (метод сэмплинга/колоды), Монте-Карло (итерации/доли). | Самостоятельный RowID и Boolean IsTest задают точное train/test без DataPartition; True означает test. Проверить счётчики, отсутствие пересечения и утечки test в обучение/подбор. В случайных режимах воспроизводимость при одном seed, а не совпадение с чужим PRNG. | `datamining-neuralnetclass:help01`, `datamining-neuralnetclass:help05` |
| `datamining-neuralnetclass:r07` | Автоподбор только структуры, только регуляризации, совместно; заданная/авто начальная точка | Readback всех флагов/начальных значений, конечная структура и независимое качество на holdout; не требовать глобального optimum. | `datamining-neuralnetclass:help01` |
| `datamining-neuralnetclass:r08` | Подвыборка для автоподбора: доля/максимум, limits шагов/секунд (0 отключает); финальное обучение на полном train | Не путать внутренний limit автоподбора с 7200с внешнего запуска. Последний fit может выйти за внутренний limit, внешний deadline не продлевается. | `datamining-neuralnetclass:help01` |
| `datamining-neuralnetclass:r09` | Сводка: total/selected/train, метрики ошибок и G-test/DF/p/mutual information по полям | Счётчики точно; RMSE/MAE/relative error или classification error/entropy независимо из прогнозов при совпадающем определении; частные G-метрики отдельным oracle. | `datamining-neuralnetclass:help02` |
| `datamining-neuralnetclass:r10` | Бинарная и многоклассовая классификация, ID/значение класса, posterior, Gini; stop при нулевой classification error | Три раздельные группы проверяют карту labels↔IDs, вероятность в [0,1] и точную confusion matrix; stop on/off не подменяет holdout качеством train. | `datamining-neuralnetclass:help01`, `datamining-neuralnetclass:help06` |

## Предлагаемое разбиение на этапы

Разбиение — гипотеза до этапа 0. Каждый этап должен приниматься самостоятельно; общие изменения, нужные этапу, входят в его же карточку.

- `datamining-neuralnetclass:s1` — Минимальная сеть и применение. Требования: `datamining-neuralnetclass:r01`, `datamining-neuralnetclass:r02`.
- `datamining-neuralnetclass:s2` — Структура, обучение и специальные выходы. Требования: `datamining-neuralnetclass:r03`, `datamining-neuralnetclass:r04`, `datamining-neuralnetclass:r10`. После: `datamining-neuralnetclass:s1`.
- `datamining-neuralnetclass:s3` — Нормализация и оценка на выборках. Требования: `datamining-neuralnetclass:r05`, `datamining-neuralnetclass:r06`. После: `datamining-neuralnetclass:s2`.
- `datamining-neuralnetclass:s4` — Автоподбор и полная сводка. Требования: `datamining-neuralnetclass:r07`, `datamining-neuralnetclass:r08`, `datamining-neuralnetclass:r09`. После: `datamining-neuralnetclass:s3`.

## Заметки черновика

Обязательный табличный вход, табличный прогноз и сводка переменных. Один target, роли Входное/Выходное/Не задано. Обучение L-BFGS и применение разделены. Непрерывный predictor задаёт один вход сети, дискретный — несколько по категориям. Классы берутся из train, target дискретный. Выход содержит класс/ID прогноза, posterior, Gini и только при обучении класс/ID факта; порядок классов и смысл Gini требуют точного readback.

Схема модели закрепляется после явных configure/train вместе с ролями полей, обученными категориями и настройками выходов. Apply сохранённой модели проверяет эту схему строго; новая категория, несовместимые поля или retrain требуют отдельного наблюдения lifecycle и соответствующей квитанции. Разрешение изменения схемы CrossTable sliding на нейросеть не переносится.

Train: три компактные группы в двух измерениях вокруг (-3,-3),(0,3),(3,-3), по 12 заранее заданных точек; отдельный holdout по 3 точки ближе к центрам. Seed закреплён, нормировка явная; базовая сеть 0 скрытых слоёв и bounded restarts. До запуска установить критерий fixture: все 9 holdout labels верны, вероятности конечны, счётчики точны. Это проверка данного простого набора, не обещание качества произвольной сети. Ошибку классификации oracle считает точно, cross-entropy требует вероятности фактического класса: если порт даёт только posterior предсказанного, признать ограничение и расширить evidence до заявления проверки entropy. После reopen прогнозы той же модели согласованы с atol=1e-8; веса не сравнивать побитно.

Узловые отказы: NULL во входных/выходном поле, неизвестный класс, неверные размеры слоёв/limits, изменение target или normalization после fit. Ошибки скрипта oracle и неполные summary не превращать в снижение требований; новую модель обучать только явным действием.
