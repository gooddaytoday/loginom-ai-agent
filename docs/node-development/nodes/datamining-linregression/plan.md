# Линейная регрессия: черновик требований

Component ID: `component.dataMining.LinRegression`. Slug: `datamining-linregression`. [Карточка](README.md) · [Реестр](../../registry.json) · [Шаблон подплана](../../templates/node-plan.md).

Черновик собран 2026-10-02 по справке и исходникам `5f772aea9`; каталог: компонент есть в текущей Help 7.4. Живое исследование, E2E и прогоны не выполнялись, обработчика нет. Это входные данные для подплана, а не назначение: перед назначением подплан переписывается по шаблону — этап 0 живого исследования, самостоятельный этап 1, приёмочный комплект и задание модели.

## Источники

- `datamining-linregression:help01` — [Линейная регрессия](https://help.loginom.ru/userguide/processors/datamining/linear-regression/), Help 7.4, прочитано 2026-10-02.
- `datamining-linregression:help02` — [Линейная регрессия — Сводка](https://help.loginom.ru/userguide/processors/datamining/linear-regression/report.html), Help 7.4, прочитано 2026-10-02.
- `datamining-linregression:help03` — [Линейная регрессия — Коэффициенты регрессии](https://help.loginom.ru/userguide/processors/datamining/linear-regression/coef-regression.html), Help 7.4, прочитано 2026-10-02.
- `datamining-linregression:help04` — [Нормализация непрерывных данных](https://help.loginom.ru/userguide/processors/normalization/normalization-continuous.html), Help 7.4, прочитано 2026-10-02.
- `datamining-linregression:help05` — [Нормализация дискретных данных](https://help.loginom.ru/userguide/processors/normalization/normalization-discrete.html), Help 7.4, прочитано 2026-10-02.
- `datamining-linregression:help06` — [Валидация моделей](https://help.loginom.ru/userguide/processors/validation.html), Help 7.4, прочитано 2026-10-02.

## Требования справки

| ID | Возможность | Предлагаемая независимая проверка | Источник |
| --- | --- | --- | --- |
| `datamining-linregression:r01` | Роли входных/выходного поля, ручной Enter, три выхода | Самостоятельные train и holdout; прогноз из независимо рассчитанных коэффициентов, schema и IDs, счётчики сводки. Управляющие переменные адресуют наблюдённые параметры. | `datamining-linregression:help01`, `datamining-linregression:help02`, `datamining-linregression:help03` |
| `datamining-linregression:r02` | Обучение, применение сохранённой модели к новым данным, явное переобучение после изменения параметров/источника, сохранение и холодное открытие. | На фиксированном обучающем входе сохранить модель; отдельно применить к holdout. Подмена параметров, модели или источника должна нарушить проверку происхождения. Применение не должно скрыто переобучать модель. | `datamining-linregression:help01` |
| `datamining-linregression:r03` | Ручные Enter, Forward, Backward, Stepwise, Ridge, LASSO, Elastic-Net; доступные приоритеты скорость/точность, достоверность данных, число факторов | Отдельный fixture с полезным, шумовым и коллинеарным признаком; все семь методов имеют проверку выбора/настроек/результата, запрещённые сочетания отказывают до эффекта. | `datamining-linregression:help01` |
| `datamining-linregression:r04` | Автоматический подбор с пятью уровнями точность→скорость; ручная/автоматическая L1/L2 регуляризация | Проверить все пресеты, отключение ручных controls, выбранные коэффициенты и отсутствие test leakage; пределы решателя не подменять идеальной точностью. | `datamining-linregression:help01` |
| `datamining-linregression:r05` | Детальные настройки: точность решения 0..1, константа, уровень доверия, пороги включения/исключения факторов; denormalize, опорные коэффициенты | Readback доступности controls, вычисление прогнозов и статистик в правильном пространстве. В Help подписи частных случаев Elastic-Net противоречат определению L1/L2: раскрыть actual bindings до expected. | `datamining-linregression:help01`, `datamining-linregression:help03` |
| `datamining-linregression:r06` | Нормализация: нет; min/max, [-1;1], [0;1], абсолютная, стандартизация, отношение (min/max/mean/sum/несмещённое SD/заданный делитель); контроль диапазона нет/ошибка/винсоризация, обученный и ручной диапазон. Дискретная: индикатор с/без опорной категории, отклонение, простая, разность/обратная разность, Гельмерт/обратный Гельмерт, индекс; опорная категория первая/последняя/редкая/частая/явная. | На скалярном ряду и трёх категориях независимо вычислить преобразованные значения; проверить обратное преобразование и новую категорию/выход за обученный диапазон. Выбор недоступного для данного поля метода должен давать явный отказ; матрицу доступности закрепить до модели. | `datamining-linregression:help04`, `datamining-linregression:help05` |
| `datamining-linregression:r07` | Случайное, последовательное и по Boolean-столбцу разбиение; размеры в строках/процентах, перестановка train/unused/test; фиксированный seed и случайный seed. Без валидации, K-fold (метод сэмплинга/колоды), Монте-Карло (итерации/доли). | Самостоятельный RowID и Boolean IsTest задают точное train/test без DataPartition; True означает test. Проверить счётчики, отсутствие пересечения и утечки test в обучение/подбор. В случайных режимах воспроизводимость при одном seed, а не совпадение с чужим PRNG. | `datamining-linregression:help01`, `datamining-linregression:help06` |
| `datamining-linregression:r08` | Полное чтение coefficients/summary и применение параметров через переменные | Проверить технические имена, метки, типы, число строк и все оговорённые показатели после холодного открытия; не округлять p-values до экранных 0. | `datamining-linregression:help01`, `datamining-linregression:help02`, `datamining-linregression:help03` |
| `datamining-linregression:r09` | Критерии отбора F, R², adjusted R², AIC, AICc, BIC, Hannan–Quinn | На noisy full-rank fixture независимо рассчитать RSS, DF и критерии; для малого n явно определить неприменимые показатели. | `datamining-linregression:help01`, `datamining-linregression:help02` |
| `datamining-linregression:r10` | Коэффициенты, SE, t, p, доверительные интервалы; log-likelihood, R²/adjusted, SD, DF, F/p и все information criteria | OLS эталон QR/SVD на исходном fixture; поддержать denormalized/normalized коэффициенты и признаки категорий, atol=1e-8 для устойчивого базового набора. | `datamining-linregression:help02`, `datamining-linregression:help03` |

## Предлагаемое разбиение на этапы

Разбиение — гипотеза до этапа 0. Каждый этап должен приниматься самостоятельно; общие изменения, нужные этапу, входят в его же карточку.

- `datamining-linregression:s1` — Базовая модель и сохранённое применение. Требования: `datamining-linregression:r01`, `datamining-linregression:r02`.
- `datamining-linregression:s2` — Все способы настройки модели. Требования: `datamining-linregression:r03`, `datamining-linregression:r04`, `datamining-linregression:r05`, `datamining-linregression:r09`. После: `datamining-linregression:s1`.
- `datamining-linregression:s3` — Нормализация, выборки и валидация. Требования: `datamining-linregression:r06`, `datamining-linregression:r07`. После: `datamining-linregression:s2`.
- `datamining-linregression:s4` — Полная статистика и управление переменными. Требования: `datamining-linregression:r08`, `datamining-linregression:r10`. После: `datamining-linregression:s3`.

## Заметки черновика

Табличный вход и необязательный вход управляющих переменных. Выходы: исходные поля с прогнозом, таблица коэффициентов и сводка переменных. Цель — одна вещественная непрерывная переменная. Входы не содержат NULL; цель без пропусков при обучении. Коэффициенты зависят от нормировки/опорных категорий, поэтому denormalize и include-constant входят в идентичность модели.

Основной train: X=[-2,-1,0,1,2,3], Y=2X+3; Enter, без нормировки/регуляризации, константа включена. Ожидаемые beta=(3,2), holdout X=4 даёт 11, atol=1e-8. Для статистик использовать отдельные 20 строк с заданными остатками и полноранговой матрицей: идеальная линия не подходит для проверки конечных t/p. Независимый QR/SVD даёт beta, covariance и интервалы; степеням свободы и вариантам normalization соответствует отдельный oracle. Категории/опорные коэффициенты проверять прогнозами и матрицей контрастов, а не голым размером таблицы.

Узловые отказы: NULL предиктора, неверный target kind/type, нулевой train size, rank deficiency, недоступное сочетание denormalize/константа. Не считать альтернативный набор collinear coefficients дефектом при эквивалентных прогнозах без заявленной уникальности решения.
