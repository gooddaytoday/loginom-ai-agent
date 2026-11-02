# Возвраты товара и кредит-ноты

> Сведения о локальном окружении обезличены. Приватные подтверждения, упомянутые в документе, не включены в репозиторий.

## Назначение и происхождение

Количественная и денежная сверка всех строк заказа по принятым возвратам и проведённым кредит-нотам. Одна денежная единица без налогов и неоговорённых сборов; временного окна нет, история смены статусов не подразумевается. Исходная net_unit_price уже учитывает скидку, actual_credit складывает проведённые amounts независимо от qty*price.

Исходные данные — original synthetic eval-author fixture: order_lines.csv (4 строки), returns.csv (4), credits.csv (4). Это искусственные операции, не реальные клиенты или документы. Три raw-файла заморожены до ручного расчёта и независимого oracle; внешние datasets, пакеты и внешняя лицензия не использованы. Лицензия репозитория — MIT.

order_lines — полный уникальный реестр order_line_id. return_id и credit_id уникальны в своих журналах; все order_line_id журналов существуют в реестре. customer_id может повторяться; ключи — ASCII strings с сохранением регистра. NULL и пустых полей во входах нет. sold_qty и qty — положительные целые; net_unit_price и amount — неотрицательные денежные значения с двумя дробными цифрами. returns.status содержит accepted/rejected, credits.status — posted/draft. Входы: UTF-8, заголовок, `;`, десятичная точка, двойная кавычка.

Независимый oracle читает только raw через Python stdlib csv: отдельный accepted quantity-ledger, posted quantity-ledger и Decimal posted money-ledger. Он итерирует полный order_lines, берёт собственную Decimal net_unit_price, вычисляет обе неотрицательные части количественного расхождения и signed actual−expected, сортирует order_line_id. Экспорт Loginom источником ответа не служит. Runtime и версия зафиксированы в provenance; все 32 ячейки независимо рассчитаны вручную.

## Фактический native reference

В сохранённом Unit1 наблюдаются 15 native узлов и 14 связей. Это описание одного решения, не требование к количеству, именам или внутренней композиции оцениваемого графа. Все три импорта связаны с экспортом; готовые итоговые значения не подставлены, JavaScript не заменяет расчёт.

| Узел | Компонент | Фактическая настройка |
|---|---|---|
| Строки заказов | TBGImportTextFile | order_lines.csv; order_line_id/customer_id string, sold_qty integer, net_unit_price float |
| Возвраты | TBGImportTextFile | returns.csv; return_id/order_line_id/status string, qty integer |
| Кредит ноты | TBGImportTextFile | credits.csv; credit_id/order_line_id/status string, qty integer, amount float |
| Принятые возвраты | TBGFilterDataEngine | status=accepted, case-sensitive; выход «Соответствуют условию» |
| Проведенные кредиты | TBGFilterDataEngine | status=posted, case-sensitive; выход «Соответствуют условию» |
| Сумма принятых количеств | TBGGroupDataEngine | order_line_id; SUM(qty), qty_Sum→accepted_qty |
| Суммы проведенных кредитов | TBGGroupDataEngine | order_line_id; SUM(qty)/SUM(amount), qty_Sum→credited_qty, amount_Sum→actual_credit |
| Заказы и принятые возвраты | TBGJoinDataEngine | полный order_lines слева, accepted summary справа, LEFT по order_line_id |
| Заказы и проведенные кредиты | TBGJoinDataEngine | предыдущий реестр слева, posted summary справа, LEFT по order_line_id |
| Нули и целые количества | TBGCalcData | accepted_qty=Int(NVLF(accepted_qty, 0)), credited_qty=Int(NVLF(credited_qty, 0)), actual_credit=NVLF(actual_credit, 0) |
| Сверка количеств и сумм | TBGCalcData | uncovered_qty=IFF(accepted_qty>credited_qty, accepted_qty−credited_qty, 0); excess_credited_qty — обратное расхождение; expected_credit=accepted_qty*net_unit_price; deviation=actual_credit−accepted_qty*net_unit_price |
| Денежный формат CSV | TBGCalcData | expected_credit/actual_credit/deviation заменены строками с точкой и двумя дробными цифрами |
| Восемь итоговых полей | TBGReformColumnsEngine | исключены customer_id/sold_qty/net_unit_price; сохранены восемь итоговых полей |
| Порядок строк заказа | TBGSortingEngine | order_line_id ASC, LocaleAware=false; получает окончательную схему денежных строк |
| Итоговый CSV | TBGExportTextFile | один CSV, UTF-8, `;`, header=column names, decimal `.`, qualifier `"`; фактический файл LF/no BOM, пустых ячеек нет |

Импорты читают доставленные storage-файлы по suffix order_lines.csv/returns.csv/credits.csv; точные пути сохранены в provenance. Отсутствующий JoinType XML не используется как доказательство LEFT: оба режима подтверждены native readback. Сводки формируются независимо до соединений, сырые журналы друг с другом не перемножаются.

Связи: Возвраты → Принятые возвраты → Сумма принятых количеств; Кредит ноты → Проведенные кредиты → Суммы проведенных кредитов; Строки заказов + accepted summary → Заказы и принятые возвраты; этот реестр + posted summary → Заказы и проведенные кредиты → Нули и целые количества → Сверка количеств и сумм → Денежный формат CSV → Восемь итоговых полей → Порядок строк заказа → Итоговый CSV.

Окончательная money-формула каждого x: `Concat(IF(x < 0, "-", ""), Str(Int(Abs(x))), ".", StrZero(Mod(Int(Round(Abs(x) * 100)), 100), 2))`. Round извлекает копейки для финального представления; промежуточные показатели не округляются. На frozen fixture деньги имеют точную двухзнаковую величину. Money strings и выбор восьми полей созданы до Sort; конечный порт содержит order_line_id string, четыре integer и три money string.

## Полный результат и проверенные границы

Ровно 4 строки × 8 колонок, одна строка на order_line_id полного реестра, порядок order_line_id ASC. Колонки сопоставляются по именам без требования к их порядку. Четыре количества записаны целым текстом без дробной части; три денежные колонки имеют не менее двух цифр после точки, включая нули, без разделителей тысяч. Абсолютный числовой допуск ±0.001 не отменяет этот текстовый формат result-table.

```csv
order_line_id;accepted_qty;credited_qty;uncovered_qty;excess_credited_qty;expected_credit;actual_credit;deviation
L01;3;2;1;0;37.50;26.00;-11.50
L02;0;1;0;1;0.00;7.00;7.00
L03;2;0;2;0;8.00;0.00;-8.00
L04;0;0;0;0;0.00;0.00;0.00
```

L01: accepted R01+R02=3, rejected R03 исключён; posted K01+K02 дают qty2 и amount26.00, draft K04 исключён. uncovered=1, excess=0, expected=3×12.50=37.50, deviation=−11.50; actual26.00 отличается от credited2×12.50=25.00. L02: accepted нет, posted K03 qty1/amount7.00 сохранён, excess=1 и deviation=7.00. L03: accepted R04 qty2 без кредита, uncovered=2, expected=8.00, deviation=−8.00. L04 без обоих журналов сохранена с нулями.

Authoring A1/3 с технической подсказкой завершён CLI exit0; БД сессии подтвердила openai/gpt-6-sol/xhigh. За 922 s: 55 tools, 46 Loginom calls, 1 tool error, 0 memory calls. Actual pin — verified private development candidate CLI0.0.0-preview-cache, не release. Все 15 сохранённых GUID сопоставлены final SUCCEEDED/completed receipts; экспорт 227 B и Save подтверждены.

Первый money calculator дал NULL через IFF; тот же GUID исправлен на IF и повторно completed до сохранения. Quantity IFF остаются числовыми clamps. Единственная tool error sort-final-01 — NOT_APPLIED/effect_possible=false/cleanup=true/node=null/execution=not_requested из-за недостижимой drop surface; новый sort-final-02 без position completed. Ошибка не выдана за успешную мутацию. A1 reopened=false/persisted_content_verified=false и arrangement=result_unconfirmed сохранены как ограничения исходной операции; cold является отдельной проверкой.

Оба ORIGINAL native-close завершились closed_ack=true/request_error=null/actual exit0/signal=null; profile idle/writer=null/recovery=[] подтверждены. Root cold заново открыл точный сохранённый пакет и выполнил все 15 BODY→F9 по 14 зависимостям без настройки и Save. После park появился новый CSV 227 B: полный header и все 32 ячейки побайтно совпали с manual/oracle/initial; все 16 integer и 12 money text cells проверены. После Close→«Не сохранять» и logout фактический server LGP остался неизменен; свой ownTab[private] закрыт, idle/writer=null/recovery=[]. Native и cold independent reviews APPROVE. Root знал oracle и не называется blind; отдельный fresh G04 ONLY-B gate закрыт на P06, нового B solve P07 нет.

D/B имеют одинаковые frozen data/oracle/acceptance/reference/SPEC и общие определения/rubric/tolerance. Business использует shared accepted detailed reference без отдельной business authoring attempt; source_task/source_provenance фиксируют источник. Финализатор использовал current CLI0.0.0-preview-cache только через --version; старый sealed P06 provenance сохранён, новая activation не выполнялась. Cold проверяет этот сохранённый пакет; actual17 historical cache/P04 cause остаются UNKNOWN.

Каждая форма имеет четыре genuine XML+raw-recipe+full-CSV near-miss: returns status ошибочно `!=draft` включает rejected; posted quantity и money обнуляются при отсутствии accepted; первый registry LEFT→inner теряет L02/L04; минимальная ширина дробной части expected_credit 2→1. Первые три имеют numeric oracle=false и предметные expected_failed. Последняя меняет только три expected_credit .00→.0, сохраняет37.50/остальные ячейки, numeric oracle=true/result-table=false. Mutants в Loginom не исполнялись. Live judge calibration, sole D/B measurements и окончательное принятие пары pending.
