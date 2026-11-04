# Фильтр строк: условия из управляющих переменных

LAB-834, 04.11.2026, mas/Linux x64, Loginom **7.4.2**, Chromium **1246**.
База `v040@5d3860bfd542c44a2875ae61d03dab6ecdb64ec6`.
Исследование только `https://app.loginom.ai/app/?testable=true`, worker пары
из карточки. Создан только собственный пакет
`lab834-filter-variables-20261104.lgp` в каталоге worker.
Сборки CLI и модельные прогоны не выполнялись: это облегчённый этап 0.

## Наблюдённый UI

Палитра:
`MF;TF-1;ModelForm;colVendors_Компоненты>Трансформация>Фильтр_строк;TreeText`.
Команда контекстного меню `mnComponentsContextMenu;mniAddNewNode` добавляет
обычный компонент `transform.filter_data`; отдельного нового компонента нет.

Изначально на графе один `Input_Data-0`, два `Output_Data-0/1`.
Контекстное меню самого узла → `mn;mniShowControlVariablesPort` показывает
**`Input_ControlVar`**. Связь с пользовательским `Output_Var-4` узла
«Переменные сценария» создаётся отдельно от таблицы. Наблюдены обе связи:
`JavaScript|Output_Data-0|Amount_Category|Input_Data-0` и
`Переменные_сценария|Output_Var-4|Amount_Category|Input_ControlVar`.
После сохранения другого условия автоматическая подпись стала `Amount`;
caption и суффиксы data-tid не являются стабильной identity.

Это управляющий вход W1 `kind:"control",input:0`, а не второй табличный.
Два выхода по-прежнему «Соответствуют условию» / «Не соответствуют условию».
Новые поля или переменный output у фильтра не появились.

Корень мастера `MF;TF-1;WizrdMCF`, страница `FilterDataWizard`, grid
`FilterDataPanel`. Без подготовленного входа сначала показывалась
`TuneDataSourceInputPortWizard`; на связанных входах сразу открывалась
«Фильтрация данных». В исследованном пути Далее → DoneWizard; после
ввода надо дождаться завершения cell editor, затем validation.

В таблице ниже B = `MF;TF-1;WizrdMCF;FilterDataWizard;FilterDataPanel`.

| data-tid | Наблюдённое действие |
|---|---|
| `B;colField_<поле>` | выбор поля; `tbl;celleditor…;cbx;boundlist` содержит RowID, Amount, Category |
| `B;colRelationType_<поле>` | выбор оператора, в том числе ≥ и «в списке» |
| `B;colValue_Amount` | scalar integer editor `VariantPropEdit` |
| `B;VariantPropEdit;SwitchButton` | literal → variable, появляется `VariableControl` |
| `B;VariantPropEdit;VariableControl;trg_picker` | список совместимых переменных: integer limit, без string codes |
| `B;colValue_Category` | при «в списке» — `StringTriggerPropEdit`, не scalar editor |
| `B;StringTriggerPropEdit;SwitchButton` | список literal → строковая переменная |
| `B;StringTriggerPropEdit;VariableControl;trg_picker` | в списке string codes, integer limit отсутствует |
| `B;colCaseSensitive_Category` | регистр; в исследовании false |
| `B;btnAdd`, `B;colDelete_<поле>` | добавить/удалить строку условия |

Номер `celleditor`, суффикс поля и picker item меняются при переоткрытии;
нельзя собирать их из старого snapshot. Все перечисленные жесты имеют data-tid;
пробела в адресации для этого среза не обнаружено.

## Native readback и существующий барьер

Читался только локальный Ext store открытого собственного мастера/preview,
без вызовов RPC, перехвата JS или изменения внутренних объектов Loginom.

| Условие | Наблюдённая строка native store |
|---|---|
| Amount ≥ limit | `DataType=4, RelationType=3, UseVariables=1, CompareValue="limit"` |
| Category in codes | `DataType=5, RelationType=10, UseVariables=128, CompareValueListAsString="codes"` |
| Amount in codes | `DataType=4, RelationType=10, UseVariables=128, CompareValueListAsString="codes"` |

Это наблюдения двух конкретных flags, не полная спецификация bitmask.
После повторного открытия master store содержит форматированные значения
`limit ( 15 )` и `codes ( C )`, а также материализованный CompareValueList.
Поэтому будущий readback не должен принимать display-text за имя ссылки
или текущий список за literal. У writer уже есть FVariablesData; способ
точного восстановления identity после cold требует проверки на этапе 1.
Не парсить имя удалением скобок из произвольной подписи.

На базе `filter-parameters.mjs:39` разрешены только literal-свойства,
scalar validator не принимает object. `filter-context.mjs:47` отказывает
при любом `UseVariables !== 0`; `filterGroupsFromNative` восстанавливает
только literal. Нужны узловые дополнения, не обход через подстановку
текущего значения. Необработанные поля условий не должны маскировать отказ.

## Результаты ручных выполнений

Вспомогательный JavaScript-источник настроен через штатный мастер:
RowID integer, Amount integer, Category string; шесть строк точно как в
`fixtures/variables.csv`. Он используется только для discovery, не вместо
фильтра. Приёмочные задания предлагают импорт исходного CSV.

| Настройка / изменение | Output 0, RowID | Output 1, RowID |
|---|---|---|
| Amount ≥ integer limit=10 AND Category in string codes=`A,B`, case-insensitive | 2,3,6 | 1,4,5 |
| Изменены только пользовательские переменные на limit=15, codes=`C`; Execute того же фильтра | 4 | 1,2,3,5,6 |
| На том же узле Amount in string codes=`10,20` | 2,4,6 | 1,3,5 |

Оба выхода прочитаны полностью: native BufferedStore total равен числу
прочитанных записей, максимум пять; NULL Amount у RowID 5 сохранён.
Проверялся выбранный выход в свежем preview, а не скрытый старый DataSetForm.
Эти данные подтверждают динамику и отсутствие потерь в малом примере;
CSV, автоматический cold и модельная приёмка здесь не заявляются.

При смене условий native mapping переставил поля Amount,Category,RowID.
Приёмочные задания не задают порядок полей: `column_order:"any"`, все
имена/типы/значения обязательны, метки `label_any`. Порядок строк также не
новый критерий. Прежние literal-режимы сохраняют свою действующую проверку.

В отдельном несохранённом черновике integer Amount in string codes=`C`
не прошёл Далее: `WizrdMCF;btnError` →
`msgbox-1;cnt;cnt;MessagesView`: **«Не указан список значений»**.
Черновик закрыт с отменой; затем список `10,20` принят и выполнен.
Это наблюдение отказа мастера, не обещание диагностики всех malformed lists.

## Доказательства и границы

Сырой `ui.jsonl` остаётся вне Git; выдержки и screenshot условий прилагаются
к итоговому комментарию. Нумерация ниже — исходный журнал этой сессии.
Промежуточные снимки без ожидания загрузки не используются как доказательства
выходного порта; итоговые чтения ниже сделаны после загрузки fresh preview.

| Факт | Журнал:строка |
|---|---|
| Две реальные связи таблицы/control | `ui.jsonl:3` |
| Scalar editor и binding | `ui.jsonl:4–5` |
| List editor и установившийся binding | `ui.jsonl:6`, `ui.jsonl:8` |
| Первый набор: output 0 / output 1 | `ui.jsonl:15` / `ui.jsonl:14` |
| Обновлённые outputs 0/1 | `ui.jsonl:17–18` |
| Сохранённые ссылки после обновления источника | `ui.jsonl:19` |
| Отказ нечислового списка для integer | `ui.jsonl:21` |
| Integer list binding, outputs 0/1 | `ui.jsonl:22–24` |
| Save собственного пакета | `ui.jsonl:25`; файл наблюдён в собственном FileStorage |

`not_checked`: scalar string, остальные сравнения и not_in, комбинация с
OR/literal, NULL/пустая переменная, пустой вход и пустой выход, границы
integer, real/datetime/boolean/variant, интервалы, quoted lists и пробелы,
сохранение identity привязки после cold-open. Scalar string и краевые
случаи включены в предложение приёмки, прочие исключены из первого среза.
Общие механизмы W1 здесь не реализуются и не принимаются.

Предложение, критерии и циклы — [раздел 7 подплана](plan.md#7-переменные-в-условиях-этап-0-lab-834-предложение-для-v040).
