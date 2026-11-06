# Посещаемость и сверхурочные по ежедневному графику

Reference считает показатели по полному календарю сотрудников за 2025-12-30…2026-01-02. Каждая запись работы относится к календарному дню собственного timestamp, несколько записей сотрудника за день суммируются. Присутствие и отсутствие определяются только на плановых днях. Вся работа учитывается в минутах, включая дни нулевого плана; сверхурочные — сумма положительных дневных превышений, без погашения недоработками других дней.

Синтетические входы: data/employee_calendar.csv — 8 уникальных employee_id/date с planned_minutes; data/work_logs.csv — 8 записей log_id/employee_id/timestamp/worked_minutes. Оба CSV: UTF-8, разделитель ;, десятичная точка. ID — строки, минуты — неотрицательные целые без NULL. date имеет формат YYYY-MM-DD и означает полночь, timestamp — YYYY-MM-DDTHH:mm:ss. Одна гражданская календарная шкала без Z/offset и перевода часовых поясов. Native-наблюдения дают local_datetime с timezone=unspecified; отдельная конвертация зоны этим reference не проверяется.

Независимый oracle использует CPython 3.12.3 и стандартные csv, collections.defaultdict, datetime. Он разбирает timestamp, группирует минуты по employee/day, проходит полный employee_calendar и суммирует дневные показатели по employee/month. Oracle не использует Loginom outputs; промежуточного округления нет.

## Фактический граф

Unit_0/Unit.xml содержит 10 прикладных native-узлов и 9 workflow-связей. Пустой служебный узел переменных не участвует в вычислениях. Имена, количество и композиция описывают reference; рубрика допускает эквивалентный native-сценарий.

| Узел | Компонент | Фактическая настройка |
| --- | --- | --- |
| Календарь сотрудников | TBGImportTextFile | employee_calendar.csv, CodePage=65001, DelimiterChar=;, DecimalSeparator=.; employee_id — dtString/discrete, date — dtDateTime, planned_minutes — dtInteger. |
| Логи работы | TBGImportTextFile | work_logs.csv с тем же CSV-форматом; log_id/employee_id — dtString/discrete, timestamp — dtDateTime, worked_minutes — dtInteger. |
| Календарный день записи | TBGCalcData | work_date — dtDateTime через EncodeDate(Year(timestamp), Month(timestamp), Day(timestamp)). |
| Сумма работы за день | TBGGroupDataEngine | employee_id/work_date — ключи, SUM(worked_minutes), mapping worked_minutes_Sum → logged_minutes. Native Group выдаёт logged_minutes как real/dtFloat. |
| Календарь и дневная работа | TBGJoinDataEngine | Календарь слева, дневной Group справа; employee_id=employee_id и date=work_date, string/DateTime ключи, case-sensitive, без повторных joined keys. Left подтверждён native-readback и полными 8 строками. |
| Дневные показатели | TBGCalcData | month — dtString через DateToStr(date,"YYYY-MM"); worked_minutes и три дневных счётчика, overtime_minutes — dtInteger; точные выражения ниже. |
| Итоги по сотруднику и месяцу | TBGGroupDataEngine | employee_id/month — строковые ключи; SUM шести уже рассчитанных дневных мер. Native выход — 4 строки, шесть real сумм. |
| Целые дни и минуты | TBGReformColumnsEngine | Все шесть мер преобразованы в dtInteger; XML TBGReformColumnDefExtension с ChangedInfo=fpDataType. Два строковых ключа сохраняются. |
| Порядок сотрудник и месяц | TBGSortingEngine | employee_id ASC, затем month ASC, без локали (LocaleAware=false); направление и autosync=false подтверждены native-readback. В выходе явно заданы 8 колонок. |
| Итоговый CSV | TBGExportTextFile | Один *.result.csv, CodePage=65001, DelimiterChar=;, CaptionType=ctUseColumnNames, DecimalSeparator=., ValueNull пустой. Вход — два string ключа и шесть integer мер. |

Связи: логи → календарный день → дневной Group; календарь и Group → left join → дневные показатели → месячный Group → integer reform → сортировка → экспорт. Готовый ответ не импортируется, JavaScript и внешних вычислительных узлов нет. Отсутствующий в XML атрибут join-режима не используется как доказательство default: left наблюдался в реальной настройке и результате.

## Фактические выражения и типы

```text
work_date = EncodeDate(Year(timestamp), Month(timestamp), Day(timestamp))
month = DateToStr(date, "YYYY-MM")
worked_minutes = NVLF(logged_minutes, 0)
planned_days = IFF(planned_minutes > 0, 1, 0)
attended_days = IFF((planned_minutes > 0) AND (NVLF(logged_minutes, 0) > 0), 1, 0)
absent_days = IFF((planned_minutes > 0) AND (NVLF(logged_minutes, 0) = 0), 1, 0)
overtime_minutes = IFF(NVLF(logged_minutes, 0) > planned_minutes, NVLF(logged_minutes, 0) - planned_minutes, 0)
```

EncodeDate создаёт полночь собственной календарной даты, в том числе для 00:00:00, 23:59:59 и перехода года. Полные native-порты подтвердили все восемь исходных строк и восемь work_date; это отдельное доказательство P20. Дневной Group даёт пять ключей: E_A/12-30=540, E_A/12-31=420, E_A/01-01=90, E_B/01-01=0, E_B/01-02=540. Год этих дат определяется входом, месяц результата сохраняет год.

Left join сохраняет все 8 календарных строк. logged_minutes=NULL только для E_B/2025-12-30, E_B/2025-12-31 и E_A/2026-01-02; нулевая запись E_B/2026-01-01 остаётся числом 0. NVLF превращает отсутствие факта в ноль только в контексте полного календаря. E_A/2026-01-01 с нулевым планом имеет work=90 и overtime=90, но planned/attended/absent=0/0/0. Нулевой лог в плановом дне даёт отсутствие.

Положительная часть вычисляется до месячной суммы: E_A/2025-12 имеет plan=work=960, но overtime=60, поскольку дневная недоработка −60 не погашает excess +60. Месячные счётчики сохраняют planned_days=attended_days+absent_days. Group возвращает real суммы; Reform и Sort реально выдают 2 string + 6 integer колонок, а не восемь integer. Полные выходы подтверждены native-readback, динамические колонки не выводились из пустых XML ColumnDefs.

## Полный результат и проверенные границы

Ровно 4 строки × 8 колонок, ключ employee_id/month ASC, строки без локали и с учётом регистра. CSV UTF-8, разделитель ;, заголовки имён, десятичная точка, month строго YYYY-MM. Все шесть мер записаны целыми числами. Колонки сверяются по именам независимо от их порядка; числа — с абсолютным допуском 0.01. Весь результат:

```csv
employee_id;month;planned_days;attended_days;absent_days;planned_minutes;worked_minutes;overtime_minutes
E_A;2025-12;2;2;0;960;960;60
E_A;2026-01;1;0;1;480;90;90
E_B;2025-12;1;0;1;480;0;0
E_B;2026-01;2;1;1;960;540;60
```

Полные CSV авторской попытки и нового blind cold rerun совпали с независимым oracle. Все 10 узлов выполнены повторно через UI без мастеров и перенастройки; старый CSV заранее припаркован, новый полный CSV проверен отдельно. Пакет закрыт без сохранения, выполнен logout, собственная вкладка закрыта; фактический серверный LGP до/после одинаков. Форматы шести integer мер и YYYY-MM проверены дополнительно. Acceptance задаёт только два типа импорт/экспорт, связность, путь import→export и два input suffixes, без требования точного графа к агенту.

Detailed и business используют один принятый detailed reference, этот SPEC и одинаковые данные/oracle/acceptance. Отдельной business CLI-попытки нет; shared provenance B ссылается на D. Offline-корпус содержит ровно три XML+CSV near-miss каждой формы: timestamp вместо дня, подписанный дневной excess вместо положительной части и attendance без условия положительного плана. Их численные oracle-исходы — false/false/false. Drop-calendar/inner join и другие ловушки не объявляются judge-покрытыми этим корпусом. Подготовка мутантов не является native-исполнением; живой judge и независимые измерения — отдельные этапы.
