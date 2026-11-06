# Трёхсторонняя сверка заказа, приёмки и счёта

Reference рассчитывает одну строку полного реестра po_lines на po_line_id: количество заказа, независимо принятое и предъявленное количества, положительный excess предъявленного над принятым, знаковое денежное отклонение и число строк счёта с несовпадающей договорной ценой. Взаимное погашение денежных отклонений не удаляет проблемные строки.

## Данные и независимый oracle

Данные синтетические, подготовлены автором eval и заморожены до gold; реальной закупкой не объявляются. data/po_lines.csv содержит 5 уникальных позиций po_line_id/supplier_id/ordered_qty/agreed_unit_price, data/receipts.csv — 4 receipt_id/po_line_id/accepted_qty, data/invoice_lines.csv — 4 invoice_line_id/po_line_id/billed_qty/billed_unit_price. Все ссылки фактов существуют в полном PO, полей NULL нет. CSV UTF-8, разделитель `;`, заголовки имён, десятичная точка; IDs строковые, количества целые, цены точные десятичные с двумя знаками. Одна единица количества и одна денежная единица, налогов нет.

Oracle использует фактический CPython 3.12.3 и stdlib csv/decimal.Decimal. Он читает только три raw inputs: независимо складывает приёмки и предъявленные количества, считает денежное отклонение и несовпадение цены каждой строки счёта, затем проходит весь PO registry по ключу. excess=max(billed−accepted,0). Денежный вывод `:.2f` сохраняет точность frozen данных без промежуточного округления. Oracle не использует Loginom, LGP, SPEC или экспорт. Полный независимый ручной ledger всех 5×8 значений сохранён до authoring.

## Фактический native-граф

Unit_0/Unit.xml содержит 14 прикладных native nodes и 14 workflow links. Имена/число/композиция описывают reference; рубрика принимает эквивалентные native-решения.

| Узел | GUID | Компонент и фактическая настройка |
| --- | --- | --- |
| Заказы | 4ecff319-4060-45b2-8d7e-2d03cc1c274f | TBGImportTextFile, po_lines.csv; IDs dtString, ordered_qty dtInteger, agreed_unit_price dtFloat. |
| Приёмки | f18af3a5-838f-40c0-8e60-7915035fa00f | TBGImportTextFile, receipts.csv; IDs dtString, accepted_qty dtInteger. |
| Строки счетов | fa28159a-fff9-40f4-81da-f57b1ec2cb73 | TBGImportTextFile, invoice_lines.csv; IDs dtString, billed_qty dtInteger, billed_unit_price dtFloat. Все три импорта UTF-8/65001, `;`, decimal `.`. |
| Принято по позиции | 9b68732a-26cd-4221-85e5-675056716fec | TBGGroupDataEngine по po_line_id, gdSum(accepted_qty). |
| Счета и цены заказа | 7ef9f8f4-4659-47c5-8b8e-73be3cd0da64 | TBGJoinDataEngine, invoice main → PO joined, inner/JoinType=jtJoin, string po_line_id=po_line_id. |
| Отклонения строк счетов | 7174a30a-8c74-4302-b8f6-e3ebf146b4eb | TBGCalcData, line_price_deviation=(billed_unit_price−agreed_unit_price)*billed_qty, line_price_problem=IFF(billed_unit_price<>agreed_unit_price,1,0), до группировки. |
| Счета по позиции | 002bf556-985f-4af1-bfa1-7dc84fcc989c | TBGGroupDataEngine по po_line_id: SUM billed_qty/line_price_deviation/line_price_problem; output mapping → billed_qty/price_deviation/price_problem_lines. |
| Заказ и приёмка | ef3fb067-4c80-457f-a933-3a77e6034c54 | TBGJoinDataEngine, весь PO main → receipt summary joined, left по string po_line_id; include_joined_keys=false, 5 строк. |
| Заказ и счета | e9abf649-f049-481e-9e58-e31235a4208f | TBGJoinDataEngine, полный предыдущий результат main → invoice summary joined, left по string po_line_id; include_joined_keys=false, 5 строк. |
| Нули и превышение | 2d571f44-8b11-473e-a946-88b9fb265a90 | TBGCalcData, Int(NVLF(...,0)) для accepted_qty/billed_qty/price_problem_lines, NVLF для price_deviation, excess с явными NVLF всех операндов. |
| Восемь полей сверки | 1cdacab2-5a62-4802-94e0-1c3e0767c229 | TBGReformColumnsEngine исключает agreed_unit_price, сохраняет восемь требуемых полей. |
| Порядок позиции заказа | 005596f9-da88-40d3-8989-9fc4ac681962 | TBGSortingEngine, po_line_id ASC, LocaleAware=false. |
| Формат суммы в CSV | 710002b5-d771-4cd0-93da-0c81aa279c3f | TBGCalcData заменяет price_deviation на dtString: Str → нормализация точки → дополняет до двух десятичных цифр, без округления. |
| Итоговая сверка CSV | e1c4cc16-c010-458a-a640-69226e961c1a | TBGExportTextFile, один *.result.csv, UTF-8/65001, `;`, names header, decimal `.`, qualifier `"`, BOM=false. |

Граф: receipts → независимый Group; invoice и PO → inner join → построчные цены → invoice Group; полный PO и receipt Group → left join, затем invoice Group → left join → нули/excess → Reform → Sort → money formatter → Export. Сырые журналы приёмок и счетов друг с другом не соединяются; строки не перемножаются. Обе left ветви подтверждены actual same-GUID native readback, не отсутствующим XML атрибутом. Все 14 GUID настроены/исполнены/прочитаны; успешных execution операций 15, включая повторное исправленное excess на том же узле.

## Сохранённые выражения, формат и восстановление

```text
line_price_deviation = (billed_unit_price - agreed_unit_price) * billed_qty
line_price_problem = IFF(billed_unit_price <> agreed_unit_price, 1, 0)
accepted_qty = Int(NVLF(accepted_qty, 0))
billed_qty = Int(NVLF(billed_qty, 0))
price_deviation = NVLF(price_deviation, 0)
price_problem_lines = Int(NVLF(price_problem_lines, 0))
excess_billed_qty = IFF(NVLF(billed_qty, 0) > NVLF(accepted_qty, 0), NVLF(billed_qty, 0) - NVLF(accepted_qty, 0), 0)
```

Финальный formatter на price_deviation:

```text
Concat(Replace(Str(price_deviation), ",", ".", True), IF(Find(".", Replace(Str(price_deviation), ",", ".", True)) = 0, ".00", IF(Count(Replace(Str(price_deviation), ",", ".", True)) - Find(".", Replace(Str(price_deviation), ",", ".", True)) = 1, "0", "")))
```

Это реальное native string-выражение на рассчитанной денежной колонке, а не JavaScript/внешний расчёт или подстановка ответа. На frozen данных сохраняет 0/1/−0.5 и даёт 0.00/1.00/−0.50; иной диапазон точности этим эталоном не проверяется. В финальном native порту три string поля po_line_id/supplier_id/price_deviation и пять integer quantity/count полей. Численный comparator распознаёт денежный текст; его допуск не отменяет требования текстового формата result-table.

Authoring имеет одну реальную tool error: WIZARD_CALCULATOR_VALIDATION_FAILED из-за `!=`; исправлено на `<>` на том же GUID 7174a30a, без дополнительного калькулятора. Отдельный промежуточный NULL-excess после первоначального запуска исправлен явными NVLF операндов на GUID 2d571f44 до Save; итог сохраняет P03/P04/P05 excess=1/0/0. Эти события не скрыты нулевым errorcount: D provenance содержит фактические 48 tools, 44 Loginom и 1 tool error, 0 memory calls.

## Полная таблица и подтверждённые границы

Ровно 5 строк × 8 колонок, полный PO registry по po_line_id ASC, колонки сопоставляются по точным именам независимо от порядка. price_deviation записан не менее чем с двумя десятичными цифрами, включая нули; пять quantities/counts — целочисленным текстом, пустых ячеек нет. Абсолютный числовой допуск 0.001. Полный результат:

```csv
po_line_id;supplier_id;ordered_qty;accepted_qty;billed_qty;excess_billed_qty;price_deviation;price_problem_lines
P01;S1;10;5;6;1;0.00;2
P02;S1;4;4;2;0;1.00;1
P03;S2;3;0;1;1;-0.50;1
P04;S2;2;1;0;0;0.00;0
P05;S2;1;0;0;0;0.00;0
```

P01 два raw ценовых отклонения +6 и −6 дают 0.00, но problem_lines=2; сравнение billed=6 с ordered=10 скрывает реальный excess над accepted=5. P03 без приёмок сохраняется с accepted=0/excess=1. P04 без счетов и P05 без обоих фактов сохраняются с нулевыми мерами. Форматы денег и integer количества проверены по всем пяти/25 ячейкам, не по отдельному примеру.

Full original CSV и новый cold D1 совпали с независимым 5×8 oracle по именам и порядку; серверный LGP до/после неизменен. Все 14 узлов повторно выполнены через UI без мастеров/перенастройки/Save; пакет закрыт NoSave, подтверждены Home/logout/своя вкладка закрыта. Actual main close ACK=true/exit0, idle и отсутствие writer подтверждены отдельным native evidence до D1. В данной private подготовке live путь не повторялся.

D/B содержат собственные одинаковые runtime inputs/oracle/reference/SPEC/acceptance; B честно ссылается на shared accepted detailed reference без отдельной B CLI-сессии. Минимальная acceptance проверяет import/export, связность, путь, три input suffix и запрет JavaScript, без требования точного графа.

Private corpus готовит четыре реальные XML+CSV ошибки каждой формы: excess относительно ordered, problem count по итоговому net price, inner вместо полного PO-left к приёмкам, padding денежного текста до одного знака. Первые три ожидают численный oracle=false и свои предметные провалы; format-only ожидает oracle=true/result-table=false. Mutants не исполнялись в Loginom, live judge и независимые измерения pending.
