# Корреляционный анализ: подплан обработки

Подготовка: **documentation_complete**. Полный runtime-контракт: **discovery_required**.
Автор: Codex, 2026-10-01. Component ID: `component.research.CorrAnalysis`.
Runtime type: **proposed** `research.correlation_analysis`, mode `correlate`.
База `loginom`: `9b17e7dd947c016395e8e32e439ca775b1cbe780`.
Версия и редакция будущей приёмки фиксируются в receipt; новых live наблюдений нет.

## Результат и границы

Реализовать настройку двух наборов полей и четырёх независимых флагов коэффициентов,
выполнение и полный типизированный результат для всех доступных сочетаний.
Расчёты выполняет native CorrAnalysis; независимая математика проверяет их результат.
Подготовка завершена по документации. Детали конкретной версии уточняются в реализации,
без отдельного планирования через Paperclip и без исследования стенда сейчас.

## Источники и доказательства

| Требование | Источник | Статус |
| --- | --- | --- |
| Четыре флага, два набора, порты, состав выхода и текстовые категории | [Help](https://help.loginom.ru/userguide/processors/scrutiny/correlation-analysis.html), прочитана 2026-10-01 | Документировано; версия страницы не указана |
| Взаимнокорреляционная функция и сдвиг | [Wiki CCF](https://wiki.loginom.ru/articles/ccf-max.html) | Определение; native нормировка/границы не специфицированы |
| Ранговые коэффициенты | [Wiki Кендалл](https://wiki.loginom.ru/articles/rank-correlation-kendall.html), [Wiki Спирмен](https://wiki.loginom.ru/articles/rank-correlation-spearman.html) | Учебные описания; неоднозначные формулы не копировать в oracle |
| Независимая формула tau-b со связями | [SciPy primary docs](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.kendalltau.html) | Математическое определение; не утверждение об интерфейсе Loginom |
| Runtime и fresh read | `node-support.mjs`, `node-api.mjs`, `node-read-contract.mjs`, `node-read-driver.mjs` | Статическое чтение базового SHA; handler отсутствует |
| Fixtures и чистый reference | SHA `fa9e225c052f37a4c4518170cf1ff4040ef10cd6` | Повторное использование входов/математики, без наследования live PASS |

## Контракт настройки

Предложение API: `parameters={left_fields:[technical_name], right_fields:[technical_name],
coefficients:{pearson:boolean,spearman:boolean,kendall_tau_b:boolean,cross_correlation:boolean}}`.
Это проект handler, не документированный API Loginom.

Оба набора непустые, имена существуют и уникальны внутри одного набора. Пересечение
наборов разрешено: self-пары и пары с переставленными сторонами сохраняются.
В UI поля выбираются по technical identity, не по неоднозначной метке.
Перестановки выбранных полей и одинаковые labels проверяются отдельно; порядок выдачи
определяется закреплённым native правилом, не предполагается порядком массива запроса.

Для нового узла все четыре флага передаются явно. Для existing частичный patch
сохраняет непереданные флаги/наборы, после patch также остаётся минимум один коэффициент.
При всех false API возвращает validation error до эффекта. Native поведение с нулём
коэффициентов описывается отдельно и не расширяет разрешённый публичный контракт.
Не придумывать настройки max_lag, significance, p-value или normalization: Help их не задаёт.

### Полная матрица коэффициентов

Обозначения: P=Пирсон, S=Спирмен, K=tau-b, C=экстремум CCF.
Четыре обязательные идентификационные колонки остаются во всех 15 случаях.

| Включённые коэффициенты | Число дополнительных колонок |
| --- | --- |
| P; S; K | По 1 |
| C | 2: signed extremum и lag |
| P+S; P+K; S+K | По 2 |
| P+C; S+C; K+C | По 3 |
| P+S+K | 3 |
| P+S+C; P+K+C; S+K+C | По 4 |
| P+S+K+C | 5 |

Это 15 отдельных nonempty masks, не выборочная проверка только all-on.
При отсутствии C колонка lag отсутствует, а не содержит нули.

## Порты, схема и строки

Один table input и один table output. Для L выбранных левых и R правых полей
документация задаёт L×R корреляционных пар. Поля output имеют роли:

| Роль | Предлагаемый тип / контракт |
| --- | --- |
| Имя левого, метка левого, имя правого, метка правого | Четыре string поля; имена и labels сравниваются с фактическим input |
| P, S, K, C | real; правила математически неопределённого значения закрепляются отдельно |
| lag CCF | Целое смещение, exact comparison; присутствует только с C |

Технические output names, labels, native type/data_kind и порядок колонок/пар
фиксируются при реализации. Не нормализовать имена native колонок под эту таблицу
без явного решения API. Пустой output сохраняет действующую schema.
Проверять повторные пары по двум technical names, не через set строк или labels.
Self-pair для непостоянного числового поля даёт P/S/K=1; для константы этот вывод неприменим.

## Независимая математика

P вычисляется из центрированных сумм: `sum(dx*dy)/sqrt(sum(dx²)*sum(dy²))`.
S — P от средних рангов, равные значения имеют среднее занятых рангов.
Формулу без связей через sum(d²) не применять к tied fixtures.
K=`(P_concordant−Q_discordant)/sqrt((P+Q+T_x)*(P+Q+T_y))`,
где T учитывает связи только в одной переменной; both-ties не входят в эти T.

Для analytic.csv независимо получены: P(x,positive)=1, P(x,negative)=−1,
P(x,square)=sqrt(5145/5369), S(x,square)=K(x,square)=1;
у tie_x/tie_y concordant=11, discordant=0, T_x=T_y=2, tau-b=11/13.
Эти ручные опоры проверяют reference отдельно от его собственного expected.json.
В малых/константных рядах denominator=0 и коэффициент математически не определён:
это не доказывает, что Loginom обязан выдать zero/NULL/NaN или ошибку.

Help задаёт P для числовых данных независимо от discrete/continuous. Для discrete
текста задаётся алфавитная нумерация unique categories. ASCII fixture содержит явные
ordinal-коды и позволяет проверить этот эффект. Unicode/case/collation, boolean,
datetime, continuous text и категории для S/K/CCF требуют отдельных outcomes.
Не переносить документированное правило Pearson-text на все коэффициенты автоматически.

NULL проверяется по каждой паре: pairwise deletion и global listwise deletion дают
различные n/значения на nulls.csv. Оба candidate расчёта приложены, но при приёмке
выбирается одна подтверждённая native политика заранее. Для CCF отдельно выяснить,
сохраняют ли пропуски позиции во времени; удаления строк могут изменить лаг.

### CCF

Help определяет выбор экстремума по максимальному модулю и выдачу лага. Signed value
не заменяется abs(value). Wiki задаёт сумму со сдвигом, но не полностью описывает
центрирование, нормировку, диапазон/знак лага и tie-breaking конкретного компонента.

`math_reference.py` строит две явно обозначенные гипотезы: uncentered full energy
и global centered full energy, с диапазоном `1−n..n−1` и сравнением x[t] с y[t+k].
Это различающие кривые, не готовый native golden. На lag.csv shifted impulse даёт
сдвиг +2 при этой convention; смена сторон проверяет знак. Inverted проверяет signed
отрицательный максимум, ccf-ties.csv — равные по модулю максимальные extrema.
Periodic дополнительно проверяет повторяющийся сигнал. Scaled/offset fixtures различают
нормировки. До аналитической приёмки заморозить одну native формулу, диапазон,
tie order и NULL policy; не позволять oracle принимать любой candidate.

## Реализация и общая зависимость

[Общий контракт](../../contracts/documentation-based-acceptance.md) описывает fresh
dynamic schema, tolerance, typed NULL и независимый cold path. Для этого узла одного
порта достаточно, но схема меняется при смене флагов/набора и metadata входа.
Node-specific будущие файлы: `correlation-node.mjs`, `correlation-parameters.mjs`,
`correlation-procedure.mjs` в runtime client/lib, адресные тесты в client/test.
Общие файлы изменяет один владелец; dependency SHA пока отсутствует, код не реализован.

1. Validate settings без UI эффектов; определить owned node/input/output identities.
2. Настроить четыре флага и обе колонки выбора; прочитать effective settings и связи.
3. Finish/Execute и дождаться owned completed execution; необходимость обучения
   проверить по native контракту, не вводить параметр без основания.
4. Прочитать всю таблицу с действующей schema, signed коэффициентами и integer lag.
5. На том же графе изменить input values/width/labels/kind и выполнить повторный public
   read с original source_operation_id; read не открывает мастер и не делает configure.
6. Проверить existing patch всех флагов, schema transition с/без C, save после чтения
   и независимое cold reopen/execute/read без неявной повторной настройки.

## Ошибки и восстановление

До эффекта отказать при пустых/повторных/unknown selections, invalid flags, нуле
коэффициентов и чужой operation identity. Для unsupported types фиксировать явный
отказ, не скрыто пропускать поле. Для valid unknown native case не превращать гипотезу
в правило валидации без проверки.

Неизвестный reply требует чтения actual operation/settings/graph, а не нового узла.
После частичного изменения Cancel сохраняет прежнюю настройку. После native ошибки
сохранить FAIL, устранить причину на том же графе и повторить read/save/cold/cleanup.
Успешный cleanup сам по себе не доказывает правильность корреляции.

## Требование → fixture → результат → доказательство

| Требование | Fixture / проверка | Независимое ожидание | Доказательство |
| --- | --- | --- | --- |
| Все 15 masks и zero rejection | analytic.csv × cases.json | 4 identity + selected coeffs + lag только при C; zero API отказ до эффекта | Help + schema assertions |
| Несколько полей, overlap/self/reverse | analytic.csv; 6×6 и subset selections | 36 ordered pair identities; P/S/K hand anchors | math_reference.py + CSV |
| Положительная/отрицательная/нелинейная | analytic.csv, scaled.csv | ±1, sqrt(5145/5369), S/K=1; scale invariants | Точные суммы/ranks |
| Связанные ранги | tie_x/tie_y | tau-b11/13, оба tie counts2; отличить tau-a | Ручной pair count |
| Категории | categories.csv, types.csv | ASCII ordinal P; остальные types/kinds имеют явный outcome | Help + independent category calculation |
| NULL | nulls.csv | Pairwise/listwise candidates различаются; freeze policy до приёмки | Два независимых поднабора |
| Constant/empty/n1/n2/all-null | degenerate.csv, empty.csv, one.csv, two.csv | Undefined не подменяется0; n2 reverse=−1 при defined math | denominator и count |
| CCF shift/sign/norm/ties | lag.csv, ccf-ties.csv, scaled.csv | Две candidate curves, sign reversal и signed extrema; native rule отдельно | Independent shifts, не native output |
| Source/schema/persistence | Все входы + mutations общего контракта | Те же IDs/S; новые schema и значения; cold agreement | Будущий public execution/read |

Вся матрица в [cases.json](acceptance/cases.json), численные результаты и гипотезы —
[expected.json](acceptance/expected.json). Предварительный tolerance computed real:
atol=rtol=1e−12; его обоснование — малые точные входы, двойная точность и вывод 17digits.
Имена/строки/целый lag/typed NULL сравниваются точно. Не увеличивать допуск для CCF,
пока неизвестна формула. Точный tolerance утверждается до приёмки конкретного SHA.

## Приёмка и точка продолжения

[CLI business task](acceptance/task.md) содержит только цель, вход и уникальный путь.
Будущая независимая приёмка: `openai/gpt-6-sol`, low, CLI7200s; все masks, source mutation,
save/cold, effective settings, typed full output и mutants из общего контракта.
Сейчас это спецификация, execution NOT_RUN; математический CHECK не является node PASS.

| Деталь, не заданная полностью документацией | Проверка в реализации и требуемая фиксация |
| --- | --- |
| Output technical schema и порядок пар | 15 masks, перестановки selections, labels/kind mutation; exact frozen contract |
| NULL/undefined и type eligibility | nulls/degenerate/types/empty/n1/n2; outcomes каждого coefficient |
| Text order/ranks/collation | ASCII + собственный Unicode/case пример; P отдельно от S/K/CCF |
| CCF convention/range/norm/ties | impulse, inverted, ccf-ties, periodic, offset/scaled; одна frozen формула и tie order |
| Default/training/persistence | Effective settings и самостоятельное cold reopen |

План документов завершён. Эти проверки входят в обычную реализацию без новой planning-задачи.
`ready_for_development` требует полного закреплённого runtime-контракта;
сдача обработанного узла — independent review актуального SHA и full-scope acceptance.
