# Нейросеть (классификация): подплан полного покрытия

[Карточка](README.md) · [RUNBOOK](../../RUNBOOK.md) · [Карта покрытия](../../coverage-map.json).

Component ID: `component.dataMining.NeuralnetClass`. Slug: `datamining-neuralnetclass`. База исследования кода: `5f772aea9`. Источники: Help 7.4, дата доступа 2026-10-02. Статус всех новых этапов: `discovery_required`; каталог: `current_help`. Это подготовленный документ, а не выполнение этапов. В базовом `node-support.mjs` обработчик не зарегистрирован, runtime type и фактические native ports ещё требуется подтвердить. Реестр приёмки не повышается.

## Источники, результат и семантика

- `datamining-neuralnetclass:help01` — [Нейросеть (классификация)](https://help.loginom.ru/userguide/processors/datamining/neural-network-classification.html) (Help 7.4, прочитано 2026-10-02).
- `datamining-neuralnetclass:help02` — [Нейросеть (классификация) — Сводка](https://help.loginom.ru/userguide/processors/datamining/neural-network-classification/report.html) (Help 7.4, прочитано 2026-10-02).
- `datamining-neuralnetclass:help03` — [Нормализация непрерывных данных](https://help.loginom.ru/userguide/processors/normalization/normalization-continuous.html) (Help 7.4, прочитано 2026-10-02).
- `datamining-neuralnetclass:help04` — [Нормализация дискретных данных](https://help.loginom.ru/userguide/processors/normalization/normalization-discrete.html) (Help 7.4, прочитано 2026-10-02).
- `datamining-neuralnetclass:help05` — [Валидация моделей](https://help.loginom.ru/userguide/processors/validation.html) (Help 7.4, прочитано 2026-10-02).
- `datamining-neuralnetclass:help06` — [Нейросеть (классификация) — Выход нейросети](https://help.loginom.ru/userguide/processors/datamining/neural-network-classification/output-set.html) (Help 7.4, прочитано 2026-10-02).

Обязательный табличный вход, табличный прогноз и сводка переменных. Один target, роли Входное/Выходное/Не задано. Обучение L-BFGS и применение разделены. Непрерывный predictor задаёт один вход сети, дискретный — несколько по категориям. Классы берутся из train, target дискретный. Выход содержит класс/ID прогноза, posterior, Gini и только при обучении класс/ID факта; порядок классов и смысл Gini требуют точного readback.



Код и Help изучены статически; live discovery, модельная попытка и аналитическая приёмка сейчас не выполнялись. Перед реализацией наблюдать component/fulltype, портовые identities, каждую страницу мастера и различия редакции/платформы в собственном аккаунте. Неизвестное свойство остаётся вопросом с наблюдаемым условием закрытия, не вымышленным control/API.

## Этапы и зависимости

| Этап | Результат этапа | Приоритет 0–5 | Обязательные принятые этапы |
| --- | --- | ---: | --- |
| `datamining-neuralnetclass:s1` | Минимальная сеть и применение | 3 | `foundation:oracle-tabular`, `foundation:typed-variables`, `foundation:training` |
| `datamining-neuralnetclass:s2` | Структура, обучение и специальные выходы | 4 | `datamining-neuralnetclass:s1` |
| `datamining-neuralnetclass:s3` | Нормализация и оценка на выборках | 5 | `datamining-neuralnetclass:s2` |
| `datamining-neuralnetclass:s4` | Автоподбор и полная сводка | 5 | `datamining-neuralnetclass:s3` |

Для `datamining-neuralnetclass:s1` рекомендуется ранее пройти `datamining-linregression:s1`; это порядок снижения риска, не обязательная зависимость.

Схема модели закрепляется после явных configure/train вместе с ролями полей, обученными категориями и настройками выходов. Apply сохранённой модели проверяет эту схему строго; новая категория, несовместимые поля или retrain требуют отдельного наблюдения lifecycle и соответствующей квитанции. Разрешение изменения схемы CrossTable sliding на нейросеть не переносится.

Общие результаты: [приёмка и oracle](../../foundations/acceptance/plan.md), [типизированные порты](../../foundations/typed-ports/plan.md), [динамическая схема](../../foundations/dynamic-schema/plan.md), [обучение](../../foundations/training/plan.md), [внешние ресурсы](../../foundations/external-systems/plan.md). Зависимость принимается с SHA и собственными доказательствами; чужая активная ветка не считается готовой основой. Самостоятельные fixtures устраняют необходимость ждать парный преобразователь или узел Разбиение на множества.

## Матрица всех режимов и требований

Каждая строка обязательна в указанном этапе; комбинации параметров проверяются по причинно значимым взаимодействиям, а не одним smoke-test. Строка источника обозначает документацию поведения, столбец проверки — будущую независимую проверку. Ни одна строка пока не PASS.

| Требование | Режимы и параметры | Этап и источник | Проверка и ожидаемое доказательство |
| --- | --- | --- | --- |
| `datamining-neuralnetclass:r01` | Роли, типы, нормализация и построение минимальной сети без скрытых слоёв | `datamining-neuralnetclass:s1`; `datamining-neuralnetclass:help01` | Схема, RowID и сохранённые параметры; holdout исключён из обучения; модель имеет отдельную идентичность. |
| `datamining-neuralnetclass:r02` | Обучение, применение сохранённой модели к новым данным, явное переобучение после изменения параметров/источника, сохранение и холодное открытие. | `datamining-neuralnetclass:s1`; `datamining-neuralnetclass:help01` | На фиксированном обучающем входе сохранить модель; отдельно применить к holdout. Подмена параметров, модели или источника должна нарушить проверку происхождения. Применение не должно скрыто переобучать модель. |
| `datamining-neuralnetclass:r03` | 0/1/2 скрытых слоя; число нейронов >=1; рестарты >=1; регуляризация 0..100 (все пресеты и ручное значение) | `datamining-neuralnetclass:s2`; `datamining-neuralnetclass:help01` | Матрица активных полей и фактически сохранённая структура; обучение ограниченных малых сетей, без обещания одинаковых весов между оптимизаторами. |
| `datamining-neuralnetclass:r04` | Продолжить обучение; порог изменения весов; максимум эпох | `datamining-neuralnetclass:s2`; `datamining-neuralnetclass:help01` | Continue использует последнюю модель и игнорирует рестарты; обычное обучение начинает новый fit; остановка/несходимость явно отражены. |
| `datamining-neuralnetclass:r05` | Нормализация: нет; min/max, [-1;1], [0;1], абсолютная, стандартизация, отношение (min/max/mean/sum/несмещённое SD/заданный делитель); контроль диапазона нет/ошибка/винсоризация, обученный и ручной диапазон. Дискретная: индикатор с/без опорной категории, отклонение, простая, разность/обратная разность, Гельмерт/обратный Гельмерт, индекс; опорная категория первая/последняя/редкая/частая/явная. | `datamining-neuralnetclass:s3`; `datamining-neuralnetclass:help03`, `datamining-neuralnetclass:help04` | На скалярном ряду и трёх категориях независимо вычислить преобразованные значения; проверить обратное преобразование и новую категорию/выход за обученный диапазон. Выбор недоступного для данного поля метода должен давать явный отказ; матрицу доступности закрепить до модели. |
| `datamining-neuralnetclass:r06` | Случайное, последовательное и по Boolean-столбцу разбиение; размеры в строках/процентах, перестановка train/unused/test; фиксированный seed и случайный seed. Без валидации, K-fold (метод сэмплинга/колоды), Монте-Карло (итерации/доли). | `datamining-neuralnetclass:s3`; `datamining-neuralnetclass:help01`, `datamining-neuralnetclass:help05` | Самостоятельный RowID и Boolean IsTest задают точное train/test без DataPartition; True означает test. Проверить счётчики, отсутствие пересечения и утечки test в обучение/подбор. В случайных режимах воспроизводимость при одном seed, а не совпадение с чужим PRNG. |
| `datamining-neuralnetclass:r07` | Автоподбор только структуры, только регуляризации, совместно; заданная/авто начальная точка | `datamining-neuralnetclass:s4`; `datamining-neuralnetclass:help01` | Readback всех флагов/начальных значений, конечная структура и независимое качество на holdout; не требовать глобального optimum. |
| `datamining-neuralnetclass:r08` | Подвыборка для автоподбора: доля/максимум, limits шагов/секунд (0 отключает); финальное обучение на полном train | `datamining-neuralnetclass:s4`; `datamining-neuralnetclass:help01` | Не путать внутренний limit автоподбора с 7200с внешнего запуска. Последний fit может выйти за внутренний limit, внешний deadline не продлевается. |
| `datamining-neuralnetclass:r09` | Сводка: total/selected/train, метрики ошибок и G-test/DF/p/mutual information по полям | `datamining-neuralnetclass:s4`; `datamining-neuralnetclass:help02` | Счётчики точно; RMSE/MAE/relative error или classification error/entropy независимо из прогнозов при совпадающем определении; частные G-метрики отдельным oracle. |
| `datamining-neuralnetclass:r10` | Бинарная и многоклассовая классификация, ID/значение класса, posterior, Gini; stop при нулевой classification error | `datamining-neuralnetclass:s2`; `datamining-neuralnetclass:help01`, `datamining-neuralnetclass:help06` | Три раздельные группы проверяют карту labels↔IDs, вероятность в [0,1] и точную confusion matrix; stop on/off не подменяет holdout качеством train. |

## Реализация в текущем runtime

Переиспользовать `packages/loginom-runtime/client/lib/node-apply.mjs`, `node-procedure.mjs`, `node-execution-procedure.mjs`, `node-process-context.mjs`, `execution-journal.mjs`: существующую операцию, deadline, ownership и отмену. `workspace-ui.mjs` расширять адресным наблюдением собственных страниц; не вводить общий интерпретатор сценариев и не обращаться к внутренним RPC Loginom.

Табличную часть опереть на `table-output-pages.mjs`, `table-output-values.mjs` и `node-execution-evidence.mjs`: preview по умолчанию ограничен, completeness/precision подтверждаются явно. `node-read-contract.mjs` требует завершённую локальную table receipt и fresh execution; variable outputs, третий порт и model identity не покрыты этим допуском автоматически.

Handler, параметры, context/readback и procedure добавлять в `packages/loginom-runtime/client/lib` по образцу `grouping-node.mjs`/`grouping-parameters.mjs` для скалярных ролей и `calculator-node.mjs`/`calculator-readback.mjs` для упорядоченных выражений. Эти образцы не доказывают готовность данного узла. После discovery добавить проверенный тип в `node-support.mjs`, публичный вариант в `node-api.mjs` и компактное развёртывание в `user-workflow.mjs`. Изменение общего контракта согласовать с владельцем соответствующего foundation; не вносить разрозненные новые train/tree/variable wire-формы в каждом handler.

Адресные проверки создаются рядом в `client/test` и выполняются из каталога пакета по его принятой команде. Пока тестов нового обработчика нет, их нельзя указывать как выполненные. Отдельно проверить совместимость 14 существующих типов и read/job/recovery на затронутых путях.

## Независимые fixtures и численные ожидания

Train: три компактные группы в двух измерениях вокруг (-3,-3),(0,3),(3,-3), по 12 заранее заданных точек; отдельный holdout по 3 точки ближе к центрам. Seed закреплён, нормировка явная; базовая сеть 0 скрытых слоёв и bounded restarts. До запуска установить критерий fixture: все 9 holdout labels верны, вероятности конечны, счётчики точны. Это проверка данного простого набора, не обещание качества произвольной сети. Ошибку классификации oracle считает точно, cross-entropy требует вероятности фактического класса: если порт даёт только posterior предсказанного, признать ограничение и расширить evidence до заявления проверки entropy. После reopen прогнозы той же модели согласованы с atol=1e-8; веса не сравнивать побитно.

Expected, формулы oracle, допуски и отрицательные подмены (значение/тип/порядок/связь/модель/источник) закрепить до модельного прогона. Не вычислять expected импортом handler и не выводить их из фактического результата проверяемой попытки. Непрерывные допуски применяются только к указанным числам; identity, Boolean, NULL, строки, количество и схема сравниваются точно. Раздельно хранить входы для модели и oracle/expected вне её workspace. Для всех стадий нужны пустой вход, границы типов, Unicode, повторный запуск, смена исходника и save/reopen в релевантном режиме.

## Ошибки, восстановление и приёмка

Узловые отказы: NULL во входных/выходном поле, неизвестный класс, неверные размеры слоёв/limits, изменение target или normalization после fit. Ошибки скрипта oracle и неполные summary не превращать в снижение требований; новую модель обучать только явным действием.

Проверять запрос до эффекта; Done/Close/Execute имеют разные результаты. При отказе мастера прочитать его собственную причину, закрыть принадлежащий операции error dialog, затем подтвердить cleanup. Не повторять Execute/Train или загрузку схемы при lost reply/неизвестном эффекте; использовать status/inspect/recover той же операции, сохраняя исходный deadline и FAIL. Ошибка/отмена не должна выдавать старый output как свежий. Для меняющего схему режима проверить фактические выходы и downstream связи после каждого изменения.

Business task этапа описывает требуемое преобразование/модель, входные файлы и уникальный путь нового пакета. Модель и effort берутся из назначения; предел попытки **7200 секунд**. Приёмка — standalone CLI и независимый cold-check точного опубликованного SHA по [общему регламенту](../../workflow/acceptance-cli.md). Проверить параметры, все входы/выходы и типы, полноту малых результатов, происхождение модели/данных, сохранение и отдельное открытие; `package_closed=true` и `logged_out=true` обязательны. Текущий табличный cold-check расширять через foundation для дерева/переменных/обучения; до появления нужного oracle этап остаётся NOT_RUN. Сборка, exit 0, preview и cleanup отдельно не означают аналитический PASS.

Этап готов к разработке после закрытия его discovery вопросов и фиксации независимых expected; этап готов к приёмке после handler, адресных тестов и проверенного oracle; принимается только объявленный stage scope. Полное покрытие узла требует всех строк всех этапов. Исторические результаты другого SHA/режима не переносятся. Checkpoint не длиннее 20 строк: SHA, принятый scope, проверенные результаты, ограничения, следующий stage/trigger. Реализация, интеграция и выпуск остаются отдельными состояниями; слияние и выпуск требуют отдельной команды владельца.

<!-- parallel-execution:start -->

## Параллельная работа

При подготовке этого плана новые задачи и прогоны не запускались; существующие карточки могут уже выполняться. При назначении используются [правила Multica](../../workflow/multica-parallel.md); наличие строки не подтверждает доступность ресурса или готовность этапа.

| Этап | Направление | Группа карточки | Разработка | Интеграция | Модель | Независимая проверка | Примечание |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `datamining-neuralnetclass:s1` | Регрессии, нейросети и временной ряд | datamining-neuralnetclass | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `datamining-neuralnetclass:s2` | Регрессии, нейросети и временной ряд | datamining-neuralnetclass | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `datamining-neuralnetclass:s3` | Регрессии, нейросети и временной ряд | datamining-neuralnetclass | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `datamining-neuralnetclass:s4` | Регрессии, нейросети и временной ряд | datamining-neuralnetclass | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |

<!-- parallel-execution:end -->
