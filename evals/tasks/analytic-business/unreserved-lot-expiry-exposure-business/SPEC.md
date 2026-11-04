# Истечение срока свободного остатка — фактический эталон P25

> Сведения о локальном окружении обезличены. Приватные подтверждения, упомянутые в документе, не включены в репозиторий.

## Контракт и источник
Обе формы используют полностью synthetic lots.csv (7 физических партий) и reservations.csv (6 резервирований).
PK — lot_id и reservation_id соответственно, reservations.lot_id ссылается на lots.lot_id; SKU может повторяться.
Непустые ASCII-ключи сравниваются с учётом регистра; status имеет только active/cancelled, резервирует только active.
Количества — положительные целые штуки, активный резерв партии не превышает on_hand_qty; unit_cost положителен.
Стоимость выражена в одной synthetic денежной единице без налогов/сборов. Реальные источники и лицензии не приписываются.
Локальные календарные expiry_date Europe/Moscow читаются без преобразования часового пояса и без текущей даты.
snapshot_date=2026-03-15, horizon_date=2026-03-20; expired строго раньше снимка, within_horizon включает обе границы.
Партии без активного резерва получают reserved_qty=0, полностью зарезервированные сохраняются с нулевым свободным остатком.
Результат содержит только присутствующие sku/expiry_class, порядок SKU ASCII, затем expired/within_horizon/later.
D/B имеют одинаковые входы, контракт, oracle, допуск и рубрику; подробная последовательность раскрыта только в D prompt.
Это экспозиция к истечению срока, не прогноз продаж и не вероятность списания.
Эквивалентная native-композиция принимается без требований к именам, GUID, количеству узлов или расположению.

## Фактическая композиция Unit_0/Unit.xml
A1 содержит 10 штатных узлов и 9 workflow links, без JavaScript, статического gold или подмены входов.
1. Два TBGImportTextFile читают lots.csv/reservations.csv: UTF-8, заголовки, «;», десятичная точка, двойная кавычка.
В lots expiry_date имеет dtDateTime с DateFormat=yyyy/mm/dd и DateSeparator=-; количества dtInteger, unit_cost dtFloat.
2. TBGFilterDataEngine оставляет status=active (frtEqual/CompareValue vrtString, CaseSensitive=true).
3. TBGGroupDataEngine группирует резервы по lot_id, gdSum(qty) → reserved_qty; R02/R03 партии L02 дают 3, не две партии.
4. TBGJoinDataEngine соединяет полный lots слева с резервами по lot_id; фактический default LEFT сохраняет все 7 партий.
Отсутствующие активные резервы у L03/L04/L06/L07 остаются NULL до калькулятора, а не теряются при соединении.
5. TBGCalcData: reserved_nonnull=Int(NVLF(reserved_qty,0)); free_qty=on_hand_qty-reserved_nonnull; free_value=free_qty*unit_cost.
Стоимость вычисляется на уровне партии до суммирования; промежуточного округления нет.
expiry_class=IF(expiry_date < EncodeDate(2026,3,15),"expired",IF(expiry_date <= EncodeDate(2026,3,20),"within_horizon","later")).
expiry_order использует те же границы и значения 1/2/3; L02 равен снимку, L03/L06 равны горизонту и включены.
6. TBGGroupDataEngine группирует по sku/expiry_class/функционально зависимому expiry_order: gdCount(lot_id) → lots,
gdSum(on_hand_qty/reserved_nonnull/free_qty/free_value) → on_hand_qty/reserved_qty/free_qty/free_value.
7. TBGSortingEngine сортирует sku и expiry_order ASC, LocaleAware=false.
8. TBGReformColumnsEngine исключает expiry_order и переводит три агрегированные суммы количеств в dtInteger; lots уже целое.
9. TBGExportTextFile сохраняет один CSV: UTF-8, заголовок имён, «;», точка, двойная кавычка, LF, без BOM.
Нулевые free_qty/free_value у полностью зарезервированной L05 остаются в итоговой SKU_B/later строке.

## Полный ожидаемый CSV
Колонки сопоставляются по точным именам; порядок колонок не ограничивается. Проверяются все 42 ячейки и порядок 6 строк.
Все 24 lots/on_hand_qty/reserved_qty/free_qty — неотрицательные целые тексты без дробной части; пустых итогов нет.
Текст совпадает точно, числа с абсолютным допуском ±0.001; дополнительный минимум знаков стоимости не задан.
```csv
sku;expiry_class;lots;on_hand_qty;reserved_qty;free_qty;free_value
SKU_A;expired;1;10;2;8;20.00
SKU_A;within_horizon;2;13;3;10;36.00
SKU_A;later;1;7;0;7;10.50
SKU_B;expired;1;3;0;3;18.00
SKU_B;within_horizon;1;4;0;4;8.00
SKU_B;later;1;6;6;0;0.00
```
Независимые ручной расчёт и stdlib Decimal oracle получены после заморозки raw, до native; gold вне agent prompt.
По партиям и группам on_hand_qty=reserved_qty+free_qty; итоги 43=11+32 и 138.60=46.10+92.50 по стоимости.

## Фактическая проверка и происхождение
Reference — оригинальный package.lgp подробного A1; B использует тот же проверенный пакет без отдельной B авторской сессии.
CLI0, openai/gpt-6-sol/xhigh подтверждена собственной БД; requested STANDARD, response tier NOT_OBSERVED, speed NOT_MEASURED.
ToolErrors=0; повтор skill — metadata enrichment существующего события, не дополнительная попытка.
Save SUCCEEDED/save_completed/workflow_preserved, но reopened=false/persisted_content_verified=false; arrangement=result_unconfirmed/warning=true.
XML и весь CSV проверены независимо; оригинальные ограничения Save сохраняются, reopen не заявляется.
Native combined SPEC+QUALITY32/root1ba835 CLOSED; обычные Close/logout, original Runtime+Knowledge ACK и actual exit0/noSignal подтверждены.
Старый idle observer не записал проходы; отдельное исправленное evidence подтвердило два полных пустых scoped прохода без CLI probe.
Cold: один наблюдённый RunAll через видимое overflow-меню, все 10 узлов grey→green и новый CSV230B/inode [private]/mtime после запуска.
Серверные LGP и оба raw не изменились по SHA и stat; cold CSV совпадает с native и полным oracle, 24 integer/noempty подтверждены.
Первый клик скрытой toolbar-кнопки не отправил input; Configure/Save не вызывались. Просмотр со scroll/collapse не повторял исполнение.
Cold закрыт NoSave/logout/закрытием собственной ownTab[private]; вкладок IAB не осталось, Authoring idle подтверждён двумя scoped проходами.
Scenario URL выведен из actual endpoint/имени пакета/Unit_0/Info.xml Name=Unit1; отдельный deep-link переход не заявляется.
Public использует четыре смысловые XML-мутации и полные wrong CSV, независимо проверяемые рецептами на копиях oracle; native mutants не исполнялись.
Combined независимое cold+public review ожидается; calibration/sole D/B/pair acceptance остаются NOTRUN/PENDING.
