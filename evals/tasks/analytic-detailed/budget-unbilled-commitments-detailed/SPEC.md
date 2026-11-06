# Доступный бюджет без двойного учёта обязательств

> Сведения о локальном окружении обезличены. Приватные подтверждения, упомянутые в документе, не включены в репозиторий.

## Назначение и происхождение

Сверка лимита, всех проведённых расходов и оставшихся обязательств по каждой бюджетной статье. Одна денежная единица без налогов и неоговорённых сборов; временного окна и истории смены статусов нет. Уже проведённая часть заказа не вычитается из доступного бюджета повторно как обязательство; cancelled не отменяет проведённые расходы.

Исходные данные — original synthetic eval-author fixture: budgets.csv (3 строки), orders.csv (4), expenses.csv (5). Это искусственные операции, не реальные финансовые документы. Три raw-файла заморожены до ручного расчёта и независимого oracle. Внешние datasets, пакеты и внешняя лицензия не использованы; лицензия репозитория — MIT.

budgets — полный уникальный реестр составных ключей (cost_center,budget_item). order_id в orders и expense_id в expenses уникальны. Все пары заказов и расходов существуют в budgets; непустой expenses.order_id существует в orders, его пара статьи совпадает с заказом. Ключи — ASCII strings с сохранением регистра. Единственное пустое поле — order_id прямого расхода E04; остальные входные ячейки непустые и без NULL. limit_amount/committed_amount/amount — неотрицательные точные денежные значения с двумя знаками. orders.status содержит active/cancelled; все expenses уже проведены. Входы: UTF-8, заголовок, `;`, десятичная точка, двойная кавычка.

Независимый oracle читает raw через Python stdlib csv/Decimal: отдельный ledger всех расходов по паре статьи и ledger расходов непустого order_id; для каждого active-заказа вычисляет max(committed_amount−own expenses,0), затем суммирует по статье. Он итерирует полный budgets, сохраняет отсутствующие факты нулями и считает signed available. Экспорт Loginom источником ответа не служит. Runtime и версия зафиксированы в provenance; все 18 ячеек независимо рассчитаны вручную.

## Фактический native reference

В сохранённом Unit1 наблюдаются 15 native узлов и 15 связей. Это описание одного решения, не требование к числу, именам или внутренней композиции оцениваемого графа. Все три импорта связаны с экспортом; готовые итоговые значения не подставлены, JavaScript не заменяет расчёт.

| Узел | Компонент | Фактическая настройка |
|---|---|---|
| Бюджеты | TBGImportTextFile | budgets.csv; cost_center/budget_item string, limit_amount float |
| Заказы | TBGImportTextFile | orders.csv; order_id/cost_center/budget_item/status string, committed_amount float |
| Расходы | TBGImportTextFile | expenses.csv; expense_id/order_id/cost_center/budget_item string, amount float |
| Расходы по статье | TBGGroupDataEngine | независимый полный expenses; cost_center,budget_item; SUM(amount), amount_Sum→spent |
| Расходы по заказам | TBGFilterDataEngine | order_id not_null, выход «Соответствуют условию»; пустой E04 импортирован NULL |
| Расходы каждого заказа | TBGGroupDataEngine | непустой order_id; SUM(amount), amount_Sum→order_spent |
| Заказы и расходы | TBGJoinDataEngine | полный orders слева, order summary справа; LEFT по order_id |
| Остаток каждого заказа | TBGCalcData | order_open=IF(status="active",IF(committed_amount>NVLF(order_spent,0),committed_amount−NVLF(order_spent,0),0),0) |
| Обязательства по статье | TBGGroupDataEngine | cost_center,budget_item; SUM(order_open), order_open_Sum→open_commitments |
| Бюджет и расходы | TBGJoinDataEngine | полный budgets слева, article spent summary справа; LEFT по cost_center и budget_item |
| Бюджет и обязательства | TBGJoinDataEngine | предыдущий реестр слева, article open summary справа; LEFT по обоим ключам |
| Доступный бюджет | TBGCalcData | spent=NVLF(spent,0), open_commitments=NVLF(open_commitments,0); available=limit_amount−NVLF(spent,0)−NVLF(open_commitments,0) |
| Денежный формат CSV | TBGCalcData | limit_amount/spent/open_commitments/available заменены строками с точкой и двумя дробными цифрами |
| Порядок статей | TBGSortingEngine | cost_center ASC,budget_item ASC; LocaleAware=false; explicit output mapping шести полей, autosync=false |
| Итоговый CSV | TBGExportTextFile | один CSV, UTF-8, `;`, header=column names, decimal `.`, qualifier `"`; фактический файл LF/no BOM, пустых ячеек нет |

Импорты читают доставленные storage-файлы по suffix budgets.csv/orders.csv/expenses.csv; точные пути сохранены в provenance. Все три LEFT подтверждены native readback, отсутствие JoinType XML само по себе этого не доказывает. Независимые сводки создаются до соединений; сырые журналы не перемножаются. Экспорт подключён к DataSource, не к отдельному Connection.

Связи: полный expenses → Расходы по статье; expenses → Расходы по заказам → Расходы каждого заказа; полный orders + order summary → Заказы и расходы → Остаток каждого заказа → Обязательства по статье; полный budgets + article spent summary → Бюджет и расходы; этот реестр + article open summary → Бюджет и обязательства → Доступный бюджет → Денежный формат CSV → Порядок статей → Итоговый CSV.

Окончательная money-формула каждого x: `Concat(IF(x < 0, "-", ""), Str(Int(Abs(x))), ".", StrZero(Round(Frac(Abs(x)) * 100), 2))`. Round имеет один аргумент и извлекает дробную денежную часть для конечного представления; промежуточные показатели не округляются. На frozen fixture значения имеют точную двухзнаковую величину. Money strings и окончательная схема созданы до Sort; конечный порт содержит два string-ключа и четыре money string.

## Полный результат и проверенные границы

Ровно 3 строки × 6 колонок, одна строка на составной ключ полного budgets; порядок cost_center,budget_item ASC. Колонки сопоставляются по именам без требования к их порядку. Все четыре денежные колонки содержат не менее двух цифр после точки, включая нули, без разделителей тысяч. Числовой допуск ±0.001 не отменяет этот текстовый формат result-table.

```csv
cost_center;budget_item;limit_amount;spent;open_commitments;available
CC1;I1;100.00;40.00;40.00;20.00
CC1;I2;80.00;35.00;70.00;-25.00
CC2;I1;30.00;0.00;0.00;30.00
```

CC1/I1: spent=12+8+15+5=40, включая прямой E04=5; O01 даёт open=60−20=40, O02=max(10−15,0)=0, available=100−40−40=20. Clamp каждого заказа до группировки не позволяет избытку O02 уменьшить остаток O01. CC1/I2: cancelled O03 даёт open0, но его E05=35 остаётся в spent; active O04 без расходов даёт open70, available=80−35−70=−25 со знаком. CC2/I1 без заказов и расходов сохраняет limit30/spent0/open0/available30. Все три бюджетных тождества limit=spent+open_commitments+available проверены.

Authoring A1 из общего бюджета3 с технической подсказкой завершён CLI exit0; observed attempts=1. БД сессии подтвердила openai/gpt-6-sol/xhigh. За 930 s: 51 tools, 46 Loginom calls, 1 tool error, 0 memory calls. Actual pin — verified private development candidate CLI0.0.0-preview-cache, не release. Все 15 сохранённых GUID и 15 связей сопоставлены final SUCCEEDED/completed receipts; все 16 apply завершены. Export 163 B и Save подтверждены.

Первый calc-available дал NULL для CC2/I1. fix-available-null на том же GUID повторно completed; сохранён available=limit_amount−NVLF(spent,0)−NVLF(open_commitments,0). Единственная tool error — read-only loginom_read двух help URI, LOGINOM_KNOWLEDGE_FAILED; summary.errors/errorTexts=[] при toolErrors=1 сохранены честно. Ошибка чтения не выдана за failed native mutation. A1 Save SUCCEEDED/save_completed/workflow_preserved/cleanup=true, но reopened=false/persisted_content_verified=false и arrangement=result_unconfirmed остаются ограничениями исходной операции; cold — отдельная проверка.

Оба ORIGINAL native-close завершились closed_ack=true/request_error=null/actual exit0/signal=null; profile idle/writer=null/recovery=[] подтверждены. Root cold заново открыл точный сохранённый пакет и выполнил все 15 BODY→F9 по 15 связям и зависимостям без настройки и Save. После единственного park появился новый CSV 163 B: header и все 18 ячеек побайтно совпали с manual/oracle/initial; все 12 money texts и 3 бюджетных тождества проверены. После Close→«Не сохранять» и logout фактический server LGP совпал с before по bytes/SHA/stat; свой ownTab[private] закрыт, idle/writer=null/recovery=[]. Native и actual cold independent reviews APPROVE. Root знал oracle и не называется blind; отдельный fresh G04 ONLY-B gate закрыт на P06, нового B solve P08 нет.

D/B имеют одинаковые frozen data/oracle/acceptance/reference/SPEC и общие определения/rubric/tolerance. Business использует shared accepted detailed reference без отдельной business authoring attempt; source_task/source_provenance фиксируют источник. Штатный финализатор работал с private staged bytecopy original A и .case→public D; исходные draft7files/A/.case сохранены. CURRENT CLI0.0.0-preview-cache вызван только через --version; sealed OLD P06 provenance сохранён, новая activation не выполнялась. Actual17 historical cache/P04 cause остаются UNKNOWN.

Каждая форма имеет четыре genuine XML+raw-recipe+full-CSV near-miss: full active committed вместо remaining; article-spent input от existing nonempty-order filter теряет direct E04; первый budget LEFT→inner теряет CC2/I1; минимальная ширина дробной части limit_amount 2→1. Первые три имеют numeric oracle=false и предметные expected_failed. Последняя меняет только три limit_amount .00→.0, остальные девять money texts и все численные значения сохраняет, numeric oracle=true/result-table=false. Mutants в Loginom не исполнялись. Live judge calibration, sole D/B measurements и окончательное принятие пары pending.
