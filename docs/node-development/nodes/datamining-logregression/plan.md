# Логистическая регрессия: черновик требований

Component ID: `component.dataMining.LogRegression`. Slug: `datamining-logregression`. [Карточка](README.md) · [Реестр](../../registry.json) · [Шаблон подплана](../../templates/node-plan.md).

Черновик собран 2026-10-02 по справке и исходникам `5f772aea9`; каталог: компонент есть в текущей Help 7.4. Живое исследование, E2E и прогоны не выполнялись, обработчика нет. Это входные данные для подплана, а не назначение: перед назначением подплан переписывается по шаблону — этап 0 живого исследования, самостоятельный этап 1, приёмочный комплект и задание модели.

## Источники

- `datamining-logregression:help01` — [Логистическая регрессия](https://help.loginom.ru/userguide/processors/datamining/logistic-regression/), Help 7.4, прочитано 2026-10-02.
- `datamining-logregression:help02` — [Логистическая регрессия — Сводка](https://help.loginom.ru/userguide/processors/datamining/logistic-regression/report.html), Help 7.4, прочитано 2026-10-02.
- `datamining-logregression:help03` — [Логистическая регрессия — Коэффициенты регрессии](https://help.loginom.ru/userguide/processors/datamining/logistic-regression/coef-regression.html), Help 7.4, прочитано 2026-10-02.
- `datamining-logregression:help04` — [Нормализация непрерывных данных](https://help.loginom.ru/userguide/processors/normalization/normalization-continuous.html), Help 7.4, прочитано 2026-10-02.
- `datamining-logregression:help05` — [Нормализация дискретных данных](https://help.loginom.ru/userguide/processors/normalization/normalization-discrete.html), Help 7.4, прочитано 2026-10-02.
- `datamining-logregression:help06` — [Валидация моделей](https://help.loginom.ru/userguide/processors/validation.html), Help 7.4, прочитано 2026-10-02.

## Требования справки

| ID | Возможность | Предлагаемая независимая проверка | Источник |
| --- | --- | --- | --- |
| `datamining-logregression:r01` | Роли входных/выходного поля, ручной Enter, три выхода | Самостоятельные train и holdout; прогноз из независимо рассчитанных коэффициентов, schema и IDs, счётчики сводки. Управляющие переменные адресуют наблюдённые параметры. | `datamining-logregression:help01`, `datamining-logregression:help02`, `datamining-logregression:help03` |
| `datamining-logregression:r02` | Обучение, применение сохранённой модели к новым данным, явное переобучение после изменения параметров/источника, сохранение и холодное открытие. | На фиксированном обучающем входе сохранить модель; отдельно применить к holdout. Подмена параметров, модели или источника должна нарушить проверку происхождения. Применение не должно скрыто переобучать модель. | `datamining-logregression:help01` |
| `datamining-logregression:r03` | Ручные Enter, Forward, Backward, Stepwise, Ridge, LASSO, Elastic-Net; доступные приоритеты скорость/точность, достоверность данных, число факторов | Отдельный fixture с полезным, шумовым и коллинеарным признаком; все семь методов имеют проверку выбора/настроек/результата, запрещённые сочетания отказывают до эффекта. | `datamining-logregression:help01` |
| `datamining-logregression:r04` | Автоматический подбор с пятью уровнями точность→скорость; ручная/автоматическая L1/L2 регуляризация | Проверить все пресеты, отключение ручных controls, выбранные коэффициенты и отсутствие test leakage; пределы решателя не подменять идеальной точностью. | `datamining-logregression:help01` |
| `datamining-logregression:r05` | Детальные настройки: точность решения 0..1, константа, уровень доверия, пороги включения/исключения факторов; denormalize, опорные коэффициенты | Readback доступности controls, вычисление прогнозов и статистик в правильном пространстве. В Help подписи частных случаев Elastic-Net противоречат определению L1/L2: раскрыть actual bindings до expected. | `datamining-logregression:help01`, `datamining-logregression:help03` |
| `datamining-logregression:r06` | Нормализация: нет; min/max, [-1;1], [0;1], абсолютная, стандартизация, отношение (min/max/mean/sum/несмещённое SD/заданный делитель); контроль диапазона нет/ошибка/винсоризация, обученный и ручной диапазон. Дискретная: индикатор с/без опорной категории, отклонение, простая, разность/обратная разность, Гельмерт/обратный Гельмерт, индекс; опорная категория первая/последняя/редкая/частая/явная. | На скалярном ряду и трёх категориях независимо вычислить преобразованные значения; проверить обратное преобразование и новую категорию/выход за обученный диапазон. Выбор недоступного для данного поля метода должен давать явный отказ; матрицу доступности закрепить до модели. | `datamining-logregression:help04`, `datamining-logregression:help05` |
| `datamining-logregression:r07` | Случайное, последовательное и по Boolean-столбцу разбиение; размеры в строках/процентах, перестановка train/unused/test; фиксированный seed и случайный seed. Без валидации, K-fold (метод сэмплинга/колоды), Монте-Карло (итерации/доли). | Самостоятельный RowID и Boolean IsTest задают точное train/test без DataPartition; True означает test. Проверить счётчики, отсутствие пересечения и утечки test в обучение/подбор. В случайных режимах воспроизводимость при одном seed, а не совпадение с чужим PRNG. | `datamining-logregression:help01`, `datamining-logregression:help06` |
| `datamining-logregression:r08` | Полное чтение coefficients/summary и применение параметров через переменные | Проверить технические имена, метки, типы, число строк и все оговорённые показатели после холодного открытия; не округлять p-values до экранных 0. | `datamining-logregression:help01`, `datamining-logregression:help02`, `datamining-logregression:help03` |
| `datamining-logregression:r09` | Выбор события: первое, последнее, редкое, частое, явный индекс; порог отсечения 0..1 | При смене события вероятности комплементарны при сопоставимой модели; для p ниже/равно/выше порога зафиксировать правило равенства до теста. | `datamining-logregression:help01` |
| `datamining-logregression:r10` | Вес записей; поправка на долю событий из train/test/вручную | Unit weights эквивалентны отсутствию весов; integer weights сопоставимы репликации. Поправка изменяет константу и вероятности по независимой формуле odds. | `datamining-logregression:help01` |
| `datamining-logregression:r11` | Критерии отбора Deviance, AIC, AICc, BIC, Hannan–Quinn | Для зафиксированного fixture независимо пересчитать критерий из log-likelihood и числа параметров; применимость малого n и undefined значения не скрывать. | `datamining-logregression:help01`, `datamining-logregression:help02` |
| `datamining-logregression:r12` | Wald, p-value, odds ratio и доверительный интервал; RMSE/ошибки классификации/entropy, McFadden R² и corrected, χ², DF, information criteria | exp(beta), Wald и интервалы согласованы; confusion matrix и likelihood рассчитаны из исходных данных и событий, atol/rtol закреплены до CLI. | `datamining-logregression:help02`, `datamining-logregression:help03` |

## Предлагаемое разбиение на этапы

Разбиение — гипотеза до этапа 0. Каждый этап должен приниматься самостоятельно; общие изменения, нужные этапу, входят в его же карточку.

- `datamining-logregression:s1` — Базовая модель и сохранённое применение. Требования: `datamining-logregression:r01`, `datamining-logregression:r02`.
- `datamining-logregression:s2` — Все способы настройки модели. Требования: `datamining-logregression:r03`, `datamining-logregression:r04`, `datamining-logregression:r05`, `datamining-logregression:r09`, `datamining-logregression:r11`. После: `datamining-logregression:s1`.
- `datamining-logregression:s3` — Нормализация, выборки и валидация. Требования: `datamining-logregression:r06`, `datamining-logregression:r07`, `datamining-logregression:r10`. После: `datamining-logregression:s2`.
- `datamining-logregression:s4` — Полная статистика и управление переменными. Требования: `datamining-logregression:r08`, `datamining-logregression:r12`. После: `datamining-logregression:s3`.

## Заметки черновика

Табличный вход и необязательный вход управляющих переменных. Выходы: исходные поля с прогнозом, таблица коэффициентов и сводка переменных. Бинарная дискретная цель; событие и его вероятность — разные поля. Дополнительная роль Вес: положительные вещественные непрерывные; нулевые/NULL веса исключаются из обучения. Входные значения без пропусков; цель обязательна при обучении.

20 сгруппированных наблюдений: X=-1/0/1 с заранее заданными обоими исходами в каждой группе (исключить полную разделимость); независимый Newton/IRLS реализует logit likelihood для Enter без регуляризации. Коэффициенты и p сравнивать atol=1e-5/rtol=1e-5 при явно заданной точности решателя. Отдельные holdout точки и веса 0/1/2/NULL проверяют подсчёты; репликация строк проверяет веса. Для regularized моделей oracle сверяет целевую функцию/штраф и прогноз, не копирует ошибочное описание L1/L2. Отбор факторов проверяется на наборе с явно различимым signal/noise, без ожидания уникального выбора при collinearity.

Узловые отказы: Не две категории цели, отрицательный/нечисловой вес, все веса нулевые, неизвестное событие, разделимость, NULL во входах. Несходимость — отдельный результат; она не оправдывает тихую смену метода или регуляризации.
