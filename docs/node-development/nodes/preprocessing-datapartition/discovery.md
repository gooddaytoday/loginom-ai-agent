# Разбиение на множества: discovery LAB-533

[Общее живое исследование пары](../preprocessing-sampling/discovery.md) содержит
native identity, data-tid, параметры, ограничения, измерение схемы и отложенные методы.

Loginom7.4.2, native engine **TBGPartitionEngine**, VendorGuid
b2161dca-d25a-440e-8833-813d4af7c5f6, PartitionComponentWizard.
«Последовательный»: явные размеры train10/test5, порядок test→train→unused.
cntTestPriority/pedTestPriorityPosition в этом режиме скрыты.

| Порт | Native подпись | Полный результат rows.csv |
|---|---|---|
| 0 | Общий выходной набор | 15 строк: RowID6..15, затем1..5; суммаValue1200 |
| 1 | Обучающий выходной набор | 10 строк6..15; сумма1050 |
| 2 | Тестовый выходной набор | 5 строк1..5; сумма150 |

Порт0: IsTestSet boolean («Тестовое множество») первым, затем RowID integer,
Class string, Value integer. false у train, true у test. Порты1/2 — только
исходные3 поля. Unused16..20 не выводится; четвёртого порта нет.
Полнота и точные типы прочитаны штатным табличным reader; stock matcher
подтвердил независимые срезы/concat. Это native discovery, не модельная приёмка.
**NULL/empty — проверяется на этапе 1 по oracle**, по решению LAB-533:
четыре новые сессии не дали подтверждённых выходов на подготовке импорта/мастера.
Подплан ready_for_development с этой оговоркой; критерии ещё утверждает владелец.
Это не утверждение сохранения NULL/типов на пустом выходе и не PASS обработчика.
