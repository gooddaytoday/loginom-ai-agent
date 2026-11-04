# Факторы себестоимости с категориальным условием

Эталон обучает аддитивную OLS-модель cost с константой, units, distance и отличием express от базового standard на всех восьми строках shipments.csv. Коэффициенты выражены в исходных единицах; express — условная добавка при одинаковых units и distance, без причинной интерпретации.

Вход: data/shipments.csv, UTF-8, разделитель `;`, поля id (строка), units/distance/cost (непрерывные числа), service_type (standard/express). id не является predictor. Независимый oracle использует CPython 3.12.3 и стандартную библиотеку fractions.Fraction: точные нормальные уравнения для фиксированного четырёхстолбцового дизайна [1,units,distance,express], без чтения пакета или экспорта Loginom.

Фактический reference содержит семь связанных native-узлов:

1. **Shipments source — TBGImportTextFile:** читает загруженный shipments.csv; CodePage=65001, DelimiterChar=`;`, DecimalSeparator=`.`. units/distance/cost имеют dkContinuous; id/service_type — dkDiscrete.
2. **Express indicator — TBGCalcData:** создаёт целое непрерывное express выражением `IFF(service_type = "express", 1, 0)`.
3. **OLS cost on units distance express — TBGLinRegressionEngine:** express/units/distance — utActive, cost — utPredicted. XML сохраняет AutoMethod=false, DetailedSettings=true, LinRegressionMethod=linregEnter. Verified native readback подтверждает intercept=true, norm_type=0 для трёх predictors и cost, denormalize=true, train/test/validation=100/0/0. XML: LearnValidationMethod=tpmNone, Teach=100/Test=0, TotalSamples/TotalSelectedSamples/TrainSamples=8, TestSamples/ValidationSamples=0; SSE=72. Пустой NormSettings не трактуется как доказательство default; RegressionModel.Normalized=true относится к сохранённой модели и не служит доказательством входной нормализации.
4. **Coefficient terms and row order — TBGCalcData:** получает именно ModelCoefficients/output1 с полями Name/cost_coefficients и фактической строкой `<Константа>`. term=`IF(Name = "<Константа>", "intercept", Name)`; term_order=`DecodeN(Name, "<Константа>", 0, "units", 1, "distance", 2, "express", 3, -1)`.
5. **Intercept units distance express order — TBGSortingEngine:** сортирует по term_order, LocaleAware=false. Направление по возрастанию подтверждено полным исходным и cold-rerun CSV; отдельный SortDirection в исходном XML отсутствует.
6. **Final term coefficient table — TBGReformColumnsEngine:** исключает term_order и Name, переименовывает cost_coefficients в coefficient; выход содержит только term/coefficient.
7. **Export final coefficients CSV — TBGExportTextFile:** экспортирует одну таблицу; CodePage=65001, CaptionType=ctUseColumnNames, DelimiterChar=`;`, DecimalSeparator=`.`. Строковый квалификатор двойная кавычка подтверждён configured native export readback; отдельный атрибут qualifier в XML отсутствует.

Связи идут последовательно 1→2→3(output1)→4→5→6→7. Прогнозный output0 регрессии не используется для итоговой таблицы. Имена/число узлов описывают этот reference; эквивалентные корректные native-композиции допустимы. Имена серверного пакета и CSV задаёт harness.

Полный результат (четыре строки в указанном порядке, колонки сопоставляются по именам, абсолютный допуск чисел 0.001):

```csv
term;coefficient
intercept;37.500000000000
units;4.250000000000
distance;0.800000000000
express;23.750000000000
```

Общий reference D/B получен в detailed CLI-сессии с авторской подсказкой; отдельной business авторской попытки не было. Подтверждены совпадение входа с data, полный исходный экспорт, browser cold rerun всех семи узлов с новым CSV и неизменным SHA серверного LGP. Происхождение и реальные проверки записаны в provenance.json; это не результат judge-калибровки или измерения качества модели. Saved-model scoring и holdout вне задачи.
