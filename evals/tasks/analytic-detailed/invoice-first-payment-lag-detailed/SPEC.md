# Скорость первого платежа по счетам

Эталон считает по месяцу выставления число счетов и распределение первого допустимого платежа на снимок `2026-03-01T00:00:00`. Счета и платежи ровно на границе включены. Допустимый платёж имеет `status=posted`, `amount>0` и `paid_at<=snapshot_at`; полная оплата не требуется. Предоплата определяется точным сравнением `paid_at<issued_at` раньше классификации по месяцу.

Входы: `data/invoices.csv` (9 счетов: invoice_id, issued_at) и `data/payments.csv` (13 платежей: payment_id, invoice_id, paid_at, amount, status), UTF-8, разделитель `;`, заголовок из имён полей. Все timestamps имеют фиксированный формат `YYYY-MM-DDTHH:mm:ss`, одну гражданскую календарную шкалу без offset/Z и преобразований часовых поясов. Независимый oracle использует CPython 3.12.3, стандартные datetime.datetime и decimal.Decimal; он читает data, выбирает минимум допустимых timestamps и рассчитывает календарную разность лет/месяцев независимо от Loginom.

## Фактический граф

`Unit_0/Unit.xml` содержит один workflow, 11 прикладных native-узлов и 10 workflow-связей. Пустой служебный узел переменных не участвует в вычислениях. Таблица описывает принятый reference, а не обязательную внутреннюю композицию решения агента.

| Узел | Компонент | Настройка |
| --- | --- | --- |
| Счета | TBGImportTextFile | Загруженный invoices.csv; CodePage=65001, DelimiterChar=`;`, DecimalSeparator=`.`; invoice_id и issued_at — dtString. |
| Платежи | TBGImportTextFile | Загруженный payments.csv; те же настройки CSV; paid_at — dtString, amount — dtFloat. |
| Счета на момент снимка | TBGFilterDataEngine | issued_at — frtLessOrEqual строке `2026-03-01T00:00:00`. |
| Проведённые положительные платежи на снимок | TBGFilterDataEngine | Одна AND-группа: status frtEqual posted, amount frtGreater 0, paid_at frtLessOrEqual snapshot. |
| Первый допустимый платёж | TBGGroupDataEngine | invoice_id — utGroup; paid_at — utValue, gdMin; выход paid_at_Min переименован в first_paid_at. |
| Счета с первым платежом | TBGJoinDataEngine | Равенство invoice_id слева/справа; включённые счета слева, первые платежи справа. Left-режим подтверждён сохранённым native-readback и полным выходом с настоящим NULL у I07; отдельный JoinType в XML не записан. |
| Календарные месяцы и классы платежа | TBGCalcData | Выражения ниже; NULL и предоплата выделены перед месяцами. |
| Распределение по месяцу выставления | TBGGroupDataEngine | Единственный ключ issue_month; count(invoice_id) → invoices и суммы пяти индикаторов классов. |
| Целочисленные счётчики | TBGReformColumnsEngine | Пять сумм классов приведены из dtFloat в dtInteger; invoices уже dtInteger. |
| Итог по месяцам по возрастанию | TBGSortingEngine | Ключ issue_month, LocaleAware=false; ASC подтверждён native-readback. |
| Итоговый CSV | TBGExportTextFile | Один *.result.csv; UTF-8, `;`, имена колонок в заголовке, DecimalSeparator=`.`. Двойная кавычка как text qualifier подтверждена native-readback. |

Связи: Счета → Счета на момент снимка → левый вход соединения; Платежи → Проведённые положительные платежи на снимок → Первый допустимый платёж → правый вход соединения; соединение → Календарные месяцы и классы платежа → Распределение по месяцу выставления → Целочисленные счётчики → Итог по месяцам по возрастанию → Итоговый CSV.

## Выражения калькулятора

```text
issue_month = Left(issued_at, 7)
issue_year = Val(Left(issued_at, 4))
issue_month_number = Val(SubStr(issued_at, 6, 2))
payment_year = Val(Left(first_paid_at, 4))
payment_month_number = Val(SubStr(first_paid_at, 6, 2))
month_delta = 12 * (payment_year - issue_year) + payment_month_number - issue_month_number
prepayment = IFF(IsNull(first_paid_at), 0, IFF(first_paid_at < issued_at, 1, 0))
same_month = IFF(IsNull(first_paid_at), 0, IFF(first_paid_at < issued_at, 0, IFF(month_delta = 0, 1, 0)))
next_month = IFF(IsNull(first_paid_at), 0, IFF(first_paid_at < issued_at, 0, IFF(month_delta = 1, 1, 0)))
later = IFF(IsNull(first_paid_at), 0, IFF(first_paid_at < issued_at, 0, IFF(month_delta > 1, 1, 0)))
no_payment = IFF(IsNull(first_paid_at), 1, 0)
```

При одинаковом fixed-width naive ISO-формате лексикографический порядок совпадает с хронологическим, поэтому строковые MIN, <= и < сохраняют требуемый смысл. Left/SubStr/Val извлекают календарные год и месяц. У ненулевой непредоплаты month_delta неотрицателен; =0, =1 и >1 исчерпывают её классы. IsNull сохраняет счета без допустимого платежа после left join. Отдельные DateTime parsing, floorDay/начало дня, offsets/Z, произвольные форматы и преобразования часовых поясов этим reference не проверены.

## Ожидаемый результат и проверки

Ровно 5 строк и 7 колонок, issue_month ASC, счётчики целые без NULL; всего 8 счетов, сумма пяти классов равна invoices в каждой строке. Колонки сопоставляются по именам, числовой допуск ±0.001:

```csv
issue_month;invoices;prepayment;same_month;next_month;later;no_payment
2025-01;1;0;0;0;1;0
2025-12;1;0;0;1;0;0
2026-01;4;1;1;1;1;0
2026-02;1;0;0;0;0;1
2026-03;1;0;1;0;0;0
```

Авторский полный CSV и новый CSV blind cold UI rerun совпали с независимым oracle; все 11 узлов выполнены без изменения настроек, серверный LGP до/после rerun одинаков. Обе формы используют этот общий принятый detailed-reference; отдельной business authoring attempt нет. Acceptance сохраняет минимальные требования импортов/экспорта, связности, пути import→export и обоих входных suffixes; число/имена узлов и конкретные выражения не становятся дополнительными критериями агента. Эквивалентные native-композиции допустимы.

Калибровочный корпус содержит три offline near-miss: последний платёж, месяц без года и исключительная граница снимка. Их XML и синтетические CSV согласованы recipes; это не доказательство native-исполнения мутантов или результата живого judge. Draft/zero/negative платежи, предоплата внутри месяца и отдельная сортировка дополнительно различены oracle selfchecks, но не заявлены как полное near-miss-покрытие.
