# Доля покупателей среди всей клиентской базы

> Сведения о локальном окружении обезличены. Приватные подтверждения, упомянутые в документе, не включены в репозиторий.

## Задача и данные

Результат содержит долю покупателей и выручку на клиента всей базы для каждого segment из полного customers. Обе формы используют одни данные, общий контракт, rubric и oracle; detailed раскрывает расчёт, business задаёт цель без последовательности преобразований.

Данные полностью синтетические, созданы eval-author для этой задачи: 6 customers и 5 sales_lines. Это не UCI, реальная CRM или производный снимок реальных клиентов. Оба raw CSV заморожены до ручного gold и oracle; внешние datasets, готовые пакеты и сторонние лицензии не использованы, лицензия репозитория — MIT. Денежная единица одна, налоги и неоговорённые сборы отсутствуют.

customers.csv имеет поля customer_id,segment; customer_id уникален, customers — полный реестр и основание показателей. sales_lines.csv имеет invoice_id,customer_id,line_id,amount; line_id и пара (invoice_id,line_id) уникальны, один invoice_id принадлежит одному customer_id. Все sales customer_id существуют в customers. Один клиент может иметь несколько чеков и строк. Все входные ячейки непустые и без NULL; ключи и категории — case-sensitive ASCII strings. amount неотрицателен и задан точной денежной строкой с двумя десятичными цифрами. Входы UTF-8, заголовок, `;`, десятичная точка, двойная кавычка.

Все строки sales_lines относятся к полному февралю 2026: [2026-02-01,2026-03-01). Это область всего файла, колонок дат и дополнительного фильтра периода нет; гражданский календарь без часовых преобразований. Покупатель — уникальный customer_id с любой строкой sales_lines, включая amount=0.00. Число invoice_id или line_id не является числом людей.

Независимый oracle читает raw через Python stdlib csv/Decimal: множество customer_id с любыми строками, отдельная Decimal-выручка каждого клиента и полный реестр членов сегмента. Для каждого сегмента он считает всех клиентов, distinct покупателей, сумму всех строк выручки, buyers/customers и revenue/customers. Экспорт Loginom не служит источником ответа. Runtime и версия записаны в provenance; полная ручная 3×6 таблица рассчитана независимо до native.

## Фактический native reference

В saved Unit1 наблюдаются 11 native узлов и 10 data links. Это описание одного решения; количество, имена и внутренняя композиция не являются требованием к оцениваемому графу. Обе import-ветви связаны с sole export; JavaScript и готовые итоговые значения не подставлены.

| Узел | Компонент | Фактическая настройка |
|---|---|---|
| Клиентский реестр | TBGImportTextFile | customers.csv; customer_id и segment string |
| Строки продаж февраля | TBGImportTextFile | sales_lines.csv; invoice_id/customer_id/line_id string, amount float |
| Продажи по клиентам | TBGGroupDataEngine | customer_id; SUM(amount)→customer_revenue, COUNT(line_id)→sale_lines |
| Вся база и покупки | TBGJoinDataEngine | полный customers слева, client summary справа; LEFT по customer_id |
| Нули и признак покупателя | TBGCalcData | customer_revenue=NVLF(customer_revenue,0); buyer_flag=IFF(NVLF(sale_lines,0)>0,1,0), integer |
| Итоги по сегментам | TBGGroupDataEngine | segment; COUNT(customer_id)→customers, SUM(buyer_flag)→buyers, SUM(customer_revenue)→revenue |
| Доли и выручка на базу | TBGCalcData | buyers=Int(buyers), buyer_share=buyers/customers, revenue_per_customer=revenue/customers |
| Формат денежных полей | TBGCalcData | revenue и revenue_per_customer заменены строками с точкой и шестью дробными цифрами |
| Шесть итоговых полей | TBGReformColumnsEngine | segment,customers,buyers,buyer_share,revenue,revenue_per_customer |
| Сегменты по возрастанию | TBGSortingEngine | segment ASC, LocaleAware=false; explicit output mapping шести полей, autosync=false |
| Итоговый CSV | TBGExportTextFile | единственный CSV, UTF-8, `;`, names header, decimal `.`, qualifier `"`; фактический LF/no BOM, пустых ячеек нет |

Импорты читают доставленные storage-файлы с suffix customers.csv и sales_lines.csv; точные пути зафиксированы в provenance. LEFT подтверждён native readback, отсутствие XML JoinType само по себе этого не доказывает. Клиентская агрегация до соединения сохраняет зерно и не размножает суммы; COUNT(line_id) нужен для наличия, а не для количества людей.

Связи: sales_lines → Продажи по клиентам; customers + этот client summary → Вся база и покупки → Нули и признак покупателя → Итоги по сегментам → Доли и выручка на базу → Формат денежных полей → Шесть итоговых полей → Сегменты по возрастанию → Итоговый CSV. Выручка суммирует каждую строку, даже при повторяющемся invoice_id. U04 с amount0 сохраняет buyer_flag1; отсутствующие факты дают revenue0/buyer_flag0. Полный customers остаётся слева, поэтому U03/U05 остаются в знаменателях, U06 сохраняет SEG_C без продаж.

Финальная money-формула каждого x: `Concat(Str(Int(Round(x, 6))), ".", StrZero(Round((Round(x, 6) - Int(Round(x, 6))) * 1000000), 6))`. Это конечное строковое представление после численного расчёта; агрегаты и отношения до него не округляются. Обе money strings и окончательные типы/шесть полей завершены до Sort/export. Все customers/buyers экспортированы целым текстом, buyer_share остаётся числовой долей.

## Полный результат и проверенные границы

Ровно 3 строки × 6 колонок; одна строка на segment полного реестра, segment ASC. Колонки сопоставляются по точным именам без требования к порядку колонок. customers/buyers — целый текст без дробной части; revenue/revenue_per_customer содержат не менее двух цифр после точки, включая нули, без разделителей тысяч. buyer_share — доля 0–1 по точности, дополнительного минимума дробных знаков нет. Числовой допуск ±0.001 не отменяет текстовые требования result-table.

```csv
segment;customers;buyers;buyer_share;revenue;revenue_per_customer
SEG_A;3;2;0.6666666666666666666666666667;42.00;14.00
SEG_B;2;1;0.5;0.00;0.00
SEG_C;1;0;0;0.00;0.00
```

SEG_A: U01 имеет три строки в двух чеках с выручкой10+5+20=35, U02 — строку7, U03 не покупал. Полная база3, distinct buyers2, buyer_share2/3, revenue42, revenue_per_customer14. Здесь 3 invoice и 4 line отличимы от 2 людей. SEG_B: U04 имеет нулевую строку и остаётся покупателем, U05 не покупал; база2/buyers1/share1/2/revenue0/rpc0. SEG_C: единственный U06 без строк сохраняется с customers1 и остальными нулями. Всего6 клиентов и revenue42; все 18 ячеек, 6 integer texts, 6 money texts и 3 shares проверены.

Authoring A1 из разрешённого бюджета3 с технической подсказкой завершён CLI exit0; фактически наблюдается одна попытка. БД сессии подтвердила openai/gpt-6-sol/xhigh. За 682 s: 36 tools, 30 Loginom calls, 0 tool errors, 0 memory calls. Actual pin — verified private development candidate CLI0.0.0-preview-cache, не release. Все 11 saved GUID и 10 links сопоставлены actual SUCCEEDED/completed/applied/cleanup=true receipts. Export177B подтверждён receipt и полным CSV.

A1 Save SUCCEEDED/save_completed/workflow_preserved/cleanup=true, но reopened=false/persisted_content_verified=false и arrangement=result_unconfirmed остаются ограничениями исходной операции. Финальный ответ автора честно отличает расчёт/Save от ещё не выполненных им reopen/native audit/cold. Оба ORIGINAL Close: closed_ack=true/request_error=null/actual exit0/signal=null; сохранённое idle proof writer=null/recovery=[].

Root cold после отдельного native audit открыл точный сохранённый пакет и выполнил все11 BODY→F9 разово топологически по10 links, включая обе import-ветви, без настройки и Save. После единственного park прежнего результата появился новый CSV177B; initial и cold byte-exact. Все18 ячеек сравнены с независимыми manual/oracle по named columns и ±.001; 6 integer texts/6 money texts/3 shares соблюдены. Native/cold CSV не byte-equal gold: SEG_A share0.6666666666666666 вместо Decimal…6667 и money6dec вместо2dec допустимы. После Close→«Не сохранять» и logout actual server LGP bytes/SHA/stat неизменны, собственный ownTab[private] закрыт, idle/writer=null/recovery=[]. Независимые native и actual cold reviews APPROVE. Root oracle-aware; отдельный fresh G04 ONLY-B gate закрыт на P06, нового P09 B solve нет.

D/B имеют одинаковые frozen raw/oracle/acceptance/reference/SPEC и общие определения/rubric/tolerance. Business использует shared accepted detailed reference без отдельной business authoring attempt; source_task/source_provenance фиксируют источник. Штатный финализатор использовал private stage bytecopy original A и sibling .case→public D; original6 draft files каждой формы, actual20 post-cold A files и original .case сохраняются. CURRENT CLI вызывается только через --version; sealed OLD P06 provenance и activation/env сохранены. Actual17 historical cache/P04 cause остаются UNKNOWN.

Четыре genuine XML+raw-recipe+fullCSV near-miss на форму: active-base denominator обеих относительных величин; existing sale_lines count вместо buyer presence; положительная выручка вместо any-line purchase теряет U04; минимальная ширина дробной части revenue6→1. Первые три имеют numeric oracle=false и предметные expected_failed. Последний меняет только3 revenue .000000→.0 в native представлении (.00→.0 в raw recipe), сохраняет все численные значения, numeric oracle=true/result-table=false. Rows variant имеет SEG_A buyers4, это не retained invoice variant с buyers3. Все mutant CSV независимо выводятся из raw; нативно mutants не исполнялись. Live judge calibration, sole D/B measurements и окончательная приёмка пары pending.
