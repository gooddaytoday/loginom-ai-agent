# P05. Транспортный счёт по весу отправления и тарифу

> Сведения о локальном окружении обезличены. Приватные подтверждения, упомянутые в документе, не включены в репозиторий.

Назначение: проверить счета всех отправлений по суммарному весу и составному договорному тарифу, сохранив неизвестную оценку отдельно от известной нулевой цены.

## Происхождение и входы

Обе формы используют один принятый reference первой авторской CLI-попытки detailed. Отдельная авторская сборка business не выполнялась. Описание основано на сохранённом `Unit_0/Unit.xml`: 15 native-узлов, 14 связей. Независимый blind browser D1 выполнил все 15 узлов без перенастройки и Save; оператор отдельно подтвердил неизменность фактического серверного LGP и совпадение нового полного CSV с oracle. Judge и независимые измерения учитываются отдельно.

Четыре синтетических входа UTF-8 с заголовками, разделителем `;`, квалификатором `"` и десятичной точкой:

- `data/shipments.csv`: 7 строк полного реестра, `shipment_id,route,tariff_code`.
- `data/packages.csv`: 12 упаковок, `package_id,shipment_id,weight_kg`; у каждого отправления есть вес в килограммах.
- `data/tariffs.csv`: 4 строки, `route,tariff_code,fixed_fee,price_per_kg`; составная пара route/tariff_code уникальна, R3/FREE — существующий нулевой тариф.
- `data/carrier_bills.csv`: 7 счетов, `bill_id,shipment_id,amount`; S06/S07 не имеют счетов.

Идентификаторы и ключи импортируются как `dtString`, вес и денежные величины — `dtFloat`. Сохранённые пути импортов `PRIVATE_STORAGE<basename>` соответствуют входам; загруженные файлы совпали с `data/`. Параметры left join, сравнения ключей и квалификатора подтверждены успешным native readback; отсутствие атрибута в XML само по себе не служит доказательством default.

## Фактические узлы и связи

1. **Реестр отправлений — `TBGImportTextFile`.** Читает shipments.csv; `CodePage=65001`, `DelimiterChar=;`, `DecimalSeparator=.`, пустой `ValueNull`.
2. **Packages — `TBGImportTextFile`.** Читает packages.csv с теми же параметрами CSV.
3. **Tariffs — `TBGImportTextFile`.** Читает tariffs.csv с теми же параметрами CSV.
4. **CarrierBills — `TBGImportTextFile`.** Читает carrier_bills.csv с теми же параметрами CSV.
5. **ShipmentWeight — `TBGGroupDataEngine`.** Из Packages: shipment_id — `utGroup`, weight_kg — `utValue`/`gdSum`; mapping weight_kg_Sum → weight_kg.
6. **ShipmentBills — `TBGGroupDataEngine`.** Независимо из CarrierBills: shipment_id — `utGroup`, amount — `utValue`/`gdSum`; mapping amount_Sum → actual_bill. Раздельные агрегаты исключают размножение упаковок и счетов.
7. **RegisterWeight — `TBGJoinDataEngine`.** Left join полного реестра с ShipmentWeight по shipment_id. Ключи сравниваются с учётом регистра; правые ключи не дублируются.
8. **RegisterBills — `TBGJoinDataEngine`.** Left join RegisterWeight с ShipmentBills по shipment_id с теми же правилами; сохраняет отправления без счетов.
9. **TariffPresence — `TBGCalcData`.** Из Tariffs вычисляет `tariff_marker` (`dtInteger`) выражением `1` для каждой реальной строки lookup. Это признак наличия строки тарифа, а не готовый результат; нулевая цена не уничтожает маркер.
10. **RegisterTariffs — `TBGJoinDataEngine`.** Left join RegisterBills с TariffPresence одновременно по route и tariff_code, с учётом регистра и без повторения правых ключей. Отсутствующий тариф даёт native NULL маркера и тарифных полей.
11. **FreightAudit — `TBGCalcData`.** `tariff_found=NVLF(tariff_marker, 0)`; `expected_cost=IFF(IsNull(tariff_marker), Null, fixed_fee + weight_kg * price_per_kg)`; `actual_bill=NVLF(actual_bill, 0)` заменяет исходное поле; `deviation=IFF(IsNull(tariff_marker), Null, NVLF(actual_bill, 0) - (fixed_fee + weight_kg * price_per_kg))`. Единственная fixed_fee начисляется после суммы веса. Денежные поля здесь числовые, без промежуточного округления.
12. **ResultFields — `TBGReformColumnsEngine`.** Исключает route, tariff_code, tariff_marker, fixed_fee, price_per_kg и оставляет шесть итоговых полей.
13. **ResultByShipment — `TBGSortingEngine`.** shipment_id ASC, case-sensitive binary comparison, `LocaleAware=false`; порядок подтверждён readback и обоими полными CSV.
14. **CSVDecimal2 — `TBGCalcData`.** Только на выходе преобразует expected_cost, actual_bill, deviation в строки с двумя десятичными знаками. Каждая формула сохраняет `IF(IsNull(field), Null, ...)`, отдельно знак, округляет Abs(field) × 100 и формирует целую/дробную части через Str/StrZero с padding=2. Неизвестная числовая оценка остаётся NULL вплоть до экспорта.
15. **ResultCSV — `TBGExportTextFile`.** Один `<name>.result.csv`: UTF-8 без BOM, Unix LF, заголовок имён полей, `;`, квалификатор `"`, десятичная точка, пустой null_marker. Сохранённый XML имеет `CodePage=65001`, `CaptionType=ctUseColumnNames`, `DelimiterChar=;`, `DecimalSeparator=.`, пустой `ValueNull`; остальные параметры подтверждены итоговым native readback.

Связи: Packages → ShipmentWeight; CarrierBills → ShipmentBills; Реестр отправлений + ShipmentWeight → RegisterWeight; RegisterWeight + ShipmentBills → RegisterBills; Tariffs → TariffPresence; RegisterBills + TariffPresence → RegisterTariffs → FreightAudit → ResultFields → ResultByShipment → CSVDecimal2 → ResultCSV. Все четыре входа достигают экспорта. JavaScript, готовых строк результата и подставленных агрегатов нет. Это один допустимый native-путь: имена, число узлов и внутренний граф не являются критериями принятия эквивалентного решения.

В авторской попытке сохранена одна ошибка `join-tariffs`: NOT_APPLIED, effect_possible=false, cleanup_complete=true, узел не создан. Причина — конфликт имён выходных полей ключей. После отдельной ветви TariffPresence успешная marked-branch завершила тарифное соединение; ошибочная операция не объявляется успехом или отсутствием ошибок.

## Ожидаемый результат и границы проверки

Полный `oracle.csv` содержит 7 строк S01–S07 по shipment_id и 6 колонок `shipment_id,weight_kg,tariff_found,expected_cost,actual_bill,deviation`. Вес — сумма всех упаковок, счёт — независимая сумма всех счетов; отсутствующий счёт даёт ноль. При найденном тарифе expected_cost включает одну fixed_fee и весь вес по price_per_kg; deviation = actual_bill − expected_cost. S04/S07 имеют tariff_found=0 и пустые expected_cost/deviation; у S05 известный R3/FREE даёт tariff_found=1 и expected_cost=0.00. S06 сохраняет actual_bill=0.00 и deviation=-26.00.

CSV UTF-8 с заголовками, `;`, квалификатором `"`, десятичной точкой и без разделителей тысяч. Все непустые денежные значения имеют не менее двух десятичных знаков; неизвестные — пустые ячейки. Сравниваются все строки и поля: точные имена колонок, состав и порядок строк, текст; числа — с абсолютным допуском 0.01. Порядок колонок не оценивается; лишние, пропущенные и повторяющиеся колонки запрещены. Oracle независимо рассчитан CPython/stdlib Decimal из четырёх входов, без чтения графа или выгрузки.

Четыре XML+CSV near-miss каждой формы проверяют удвоенную fixed_fee, ошибочный признак наличия по положительной цене, замену NULL нулём только при экспорте и один десятичный знак денежных полей. Последний сохраняет численные значения данного fixture, поэтому numeric oracle проходит, а обязательный result-full нарушен. Подготовка корпуса не исполняет native-мутанты и не доказывает judge-покрытие прочих ловушек; live-калибровка и измерения остаются отдельными gates.
