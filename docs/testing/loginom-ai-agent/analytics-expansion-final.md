# Analytics expansion: подтверждённый результат и возобновление

> Сведения о локальном окружении обезличены. Приватные подтверждения, упомянутые в документе, не включены в репозиторий.

Текущий результат по всем **50 исходным парам**: **K=24 принятые пары /48 новых evals**, **26deferred**. Итоговый runnable состав снова содержит только одинаковые24 основы slug D/B; прежние65 кейсов сохранены. Все23 возвращённые пары имеют текущие dispositions, остатки бюджетов и условия возврата в [карточках](../../superpowers/specs/2026-10-28-analytics-expansion-pairs.md). Новых измеренных исходов и принятого K нет. Приёмка eval означает проверенную задачу, а не успешное решение модели. Независимое review возобновления (приватный архив; не опубликован) **SPEC+QUALITY APPROVE**, обязательные замечания закрыты; доступная обязательная работа по возобновлению завершена с обоснованными deferred; прежний final APPROVE относится к предыдущему closeout.

Добавлено этим возобновлением: genuine native references, browser cold, self-contained public D/B и corpus/prepare P36/P37/P39 закрыты с независимыми P36 (приватный архив; не опубликован), P37 (приватный архив; не опубликован) и P39 (приватный архив; не опубликован) SPEC+QUALITY APPROVE/root FULLREAD. P37 viewport timeout/rebind сохранён без повторного RunAll; P39 actual tool errors, releasedAfterProof и Save/reopen limitations сохранены в native review/provenance. Новая стандартная calibration составила **96logical rows=36+24+36**: P32–P34 D/B36/36 (приватный архив; не опубликован), P35+P14 D/B24/24 (приватный архив; не опубликован) (12целевых+12same-form anchor-контролей) и G09 combined calibration review (приватный архив; не опубликован) D/B36/36. Все три independent SPEC+QUALITY APPROVE/root FULLREAD, exact expectations/cleanup закрыты; прежние P14 измерения не переаттестованы. G08 P31 и G09 P36/G10 P48 blind-B компоненты сохранены; это не новая групповая приёмка.

Актуальный измерительный блокер проверен ordinary operations: P15 resumed admission review (приватный архив; не опубликован) подтверждает sandbox Help failure на основном measurement pin до модели; P19 original-runtime admission review (приватный архив; не опубликован) подтверждает Help failure B на exact original runtime D. Cleanup/archive/releases и reviews закрыты, модельные бюджеты не потрачены. P19D100/PASS и P24B75/FAIL/oraclePASS сохранены; current CP сопоставима с P24B, осталось только D. P38 A1/A2 и P40/P43 A1 native failures независимо reviewed/cleanup closed. Knowledge classification review (приватный архив; не опубликован) APPROVE/root FULLREAD: текущий list UNAVAILABLE за12478ms, original close ACK/actual exit0/noSignal и settled. Нового различающего условия для P38 A3, P40/P43 или FIRST A1 P45/P47/P48/P49 не получено; leaf UNKNOWN, историческая причина P40/P43 и постоянная outage не доказаны. Бюджеты сохранены; текущая точка — [checkpoint](../../superpowers/plans/2026-10-28-analytics-expansion-implementation.md#исполнение-и-checkpoint).

## Объём и фактические исходы

Подробные сохранённые результаты: [D](analytics-expansion-detailed.md), [B](analytics-expansion-business.md). Источники и точные ссылки на actual result, ресурсы, pins и reviews находятся в input (приватный архив; не опубликован). Текущие оценки используют сохранённый judge outcome, без новых модельных попыток. Hash source_card и ссылки intent_reference во входной сводке относятся к историческому снимку: карточки и G06 intent затем дополнены итоговыми dispositions. Они не заявлены текущими immutable hashes; сами сохранённые verdict/reference sources не изменялись.

| Показатель | Detailed, n=24 | Business, n=24 |
|---|---:|---:|
| Official PASS / FAIL / NULL |12 /11 /1|6 /18 /0|
| Numeric oracle PASS / FAIL / NULL |18 /5 /1|10 /14 /0|
| Status completed / failed / no_artifact / interrupted |18 /4 /1 /1|13 /6 /5 /0|
| Judge scored / no_artifact / skipped |21 /2 /1|13 /11 /0|
| Resource PASS / FAIL |6 /18|11 /13|
| Official PASS вместе с resource PASS |2|3|
| Report-defined structural criteria PASS / FAIL / unknown |18 /3 /3|10 /3 /11|

Structural criteria — агрегация имеющихся именованных verdicts по явному правилу (приватный архив; не опубликован), не единый официальный score. Отсутствующий verdict остаётся unknown. Официальный `structural_score` отдельно: D100 у2/NULL у22; B100 у1/0 у1/NULL у22. Numeric oracle не подтверждает формат, Save или native-граф; status completed не означает полный контракт.

| Парная категория official pass | Количество | Пары |
|---|---:|---|
| Обе PASS |4|P11, P22, P42, P44|
| Только D PASS, B FAIL |8|P06, P07, P16, P17, P18, P20, P21, P27|
| Только B PASS, D FAIL |1|P41|
| Обе FAIL |10|P01, P02, P03, P05, P08, P09, P12, P13, P14, P23|
| Не классифицирована: D NULL, B PASS |1|P46|

### Все принятые пары

D/B ячейка — score / official pass / numeric oracle. Ссылки на полные result и ресурсные проверки — в отдельных D/B отчётах; [карточки](../../superpowers/specs/2026-10-28-analytics-expansion-pairs.md) содержат reference/cold/oracle/calibration/blind-B и фактические ограничения.

| Пара | Slug | D | B |
|---|---|---|---|
| P01 | receivables-payments-credits | 63 / FAIL / PASS | 63 / FAIL / PASS |
| P02 | procurement-three-way-match | 50 / FAIL / PASS | 75 / FAIL / PASS |
| P03 | inventory-ledger-reconciliation | 13 / FAIL / FAIL | 13 / FAIL / FAIL |
| P05 | freight-weight-bill-audit | 75 / FAIL / PASS | 0 / FAIL / FAIL |
| P06 | licensed-seats-billing-audit | 88 / PASS / PASS | 0 / FAIL / FAIL |
| P07 | accepted-returns-credit-audit | 100 / PASS / PASS | 63 / FAIL / FAIL |
| P08 | budget-unbilled-commitments | 25 / FAIL / FAIL | 0 / FAIL / FAIL |
| P09 | customer-base-purchase-penetration | 75 / FAIL / PASS | 0 / FAIL / FAIL |
| P11 | cross-device-campaign-reach | 100 / PASS / PASS | 100 / PASS / PASS |
| P12 | inspected-unit-defect-rates | 0 / FAIL / FAIL | 0 / FAIL / FAIL |
| P13 | joint-ownership-revenue-allocation | 0 / FAIL / FAIL | 0 / FAIL / FAIL |
| P14 | order-discount-category-revenue | 75 / FAIL / PASS | 75 / FAIL / PASS |
| P16 | daily-cash-bank-reconciliation | 100 / PASS / PASS | 0 / FAIL / FAIL |
| P17 | observed-purchase-cohort-retention | 100 / PASS / PASS | 63 / FAIL / PASS |
| P18 | signup-month-product-activation | 100 / PASS / PASS | 0 / FAIL / FAIL |
| P20 | employee-day-attendance-overtime | 100 / PASS / PASS | 0 / FAIL / FAIL |
| P21 | station-hour-bike-flows | 100 / PASS / PASS | 0 / FAIL / FAIL |
| P22 | invoice-first-payment-lag | 100 / PASS / PASS | 100 / PASS / PASS |
| P23 | matched-basket-price-index | 13 / FAIL / FAIL | 13 / FAIL / FAIL |
| P27 | tariff-functional-conflicts | 100 / PASS / PASS | 0 / FAIL / FAIL |
| P41 | wholesale-basket-concentration | 75 / FAIL / PASS | 100 / PASS / PASS |
| P42 | paired-change-dispersion | 100 / PASS / PASS | 100 / PASS / PASS |
| P44 | delivery-cost-dummy-regression | 100 / PASS / PASS | 100 / PASS / PASS |
| P46 | three-type-minimum-sse | NULL / NULL / NULL | 100 / PASS / PASS |

### Сохранённые исключения и сопоставимость

- P01: первоначальные D100/B88 сохранены в original measurements (приватный архив; не опубликован). После исправления пропущенного требования денежного формата те же артефакты получили judge-only63/63. Новых запусков модели не было; таблицы используют текущие63/63.
- P06D: official88/PASS сохранён, но необязательный в rubric `saved-export=false`; полный контракт одного экспортера не выполнен. Это оговорка к официальной метрике, а не повод убрать eval или скрыто пересчитать балл.
- P46D: interrupted, judge skipped, score/pass/oracle=NULL. Сохранённый CSV не подменяет отсутствующий официальный verdict; пара не записана как «только B».
- Среди accepted24 записанные существенные D/B runtime/agent pins равны в каждой паре. Это не одна версия runtime для всей кампании. Модель измерения и судья сохранены по Benchmark handoff (приватный архив; не опубликован); фактические версии — per-run summaries. Последние авторские операции использовали gpt-6-sol/xhigh/STANDARD; прежние реальные authoring pins сохранены в provenance.
- Результаты описательные: одна попытка формы, отбор по доступности корректного reference и инфраструктуры. Различия нагрузки, времени и provider failures не позволяют приписывать разницу D/B только формулировке. В частности, P27B provider-auth failure не доказывает сложность бизнес-вопроса. Resource FAIL остаются в знаменателе.
- Реальные полные снимки памяти и журналы серий переиспользованы из per-pair evidence/reviews; пропуски исторического capture и ограничения observer/IO/RSS/reopen не превращены в PASS. Сохранённая прежняя полностью наблюдавшаяся серия P15: до D (приватный архив; не опубликован), до B (приватный архив; не опубликован), после (приватный архив; не опубликован): все7 сравнений равны. В resumed P15 D2 admission свежий before совпал по7 областям; post-memory не проводился и не заявлен PASS. Это не ретроспективная аттестация каждого ранее ненаблюдавшегося интервала.

## Deferred: все26 пар и утраченное покрытие

Итоговые причины, накопленные попытки/остатки, сохранённые результаты, evidence и проверяемое условие возврата — в каждой [карточке](../../superpowers/specs/2026-10-28-analytics-expansion-pairs.md). Accepted-only composition DONE: resume selection preservation (приватный архив; не опубликован) подтверждает32каталога/220файлов9пар P15/P19/P32–P37/P39, bytes+modes exact, в private `deferred/pXX/resume-final-selection/{task,calibration/task}`. Точные текущие D/B task/corpus paths — в карточках. P15/P19 corpus оставался в прежнем `deferred/pXX/calibration/<task>` и не переносился. Остальные deferred материалы сохранены по прежним manifests; первичные attempt/evidence не удалялись. Невыполненная проверка остаётся NOTRUN, а не PASS.

Общая измерительная зависимость P15 и остальных полностью неизмеренных пар подтверждена актуальным resumed admission, а не только историческим сбоем. Разбор области блокера (приватный архив; не опубликован) не утверждает постоянную недоступность всех задач. Offline judge доступен без Loginom/Help readiness, доступная calibration P32–P35/P36/P37/P39 закрыта. Authoring условно ограничен общим readiness/lease prerequisite P40/P43; завершённая classification не исправила его и не дала новой различающей причины. Не провоцировались одинаковые неизменные допуски и не расходовались сохранённые остатки ради смены задачи.

| Пара | Не закрытая зависимость / причина | Authoring использовано; осталось | Покрытие вне принятого набора |
|---|---|---|---|
| P04 | Полный native/cold gate, sort/export после3 попыток | 3;0 | Эквайринг: комиссия, резерв и выплата |
| P10 | CSV export input_mapping obscured;3 попытки | 3;0 | Корзины из длинного чека, support/confidence |
| P15 | Actual resumed measurement admission: sandbox Help failure до модели; cleanup/review APPROVE; D0/B0 | 1;2 | Резервирование поставщиков и знаменатель SKU |
| P19 | D100/PASS сохранена; exact original-runtime B admission Help failure до модели, cleanup/review APPROVE; B0/1 | 1;2 | Обязательства и календарные deadlines |
| P24 | B75/FAIL/oraclePASS сохранена; current CP сопоставима с B; оставшаяся D0/1 ограничена actual P15 Help prerequisite | 1;2 | Выручка на открытый магазинодень |
| P25 | Actual P15 Help prerequisite; native/cold/public/calibration/blind-B сохранены; D0/B0 | 1;2 | Истечение срока свободного, ещё не зарезервированного lot stock; полнота партий/резервы/денежная экспозиция. |
| P26 | Actual P15 Help prerequisite; native/cold/public/calibration/blind-B сохранены; D0/B0 | 1;2 | Повторная доставка одного измерения: отделение retry от события и агрегирование без повторного учёта. |
| P28 | Actual P15 Help prerequisite; native/cold/public/calibration/blind-B сохранены; D0/B0 | 1;2 | Предметная пригодность исходных retail-строк к customer analytics, реальные UCI источники и взаимоисключающие классы. |
| P29 | Actual P15 Help prerequisite; native/cold/public/calibration/blind-B сохранены; D0/B0 | 1;2 | Влияние заполнения numeric NULL на сравнение подразделений, с наблюдаемым нулём и сохранением исходной базы. |
| P30 | Actual P15 Help prerequisite; native/cold/public/calibration/blind-B сохранены; D0/B0 | 1;2 | Покрытие registry через точный status alias/case/no-trim и различие NULL/empty/literalNULL. |
| P31 | Actual P15 Help prerequisite; native/cold/public/calibration/blind-B component CLOSED; D0/B0 | 1;2 | Сопоставимость измерений в различных единицах по данному unit mapping, полный registry и численный итог. |
| P32 | Native/cold/public/calibration D/B PASS/review APPROVE; G08 blind-B component сохранён; D0/B0, actual P15 Help prerequisite | 2;1 | Сдвиг состава complete-case followup против полного enrolled cohort при общей baseline переменной и observed0/NULL. |
| P33 | Native/cold/public/calibration D/B PASS/review APPROVE; G08 blind-B component сохранён; D0/B0, actual P15 Help prerequisite | 1;2 | Расход по ролям из широкой табели: native unpivot/role mapping/rates и различение NULL/known0. |
| P34 | Native/cold/public/calibration D/B PASS/review APPROVE; G08 blind-B component сохранён; D0/B0, actual P15 Help prerequisite | 1;2 | Качество вероятностей: boundary reliability bins/full model-bin domain, model-wide Brier и пустые bin means; исходная transition probability матрица уже вытеснена отдельно. |
| P35 | Native/cold/public/calibration D/B24/24 PASS/review APPROVE; G08 blind-B component сохранён; D0/B0, actual P15 Help prerequisite | 1;2 | Двухмерная native матрица взвешенных удельных расходов, generated pivot columns и NULL/known0. |
| P36 | Native/cold/public/corpus/prepare и G09 calibration D/B36/36 CLOSED/review APPROVE; blind-B full40 component PASS; D0/B0, actual P15 Help prerequisite | 1;2 | Multi-select service coverage с правильным respondent denominator и полным service domain. |
| P37 | Native/cold/public/corpus/prepare и G09 calibration D/B36/36 CLOSED/review APPROVE; D0/B0, actual P15 Help prerequisite | 1;2 | Восстановление assay panel перед balance: AVG повторов, distinct presence, absent-vs-known0 и conditional balance. |
| P38 | A1/A2 native NOT_PASS/no Save/LGP/CSV; failure+cleanup reviews APPROVE; leaf UNKNOWN, A3 требует новой различающей причины, classification её не дала | 2;1 | Case-mix standardization по общим весам strata против собственного mix, signed effect в pp. |
| P39 | Native/cold/public/corpus/prepare и G09 calibration D/B36/36 CLOSED/review APPROVE; D0/B0, actual P15 Help prerequisite | 1;2 | Between/within decomposition с неравными размерами групп, centered sums и singleton0. |
| P40 | A1 actual CLI1 отдельно от outer0/native NOT_PASS; failure+cleanup review APPROVE; leaf UNKNOWN, новая причина для retry отсутствует | 1;2 | Вероятностно-взвешенные population variance/covariance, вклад2cov и variance total. |
| P43 | A1 actual CLI1 отдельно от outer0/native NOT_PASS; failure+cleanup review APPROVE; условный shared readiness/lease prerequisite, leaf UNKNOWN | 1;2 | Native multivariate OLS weather baseline с допустимыми predictors, in-sample fitted/residuals/group RMSE на реальном UCI slice. |
| P45 | Условный общий Authoring readiness/lease prerequisite P40/P43; FIRST A1 NOTRUN, offline сохранено; возврат по восстановлению/новому условию, без PASS соседа; измерения отдельно зависят от Help | 0;3 | Две вложенные native OLS на одних сменах: loss от исключения idle_hours, training SSE/RMSE/centered R². |
| P47 | Условный общий Authoring readiness/lease prerequisite P40/P43; FIRST A1 NOTRUN, offline сохранено; возврат по восстановлению/новому условию, без PASS соседа; измерения отдельно зависят от Help | 0;3 | Native seed42/no-normalization достижение двух independently unique global optima k2/k3 и сравнение SSE. |
| P48 | Условный общий Authoring readiness/lease prerequisite P40/P43; FIRST A1 NOTRUN, offline сохранено; возврат по восстановлению/новому условию, без PASS соседа; измерения отдельно зависят от Help | 0;3 | Реальные native Excel imports двух named Recipe/Stock sheets плюс Plan CSV и ingredient-level netting/purchase cost. |
| P49 | Условный общий Authoring readiness/lease prerequisite P40/P43; FIRST A1 NOTRUN, offline сохранено; возврат по восстановлению/новому условию, без PASS соседа; измерения отдельно зависят от Help | 0;3 | Два native text dialect imports CP1251/UTF16LE BOM, согласование типов и capped piecewise incentive policy. |
| P50 | Native Excel/reference;3 попытки, исправный режим не доказан | 3;0 | Excel named sheet и валютная точка безубыточности |

P19D100/PASS и P24B75/FAIL/oraclePASS — сохранённые частичные измерения deferred-пар, **вне знаменателя24**. У P19 D1/1 и B0/1; у P24 B1/1 и D0/1; предмодельные допуски не расходовали модельную попытку. У остальных deferred D0/1 и B0/1. Дополнительно замена исходной P34 на R02 до authoring оставила вне покрытия условную нормировку полной матрицы миграций; R02 тоже deferred.

### Условия возврата и решения владельца

Для подготовленных P15/P25/P26/P28–P37/P39 — новая проверяемая причина/изменившееся условие measurement prerequisite, затем успешная ordinary preparation с чистым выходом на одной разрешённой версии D/B и оставшиеся по одному измерению с прежними pins/memory/cleanup. Завершённые подготовительные PASS переиспользуются. P19 разрешена только оставшаяся B на exact original runtime D; P24 только D на сопоставимом с сохранённой B runtime. Завершённые P19D и P24B не повторяются. Новые credentials/OAuth/инфраструктура не разрешены автоматически.

P38 A3 требует новой различающей причины/подтверждённого исправления после A2; один catalog PASS или соседний PASS недостаточен. Корректирующие P40/P43 и FIRST A1 P45/P47/P48/P49 требуют восстановления существующего generation/catalog/admission пути либо нового конкретного условия/различимой гипотезы; смена task ID или очередной соседний PASS не достаточны. Knowledge classification закрыта с честным UNAVAILABLE и clean close, нового основания не дала. После native успеха остаются зависимые cold/public/calibration/применимый blind-B и измерения в прежних бюджетах. P04/P10/P50 остаются exhausted3/3: новых попыток текущая команда не разрешает.

Исторические Knowledge IPC/startup и proxy исправления сохранены в [activation plan](../../superpowers/plans/2026-11-01-knowledge-benchmark-activation.md) и [startup evidence](../../superpowers/plans/2026-11-01-knowledge-startup-evidence.md). Один полный diagnostic verify PASS не заменяет actual measurement admission; исторический SIGKILL trigger и универсальная сетевая устойчивость не доказаны. Текущие ordinary P15/P19 failures приведены выше; pins/бюджеты не менялись, новые измеренные исходы не получены.

## Проверки и границы завершения

- resume selection parity (приватный архив; не опубликован): **PASS**, K24/48/26, одинаковый D/B roster; data/oracle/reference/acceptance и provenance сохранены. Все50 individual dispositions и23 остатка — в карточках; принятые48 actual outcomes переиспользованы без новых измерений.
- resume selection preservation (приватный архив; не опубликован):32каталога/220файлов9пар перемещены в private с точными bytes+modes; P15/P19 corpus уже был private и не менялся. Исходные reference/native/cold/calibration evidence сохранены.
- resume offline checks (приватный архив; не опубликован): шесть штатных collection/corpus checks exit0. Каждая новая коллекция24tasks, corpus101cases; legacy collection65tasks, legacy corpus35tasks/114cases. Corpus35 не является полным калиброванием65; сохранность65 подтверждена отдельно. Прежний prepared.json (приватный архив; не опубликован) переиспользован, preparer сейчас не перезапускался.
- По три existing warning в D и B побайтно равны прежним final validation: matched-basket о полном result CSV и station/wholesale о gold>50rows; это ненулевые сохранённые ограничения, не новый дефект.
- Old65/520файлов совпадают с authoritative P06 source-freeze protected baseline (приватный архив; не опубликован) и предкампанийным Git tree; свежая parity PASS подтверждает обе базы. Прежний независимый preservation review (приватный архив; не опубликован) сохраняет ограничение: точного полного timestamped manifest на самый старт кампании нет.
- Принятые source/product/native/cold/fullCSV/measurement/memory proofs и prepared artifacts переиспользованы при неизменных источниках. Новые P36/P37/P39 cold/public и calibration96logical rows имеют ссылки на independent reviews выше; это не приёмка deferred-пар и не переаттестация прежних24.
- Прежнее independent final review (приватный архив; не опубликован) APPROVE относится к предыдущему closeout. Новое review возобновления (приватный архив; не опубликован) **SPEC+QUALITY APPROVE/root FULLREAD**: M1/M2 исправлены и проверены, открытых замечаний нет.

Все незакоммиченные изменения сохранены. Commit/push/merge/release, setup/OAuth, старый карантин, автоматизация/heartbeat и новые бюджеты не выполнялись. Deferred — явные невыполненные области, а не утверждение о ста готовых evals.
