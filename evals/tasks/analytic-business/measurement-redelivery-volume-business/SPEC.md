# Повторная доставка измерения — фактический эталон P26

> Сведения о локальном окружении обезличены. Приватные подтверждения, упомянутые в документе, не включены в репозиторий.

## Контракт и источник
Обе формы используют полностью synthetic deliveries.csv: 9 доставок пяти самостоятельных измерений на трёх приборах.
Зерно — доставка с уникальным delivery_id; measurement_id глобально определяет согласованные device/quantity.
Все поля непустые, ключи ASCII/case-sensitive, quantity — положительное целое количество штук, без дат и денег.
device/quantity не являются бизнес-ключом: M01 и M02 с одинаковым quantity=5 остаются разными измерениями.
Результат содержит все присутствующие device, включая DEV_C с единственной доставкой M05; порядок device ASCII ASC.
deliveries учитывает каждую исходную строку; measurements — каждый measurement_id ровно один раз.
repeated_deliveries=deliveries−measurements; total_quantity суммирует quantity ровно один раз на measurement_id.
D/B имеют одинаковые входы, определения, oracle, допуск и рубрику; подробный метод раскрыт только в D prompt.
Эквивалентная native-композиция допустима без требований к именам, GUID, количеству узлов или расположению.

## Фактическая композиция Unit_0/Unit.xml
A1 содержит 7 штатных узлов и 6 workflow links в одном пути import→export; нет JS, статического gold или подмены входов.
1. TBGImportTextFile читает deliveries.csv: UTF-8, заголовок, «;», десятичная точка, двойная кавычка.
delivery_id/measurement_id/device имеют dtString, quantity — dtInteger.
2. TBGGroupDataEngine группирует по measurement_id и функционально зависимым device/quantity.
gdCount(delivery_id) → delivery_count сохраняет число исходных доставок до сворачивания фактов.
Пять строк первой группы: M01/DEV_A/5/2, M02/DEV_A/5/1, M03/DEV_A/2/2, M04/DEV_B/7/3, M05/DEV_C/4/1.
3. TBGCalcData получает repeated_count=delivery_count−1 для каждого факта, включая ноль у singleton.
4. Второй TBGGroupDataEngine группирует по device: gdSum(delivery_count)→deliveries,
gdCount(measurement_id)→measurements, gdSum(repeated_count)→repeated_deliveries, gdSum(quantity)→total_quantity.
Тройная M04 даёт две лишние доставки и quantity=7 один раз; M01/M02 обе вносят quantity=5.
5. TBGReformColumnsEngine переводит три SUM-поля deliveries/repeated_deliveries/total_quantity в dtInteger;
measurements уже имеет целочисленный тип gdCount. Промежуточного округления нет.
6. TBGSortingEngine сортирует device ASC, LocaleAware=false.
7. TBGExportTextFile сохраняет один UTF-8 CSV: заголовок имён, «;», точка, двойная кавычка, LF, без BOM.
Явные export request/readback подтверждают параметры, которые не записаны в XML как отличия от defaults.

## Полный ожидаемый CSV
Все 15 ячеек и порядок трёх строк проверяются; колонки сопоставляются по точным именам без ограничения их порядка.
Все 12 количественных значений — неотрицательные целые тексты без дробной части/тысяч; пустых итогов нет.
Текст совпадает точно, числа — с абсолютным допуском ±0.001; промежуточного округления нет.
```csv
device;deliveries;measurements;repeated_deliveries;total_quantity
DEV_A;5;3;2;12
DEV_B;3;1;2;7
DEV_C;1;1;0;4
```
Независимые ручной разбор всех девяти доставок и stdlib Counter oracle получены после raw freeze, до native; gold вне agent prompt.
Итоги: 9=5+4 для доставок/фактов/повторов; сырой quantity 44=23+21 самостоятельного и повторного объёма.
Канонические offline traps сохраняются: удаление всех повторённых фактов теряет DEV_B, суммирование всех доставок даёт A19/B21/C4.
Actual XML не содержит фильтра; public near-miss использует четыре существующие смысловые настройки по принятому scoped simplification,
без новых узлов, неподтверждённых атрибутов или mutation engine; эти два полных raw-derived offline traps не выдаются за XML-mutants.

## Фактическая проверка и происхождение
Reference — оригинальный package.lgp подробного A1; B использует тот же проверенный пакет без отдельной B авторской сессии.
CLI0, openai/gpt-6-sol/xhigh подтверждена собственной БД; requested STANDARD, response tier NOT_OBSERVED, speed NOT_MEASURED.
ToolErrors=0; duplicate skill имеет тот же callID/input/output с enriched activation metadata, whole-event byte equality не заявляется.
Save SUCCEEDED/save_completed/workflow_preserved, но reopened=false/persisted_content_verified=false; arrangement=result_unconfirmed/warning=true.
XML и полный CSV проверены независимо; исходные Save limitations сохраняются, reopen не заявляется.
Native combined SPEC+QUALITY29/root171cbd CLOSED; обычные Close/logout и original Runtime+Knowledge ACK/actual exit0/noSignal подтверждены.
Cold: один наблюдённый RunAll, 7 native и один service узел grey→green; новый CSV109B/inode [private]/mtime после запуска.
Серверные LGP/raw не изменились по SHA/stat; cold CSV равен native и oracle по всем15/12integer/noempty.
Configure/Save не вызывались; cold-full.png показывает первые шесть узлов, cold-export.png — правую часть/экспорт после scroll.
Cold завершён NoSave/logout/закрытием собственной ownTab[private], IAB[] и двумя пустыми scoped process passes; нового CLI probe нет.
После подтверждённых UI-действий вспомогательная JS-очистка переменной дала ошибку; уже завершённые logout/tabclose не повторялись.
Scenario URL выведен из actual endpoint/имени пакета/Unit_0/Info.xml Name=Unit1; отдельный deep-link переход не заявляется.
Public wrong CSV проверяются существующими рецептами на disposable oracle copies; native mutants не исполнялись.
Combined независимое cold+public review ожидается; calibration/sole D/B/pair acceptance остаются NOTRUN/PENDING.
