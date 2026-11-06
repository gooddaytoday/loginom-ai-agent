# Исполнение обязательств на фиксированный снимок

> Сведения о локальном окружении обезличены. Приватные подтверждения, упомянутые в документе, не включены в репозиторий.

## Задача и исходные данные

Одна строка на (team,deadline_month) полного реестра obligations: число обязательств, четыре взаимоисключающих класса и доля нарушений среди наступивших сроков. D/B имеют дословно одинаковые общие определения, вход, схему, формат, rubric и oracle; только D раскрывает расчёт. Эквивалентная композиция штатных узлов допустима без требований к именам, числу узлов, layout или внутреннему графу.

Вход obligations.csv полностью synthetic: восемь проектных строк G06 P19, созданных eval author; внешние datasets/пакеты не использованы, сторонняя лицензия не заявляется, repository license MIT. PK id; ASCII case-sensitive id/team, deadline непустые; completed_at — единственное nullable поле. UTF-8/header/semicolon/decimal dot/двойная кавычка; пустота — отсутствие completed_at, не текст NULL.

Опубликованный snapshot_at=2026-03-15 12:00:00 фиксирован. Deadline/completed_at локальные Europe/Moscow, YYYY-MM-DD HH:MM:SS, без timezone conversion; deadline_month=YYYY-MM. Завершение наблюдается только при непустом completed_at≤snapshot. Наблюдаемое completed_at≤deadline — on_time, позже deadline — late. Ненаблюдаемое при deadline<snapshot — open_overdue, иначе open_not_due. Numerator=late+open_overdue; denominator=count(deadline≤snapshot) в группе. При denominator0 доля пустая. Будущее completed_at не является наблюдаемым завершением.

Независимый Python3 stdlib csv/datetime/Decimal/dict oracle читает только frozen raw; отдельно после actual raw freeze и до oracle/native получена полная ручная таблица 3×8. Native CSV и его граф не служат источником oracle; промежуточного округления нет. Oracle runtime/version описаны в provenance.

## Фактический native reference

Прочитаны все семь XML сохранённого package; Unit_0/Info.xml задаёт Name=Unit1, сценарий в Unit_0/Unit.xml. В данном reference восемь native узлов и семь последовательных data links; это наблюдение, не новый критерий приёмки. JavaScript/подстановка готовых итоговых чисел отсутствуют.

1. c70c4afc — TBGImportTextFile, PRIVATE_STORAGE id/team dtString, deadline/completed_at dtDateTime; CodePage65001,DelimiterChar=";",DecimalSeparator=".",DateFormat="yyyy/mm/dd",DateSeparator="-",ValueNull="". Пустое completed_at действительно прочитано как null, подтверждено per-id native readback.
2. 0e032806 — TBGCalcData: observed=IFF(IsNull(completed_at),0,IFF(completed_at<=EncodeDateTime(2026,3,15,12,0,0),1,0)); deadline_month=DateToStr(deadline,"YYYY-MM"); due=IFF(deadline<=EncodeDateTime(2026,3,15,12,0,0),1,0). Фиксированные EncodeDateTime значения — контрактный снимок, не готовые ответы.
3. e7a3507a — TBGCalcData: on_time=IFF(observed=1,IFF(completed_at<=deadline,1,0),0); late=IFF(observed=1,IFF(completed_at>deadline,1,0),0); open_overdue=IFF(observed=0 AND deadline<snapshot,1,0); open_not_due=IFF(observed=0 AND deadline>=snapshot,1,0). Все четыре индикатора dtInteger; null completed_at не сравнивается как реальная дата завершения.
4. c9670f16 — TBGGroupDataEngine: team/deadline_month utGroup Order0/1; id gdCount→obligations; on_time/late/open_overdue/open_not_due/due gdSum→одноимённые counters и due_count. Полный реестр сохраняет группы с будущими сроками; все четыре counters разделяют obligations.
5. b19065c5 — TBGCalcData: violation_share=IFF(due_count=0,Null(),(late+open_overdue)/due_count),dtFloat. Знаменатель не obligations; future-deadline строки и открытое при deadline=snapshot различаются. T_B/April остаётся undefined, а не 0.
6. 46905a66 — TBGReformColumnsEngine: пять counter columns приведены в dtInteger; due_count исключён, восемь контрактных колонок сохранены, доля остаётся числовой.
7. 01064a6d — TBGSortingEngine: team ASC затем deadline_month ASC,LocaleAware=false; ASCII ключи без зависимости от locale.
8. 23524d6e — TBGExportTextFile: PRIVATE_STORAGE".",DelimiterChar=";",ValueNull="". Ровно один полный result CSV; фактический header/LF/noBOM/пустая доля проверены по выгрузке.

Связи: import→snapshot/месяц/due→четыре класса→полная группировка→доля→восемь полей→ASCII sort→export. Ни фильтра future deadline, ни удаления группы с denominator0 нет.

## Полный результат и проверки

Точные восемь имён колонок; колонки сопоставляются по именам, их порядок не оценивается. Ровно три строки в ASCII ASC(team,deadline_month), все 24 ячейки проверяются с абсолютным числовым допуском ±0.001. Все 15 counter texts целые неотрицательные без дробной части/тысяч; денежных полей и дополнительного minprecision доли нет. Единственная output пустота — violation_share у T_B/2026-04, не0/NULL.

```csv
team;deadline_month;obligations;on_time;late;open_overdue;open_not_due;violation_share
T_A;2026-03;6;1;1;2;2;0.6
T_B;2026-03;1;0;1;0;0;1
T_B;2026-04;1;0;0;0;1;
```

O01 завершено ровно в deadline→on_time; O02→late; O03 открыто overdue. O04 будущий deadline→open_not_due и не denominator. O05 deadline=snapshot→ещё open_not_due, но входит в denominator. O06 завершение после snapshot игнорируется→open_overdue. O07 completed=snapshot наблюдается→late. O08 будущий April deadline→open_not_due/denominator0/emptyshare. T_A: нарушение3/наступившие5=.6; T_B March1/1,April0/0 undefined.

Actual A1: terminal0/CLI0/used1of3, confirmed openai/gpt-6-sol/xhigh;25 DB assistants,27 unique tools,0toolErrors/0memoryWrites. Повторный raw skill event с тем же id/timing/payload сохранён и сопоставлен с БД; это не второй вызов. Requested STANDARD/default отдельно от responseTier NOT_OBSERVED/speed NOT_MEASURED.

Original Save SUCCEEDED/save_completed/workflow_preserved, но persisted_content_verified=false/reopened=false/arrangement attempted-result_unconfirmed-warning сохранены честно. Собранные LGP/XML и полный CSV проверены отдельно; original Close/logout без discard и оба Runtime/Knowledge ACK+actualexit0/noSignal/idle приняты native actual review.

Accepted cold D1: один park,одно наблюдаемое toolbar «Выполнить все»; все восемь native grey→green, новый160B CSV с другим inode, full24/15integer/soleempty. Server LGP/raw SHA+stat unchanged; Configure/Save не вызывались. NoSave→logout/sign-in AX→own ownTab[private] closed/idle; screenshots с поздней отрисовкой не заменяют DOM/AX/content proof. Current A/storage.json законно обновлён collect --rerun, исходный native receipt сохранён S/native-storage.json.

Native actual34/root4721fd и cold actual30/root792ad1 independently APPROVE/root FULLREAD CLOSED. Публикация переиспользует эти проверки; native mutants не исполнялись, judge/group calibration/sole D+B и pair acceptance остаются pending до всех G06 prerequisites. P17 ONLY-B остаётся conditional group gate, отдельный ONLY-B P19 не добавлен.
