# Активация в календарный месяц регистрации

Reference построен в Authoring A1 и прошёл независимый native audit APPROVE и cold D1. Пакет реализует полный eligible-реестр, distinct user coverage и долю активации по завершённым месяцам регистрации. Live calibration и независимые D/B measurements остаются pending.

Задача считает полный eligible-реестр пользователей завершённых месяцев регистрации на snapshot_at=2026-03-01T00:00:00. Допустимы события в [signup_timestamp, начало следующего месяца). Каждый пользователь учитывается один раз в каждом из трёх действий; activated требует create_project, invite_member и export, независимо от порядка. Повтор одного действия не заменяет отсутствующее. Доля activated/users использует всех eligible users, включая не имеющих событий.

## Данные и независимое ожидаемое значение

Синтетические data/users.csv — 7 user_id/signup_timestamp; data/events.csv — 18 event_id/user_id/event_timestamp/event_type. IDs строковые, event_type — исходные create_project/invite_member/export, производных flags нет. Все ссылки существуют, NULL нет. CSV UTF-8, `;`, имена колонок в заголовке, qualifier `"`. Физический порядок событий намеренно не хронологический и не определяет активацию.

Timestamps — гражданская календарная шкала, фиксированный YYYY-MM-DDTHH:mm:ss без offset/Z/fractions. Никакая timezone conversion не требуется, UTC данным не приписывается. Следующий месяц учитывает год; eligible означает next_month<=snapshot. Декабрь 2025, январь и февраль 2026 завершены, март 2026 не завершён.

Raw-only oracle использует Python stdlib datetime/set/csv и Decimal для доли: определяет собственный next_month пользователя, собирает множества допустимых действий, затем проходит полный eligible users и группирует по YYYY-MM. Loginom/reference/export не источники gold. Полный независимый ручной разбор: U01 активирован в регистрации; U02 два create и export без invite; U03 export ровно на next_month исключён; U04 все три в любом порядке; U05 pre-signup create исключён; U06 без событий в основании; U07 незавершённый март исключён.

## Фактический сохранённый граф A1

Unit_0/Unit.xml содержит 16 native nodes/16 workflow links. Ни имена, ни число узлов, ни эта композиция не навязываются решению агента; штатный эквивалентный путь допускается rubric.

| Узел | GUID | Компонент и сохранённая настройка |
| --- | --- | --- |
| Реестр пользователей | 53bbc905-0390-45d2-953b-aac8fa5ca4ee | TBGImportTextFile, users.csv, оба поля dtString, UTF-8/65001, `;`. |
| События | d74b68ae-cb55-40f7-9234-468ff6577681 | TBGImportTextFile, events.csv, все четыре поля dtString с тем же CSV-форматом. |
| Календарь регистрации | f4bb7b17-7525-4bb2-b7ba-e5250298c56e | TBGCalcData: signup_dt=ISO8601ToDate(signup_timestamp):dtDateTime; next_month=AddMonth(StartOfTheMonth(signup_dt),1):dtDateTime; signup_month=DateToStr(signup_dt,"YYYY-MM"):dtString. |
| Завершённые месяцы | 40a0108f-31b6-442a-991c-0260d43473c8 | TBGFilterDataEngine, next_month frtLessOrEqual 2026-03-01T00:00:00, comparison vrtDate. |
| События и регистрации | 27915990-21b2-480b-ab29-c700c111a385 | TBGJoinDataEngine, inner/JoinType=jtJoin по string user_id; eligible registration main, events joined; режим и ориентация подтверждены actual readback, 15 событий U01–U05. |
| Интервал действия | 63f033ad-f9bc-4c3c-9005-eb499abbf324 | TBGCalcData: event_dt=ISO8601ToDate(event_timestamp):dtDateTime; in_signup_month=IFF(event_dt>=signup_dt and event_dt<next_month,1,0):dtInteger. |
| Допустимые действия | 927d469e-4e89-4132-a544-818b5fc51d04 | TBGFilterDataEngine, in_signup_month frtEqual 1. |
| Признаки действий | caf62a57-81a5-4458-ad5e-1326b2f543ca | TBGCalcData: did_create/did_invite/did_export — три integer IFF по точным event_type. |
| Охват по пользователю | 3b914b99-a1c5-4c38-91c3-aa8928cb932b | TBGGroupDataEngine по user_id, gdMax трёх flags; mapping did_create_Max/did_invite_Max/did_export_Max → has_create/has_invite/has_export. |
| Полное основание | 7a48dc4f-e5a7-4561-b7b0-6a44f75b145d | TBGJoinDataEngine, полный eligible users main и user coverage joined по user_id. Actual readback left, include_joined_keys=false, 6 строк; U06 сохранён с NULL has_*. Отсутствие JoinType в XML не используется как доказательство режима. |
| Активация пользователя | f78b3102-fad2-4d57-8a7f-06f8c030bb23 | TBGCalcData: NVLF трёх has_* в нули; fully_activated=IFF(created_project=1 and invited_member=1 and exported=1,1,0). |
| Сводка по месяцу | 1089198b-6b79-4052-9fd2-b654f2a62870 | TBGGroupDataEngine по signup_month, gdCount(user_id) → users, четыре gdSum → created_project/invited_member/exported/activated. |
| Целые счётчики | efaa30ea-4a2e-4ecb-ac79-b5f1b33f5bf8 | TBGReformColumnsEngine: четыре real суммы переводит в dtInteger через ChangedInfo=fpDataType; users уже integer, signup_month string. |
| Доля активации | f4c495b3-8aaa-4d06-bb15-e1bdc9320144 | TBGCalcData, activation_share=activated/users:dtFloat. |
| Порядок месяцев | 54a7cffd-9e61-4fed-be70-30d9bc3f5701 | TBGSortingEngine, signup_month, LocaleAware=false; actual readback signup_month ASC/binary; направление не выводится из отсутствующего XML атрибута. |
| Итоговый CSV | fe253407-fd3e-4cec-9f9d-df26130d7fb0 | TBGExportTextFile, один *.result.csv, UTF-8/65001, delimiter `;`, CaptionType=ctUseColumnNames, decimal `.`, ValueNull пустой. |

Две исходные ветви: users→calendar→eligible; events и eligible→inner join→DateTime window→valid filter→flags→user MAX Group; eligible и coverage→full-base join→per-user activation→monthly Group→integer Reform→share→sort→export. Все 16 links прочитаны из actual LGP. Готовые итоговые строки не импортируются, JavaScript отсутствует.

Сохранённый пакет действительно использует native ISO8601ToDate, StartOfTheMonth и AddMonth, в отличие от извлечения строковых компонентов; этот факт не вводит дополнительный gate к эквивалентным решениям. Семантика гражданского времени и границы определены prompt, а не названием функции. Same-GUID configure/readback/execution/type доказательство подтверждено p18-native-evidence-review.md APPROVE: все 16 checkpoints успешны; гражданские часы сохранены, 6 eligible users и 13 valid events, MAX Group имеет 5 пользователей, full-base left возвращает 6. Это не заменяется одним XML. Read action-flags имеет schema-only sample и не выдаётся за полный sample; последующий user-flags read полон.

## Полный ожидаемый результат и формат

```csv
signup_month;users;created_project;invited_member;exported;activated;activation_share
2025-12;1;1;1;1;1;1.000
2026-01;2;2;1;1;0;0.000
2026-02;3;1;2;2;1;0.333
```

Ровно 3×7, signup_month ASC, 15 счётчиков целочисленным текстом без дробной части/разделителей тысяч, пустых значений нет. Имена колонок точны, порядок колонок не оценивается. activation_share — доля 0–1 с абсолютным допуском 0.001; три знака достаточны, дополнительного минимума числа знаков нет. Полные Authoring CSV и новый cold D1 CSV сопоставлены root со всеми 3×7 ячейками независимого ручного ledger и frozen oracle. Все 15 счётчиков имеют целую текстовую запись; actual share 1/0/0.3333333333333333 соответствует допуску 0.001 без ограничения числа десятичных знаков.

## Adversarial recipes

Четыре genuine XML+CSV near-miss: верхняя граница next_month становится включительной; create MAX→SUM с корректным source mapping и activation по сумме>=3 (три literal XML edits; mapping поддерживает тот же порт и не является отдельной аналитической ошибкой); full eligible left→inner теряет U06; AND трёх действий заменён OR. Они различают опубликованные правила и конкретные raw witnesses. CSV пересчитывается из исходных users/events, а не патчится по gold. Формальные expected_failed используют существующие IDs rubric; ожидаемый oracle false у всех четырёх. Loginom execution mutants/live judge пока не выполнялись, их ожидаемые провалы не выдаются за фактический verdict.

Все 16 узлов сохранённого пакета cold D1 выполнены одиночными BODY click→F9 до зелёного исполнения и синего завершённого выделения без Configure/Save; пакет закрыт NoSave, подтверждены Home/logout и закрытие своей вкладки. Старый CSV припаркован до UI, новый полный CSV проверен отдельно; server LGP до/после совпадает с actual A1. D1 выполнял root, знающий ожидаемую таблицу, поэтому этот executor не обозначается blind. Initial delegated surface inventory завершился до UI с 0 F9; root продолжил через работавшую IAB surface без изменения среды.

Обе формы self-contained: общие inputs/oracle/reference/SPEC/acceptance и rubric. B честно использует shared accepted detailed reference; отдельной business CLI-сессии нет. Acceptance задаёт import/export/path, два input suffix, связность и запрет JavaScript без навязывания числа узлов. Provenance содержит фактический CPython oracle runtime и synthetic origin. Доказательства actual native/cold разделены; live judge и измерения не подменяются offline checks.
