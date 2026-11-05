# P27. Противоречия в тарифном справочнике

> Сведения о локальном окружении обезличены. Приватные подтверждения, упомянутые в документе, не включены в репозиторий.

Назначение: отделить повторные копии одного тарифа от нескольких содержаний на ключ и оценить масштаб конфликтов по поставщику.

## Происхождение и вход

Обе формы используют один принятый reference третьей авторской CLI-попытки detailed. Отдельная авторская сборка business не выполнялась. Описание основано на единственном сохранённом `Unit_0/Unit.xml`: семь native-узлов, шесть последовательных связей. Уже выполненный независимый blind browser D1 прошёл все семь узлов без перенастройки и Save; оператор отдельно подтвердил неизменность фактического серверного LGP и совпадение нового полного CSV с oracle. Judge и измерения учитываются отдельно.

`data/tariffs.csv` — 33 синтетические строки: `row_id,supplier,service,currency,price,source_tag`, без пропусков и NULL. UTF-8, заголовок, разделитель `,`, десятичная точка. `price` импортируется как `dtFloat`/`dkContinuous`; остальные поля — `dtString`/`dkDiscrete`. Ключ тарифа — точная пара supplier/service; содержание — currency/price. row_id/source_tag в сравнение не входят.

## Фактическая цепочка

1. **Исходные тарифы — `TBGImportTextFile`.** Входной путь `PRIVATE_STORAGE`; `CodePage=65001`, `DelimiterChar=,`, `DecimalSeparator=.`, пустой `ValueNull`; шесть перечисленных полей.
2. **Варианты тарифов и кратность — `TBGGroupDataEngine`.** Измерения `supplier,service,currency,price` с порядками 0–3; `row_id` — значение `gdCount`; `source_tag` не используется. Явный выходной mapping `row_id_Count` → `variant_rows`; измерения передаются дальше. Каждое сочетание содержания сохраняет число всех его исходных копий.
3. **Варианты и исходные строки ключа — `TBGGroupDataEngine`.** Измерения `supplier,service`; для `variant_rows` заданы `gdSum gdCount`. Mappings: `variant_rows_Count` → `content_variants`, `variant_rows_Sum` → `key_rows`; supplier/service сохраняются. Одна выходная строка соответствует одному тарифному ключу.
4. **Конфликтность ключей с кратностью — `TBGCalcData`.** Поля `dtInteger`: `is_consistent=IFF(content_variants = 1, 1, 0)`, `is_conflicting=IFF(content_variants > 1, 1, 0)`, `conflict_rows=IFF(content_variants > 1, key_rows, 0)`. В последнем выражении используется полная исходная кратность, а не число вариантов.
5. **Масштаб конфликтов по поставщикам — `TBGGroupDataEngine`.** Измерение `supplier`; `service` агрегируется `gdCount`, три поля калькулятора — `gdSum`. Mappings: `service_Count` → `tariff_keys`, `is_consistent_Sum` → `consistent_keys`, `is_conflicting_Sum` → `conflicting_keys`, `conflict_rows_Sum` → `rows_in_conflicting_keys`.
6. **Итог по поставщикам по возрастанию — `TBGSortingEngine`.** `SortingColumns` содержит supplier, `LocaleAware=false`; отдельного атрибута направления нет. Сохранённые CLI/D1 CSV подтверждают порядок по возрастанию. Выходные mappings сохраняют пять итоговых полей.
7. **Итоговый CSV масштаба конфликтов — `TBGExportTextFile`.** Один `*.result.csv`; `CodePage=65001`, `CaptionType=ctUseColumnNames`, `DelimiterChar=;`, `DecimalSeparator=.`, пустой `ValueNull`. Атрибут строкового квалификатора в XML не записан.

Все шесть связей передают табличные данные строго в указанной последовательности. Это один допустимый путь через штатные группировки без JavaScript; эквивалентные native-композиции принимаются без требования к именам, числу узлов или внутреннему графу. Имена пакета и выгрузки задаёт harness.

## Ожидаемый результат

Ровно одна строка на каждого supplier по возрастанию; ровно пять колонок `supplier,tariff_keys,consistent_keys,conflicting_keys,rows_in_conflicting_keys`. Число ключей — distinct supplier/service; один вариант currency/price означает consistent, несколько — conflicting. Повторы одного содержания безвредны. В rows_in_conflicting_keys входят все исходные строки конфликтных ключей с полной кратностью. Все поставщики сохраняются, включая не имеющих конфликтов; consistent_keys + conflicting_keys = tariff_keys.

Один CSV UTF-8 с заголовками, разделителем `;`, строковым квалификатором `"`, десятичной точкой и без разделителей тысяч. Источник полного ожидаемого результата — `oracle.csv`. Сравниваются все строки и поля: точные имена колонок, состав и порядок строк, текст; числа — с абсолютным допуском `0.001`. Порядок колонок не оценивается; лишние, пропущенные и повторяющиеся колонки запрещены.
