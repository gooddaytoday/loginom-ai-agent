# Нейросеть (регрессия): черновик требований

Component ID: `component.dataMining.NeuralnetReg`. Slug: `datamining-neuralnetreg`. [Карточка](README.md) · [Реестр](../../registry.json) · [Шаблон подплана](../../templates/node-plan.md).

Черновик собран 2026-10-02 по справке и исходникам `5f772aea9`; каталог: компонент есть в текущей Help 7.4. Живое исследование, E2E и прогоны не выполнялись, обработчика нет. Это входные данные для подплана, а не назначение: перед назначением подплан переписывается по шаблону — этап 0 живого исследования, самостоятельный этап 1, приёмочный комплект и задание модели.

## Источники

- `datamining-neuralnetreg:help01` — [Нейросеть (регрессия)](https://help.loginom.ru/userguide/processors/datamining/neural-network-regression.html), Help 7.4, прочитано 2026-10-02.
- `datamining-neuralnetreg:help02` — [Нейросеть (регрессия) — Сводка](https://help.loginom.ru/userguide/processors/datamining/neural-network-regression/report.html), Help 7.4, прочитано 2026-10-02.
- `datamining-neuralnetreg:help03` — [Нормализация непрерывных данных](https://help.loginom.ru/userguide/processors/normalization/normalization-continuous.html), Help 7.4, прочитано 2026-10-02.
- `datamining-neuralnetreg:help04` — [Нормализация дискретных данных](https://help.loginom.ru/userguide/processors/normalization/normalization-discrete.html), Help 7.4, прочитано 2026-10-02.
- `datamining-neuralnetreg:help05` — [Валидация моделей](https://help.loginom.ru/userguide/processors/validation.html), Help 7.4, прочитано 2026-10-02.

## Требования справки

| ID | Возможность | Предлагаемая независимая проверка | Источник |
| --- | --- | --- | --- |
| `datamining-neuralnetreg:r01` | Роли, типы, нормализация и построение минимальной сети без скрытых слоёв | Схема, RowID и сохранённые параметры; holdout исключён из обучения; модель имеет отдельную идентичность. | `datamining-neuralnetreg:help01` |
| `datamining-neuralnetreg:r02` | Обучение, применение сохранённой модели к новым данным, явное переобучение после изменения параметров/источника, сохранение и холодное открытие. | На фиксированном обучающем входе сохранить модель; отдельно применить к holdout. Подмена параметров, модели или источника должна нарушить проверку происхождения. Применение не должно скрыто переобучать модель. | `datamining-neuralnetreg:help01` |
| `datamining-neuralnetreg:r03` | 0/1/2 скрытых слоя; число нейронов >=1; рестарты >=1; регуляризация 0..100 (все пресеты и ручное значение) | Матрица активных полей и фактически сохранённая структура; обучение ограниченных малых сетей, без обещания одинаковых весов между оптимизаторами. | `datamining-neuralnetreg:help01` |
| `datamining-neuralnetreg:r04` | Продолжить обучение; порог изменения весов; максимум эпох | Continue использует последнюю модель и игнорирует рестарты; обычное обучение начинает новый fit; остановка/несходимость явно отражены. | `datamining-neuralnetreg:help01` |
| `datamining-neuralnetreg:r05` | Нормализация: нет; min/max, [-1;1], [0;1], абсолютная, стандартизация, отношение (min/max/mean/sum/несмещённое SD/заданный делитель); контроль диапазона нет/ошибка/винсоризация, обученный и ручной диапазон. Дискретная: индикатор с/без опорной категории, отклонение, простая, разность/обратная разность, Гельмерт/обратный Гельмерт, индекс; опорная категория первая/последняя/редкая/частая/явная. | На скалярном ряду и трёх категориях независимо вычислить преобразованные значения; проверить обратное преобразование и новую категорию/выход за обученный диапазон. Выбор недоступного для данного поля метода должен давать явный отказ; матрицу доступности закрепить до модели. | `datamining-neuralnetreg:help03`, `datamining-neuralnetreg:help04` |
| `datamining-neuralnetreg:r06` | Случайное, последовательное и по Boolean-столбцу разбиение; размеры в строках/процентах, перестановка train/unused/test; фиксированный seed и случайный seed. Без валидации, K-fold (метод сэмплинга/колоды), Монте-Карло (итерации/доли). | Самостоятельный RowID и Boolean IsTest задают точное train/test без DataPartition; True означает test. Проверить счётчики, отсутствие пересечения и утечки test в обучение/подбор. В случайных режимах воспроизводимость при одном seed, а не совпадение с чужим PRNG. | `datamining-neuralnetreg:help01`, `datamining-neuralnetreg:help05` |
| `datamining-neuralnetreg:r07` | Автоподбор только структуры, только регуляризации, совместно; заданная/авто начальная точка | Readback всех флагов/начальных значений, конечная структура и независимое качество на holdout; не требовать глобального optimum. | `datamining-neuralnetreg:help01` |
| `datamining-neuralnetreg:r08` | Подвыборка для автоподбора: доля/максимум, limits шагов/секунд (0 отключает); финальное обучение на полном train | Не путать внутренний limit автоподбора с 7200с внешнего запуска. Последний fit может выйти за внутренний limit, внешний deadline не продлевается. | `datamining-neuralnetreg:help01` |
| `datamining-neuralnetreg:r09` | Сводка: total/selected/train, метрики ошибок и G-test/DF/p/mutual information по полям | Счётчики точно; RMSE/MAE/relative error или classification error/entropy независимо из прогнозов при совпадающем определении; частные G-метрики отдельным oracle. | `datamining-neuralnetreg:help02` |
| `datamining-neuralnetreg:r10` | Ограничение выходов: нет/интервал/снизу/сверху; lower/upper границы | Линейная/tanh/усечённая экспонента проверяются границами и сменой схемы настроек; недопустимый интервал отклоняется. | `datamining-neuralnetreg:help01` |

## Предлагаемое разбиение на этапы

Разбиение — гипотеза до этапа 0. Каждый этап должен приниматься самостоятельно; общие изменения, нужные этапу, входят в его же карточку.

- `datamining-neuralnetreg:s1` — Минимальная сеть и применение. Требования: `datamining-neuralnetreg:r01`, `datamining-neuralnetreg:r02`.
- `datamining-neuralnetreg:s2` — Структура, обучение и специальные выходы. Требования: `datamining-neuralnetreg:r03`, `datamining-neuralnetreg:r04`, `datamining-neuralnetreg:r10`. После: `datamining-neuralnetreg:s1`.
- `datamining-neuralnetreg:s3` — Нормализация и оценка на выборках. Требования: `datamining-neuralnetreg:r05`, `datamining-neuralnetreg:r06`. После: `datamining-neuralnetreg:s2`.
- `datamining-neuralnetreg:s4` — Автоподбор и полная сводка. Требования: `datamining-neuralnetreg:r07`, `datamining-neuralnetreg:r08`, `datamining-neuralnetreg:r09`. После: `datamining-neuralnetreg:s3`.

## Заметки черновика

- `datamining-neuralnetreg:help01` — [Нейросеть (регрессия)](https://help.loginom.ru/userguide/processors/datamining/neural-network-regression.html) (Help 7.4, прочитано 2026-10-02).
- `datamining-neuralnetreg:help02` — [Нейросеть (регрессия) — Сводка](https://help.loginom.ru/userguide/processors/datamining/neural-network-regression/report.html) (Help 7.4, прочитано 2026-10-02).
- `datamining-neuralnetreg:help03` — [Нормализация непрерывных данных](https://help.loginom.ru/userguide/processors/normalization/normalization-continuous.html) (Help 7.4, прочитано 2026-10-02).
- `datamining-neuralnetreg:help04` — [Нормализация дискретных данных](https://help.loginom.ru/userguide/processors/normalization/normalization-discrete.html) (Help 7.4, прочитано 2026-10-02).
- `datamining-neuralnetreg:help05` — [Валидация моделей](https://help.loginom.ru/userguide/processors/validation.html) (Help 7.4, прочитано 2026-10-02).

Обязательный табличный вход, табличный прогноз и сводка переменных. Один target, роли Входное/Выходное/Не задано. Обучение L-BFGS и применение разделены. Непрерывный predictor задаёт один вход сети, дискретный — несколько по категориям. Прогноз добавляется к исходным полям. Help одновременно называет numeric integer/real target и «Дискретный» вид: подтвердить фактическую допустимость continuous/discrete до закрепления контракта; не копировать ограничение классификации.

Схема модели закрепляется после явных configure/train вместе с ролями полей, обученными категориями и настройками выходов. Apply сохранённой модели проверяет эту схему строго; новая категория, несовместимые поля или retrain требуют отдельного наблюдения lifecycle и соответствующей квитанции. Разрешение изменения схемы CrossTable sliding на нейросеть не переносится.

Train X=-2..2 с шагом 0.1, Y=2X+3; holdout X=[-1.75,-0.25,1.25,1.75]. Для сети без скрытых слоёв, без регуляризации и ограничения выхода эталонная функция известна; предельный RMSE=1e-3 задать до запуска. Для 1/2 слоёв и auto-selection заранее закрепить отдельную оценку на том же holdout, не требовать коэффициентов линейной модели. Oracle пересчитывает RMSE/MAE, относительную ошибку отдельно на Y!=0; нулевая цель проверяет undefined/специальную семантику. Выходы interval/lower/upper проверяются точными bounds с atol=1e-8; roundtrip сохранённой модели — atol=1e-8.

Узловые отказы: NULL во входных/выходном поле, неизвестный класс, неверные размеры слоёв/limits, изменение target или normalization после fit. Ошибки скрипта oracle и неполные summary не превращать в снижение требований; новую модель обучать только явным действием.
