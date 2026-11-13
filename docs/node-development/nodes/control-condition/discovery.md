# Условие: native-проба этапа 1

13.11.2026, LAB-1557, mas2. База `v040@864fad6efe` (#1080). Только
https://app.loginom.ai/app/?testable=true, worker собственной пары, несохранённые черновики.
Loginom 7.4.2. Проба — штатные модули runtime (`loginBrowser`, `makeWorkspacePrepareCode`,
`createNodeTargetBrowserAdapter`), без перехвата внутреннего JS; чтение — кэшированные
Ext-сторы и DOM по `data-tid`.

## Ответы на вопросы раздела 5 плана

1. **Палитра и создание.** `MF;TF-N;ModelForm;colVendors_Компоненты>Управление>Условие;TreeText`,
   `mnComponentsContextMenu;mniAddNewNode`. Иконка `bg-vendor-icon-condition`. Новый узел —
   `MF;TF-N;Graph;Условие` с `Setting`, `Launch`, `Label`; **метки входа (`GenericEnterLabel`) нет,
   вложенного графа нет.** NW1 не нужен. Портов у нового узла нет.
2. **Мастер — свой, не как у Подмодели.** Корень `MF;TF-N;WizrdMCF`, страницы
   `ConditionSocketsWizard` («Настройка списка портов») → `ConditionParamsWizard`
   («Настройка списка условий») → `DoneWizard`. Сетка портов `ConditionSocketsWizard;grdSockets`
   (колонки `colName`, `colDisplayName`, `colSocketType`, `colPassToOutput`, `colDelete`;
   ячейки `colX_<строка>`), кнопки `btnAdd`, `btnUp`, `btnDown`, `btnEdit`. Меню
   `ConditionSocketsWizard;btnAdd;mn`: пункты «Переменные», «Таблица», «Дерево данных»
   (`mn.i`, `mn.i-1`, `mn.i-2`). GUID типов портов (`FVendorInfoGuid`) совпадают с Подмоделью:
   вход таблицы `05969d66…`, вход переменных `ba746e45…`, выход таблицы `d2278de3…`,
   выход переменных `269b1f91…`. Стор сетки: `Name`, `DisplayName`, `PassToOutput`, `Index`;
   тип — только текст ячейки `colSocketType_N`.
3. **«Передавать на выход» включён по умолчанию** у обоих входов. При таблице и переменных:
   входы `Input_Data-0` (метка «Порт1»), `Input_Var-1` («Порт2»); выходы `Output_Data-0`
   «Detailed - Порт1», `Output_Var-1` «Detailed - Порт2», `Output_Data-2` «Иначе - Порт1»,
   `Output_Var-3` «Иначе - Порт2». **Нумерация runtime** (observe/read) — подряд по табличным
   выходам: Detailed = 0, «Иначе» = 1; переменные — `variable_inputs[0]` (native 1),
   `variable_outputs` 0/1 (native 1/3). Комплект использует нумерацию runtime.
4. **Шаг 2.** `ConditionParamsWizard;grdBranches` (колонка `colBranch`, ячейки
   `colBranch_<имя>`, `colBranchDelete_<имя>`), `btnAddBranch`, `btnUpBranch`, `btnDownBranch`.
   Новый узел уже имеет ветвь «Ветвь1» с условием «Порт1.* Количество =» (агрегат таблицы);
   «Иначе» в списке нет. `ConditionsView;btnAdd` неактивна, пока ветвь не выбрана. Сетка условий
   `ConditionsView` (`colField`, `colAggregation`, `colRelationType`, `colCompareValue`,
   `colCaseSensitive`, `colDelete`), `btnAddOR`. Переименование ветви — двойной щелчок по
   выбранной строке → `grdBranches;tbl;celleditor;txt`. Поле — комбобокс
   `ConditionsView;tbl;celleditor;cbx` (стор: `Name`, `IsVariableField`, `SocketGuid`,
   `DataType`); список полей появляется **только после связей входов**. Переменная `Mode`
   выбирается без агрегации; отношения `< <= > >= = <> пустой не пустой` («=» —
   `RelationType` 6); значение вводится в `VariantFieldEditor;cbx` с Enter
   (`CompareValue` 1). Номер редактора ячейки (`celleditor`, `-1`, `-2`) зависит от порядка
   создания — адресовать по фокусу, не по номеру.
5. **Связь** «Переменные сценария» `Output_Var-4` → `Input_Var-1` Условия; observe видит её как
   `variable_links` kind `variables`, input 0. Вход таблицы — `Input_Data-0`.
6. **Выполнение.** Активная ветвь: порты `FStatus` 1, «Порт активен, данные есть», иконка
   `output_table_active.svg`. Заблокированная: `FStatus` 2, «Порт частично сконфигурирован»,
   `output_table_warning.svg`. Штатное чтение неактивного порта отказывает
   (`node-output-procedure.mjs:114`, «Requested output is not active»).
7. **Смена `Mode`** на 0 в «Переменных сценария» (Done) деактивирует Условие; Execute Условия
   без перенастройки выбирает «Иначе» (её порты `FStatus` 1, Detailed — 2). Повторное открытие
   мастера выполненного узла спрашивает о деактивации (`msgbox;tlb;yes`).
8. **Сохранение и fulltype** — пробой не наблюдались (черновики не сохранялись); сохранение
   проверяется основным сценарием и cold.
9. **Отказ.** Пустая ветвь мастером принимается (Next без `btnError`). Нецелое значение для
   целой переменной **молча заменяется** прежним значением: подсказка редактора
   «Недопустимое целое число», `btnError` нет. Обработчик сверяет записанное значение.
10. Дерево как вход — в меню есть («Дерево данных»), в срез не входит.

Автоматическая метка меняет `data-tid` узла после каждого Done («Условие» → «Порт1.*» →
«Порт2.ModeMode»): узел адресуется по GUID/ref.

## Решение для обработчика

Две настройки одного узла `control.condition`: mode `ports` (новый узел, Done) создаёт входы,
затем штатная связь входов и mode `variable_branch` настраивают ветвь. Повтор после смены
переменной — существующий узел, `parameters:{}`, Execute (штатный путь чтения без
перенастройки). Результат чтения содержит `branch_activity` по порту каждой ветви.

## Пробелы

- Fulltype и структура `Unit.xml` не сняты (см. п. 8).
- Выход из сеанса первой пробы не подтверждён: штатная очистка несохранённого черновика
  вернула `UNSAVED_CHANGES`, браузер закрыт; сохранённых пакетов и блокировок нет.
