# Дополнительные типы и ограничения Quality: LAB-1103

08.11.2026, mas2, база `v040@d355159858e2b090a60b11cc21735fa5206c9308`.
Стенд `https://app.loginom.ai/app/?testable=true`, Loginom 7.4.2;
собственный reviewer пары `01a124e5-1623-7a32-93c7-a3754c7dbdd7`.
Операторский preflight; runtime не менялся, CLI не собирался.
Предыдущий LAB-1018 не исследовал эти типы. Новые критерии ниже — предложение
владельцу до реализации; модельный/cold PASS не заявлен.
Общий собственный probe сохранён, закрыт, logout и закрытие браузера подтверждены.

## Наблюдения по data-tid

Палитра `ModelForm;colVendors_Компоненты>Исследование>Качество_данных;TreeText`.
Источник `fixtures/types.csv`, заголовки, comma, decimal dot, NULL `?`.
В импорте заданы yyyy/mm/dd + «Дефис (-)», boolean true/false.
`ImportTextFileParamsWizard;ColumnDefsTuning;grdSettings;grd-1;normalHeaderCt;`
ячейки `<номер>_2`/`<номер>_3` подтвердили пары:
RowID integer/continuous, Flag boolean/discrete, Stamp datetime/continuous,
Code integer/discrete, Measure real/discrete, Text string/discrete.
После типизации прочитаны проходные даты и boolean, а не исходные CSV-строки.

При открытии `Graph;Качество_данных;Setting` UI сообщает:
«Мастера настройки для "Качество данных" не существует».
В `WizrdMCF` только пять `DerivedDataSourceMappingEngineOutputPortWizard`
(без суффикса, затем −1…−4) и DoneWizard. После выполнения страницы
по-прежнему предлагают соответствие/общие свойства полей, не правила проверок.
Вход настраивается отдельно через `Graph;Качество_данных;Input_Data-0` →
`TuneDataSourceMappingWizard`; поля связаны с актуальным источником.
`btnEditMappingColumn` → `EditTuneColumnDefForm`: только Name, DisplayName,
DataType, DataKind, UsageType. Алгоритмических настроек качества в нём нет.

Смена схемы источника может оставить старые несвязанные поля input mapping.
Наблюдённое «Порт \"Входной источник данных\" не настроен» устранено удалением
своих потерянных отображений через `colTargetDelete_<имя>` и подтверждением.
Это подготовка собственного пакета, не отказ нового типа или обработчика.
Итоговый вход содержит ровно шесть ожидаемых полей, UsageType «Используемое».

Результаты прочитаны в `ModelForm;PreviewWindow;PreviewForm;DataSetForm;`
`normalHeaderCt;<имя>_<индекс>`, с выбором каждого активного порта.
Суффиксы вкладок динамические, скрытые старые таблицы не учитывались.

## Результаты и независимый oracle

Порты 0 и 3: все 8 исходных типизированных строк без коррекции, включая
Flag=NULL у RowID 4 и Stamp=NULL у RowID 5. Порты 1/2 пусты со схемой входа.
Порт 4: прежняя фиксированная схема из десяти колонок; шесть строк в порядке
входных полей. Нативные типы заголовков — integer/string/real/variant как
в прежнем profile. Количество портов и поля SummaryTable не изменились.

`acceptance/oracle-types.py` использует CSV, Fraction, Gregorian `datetime.date`
и существующий независимый `oracle.py`; не читает Loginom, XML, runtime,
журнал или actual output. Proposed expected — `expected-types.json`.

| Поле | Null/Out/Extr | Avg (oracle) | Moda (oracle) | Median (oracle) | Native preview |
|---|---|---|---|---|---|
| RowID | 0/0/0 | 9/2 | 15/8 | 5 | 4,50 / 1,88 / 5,00 |
| Flag | 1/0/0 | 4/7 | boolean true | NULL | 0,57 / true / NULL |
| Stamp | 1/0/0 | 322185/7 | 368191/8 | 46026 | 46026,43 / 46023,88 / 46026,00 |
| Code | 0/0/0 | 5/2 | 11/8 | 3 | 2,50 / 1,38 / 3,00 |
| Measure | 0/0/0 | 5/2 | 11/8 | 3 | 2,50 / 1,38 / 3,00 |
| Text | 0/0/0 | NULL | string B | NULL | NULL / B / NULL |

Числовая мода остаётся гистограммной даже при discrete numeric:
четыре равных интервала [1,4], первый центр 1,375; это не частотное значение 4.
Boolean Avg — доля true среди непустых; Median отсутствует.
Дата в проходных портах — datetime, но сводки отображаются числами серийных
дней. Oracle-кандидат календарного начала — 1899-12-30. На положительных
датах этого fixture он численно согласуется с preview; иные эпохи/зоны,
отрицательные даты и дробные сутки этим опытом не установлены.

Preview округляет real до двух знаков; по нему **не подтверждены** binary64
точность и native subtype Moda(Flag/Stamp). `expected-types.json` предлагает
boolean Moda для Flag и real Moda для Stamp; это условие будущего native
preflight до первого модельного прогона, не установленный тег из текста true.
Существующий stock verifier уже понимает boolean/datetime/variant cells;
новый verifier или ослабление численного сравнения не предлагаются.

## Ограничения платформы 7.4.2

Алгоритмический мастер, controls MaxNullsPercent/ActionNull/ActionOut/ActionExtr,
отдельная настройка правил проверки и режим frozen-fit apply не обнаружены.
Узел предлагает обычное «Выполнить» и «Обучить» в общем меню; само наличие
второй команды не доказывает сохранённую модель. В UI настройки проверки
отсутствуют и до, и после исполнения, включая редактор input column.
Это **ограничение платформы** для работы через UI, а не доказательство
отсутствия внутренних XML-полей или всех возможных способов использования.
XML/RPC для изменения скрытых параметров не применялись.
`task-hidden-settings.md`/`task-apply.md` сохраняются как запросы на недоступный
объём; нет выдуманного численного expected для несуществующих controls.
Для этого объёма действует stop карточки и требуется решение владельца.

## Предложение этапа 1

Расширить существующий profile по типам, без нового режима и без новых
parameters. Дать модели только `task-types.md` и `types.csv`.
Критерии: все пять полных типизированных выходов `expected-types.json`,
точные ID/NULL/числа и native variant subtype, datetime без часового пояса,
непредписанные метки через label_any, CSV каждого порта, Save/cold/cleanup,
2/3 исполнителя и 2/3 независимой проверки одного SHA.
Порог real — прежний abs 1e-9/rel 1e-12; epoch/subtype не подменять допуском.
Новый business-прогон обязателен в каждом цикле после правки.

Собственные файлы: `quality-parameters.mjs`, `quality-procedure.mjs`,
`quality-output.mjs`, `quality-readback.mjs`, `quality-moda.mjs` и тесты;
при необходимости `quality-node.mjs`. Аддитивные описания и сценарий run-check.
Общий `decodeVariantFrame` уже знает boolean и datetime; собственный
quality-moda пока разрешает только tags 1/5/8/20. Расширение до boolean
должно оставаться в этом же ограниченном capability (50 строк/1 МБ),
без изменения общего decoder, lifecycle или публичного контракта.
Если native date Moda окажется datetime с неподтверждённой семантикой,
это новый blocker, а не разрешение обойти существующие guards.
Оценка: 2–3 цикла на типы/readback/регрессию после native subtype preflight.
Для скрытых настроек/apply циклы не оцениваются до решения по платформе.
[Бюджеты](../preprocessing-elimoutlier/model-contract/modes-budgets.md).
