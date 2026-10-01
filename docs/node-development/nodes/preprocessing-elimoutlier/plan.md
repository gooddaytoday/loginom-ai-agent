# Редактирование выбросов: подплан обработки

Подготовка: **documentation_complete**. Полный runtime-контракт: **discovery_required**.
Автор: Codex, 2026-10-01. Component ID: `component.preprocessing.Elimoutlier`.
Runtime type: **proposed** `preprocessing.eliminate_outliers`, mode `edit`.
База `loginom`: `9b17e7dd947c016395e8e32e439ca775b1cbe780`.
Версия/редакция/платформа будущей приёмки определяются её receipt; новых live наблюдений нет.

## Результат и границы

Реализовать штатный Elimoutlier со всеми критериями и методами, настройкой каждого поля,
отдельными правилами outliers/extremes и тремя читаемыми выходами. Runtime не заменяет
native вычисления собственной статистикой. Вычисления oracle независимы от Loginom.
Подплан завершён по документации; уточнение деталей конкретной версии входит в
реализацию, не требует отдельной цепочки planning-агентов и не выполняется сейчас.

## Источники и наблюдения

| Утверждение | Источник | Дата / версия | Доказательство |
| --- | --- | --- | --- |
| SD/IQR, методы, порты и таблица типов | [Help](https://help.loginom.ru/userguide/processors/preprocessing/eliminate-outliers.html) | Прочитана 2026-10-01; версия страницы не указана | Документация; иконки таблицы прочитаны по SVG filenames |
| IQR и учебное правило квартилей | [Wiki IQR](https://wiki.loginom.ru/articles/iqr.html) | Прочитана 2026-10-01 | Математический пример, не полный native алгоритм |
| Стерджес и наиболее вероятный интервал | [Wiki интервал](https://wiki.loginom.ru/articles/mean-most-likely-interval.html) | Прочитана 2026-10-01 | Описание; rounding/bin ties не заданы |
| Handler/readers | `node-support.mjs`, `node-api.mjs`, `table-output-values.mjs` в runtime client/lib | Базовый SHA | Статическое чтение, handler отсутствует |
| Малые CSV | Исходный SHA `fc49d0dd5eed535771116a8a1243af3bbf2fac54` | Сохранённая подготовка | Fixtures, без наследования прежнего live PASS |

## Входы, выходы и семантика

Одна входная таблица. Выходы: `processed`, `outliers`, `extremes`.
Processed — результат редактирования/удаления. Два диагностических выхода содержат
исходные строки с обнаруженными аномалиями. Не сравнивать side output с уже заменённым
processed. Соответствие native indices/GUID фиксируется при реализации; ожидаемые роли
следуют Help, а индексы 0/1/2 пока proposed.

RowID и необрабатываемый payload сохраняются; при delete строка исключается из processed
полностью. Для нескольких полей проверять объединение причин удаления и принадлежность
к диагностическим выходам, включая строку с outlier в X и extreme в Y. Пересечение
side outputs и повторная диагностика после изменения поля не предполагаются автоматически.
Пустой diagnostic output имеет полную schema. Integer64/NULL/labels/data_kind и
precision читаются независимо, schema после замены не угадывается.

### Предлагаемые настройки API

`parameters={ordered:boolean, fields:[{field, enabled, criterion:stddev|iqr,
outliers:{multiplier,method,value?}, extremes:{multiplier,method,value?}}]}`.
Методы: `keep`, `delete`, `mean`, `median`, `most_likely`, `constant`, `clip`.
Field — уникальный technical name. При constant значение typed и совместимо с полем;
для остальных value отсутствует. Multipliers — finite nonnegative; отношение двух
порогов проверить как cross-field restriction, не менять местами молча.

Для нового узла указать enabled, критерий, оба полных блока и ordered явно, без native
defaults. Для existing использовать field patch и сохранять непереданные настройки.
Переданный field block целиком валидируется; выключенное поле не редактируется.
Доступность конкретных методов определяется таблицей ниже. Невалидный тип/вид или
неподдержанная constant отвергается до эффекта. Точная native область multiplier и
правила смешанных критериев нескольких полей уточняются при реализации.

### Допустимость методов по документации

Обозначения: **All** = boolean/datetime/real/integer/string;
**NumericDate** = datetime/real/integer. Колонки разделяют ordered и data_kind.

| method | unordered/discrete | unordered/continuous | ordered/discrete | ordered/continuous |
| --- | --- | --- | --- | --- |
| keep | All | NumericDate | All | NumericDate |
| delete | All | NumericDate | — | — |
| mean | datetime | NumericDate | datetime | NumericDate |
| median | NumericDate | NumericDate | NumericDate | NumericDate |
| most_likely | All | NumericDate | All | NumericDate |
| constant | All | NumericDate | All | — |
| clip | All | NumericDate | All | NumericDate |

Таблица воспроизведена из SVG type icons, а не из порядка текстовых ссылок web renderer.
В Help одновременно сказано, что ordered не влияет на boolean/string, но ordered-delete
в таблице пуст. Это **неразрешённое противоречие документации**: не запрещать и не объявлять
поддержанным такой случай без проверки реализации. Таблица методов не объясняет численный
критерий обнаружения категориальных аномалий; не преобразовывать string в числа произвольно.
[Матрица](acceptance/cases.json) включает 280 отдельных criterion×method×type×kind×ordered
сочетаний и 1960 сочетаний двух методов outlier/extreme, в том числе отрицательные.
Это покрытие требований, а не утверждение, что все сочетания допустимы.

### Математика и правила, которые нельзя подменить

SD: сравнивать отклонение от среднего с `k*sigma`. Независимые candidates для sigma
используют сумму квадратов /n либо /(n−1). Help говорит об отклонении **более** порога;
значение точно на пороге имеет отдельный boundary case. Популяция расчёта порогов,
замен и порядок применения двух классов не определены полной спецификацией.

IQR=`Q3−Q1`. Help формулирует критерий относительно медианы, поэтому нельзя заменить
его Tukey fences `Q1−k*IQR`/`Q3+k*IQR` без проверки. Wiki показывает median-of-halves
для нечётного ряда; это не устанавливает все чётные/малые/NULL случаи. В independent
expected сохраняются отдельно half-sample и interpolation candidates, не «любой верный».

Mean/median replacements должны различать весь исходный столбец и очищенный набор.
Для clip итог равен соответствующей границе, не произвольному winsorized quantile.
Constant type сохраняется либо явно применяется подтверждённое native преобразование.
Для most_likely Wiki задаёт число интервалов через Стерджеса и центр интервала;
формулы страницы имеют неоднозначную запись min/скобок. Размер/округление числа bins,
крайние endpoints, расчёт по discrete категории, равная плотность и приоритет интервала
отмечены для проверки. Наблюдённая замена сама по себе не является independent expected.

NULL не равен нулю. Empty/all-NULL/constant/singleton имеют отдельные outcomes; математическая
неопределённость не означает автоматически native NULL. Не менять исходную таблицу
последовательным повторным Execute вместо проверки сохранённых learned параметров.
Сначала определить, требует ли узел обучения и когда пороги переоцениваются.

## Реализация и зависимости

[Общие расширения](../../contracts/documentation-based-acceptance.md) нужны для третьего
порта, типизированного independent oracle и динамической schema. Общий код имеет одного
владельца; принятого dependency SHA сейчас нет, implementation не запускалась.
Node-specific будущие `elimoutlier-node.mjs`, `elimoutlier-parameters.mjs`,
`elimoutlier-procedure.mjs` находятся в `packages/loginom-runtime/client/lib/`, тесты в client/test.

1. Validate fields/type/kind/ordered и оба action blocks без UI эффектов.
2. Связать вход и owned node; открыть мастер штатной процедурой, выбрать каждый field,
   записать критерий/пороги/actions/enabled и сверить effective readback.
3. Завершить/при необходимости обучить/Execute; одно owned execution на все выходы.
4. Прочитать processed/outliers/extremes с исходными IDs, полной schema, typed rows и
   precision. Не заимствовать schema metadata из expected как фактическое доказательство.
5. Existing patch/replay и public read original S после изменения источника; динамика
   ширины и metadata не выполняет скрытый configure downstream.
6. Сохранение после последнего read и независимое cold execute/read всех трёх таблиц.

## Ошибки и восстановление

Неизвестные/повторные поля, unsupported method, NaN/Infinity, incompatible constant,
невалидные пороги и неверная identity отклоняются до эффекта. Contradictory Help cases
имеют явный unresolved outcome до закрепления правила, а не молчаливый fallback.

После частичной настройки получить actual state. Неизвестный reply продолжать с тем
же operation_id. Cancel не должен сохранять draft; error message читать штатно.
Ошибку численного выполнения воспроизвести и сохранить, исправить на том же графе,
повторить read → save → cold → cleanup. Переобучение не объявлять ненужным без основания.
Сейчас никакие операции на стенде не выполняются.

## Проверки и независимые ожидаемые результаты

[expected.json](acceptance/expected.json) содержит чистую арифметику и различающие
candidates, [cases.json](acceptance/cases.json) — параметры и ссылки на fixtures.

| Требование | Fixture / действие | Independent result / различение | Evidence |
| --- | --- | --- | --- |
| SD × семь actions обоих классов | sigma-symmetric.csv; k0.25/k1.5 | N28, mean/median0, SS20200; ±10 — outer, ±100 — extreme при обоих denominator candidates | Офлайн reference |
| Все пары actions | 49 пар на SD и 49 на IQR | Полная матрица effects/diagnostic membership, без сокращения до одного action | cases.json |
| IQR × семь actions | iqr-symmetric.csv | N32, median0, Q1−2/Q3+2; ΔQ4; ±10/±100 — различающиеся классы при k1.5/k3 | Арифметика; population/priority ещё фиксируются |
| SD denominator | denominator.csv `[0,0,0,1]`, k1.6 | sigma population √3/4 против sample1/2; значение1 меняет классификацию | Не выбирать после подгонки output |
| Точно на fence | boundary-sd.csv; boundary.csv | Equality/below/above, strict versus inclusive, разные denominator/rounding | Пороговые candidates заранее |
| Replacement population | population.csv | Mean/median полного и очищенного набора различаются | Independent sums/counts |
| Квартили small/even | quartiles.csv, quartiles-even.csv | Half-sample/interpolation различаются | Вопрос локализован, не общая «неизвестная математика» |
| Most likely | most-likely-bin.csv, most-likely-tie.csv, most-likely-equal-bins.csv | Bins/density/tie candidates; новый fixture имеет несколько modal winners при всех трёх roundings | Wiki + reference; точное правило заморозить |
| Несколько полей и disabled | multi.csv | Payload/RowID exact; причины удаления и оба side memberships по original values | Независимая матрица полей |
| Types/kinds/ordered | types.csv × вся матрица | Каждое допустимое действие или явный отказ; неnumeric anomalies отдельно | SVG Help matrix |
| NULL/degenerate | nulls.csv, all-null.csv, empty.csv, singleton.csv, constant.csv | Typed NULL; denominator/population и empty schemas; native outcomes не угадываются | Полные маленькие входы |
| Dynamic / persistence / recovery | synthetic width/metadata controls общего контракта | Те же IDs/S, новые поля/label/kind, исправленная ошибка, cold без configure | Полный public path будущей реализации |

Для SD baseline при keep сохраняются 28 processed rows; при удалении всех четырёх
аномалий —24. Mean/median symmetry replacement=0. Constant17 меняет только выбранные
аномалии. Clip значения вычисляются выбранной заранее формулой sigma/fence. Диагностические
выходы должны содержать исходные ±10/±100, exact typed source. Два side класса могут
пересекаться или разделяться только по закреплённому native правилу, не по удобству oracle.
Порядок и кратности сравниваются; число строк отдельно не доказывает корректность.

## Задание CLI и приёмка

[task.md](acceptance/task.md) содержит только бизнес-цель, вход и уникальный package path.
Будущая CLI-модель `openai/gpt-6-sol`, low, лимит7200s; expected и вычисления изолированы.
Приёмка каждого метода/типа и обоих actions, все три выхода, source mutation с original S,
повторные read, save и independent cold обязательны. Общие mutants/tolerance/coverage:
[контракт](../../contracts/documentation-based-acceptance.md). Сейчас execution NOT_RUN.

## Критерии этапов

Документальная подготовка завершена: методы, матрицы, входы и независимые расчёты заданы.
Перед аналитическим PASS выбрать и зафиксировать denominator/quartiles/популяции/priority,
категориальную семантику и доступность противоречивых случаев. При ready_for_development
полный контракт не имеет unresolved settings. При сдаче реализованного узла обязателен
independent full-scope review нового SHA; старый documentary PASS не переиспользуется.

## Точка продолжения

Будущий разработчик Elimoutlier решает вопросы в реализации, без новой planning-задачи.

| Деталь вне полноты документации | Контроль и требуемая фиксация |
| --- | --- |
| n против n−1, критерий boundary/NULL | denominator + boundary-sd + nulls; одна frozen формула |
| Квартили и центр fences | quartiles odd/even + asymmetric input; не заменять median-rule Tukey-rule |
| Популяция замены, очередность outlier/extreme, пересечения | population + multi, обоим actions разные константы; исходные diagnostic rows |
| Bins/most-likely/equality/category | bin/equal-bins/types, counts и typed replacements |
| ordered/boolean/string противоречие | Адресная проверка двух conflicting combinations и точный отказ/поддержка |
| native schema/training/defaults/persistence | Typed full read и save/cold на тех же effective settings |

Эти пункты не требуют открытия Loginom при подготовке настоящего документа.
