# Ежедневная сверка кассового журнала и банка

Эталон строит полную сверку за 2024-12-30…2025-01-04 в локальных часах Europe/Moscow (UTC+03:00 в этом периоде), без преобразования зоны. Событие относится к календарному дню собственного local_timestamp; inflow — поступления, outflow — положительные списания, ledger_net = inflow − outflow, deviation = bank_net − ledger_net. Каждый день полного календаря сохраняется, включая дни без событий и с нулевым расхождением.

Синтетические входы: data/cash_events.csv — 7 событий (event_id, local_timestamp, direction, amount); data/bank_daily.csv — полный снимок 6 дней (date, net_amount); data/report_calendar.csv — 6 уникальных дат. Входы UTF-8, запятая, десятичная точка; local_timestamp строго YYYY-MM-DD HH:MM:SS, date — YYYY-MM-DD. direction=in/out, amount положительна; NULL во входах нет. Независимый oracle использует CPython 3.12.3, стандартные datetime.date/datetime и decimal.Decimal: группирует события через datetime.strptime().date(), проходит полный календарь, считает Decimal-суммы и bank−ledger независимо от Loginom.

## Фактический граф

Один workflow Unit_0/Unit.xml содержит 11 прикладных native-узлов и 10 workflow-связей. Пустой служебный узел переменных не связан с вычислениями. Число, имена и конкретная композиция описывают принятый reference; эквивалентные native-решения агента допустимы.

| Узел | Компонент | Настройка |
| --- | --- | --- |
| Кассовые события Europe Moscow UTC+03 | TBGImportTextFile | cash_events.csv; CodePage=65001, DelimiterChar=запятая, DecimalSeparator=точка; local_timestamp — dtDateTime, amount — dtFloat, остальные поля — dtString. |
| Полный банковский снимок | TBGImportTextFile | bank_daily.csv; тот же CSV-формат; date — dtDateTime, net_amount — dtFloat. |
| Полный отчетный календарь | TBGImportTextFile | report_calendar.csv; тот же CSV-формат; date — dtDateTime. |
| Начало дня и направления Europe Moscow | TBGCalcData | date — dtDateTime через EncodeDate(Year/Month/Day(local_timestamp)); in_amount/out_amount — dtFloat по direction. |
| Дневные поступления и списания | TBGGroupDataEngine | Единственный ключ date, SUM(in_amount/out_amount); выходы inflow/outflow. |
| Календарь и дневные итоги кассы | TBGJoinDataEngine | Календарь слева, дневные суммы справа, date=date, оба ключа DateTime; left подтверждён native-readback и полным выходом. |
| Полный календарь касса и банк | TBGJoinDataEngine | Предыдущий выход слева, bank_daily справа, date=date; net_amount → bank_net. Left подтверждён native-readback, не выведен из XML-default. |
| Нули кассы и расчет отклонения банк минус касса | TBGCalcData | NVLF отсутствующих кассовых сумм, ledger=in−out и deviation=bank−ledger; выражения ниже. |
| Ежедневная сверка по возрастанию даты | TBGSortingEngine | DateTime date ASC, LocaleAware=false; ASC подтверждён native-readback. |
| Формат CSV дата ISO деньги два знака | TBGCalcData | DateToStr и пять строковых денежных полей, только после расчёта и сортировки; выражения ниже. |
| Итоговый CSV ежедневной сверки | TBGExportTextFile | Один *.result.csv, UTF-8/65001, разделитель ;, заголовки имён, десятичная точка, пустой NULL marker; двойная кавычка подтверждена native-readback. |

Связи: касса → начало дня/направления → дневные SUM; календарь + SUM → первый left join; его выход + банк → второй left join → нули/разности → сортировка → финальный формат → единственный экспорт. Готовый рассчитанный результат не импортируется, JavaScript и внешние вычислительные узлы отсутствуют.

## Фактические выражения

Начало дня и направления:

```text
date = EncodeDate(Year(local_timestamp), Month(local_timestamp), Day(local_timestamp))
in_amount = IF(direction = "in", amount, 0)
out_amount = IF(direction = "out", amount, 0)
```

Отсутствующие факты и разности:

```text
inflow = NVLF(inflow, 0)
outflow = NVLF(outflow, 0)
ledger_net = NVLF(inflow, 0) - NVLF(outflow, 0)
deviation = bank_net - (NVLF(inflow, 0) - NVLF(outflow, 0))
```

Финальный формат:

```text
date = DateToStr(date, "YYYY-MM-DD")
inflow = Concat(IF(Round(inflow, 2) < 0, "-", ""), Str(Int(Round(Abs(inflow) * 100) / 100)), ".", StrZero(Round(Abs(inflow) * 100) - 100 * Int(Round(Abs(inflow) * 100) / 100), 2))
outflow = Concat(IF(Round(outflow, 2) < 0, "-", ""), Str(Int(Round(Abs(outflow) * 100) / 100)), ".", StrZero(Round(Abs(outflow) * 100) - 100 * Int(Round(Abs(outflow) * 100) / 100), 2))
ledger_net = Concat(IF(Round(ledger_net, 2) < 0, "-", ""), Str(Int(Round(Abs(ledger_net) * 100) / 100)), ".", StrZero(Round(Abs(ledger_net) * 100) - 100 * Int(Round(Abs(ledger_net) * 100) / 100), 2))
bank_net = Concat(IF(Round(bank_net, 2) < 0, "-", ""), Str(Int(Round(Abs(bank_net) * 100) / 100)), ".", StrZero(Round(Abs(bank_net) * 100) - 100 * Int(Round(Abs(bank_net) * 100) / 100), 2))
deviation = Concat(IF(Round(deviation, 2) < 0, "-", ""), Str(Int(Round(Abs(deviation) * 100) / 100)), ".", StrZero(Round(Abs(deviation) * 100) - 100 * Int(Round(Abs(deviation) * 100) / 100), 2))
```

EncodeDate создаёт настоящую календарную полночь DateTime, сохраняя гражданские год/месяц/день. Native-наблюдения подтверждают все 7 событий, включая 00:00:00/23:59:59 и переход года; события одного дня сворачиваются вместе. Полные порты двух join сохраняют 6 дат, настоящие NULL кассовых сумм за 2 и 4 января и банковские значения 0/3; NVLF применяется только к отсутствующим фактам полного календаря. Bank_daily полон. Отрицательные bank_net и ledger_net не теряются. DateToStr выполняется после DateTime-соединений и сортировки. Промежуточного округления нет; Round/StrZero используются только для последнего строкового представления результата. Native timezone отмечена unspecified: конвертация зоны, DST и отдельный Date_Time handler этим reference не проверяются.

## Полный результат и проверки

Ровно 6 строк × 6 колонок, date ASC; UTF-8, ;, квалификатор двойная кавычка, десятичная точка без тысячных разделителей. date строго YYYY-MM-DD, все 30 денежных ячеек имеют ровно два знака после точки. Допуск значений ±0.01 не отменяет формат. Порядок колонок не оценивается, колонки сопоставляются по именам.

```csv
date;inflow;outflow;ledger_net;bank_net;deviation
2024-12-30;100.25;20.10;80.15;80.15;0.00
2024-12-31;40.00;5.20;34.80;34.90;0.10
2025-01-01;2.00;7.00;-5.00;-5.00;0.00
2025-01-02;0.00;0.00;0.00;0.00;0.00
2025-01-03;12.34;0.00;12.34;12.09;-0.25
2025-01-04;0.00;0.00;0.00;3.00;3.00
```

Полные CSV авторской CLI-попытки и нового blind cold UI rerun совпали с независимым oracle; отдельно подтверждены date и ровно два десятичных знака. Все 11 узлов повторно выполнены без мастеров/перенастройки; пакет закрыт без сохранения, выполнен logout и закрыта собственная вкладка; фактический серверный LGP до/после D1 одинаков. Типы, формулы, left-режимы, ASC и квалификатор подтверждены actual XML и verified native-readback. Acceptance оставляет только импорты/экспорт, связность, путь import→export и три входных suffixes, без добавочного требования графа к агенту.

Обе формы используют общий принятый detailed-reference и общий SPEC; отдельной business authoring attempt нет. Shared provenance B ссылается на D. Offline-корпус содержит три XML+CSV near-miss: timestamp вместо дня, обратный знак deviation и три денежных знака вместо двух. Последний сохраняет числа и проходит численный oracle, но нарушает full_result. Подготовка мутантов не является их native-исполнением или результатом живого judge. Drop-zero/inner-join и остальные ловушки не заявлены покрытыми этим минимальным корпусом; калибровка судьёй и независимые измерения — отдельные этапы.
