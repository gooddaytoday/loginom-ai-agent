# Баланс складских остатков

Reference сверяет полный начальный реестр пар sku/warehouse с движениями и полным фактическим пересчётом. Расход уменьшает учётный остаток; оба отклонения сохраняют знак. Один SKU разных складов не объединяется, пара без движений остаётся в результате с нулевыми received_qty/issued_qty.

## Данные и независимый oracle

Исходные данные оригинальные синтетические, подготовлены автором eval и заморожены до gold: data/opening_stock.csv — три уникальные пары sku/warehouse с opening_qty/unit_cost; data/movements.csv — три уникальных movement_id с парой, направлением in/out и строго положительным qty; data/physical_count.csv — полный уникальный пересчёт каждой пары. NULL и дополнительных пар нет. Внешний dataset или готовый пакет не заимствовались; отдельной лицензии внешнего источника нет, лицензия репозитория MIT. Эти данные не объявляются реальным складским учётом.

Одна единица количества и одна денежная единица без налогов. Стоимость единицы фиксирована для своей пары, вход unit_cost имеет ровно два знака; FIFO и средневзвешенная оценка не требуются. CSV UTF-8, разделитель ;, заголовки имён, десятичная точка, двойная кавычка как текстовый ограничитель. Все входные количества целые.

Независимый oracle: фактический CPython 3.12.3, stdlib csv/decimal.Decimal. Он читает только raw inputs, ведёт отдельные приход/расход для каждой пары полного реестра, затем вычисляет expected=initial+received-issued, difference=counted-expected и value=difference*unit_cost. Итерация полного реестра отсортирована по двум ключам. Никакие Loginom output, reference или SPEC в расчёте не используются. Полный независимый ручной ledger всех 3×9 значений и контроль общего баланса выполнены после freeze до authoring; raw bytes после gold не менялись.

## Фактический native-граф

Unit_0/Unit.xml содержит 13 прикладных native nodes и 12 workflow links. Эти имена, GUID и композиция описывают reference, а не дополнительные условия приёмки иных корректных native решений.

- Начальные остатки (109624ed-3162-494d-86ef-264d9e2f32a6): TBGImportTextFile, opening_stock.csv; sku/warehouse строковые, opening_qty integer, unit_cost float.
- Движения (9ea0874d-313b-46c1-89ea-6bc96483cfc9): TBGImportTextFile, movements.csv; movement_id/sku/warehouse/direction строковые, qty integer.
- Пересчёт (6ed5ad10-d04e-4338-90eb-742619e5274f): TBGImportTextFile, physical_count.csv; sku/warehouse строковые, counted_qty integer. Все три импорта UTF-8/65001, ;, decimal .
- Приход и расход (4c4de325-494a-4183-b0d6-6ad8de47d8d9): TBGCalcData, received_qty=IFF(direction = "in", qty, 0), issued_qty=IFF(direction = "out", qty, 0).
- Обороты по складам (4c8c8ef8-6310-40ba-8864-b6e6d59cce4d): TBGGroupDataEngine, gdSum received_qty/issued_qty по sku и warehouse.
- Реестр и обороты (a44b7c9b-c453-4c04-8a88-99de26cf9a30): TBGJoinDataEngine, весь opening_stock main → aggregated movements joined, left по обоим ключам, case_sensitive=true, include_joined_keys=false. XML содержит оба ключа; mode=left подтверждён native configuration readback, а не выведен только из отсутствующего JoinType.
- Нулевые обороты (849c58b1-f6e5-4dbb-8080-702738986c46): TBGCalcData, received_qty=Int(NVLF(received_qty, 0)), issued_qty=Int(NVLF(issued_qty, 0)); целые суммы без движений становятся нулями.
- Баланс и пересчёт (0b6f8484-0617-45ff-85ea-570d028e53b5): TBGJoinDataEngine, полный ledger main → physical_count joined, left по sku/warehouse, case_sensitive=true, include_joined_keys=false. Стоимость и opening остаются от своей пары реестра.
- Отклонения (4e20ff67-57e3-41eb-bf7c-33f9374a35b3): TBGCalcData, expected_qty=opening_qty+received_qty-issued_qty, quantity_deviation=counted_qty-expected_qty, value_deviation=quantity_deviation*unit_cost.
- Денежный формат (227dc2c3-e82d-4d5a-964c-d874c4545f92): TBGCalcData, money_cents=Round(Abs(value_deviation)*100,0), затем Concat(IF(value_deviation < 0, "-", ""), Str(Div(money_cents,100)), ".", StrZero(Mod(money_cents,100),2)). Abs используется лишь для целых центов, знак восстанавливается из исходного value_deviation. При целых количествах и двухзнаковой цене все результаты точны в центах; Round относится только к финальному представлению, не промежуточному расчёту.
- Девять полей отчёта (a2e83bb2-913d-4495-aeae-1ab9e91c484c): TBGReformColumnsEngine исключает unit_cost/money_cents и оставляет ровно девять требуемых полей.
- Сортировка товара и склада (5d54299c-7361-48ae-acba-005d277d0736): TBGSortingEngine, sku ASC, затем warehouse ASC, без locale comparison.
- Итоговый CSV (8b4ec41d-776f-40d7-879a-f6f51ec534bc): TBGExportTextFile, один result.csv, UTF-8/65001, delimiter ;, header names, decimal .; двойная кавычка подтверждена native readback, поскольку default qualifier отдельно не сериализован.

Все три импорта связаны с итоговым экспортом. Готовая итоговая таблица в граф не подставлена, JavaScript не заменяет расчёт. В финальном порту sku/warehouse/value_deviation строковые, шесть quantity fields integer. Минимальный acceptance проверяет import/export, связность, путь и три input suffix; штатная rubric требует native расчёт и принимает эквивалентную композицию без точного числа/имён узлов.

## Полный результат и проверенные границы

Ровно 3 строки × 9 колонок, одна строка каждой исходной пары, порядок sku/warehouse ASC. Колонки сопоставляются по именам независимо от порядка, все значения сверяются. Шесть quantities каждой строки записаны целым текстом, value_deviation имеет не менее двух цифр после точки, включая нулевые значения; пустых ячеек нет. Абсолютный числовой допуск 0.001 не отменяет текстовый формат result-table.

```csv
sku;warehouse;opening_qty;received_qty;issued_qty;expected_qty;counted_qty;quantity_deviation;value_deviation
A;W1;10;4;3;11;10;-1;-2.50
A;W2;20;0;5;15;17;2;6.00
B;W1;7;0;0;7;8;1;1.20
```

A/W1: 10+4−3=11, counted=10, difference=−1, value=−2.50. A/W2: 20+0−5=15, counted=17, difference=2, value=6.00; склады одного SKU и цены 2.50/3.00 различимы. B/W1 не имеет movements, сохраняется с expected=7/count=8/difference=1/value=1.20. Общий expected=37+4−8=33; counted=35, сумма quantity_deviation=2; сумма value_deviation=4.70. В frozen данных нет нулевого денежного отклонения: formatter явно формирует .00 для нуля, но отдельного zero-output witness эта таблица не содержит.

Authoring A1/3 завершён CLI exit0, session DB подтвердила openai/gpt-6-sol/xhigh: 47 tools, 40 Loginom calls, 1 tool error, 0 memory calls. Первый dock_prepare вернул LOGINOM_CONNECTION_NOT_READY; последующие 13 native execution receipts SUCCEEDED. После Save persisted reopen не заявлялся в A1; arrangement=result_unconfirmed не выдан за подтверждение размещения. Отдельные Main close ACK/exit0, package closed/logout и idle/writer absence подтверждены собственными receipts.

Root cold D1 повторно открыл сохранённый пакет и выполнил все 13 node BODY→F9 без изменения настройки/Save; новый полный 3×9 CSV совпал с oracle, проверены все 27 ячеек, 18 integer cells, 3 money cells≥2dec, max_numeric_error=0. Серверный LGP после logout побайтно неизменен; своя вкладка закрыта, profile idle/writer absent. Root знал oracle: это не blind D1. Парковка прежнего CSV была одна и успешна; после неё вспомогательный JSON parse не отменил эффект, первая collection без explicit env остановилась до collection, исправленный collector отработал один раз. Эти вспомогательные ошибки не скрывают и не добавляют native попыток.

D/B имеют собственные одинаковые frozen inputs/oracle/acceptance/reference/SPEC; B использует shared accepted detailed reference без отдельной business authoring attempt. Новые CLI/model/Loginom/browser операции при offline финализации не выполняются; существующий finalizer использует только read-only CLI --version.

Calibration corpus каждой формы содержит четыре genuine XML+raw-recipe+full-CSV near-miss: расход прибавлен; первый registry-left заменён inner и теряет B/W1; signed difference заменён Abs; минимальная ширина остатка копеек уменьшена 2→1. Первые три имеют numeric oracle=false и предметные expected_failed; последняя меняет только 6.00→6.0, оставляет −2.50/1.20 и numeric oracle=true, но result-table=false по одной форматной ячейке. Mutants не исполнялись в Loginom; live judge calibration и отдельные измерения pending.
