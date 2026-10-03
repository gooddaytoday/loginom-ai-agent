# Линейная регрессия: подплан полного покрытия

[Карточка](README.md) · [RUNBOOK](../../RUNBOOK.md) · [Карта покрытия](../../coverage-map.json).

Component ID: `component.dataMining.LinRegression`. Slug: `datamining-linregression`. База исследования кода: `5f772aea9`. Источники: Help 7.4, дата доступа 2026-10-02. Статус всех новых этапов: `discovery_required`; каталог: `current_help`. Это подготовленный документ, а не выполнение этапов. В базовом `node-support.mjs` обработчик не зарегистрирован, runtime type и фактические native ports ещё требуется подтвердить. Реестр приёмки не повышается.

## Источники, результат и семантика

- `datamining-linregression:help01` — [Линейная регрессия](https://help.loginom.ru/userguide/processors/datamining/linear-regression/) (Help 7.4, прочитано 2026-10-02).
- `datamining-linregression:help02` — [Линейная регрессия — Сводка](https://help.loginom.ru/userguide/processors/datamining/linear-regression/report.html) (Help 7.4, прочитано 2026-10-02).
- `datamining-linregression:help03` — [Линейная регрессия — Коэффициенты регрессии](https://help.loginom.ru/userguide/processors/datamining/linear-regression/coef-regression.html) (Help 7.4, прочитано 2026-10-02).
- `datamining-linregression:help04` — [Нормализация непрерывных данных](https://help.loginom.ru/userguide/processors/normalization/normalization-continuous.html) (Help 7.4, прочитано 2026-10-02).
- `datamining-linregression:help05` — [Нормализация дискретных данных](https://help.loginom.ru/userguide/processors/normalization/normalization-discrete.html) (Help 7.4, прочитано 2026-10-02).
- `datamining-linregression:help06` — [Валидация моделей](https://help.loginom.ru/userguide/processors/validation.html) (Help 7.4, прочитано 2026-10-02).

Табличный вход и необязательный вход управляющих переменных. Выходы: исходные поля с прогнозом, таблица коэффициентов и сводка переменных. Цель — одна вещественная непрерывная переменная. Входы не содержат NULL; цель без пропусков при обучении. Коэффициенты зависят от нормировки/опорных категорий, поэтому denormalize и include-constant входят в идентичность модели.



Код и Help изучены статически; live discovery, модельная попытка и аналитическая приёмка сейчас не выполнялись. Перед реализацией наблюдать component/fulltype, портовые identities, каждую страницу мастера и различия редакции/платформы в собственном аккаунте. Неизвестное свойство остаётся вопросом с наблюдаемым условием закрытия, не вымышленным control/API.

## Этапы и зависимости

| Этап | Результат этапа | Приоритет 0–5 | Обязательные принятые этапы |
| --- | --- | ---: | --- |
| `datamining-linregression:s1` | Базовая модель и сохранённое применение | 3 | `foundation:oracle-tabular`, `foundation:typed-variables`, `foundation:training` |
| `datamining-linregression:s2` | Все способы настройки модели | 4 | `datamining-linregression:s1` |
| `datamining-linregression:s3` | Нормализация, выборки и валидация | 5 | `datamining-linregression:s2` |
| `datamining-linregression:s4` | Полная статистика и управление переменными | 5 | `datamining-linregression:s3` |

Общие результаты: [приёмка и oracle](../../foundations/acceptance/plan.md), [типизированные порты](../../foundations/typed-ports/plan.md), [динамическая схема](../../foundations/dynamic-schema/plan.md), [обучение](../../foundations/training/plan.md), [внешние ресурсы](../../foundations/external-systems/plan.md). Зависимость принимается с SHA и собственными доказательствами; чужая активная ветка не считается готовой основой. Самостоятельные fixtures устраняют необходимость ждать парный преобразователь или узел Разбиение на множества.

## Матрица всех режимов и требований

Каждая строка обязательна в указанном этапе; комбинации параметров проверяются по причинно значимым взаимодействиям, а не одним smoke-test. Строка источника обозначает документацию поведения, столбец проверки — будущую независимую проверку. Ни одна строка пока не PASS.

| Требование | Режимы и параметры | Этап и источник | Проверка и ожидаемое доказательство |
| --- | --- | --- | --- |
| `datamining-linregression:r01` | Роли входных/выходного поля, ручной Enter, три выхода | `datamining-linregression:s1`; `datamining-linregression:help01`, `datamining-linregression:help02`, `datamining-linregression:help03` | Самостоятельные train и holdout; прогноз из независимо рассчитанных коэффициентов, schema и IDs, счётчики сводки. Управляющие переменные адресуют наблюдённые параметры. |
| `datamining-linregression:r02` | Обучение, применение сохранённой модели к новым данным, явное переобучение после изменения параметров/источника, сохранение и холодное открытие. | `datamining-linregression:s1`; `datamining-linregression:help01` | На фиксированном обучающем входе сохранить модель; отдельно применить к holdout. Подмена параметров, модели или источника должна нарушить проверку происхождения. Применение не должно скрыто переобучать модель. |
| `datamining-linregression:r03` | Ручные Enter, Forward, Backward, Stepwise, Ridge, LASSO, Elastic-Net; доступные приоритеты скорость/точность, достоверность данных, число факторов | `datamining-linregression:s2`; `datamining-linregression:help01` | Отдельный fixture с полезным, шумовым и коллинеарным признаком; все семь методов имеют проверку выбора/настроек/результата, запрещённые сочетания отказывают до эффекта. |
| `datamining-linregression:r04` | Автоматический подбор с пятью уровнями точность→скорость; ручная/автоматическая L1/L2 регуляризация | `datamining-linregression:s2`; `datamining-linregression:help01` | Проверить все пресеты, отключение ручных controls, выбранные коэффициенты и отсутствие test leakage; пределы решателя не подменять идеальной точностью. |
| `datamining-linregression:r05` | Детальные настройки: точность решения 0..1, константа, уровень доверия, пороги включения/исключения факторов; denormalize, опорные коэффициенты | `datamining-linregression:s2`; `datamining-linregression:help01`, `datamining-linregression:help03` | Readback доступности controls, вычисление прогнозов и статистик в правильном пространстве. В Help подписи частных случаев Elastic-Net противоречат определению L1/L2: раскрыть actual bindings до expected. |
| `datamining-linregression:r06` | Нормализация: нет; min/max, [-1;1], [0;1], абсолютная, стандартизация, отношение (min/max/mean/sum/несмещённое SD/заданный делитель); контроль диапазона нет/ошибка/винсоризация, обученный и ручной диапазон. Дискретная: индикатор с/без опорной категории, отклонение, простая, разность/обратная разность, Гельмерт/обратный Гельмерт, индекс; опорная категория первая/последняя/редкая/частая/явная. | `datamining-linregression:s3`; `datamining-linregression:help04`, `datamining-linregression:help05` | На скалярном ряду и трёх категориях независимо вычислить преобразованные значения; проверить обратное преобразование и новую категорию/выход за обученный диапазон. Выбор недоступного для данного поля метода должен давать явный отказ; матрицу доступности закрепить до модели. |
| `datamining-linregression:r07` | Случайное, последовательное и по Boolean-столбцу разбиение; размеры в строках/процентах, перестановка train/unused/test; фиксированный seed и случайный seed. Без валидации, K-fold (метод сэмплинга/колоды), Монте-Карло (итерации/доли). | `datamining-linregression:s3`; `datamining-linregression:help01`, `datamining-linregression:help06` | Самостоятельный RowID и Boolean IsTest задают точное train/test без DataPartition; True означает test. Проверить счётчики, отсутствие пересечения и утечки test в обучение/подбор. В случайных режимах воспроизводимость при одном seed, а не совпадение с чужим PRNG. |
| `datamining-linregression:r08` | Полное чтение coefficients/summary и применение параметров через переменные | `datamining-linregression:s4`; `datamining-linregression:help01`, `datamining-linregression:help02`, `datamining-linregression:help03` | Проверить технические имена, метки, типы, число строк и все оговорённые показатели после холодного открытия; не округлять p-values до экранных 0. |
| `datamining-linregression:r09` | Критерии отбора F, R², adjusted R², AIC, AICc, BIC, Hannan–Quinn | `datamining-linregression:s2`; `datamining-linregression:help01`, `datamining-linregression:help02` | На noisy full-rank fixture независимо рассчитать RSS, DF и критерии; для малого n явно определить неприменимые показатели. |
| `datamining-linregression:r10` | Коэффициенты, SE, t, p, доверительные интервалы; log-likelihood, R²/adjusted, SD, DF, F/p и все information criteria | `datamining-linregression:s4`; `datamining-linregression:help02`, `datamining-linregression:help03` | OLS эталон QR/SVD на исходном fixture; поддержать denormalized/normalized коэффициенты и признаки категорий, atol=1e-8 для устойчивого базового набора. |

## Реализация в текущем runtime

Переиспользовать `packages/loginom-runtime/client/lib/node-apply.mjs`, `node-procedure.mjs`, `node-execution-procedure.mjs`, `node-process-context.mjs`, `execution-journal.mjs`: существующую операцию, deadline, ownership и отмену. `workspace-ui.mjs` расширять адресным наблюдением собственных страниц; не вводить общий интерпретатор сценариев и не обращаться к внутренним RPC Loginom.

Табличную часть опереть на `table-output-pages.mjs`, `table-output-values.mjs` и `node-execution-evidence.mjs`: preview по умолчанию ограничен, completeness/precision подтверждаются явно. `node-read-contract.mjs` требует завершённую локальную table receipt и fresh execution; variable outputs, третий порт и model identity не покрыты этим допуском автоматически.

Handler, параметры, context/readback и procedure добавлять в `packages/loginom-runtime/client/lib` по образцу `grouping-node.mjs`/`grouping-parameters.mjs` для скалярных ролей и `calculator-node.mjs`/`calculator-readback.mjs` для упорядоченных выражений. Эти образцы не доказывают готовность данного узла. После discovery добавить проверенный тип в `node-support.mjs`, публичный вариант в `node-api.mjs` и компактное развёртывание в `user-workflow.mjs`. Изменение общего контракта согласовать с владельцем соответствующего foundation; не вносить разрозненные новые train/tree/variable wire-формы в каждом handler.

Адресные проверки создаются рядом в `client/test` и выполняются из каталога пакета по его принятой команде. Пока тестов нового обработчика нет, их нельзя указывать как выполненные. Отдельно проверить совместимость 14 существующих типов и read/job/recovery на затронутых путях.

## Независимые fixtures и численные ожидания

Основной train: X=[-2,-1,0,1,2,3], Y=2X+3; Enter, без нормировки/регуляризации, константа включена. Ожидаемые beta=(3,2), holdout X=4 даёт 11, atol=1e-8. Для статистик использовать отдельные 20 строк с заданными остатками и полноранговой матрицей: идеальная линия не подходит для проверки конечных t/p. Независимый QR/SVD даёт beta, covariance и интервалы; степеням свободы и вариантам normalization соответствует отдельный oracle. Категории/опорные коэффициенты проверять прогнозами и матрицей контрастов, а не голым размером таблицы.

Expected, формулы oracle, допуски и отрицательные подмены (значение/тип/порядок/связь/модель/источник) закрепить до модельного прогона. Не вычислять expected импортом handler и не выводить их из фактического результата проверяемой попытки. Непрерывные допуски применяются только к указанным числам; identity, Boolean, NULL, строки, количество и схема сравниваются точно. Раздельно хранить входы для модели и oracle/expected вне её workspace. Для всех стадий нужны пустой вход, границы типов, Unicode, повторный запуск, смена исходника и save/reopen в релевантном режиме.

## Ошибки, восстановление и приёмка

Узловые отказы: NULL предиктора, неверный target kind/type, нулевой train size, rank deficiency, недоступное сочетание denormalize/константа. Не считать альтернативный набор collinear coefficients дефектом при эквивалентных прогнозах без заявленной уникальности решения.

Проверять запрос до эффекта; Done/Close/Execute имеют разные результаты. При отказе мастера прочитать его собственную причину, закрыть принадлежащий операции error dialog, затем подтвердить cleanup. Не повторять Execute/Train или загрузку схемы при lost reply/неизвестном эффекте; использовать status/inspect/recover той же операции, сохраняя исходный deadline и FAIL. Ошибка/отмена не должна выдавать старый output как свежий. Для меняющего схему режима проверить фактические выходы и downstream связи после каждого изменения.

Business task этапа описывает требуемое преобразование/модель, входные файлы и уникальный путь нового пакета. Модель и effort берутся из назначения; предел попытки **7200 секунд**. Приёмка — standalone CLI и независимый cold-check точного опубликованного SHA по [общему регламенту](../../workflow/acceptance-cli.md). Проверить параметры, все входы/выходы и типы, полноту малых результатов, происхождение модели/данных, сохранение и отдельное открытие; `package_closed=true` и `logged_out=true` обязательны. Текущий табличный cold-check расширять через foundation для дерева/переменных/обучения; до появления нужного oracle этап остаётся NOT_RUN. Сборка, exit 0, preview и cleanup отдельно не означают аналитический PASS.

Этап готов к разработке после закрытия его discovery вопросов и фиксации независимых expected; этап готов к приёмке после handler, адресных тестов и проверенного oracle; принимается только объявленный stage scope. Полное покрытие узла требует всех строк всех этапов. Исторические результаты другого SHA/режима не переносятся. Checkpoint не длиннее 20 строк: SHA, принятый scope, проверенные результаты, ограничения, следующий stage/trigger. Реализация, интеграция и выпуск остаются отдельными состояниями; слияние и выпуск требуют отдельной команды владельца.

<!-- parallel-execution:start -->

## Параллельная работа

При подготовке этого плана новые задачи и прогоны не запускались; существующие карточки могут уже выполняться. При назначении используются [правила Multica](../../workflow/multica-parallel.md); наличие строки не подтверждает доступность ресурса или готовность этапа.

| Этап | Направление | Группа карточки | Разработка | Интеграция | Модель | Независимая проверка | Примечание |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `datamining-linregression:s1` | Регрессии, нейросети и временной ряд | datamining-linregression | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `datamining-linregression:s2` | Регрессии, нейросети и временной ряд | datamining-linregression | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `datamining-linregression:s3` | Регрессии, нейросети и временной ряд | datamining-linregression | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `datamining-linregression:s4` | Регрессии, нейросети и временной ряд | datamining-linregression | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |

<!-- parallel-execution:end -->
