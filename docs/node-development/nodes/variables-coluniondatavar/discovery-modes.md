# LAB-1038: ручное соответствие и дополнительные входы

07.11.2026, mas2, Loginom 7.4.2, pinned Chromium 1246. База
`origin/v040@8943d291b046698d67828f19dcca88aab790cf2c`.
Только `https://app.loginom.ai/app/?testable=true`, worker назначенной пары
`01a124e5-1623-7a32-93c7-a3754c7dbdd7`, новый собственный черновик.
UI-жесты по data-tid, чтение локальных controls/stores/native graph без RPC,
подмены JS, сборки CLI или запуска модели. Сырые доказательства — приложение
к карточке, не Git. Это исследование и предложения, не бизнес-PASS.

## Наблюдение

Префикс P = `MF;TF-1`. Палитра:
`P;ModelForm;colVendors_Компоненты>Переменные>Соединение_(переменные);TreeText`.
Новый узел имеет `Input_Var-0`, `Input_Var-1`, `Input_Add`, `Output_Var-0`.
Один клик `Input_Add` добавил **Input_Var-2**, сохранив GUID узла и прежние
порты. Native подпись третьего — «Добавляемые переменные 2».
Максимум портов и удаление самого порта не проверены.

Узел привязан к пользовательскому выходу 4 своего builtin. Связь видна как
`P;Graph;Переменные_сценария|Output_Var-4|amount_stamp_mixed|Input_Var-0`.
Native GUID узла сохраняется, хотя caption/TID после связи изменились.
Это наблюдение связи, не выполнение трёх самостоятельных источников.

Настройка: контекстное меню узла `mn;mniSetupNode`, далее
`P;WizrdMCF;DerivedVariablesMappingEngineOutputPortWizard` (W).
Есть `W;btnAutoSyncThroughColumns`, `btnSyncThroughColumns`,
`btnTargetAutoLink`, `btnTargetClearLinks`, `btnAddMappingColumn`,
`btnEditMappingColumn`, `btnMoveMappingColumnUp/Down`, `rbTable/rbLinks`.
После выключения autosync и Add открылся `EditVariableForm` с `edtName`,
`edtDisplayName`, `cbxDataType`, `cbxUsageType`, `edtDescription`, Apply/Cancel.
В этом редакторе выходного соответствия **нет поля значения**: это описание
переменной, а не ввод константы. Все изменения черновика отменены штатно.

Даже после подключения источника `W;grdTargetColumns` имел локальный count=0,
isLoading=false. Кнопка Sync не дала полного списка для адресного редактирования.
Это ограничение прочитанного store, а не доказательство пустого выхода.
Ручная связь конкретного источника, integer→string и вычисленный результат
пока **не доказаны**. Предложенный oracle не извлечён из этих пустых записей.

## Управляющий порт — stop

В локальном native-инвентаре этого узла наблюдены три входа subtype=3,
один Input_Add subtype=10 и один выход subtype=3. Входа subtype=4 нет,
даже скрытого. В контекстном меню нет `mn;mniShowControlVariablesPort`.
Нельзя обещать управляющий вход или подменять его третьим набором данных.
По правилу карточки «режима нет в UI» этот пункт блокируется для решения
владельца. Набор control в fixture нужен для предложения безопасного отказа;
положительного control-output oracle нет.

## Предлагаемая приёмка и объём

`fixtures/modes.json`, `acceptance/task-manual.md`, `task-inputs.md`,
`acceptance/modes/{oracle.py,expected.json}` — отдельное предложение, прежняя
принятая приёмка не меняется. Проверять полный упорядоченный typed variable
output 0: ручной выбор/переименование/порядок, integer→string простого целого,
patch правого значения без перенастройки union, третий источник/отсоединение,
сохранение NodeRef/связей, Save/reopen/cold. NULL/false/0/пустая строка
различаются. Control — объяснимый отказ без мутации, до решения владельца.
Для положительных случаев стандарт ≥2/3 + независимые ≥2/3 на одном SHA.

`node-contracts.mjs` связывает тип с `variables-coluniondatavar-node.mjs`;
ожидаемые изменения: `*-parameters` (два→три входа, ordered manual settings),
`*-preflight` (проверка custom вместо безусловного отказа), `*-context`
(полный native mapping), `*-readback`, `*-node`. Общая точка подключения —
`variable-port-mapping.mjs`/admission; она сейчас не является writer этого
output wizard. Потребность в общей правке **не доказана**: сначала адресно
доказать источник mapping records и UI-конверсию; без обхода native reader.
Если нужен общий контракт — stop до кода, не считать это разрешённой регистрацией.

Оценка: **2 цикла** для третьего входа и его reexecute/cold; **2 цикла**
для ручного соответствия/конверсии после разрешения чтения mapping.
Control не оценивать как реализуемый. Каждый цикл с бизнес-прогоном;
одна поведенческая правка на последующий PR. Бюджеты — `mode-budgets.md`.
