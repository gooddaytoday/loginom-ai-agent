# Почасовые потоки велосипедов по календарю станций

Reference рассчитывает отправления, прибытия и чистый приток по полному station_hours станций 412 и 516 за 3–4 января 2024 UTC. Каждый конец поездки относится к собственной станции и собственному календарному часу. Конец на внешней станции не удаляет допустимый другой конец и не создаёт строки вне календаря. Все 96 часов сохраняются; отсутствующие события дают 0, net_inflow=arrivals−departures.

## Источник и адаптация

[Oslo City Bike historical data](https://oslobysykkel.no/en/open-data/historical), [полный исходный CSV за январь 2024](https://data.urbansharing.com/oslobysykkel.no/trips/v1/2024/01.csv), получен 29.10.2026. Лицензия [NLOD 2.0](https://data.norge.no/nlod/en/2.0). Contains data under the Norwegian licence for Open Government data (NLOD) distributed by Oslo City Bike. Адаптация выполнена автором eval; поддержка адаптации со стороны владельца источника не заявляется. Полные source metadata, SHA исходного файла, selector и номера записей находятся в provenance.json.

Из 8 382 исходных записей выбраны девять: хотя бы одна станция конца принадлежит {412,516} и хотя бы один timestamp принадлежит [2024-01-03T00:00:00,2024-01-05T00:00:00) UTC. Порядок исходных записей сохранён. Поля started_at/start_station_id и ended_at/end_station_id переименованы в start_timestamp/start_station и end_timestamp/end_station. trip_id — технический OSLO202401-R плюс шестизначный номер исходной записи без заголовка, а не реальный ID поездки. Строковые station IDs не изменены.

Исходные timestamps имеют +00:00. Во frozen trips.csv они представлены как YYYY-MM-DDTHH:mm:ss в UTC: нулевой offset и дробные секунды удалены, без перевода в местное время. Год, месяц, день и час каждого конца сохранены. Во всех девяти поездках timestamp внутри выбранного интервала; внешние станции присутствуют. station_hours.csv — построенный календарь двух станций × 48 часов, а не измерение доступности станций. Источник исключает отмены и перемещения команды, публикует поездки от минуты в штатное время работы; вывод относится только к опубликованному срезу.

## Входы и независимый oracle

- data/trips.csv: 9 строк, trip_id;start_timestamp;start_station;end_timestamp;end_station.
- data/station_hours.csv: 96 уникальных station_id;calendar_timestamp, часовые начала выбранного интервала.

Оба CSV UTF-8 с разделителем `;`; станции и идентификаторы — строки, timestamps фиксированного ISO-формата без NULL. Native imports сохраняют timestamp как dtString. CPython 3.12.3 oracle использует stdlib csv, collections.defaultdict и datetime: отдельно разбирает собственное время каждого конца, накапливает события по station/hour, затем проходит полный календарь и вычисляет разность. Он не использует результаты Loginom. Полный ручной пересчёт frozen endpoints и отдельное blind B решение дали тот же 96×8 CSV.

## Фактический native-граф

В Unit_0/Unit.xml 12 прикладных native-узлов и 12 workflow-связей. Число узлов и композиция описывают reference; рубрика допускает эквивалентный native-путь.

| Узел | Компонент | Фактическая настройка |
| --- | --- | --- |
| Поездки | TBGImportTextFile | trips.csv, UTF-8/65001, `;`, decimal `.`; все пять полей dtString, импортировано 9 строк. |
| Календарь станций | TBGImportTextFile | station_hours.csv с тем же CSV-форматом; station_id и calendar_timestamp dtString, 96 строк. |
| Часы начала и завершения | TBGCalcData | start_year/month/day/hour и end_year/month/day/hour: отдельные Val(SubStr()) собственного timestamp, все dtInteger. |
| Календарные компоненты UTC | TBGCalcData | year/month/day/hour из calendar_timestamp теми же четырьмя срезами, все dtInteger. |
| Отправления по станциям и часам | TBGGroupDataEngine | start_station и четыре start_* компонента — ключи; gdCount(trip_id), mapping trip_id_Count → departures; 8 групп, integer count. |
| Прибытия по станциям и часам | TBGGroupDataEngine | end_station и четыре end_* компонента — ключи; gdCount(trip_id), mapping trip_id_Count → arrivals; 9 групп, integer count. |
| Календарь и отправления | TBGJoinDataEngine | Calendar слева, departures справа; left, include_joined_keys=false; station_id=start_station и все четыре компонента равны. Слева/справа string station и integer компоненты. Выход 96 строк. |
| Календарь и прибытия | TBGJoinDataEngine | Предыдущий результат слева, arrivals справа; left с пятью равенствами station_id/end_station и year/month/day/hour; include_joined_keys=false. Выход 96 строк. |
| Нули и чистый приток | TBGCalcData | Заменяет departures/arrivals на NVLF(...,0), вычисляет arrivals−departures; три dtInteger. |
| Восемь итоговых полей | TBGReformColumnsEngine | Исключён calendar_timestamp, сохранены station_id и семь integer полей результата. |
| Порядок станция год месяц день час | TBGSortingEngine | station_id,year,month,day,hour в этом порядке, все ASC; binary, LocaleAware=false; явно восемь выходных колонок. |
| Почасовые потоки велосипедов | TBGExportTextFile | Один *.result.csv, UTF-8/65001, `;`, decimal `.`, qualifier `"`, names header=1, BOM=false, NULL пустой. |

Связи: trips → компоненты → две группировки; calendar → компоненты и departures → первый join; первый join и arrivals → второй join → нули/net → reform → sort → export. Все ветви действительно подключены. Готовые счётчики не импортируются; JavaScript и внешних вычислительных узлов нет. Left, ASC и типы подтверждены actual native-readback на тех же GUID сохранённого пакета; отсутствующий атрибут XML не используется как доказательство default.

## Выражения и границы доказательства

Для каждого из start_timestamp, end_timestamp и calendar_timestamp native-выражения используют:

```text
year  = Val(SubStr(timestamp, 1, 4))
month = Val(SubStr(timestamp, 6, 2))
day   = Val(SubStr(timestamp, 9, 2))
hour  = Val(SubStr(timestamp, 12, 2))
departures = NVLF(departures, 0)
arrivals = NVLF(arrivals, 0)
net_inflow = NVLF(arrivals, 0) - NVLF(departures, 0)
```

Здесь timestamp — соответствующее фактическое поле, а start_/end_ префиксы выходов сохранены. Это эквивалентный native-расчёт компонентов на объявленных фиксированных UTC-строках. Все 18 trip и 96 calendar timestamps проверены на формат и совпадение с календарными компонентами. DateTime parsing и DateTime handler этим reference не проверены; неподдержанность DateTime не установлена.

События группируются до join по полному пятикомпонентному ключу, поэтому их кратность не перемножается. Оба left join сохраняют календарь; NULL факта превращается в ноль только после них. Reform/sort native outputs имеют station_id:string и year/month/day/hour/departures/arrivals/net_inflow:integer.

## Полный результат и проверки

Ровно 96 строк × 8 колонок: station_id;year;month;day;hour;departures;arrivals;net_inflow. Ключ station_id/year/month/day/hour уникален и отсортирован ASC, station_id сравнивается как строка без локали. Все семь числовых колонок целые, net может быть отрицательным; пустых ячеек нет. Полный ожидаемый CSV хранится в oracle.csv и дословно включён в checklist complete_result. Harness сопоставляет колонки по именам, числовые значения — с абсолютным допуском 0.01; все строки и порядок оцениваются.

В календарь попало 5 отправлений и 5 прибытий, 87 часов имеют три нуля. Переход суток поездки OSLO202401-R000434: отправление 412/03.01/23, прибытие 516/04.01/00. Поездка OSLO202401-R000710 прибывает на 516 в 20-м часу, начавшись на внешней станции в 19-м; два отправления OSLO202401-R000723 и R000725 попадают в 516/04.01/22, departures=2, net=−2. Эти пояснения не заменяют полную сверку CSV.

Авторский CSV и новый полный cold D1 CSV совпали с независимым oracle по всем 96×8 значениям и порядку; отдельно подтверждены 672 целочисленные ячейки. Все 12 узлов повторно выполнены через UI без мастеров и перенастройки, старый CSV припаркован. Пакет закрыт без сохранения, подтверждены Home/logout/закрытие своей вкладки; серверный LGP до/после неизменен. Acceptance задаёт import/export, связность, путь import→export, оба input suffix и запрет JavaScript, без точного графа для агента.

D/B self-contained формы имеют общие inputs/oracle/reference/SPEC/acceptance и rubric. B использует принятый detailed reference с честным shared provenance; отдельной business CLI-попытки нет. Offline corpus каждой формы содержит три XML+CSV near-miss: прибытия по дате/часу отправления, inner join отправлений вместо сохранения календаря и обратный знак net. Все три ожидают oracle=false и провал своего предметного пункта плюс complete_result. Mutants подготовлены офлайн и не исполнялись в Loginom; живой judge и независимые D/B измерения остаются отдельными pending этапами.
