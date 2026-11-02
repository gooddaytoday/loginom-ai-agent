# Лицензии с минимальным договорным объёмом

## Назначение и происхождение

Сверка ожидаемого и фактически выставленного счёта всех аккаунтов за полный февраль 2026 года. Оплачивается большее из числа действующих платных мест и договорного минимума. Расчёт ведётся в одной денежной единице без налогов, неоговорённых сборов и prorating; история изменения лицензий внутри месяца не подразумевается.

Исходные данные — original synthetic eval-author fixture: accounts.csv (4 строки), seats.csv (6), plans.csv (2), bills.csv (3). Это искусственные строки, не реальные клиенты или счета. Все четыре raw-файла заморожены до независимого ручного расчёта и oracle; внешние наборы, пакеты и внешняя лицензия не использованы. Лицензия репозитория — MIT.

accounts — полный уникальный реестр account_id с собственными plan и minimum_seats; plans — полный уникальный справочник plan/seat_price. seat_id и bill_id уникальны, все внешние ключи существуют. Ключи — ASCII strings с сохранением регистра. NULL/пустых полей во входах нет, enabled/billable — целые 0/1, minimum_seats — неотрицательное целое, деньги неотрицательны с двумя знаками после точки. Входы: UTF-8, заголовок, разделитель `;`, десятичная точка, двойная кавычка.

Независимый oracle читает raw через Python stdlib csv: множества seat_id с обоими flags=1, max с собственным minimum, Decimal-цена своего plan и отдельный Decimal ledger всех bills. Он итерирует полный accounts и сортирует account_id; экспорт Loginom не служит источником ответа. Runtime и версия зафиксированы в provenance, все 28 ячеек независимо пересчитаны вручную.

## Фактический native reference

В сохранённом Unit1 наблюдаются 16 native узлов и 15 связей. Это описание одного корректного решения, не требование к числу, именам или внутренней композиции оцениваемого графа. Все четыре импорта связаны с итоговым экспортом; готовая таблица не подставлена, JavaScript не заменяет расчёт.

| Узел | Компонент | Фактическая настройка |
|---|---|---|
| Аккаунты | TBGImportTextFile | accounts.csv; account_id/plan string, minimum_seats integer |
| Места | TBGImportTextFile | seats.csv; seat_id/account_id string, enabled/billable integer |
| Тарифы | TBGImportTextFile | plans.csv; plan string, seat_price float |
| Счета | TBGImportTextFile | bills.csv; bill_id/account_id string, amount float |
| Активные платные места | TBGFilterDataEngine | enabled=1 AND billable=1; выход «Соответствуют условию» |
| Число платных мест | TBGGroupDataEngine | account_id; count(seat_id), переименование seat_id_Count→active_billable_seats |
| Сумма счетов | TBGGroupDataEngine | account_id; sum(amount), amount_Sum→actual_bill |
| Аккаунты и места | TBGJoinDataEngine | accounts слева, сводка мест справа, left по account_id |
| Аккаунты и счета | TBGJoinDataEngine | предыдущий реестр слева, сводка bills справа, left по account_id |
| Тариф за место | TBGJoinDataEngine | реестр слева, plans справа, left по plan |
| Нулевые факты | TBGCalcData | NVLF(active_billable_seats, 0) integer; NVLF(actual_bill, 0) float |
| Минимум и отклонение | TBGCalcData | billed_seats=Max(active_billable_seats, minimum_seats); expected_bill=billed_seats * seat_price; deviation=actual_bill - expected_bill |
| Формат денежных сумм | TBGCalcData | expected_bill/actual_bill/deviation заменены строками с точкой и двумя дробными цифрами |
| Семь полей сверки | TBGReformColumnsEngine | исключены plan/seat_price; сохранены ровно семь итоговых полей |
| По account_id | TBGSortingEngine | account_id ASC, LocaleAware=false; получает окончательную схему с денежными строками |
| Итоговый CSV | TBGExportTextFile | один CSV, UTF-8, `;`, header=column names, decimal `.`, qualifier `"`, LF, no BOM, null marker empty |

Импорты читают доставленные storage-файлы по suffix accounts.csv/seats.csv/plans.csv/bills.csv. Полные фактические пути зафиксированы в provenance. Отсутствующий JoinType XML не используется как самостоятельное доказательство left: все три режима подтверждены native readback. Настройки импорта и экспорта подтверждены квитанциями, формат CSV — также фактическими байтами.

Связи: Места → Активные платные места → Число платных мест; Счета → Сумма счетов; Аккаунты + Число платных мест → Аккаунты и места; этот выход + Сумма счетов → Аккаунты и счета; этот выход + Тарифы → Тариф за место → Нулевые факты → Минимум и отклонение → Формат денежных сумм → Семь полей сверки → По account_id → Итоговый CSV. Журналы агрегируются отдельно, сырые факты не перемножаются.

После числовых расчётов каждый денежный x преобразуется в строку выражением `Concat(IF(x < 0, "-", ""), Str(Int(Abs(x))), ".", StrZero(Mod(Int(Round(Abs(x) * 100, 0)), 100), 2))`. Round здесь служит извлечению копеек для финального представления, не меняет промежуточные показатели. На frozen fixture суммы имеют точную двухзнаковую денежную величину. Окончательные денежные строки и выбор семи колонок созданы до Sort; финальный порт содержит account_id string, три integer и три money string.

## Полный результат и проверенные границы

Ровно 4 строки × 7 колонок, по одной на account_id полного реестра; порядок account_id ASC. Колонки сопоставляются по точным именам без требования к их порядку. active_billable_seats/minimum_seats/billed_seats записаны целым текстом без дробной части. Все денежные ячейки имеют не менее двух цифр после точки, включая нули, без разделителей тысяч; пустых значений нет. Абсолютный числовой допуск ±0.001 не отменяет текстовый формат result-table.

```csv
account_id;active_billable_seats;minimum_seats;billed_seats;expected_bill;actual_bill;deviation
A01;1;0;1;10.00;10.00;0.00
A02;0;3;3;60.00;55.00;-5.00
A03;0;0;0;0.00;0.00;0.00
A04;2;1;2;40.00;0.00;-40.00
```

A01: только S01 имеет оба flags=1; S02 отключено, S03 бесплатно, S04 не удовлетворяет обоим. Ожидается 1×10=10.00; два счета 4.00+6.00 дают 10.00, deviation=0.00. A02 без seats сохраняет minimum=3, ожидается 60.00, факт=55.00, deviation=−5.00. A03 без обоих журналов сохраняется с нулевыми количествами и деньгами. A04 имеет 2 места при minimum=1, ожидается 40.00, bills нет, deviation=−40.00. В fixture различимы оба флага, минимум без seats, значение выше минимума, несколько счетов, отсутствие фактов, нулевой и отрицательный денежный результат.

Authoring A1/3 с технической подсказкой завершён CLI exit0; session DB подтвердила openai/gpt-6-sol/xhigh. За 970 s: 55 tools, 50 Loginom calls, 3 tool errors, 0 memory calls. Два отказа upload по artifact_id и reform с лишними excluded mappings были NOT_APPLIED/request_rejected/effect_possible=false; исправленные операции успешны. Все 16 сохранённых node GUID сопоставлены completed/SUCCEEDED receipts. Save подтверждён, но A1 reopen/persisted_content_verified не заявлялся, arrangement=result_unconfirmed сохранено как ограничение. Original native-close ACK/exit0 и profile idle/writer=null/recovery=[] подтверждены отдельными receipts.

Root cold rerun заново открыл точный сохранённый пакет и выполнил все 16 BODY→F9 в порядке 15 зависимостей без перенастройки и Save. После park появился новый CSV 204 B: полный header и все 28 ячеек совпали с manual/oracle/initial CSV; все 12 integer и 12 money text cells проверены. После NoSave/logout фактический server LGP остался неизменен; собственная вкладка закрыта, профиль idle/writer=null/recovery=[]. Root знал oracle: cold executor не называется blind. Отдельный fresh ONLY-B solve читал только business prompt/inputs/raw, дал полный совпавший 4×7 CSV; его независимость не приписывается UI-execution. Native audit и actual cold/ONLY-B review APPROVE относятся к этим сохранённым evidence.

D/B имеют одинаковые frozen data/oracle/acceptance/reference/SPEC и общие определения/rubric/tolerance. Business использует shared accepted detailed reference без отдельной business authoring attempt; её source_task/source_provenance фиксируют происхождение. Офлайн-финализация использовала старый Authoring CLI только через штатный finalizer --version; новый candidate и отдельный B build этим не проверялись.

Каждая форма имеет четыре genuine XML+raw-recipe+full-CSV near-miss: AND→OR; отказ от договорного минимума; первый registry-left→inner с потерей A02/A03; минимальная ширина дробной части expected_bill 2→1. Первые три имеют numeric oracle=false и предметные expected_failed; последняя меняет только четыре expected_bill .00→.0, numeric oracle=true, result-table=false по денежному формату. Mutants в Loginom не исполнялись. Live judge calibration, отдельные D/B measurements и окончательное принятие пары pending.
