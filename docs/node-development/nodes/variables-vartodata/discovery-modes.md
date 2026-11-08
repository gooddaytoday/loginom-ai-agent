# LAB-1038: смена ориентации и состава источника

07.11.2026, mas2, Loginom 7.4.2, pinned Chromium 1246. База
`origin/v040@8943d291b046698d67828f19dcca88aab790cf2c`.
Только `https://app.loginom.ai/app/?testable=true`, worker назначенной пары,
свой новый черновик. UI-жесты по data-tid, чтение локального UI, без RPC,
подмены JS, сборки CLI и запуска модели. Сырые доказательства приложены
к карточке, не Git. Preview не выдаётся за полный native typed cold.

## Узел, вход и переключение существующего

Палитра `MF;TF-1;ModelForm;colVendors_Компоненты>Переменные>Переменные_в_таблицу;TreeText`.
Пользовательский выход 4 своего builtin связан с variables input 0,
табличный выход 0. Исходный набор: amount real=7.5, stamp datetime с целыми
секундами, mixed declared Variant с введённой строкой «19».

Один и тот же GUID `0390c77c-8a49-4639-b788-1b6c372dd252`:
columns → rows → columns, связь сохранилась. Caption и DOM-TID менялись,
поэтому они не identity. Настройка через `mn;mniSetupNode`, при активном
узле штатный `msgbox;tlb;yes` подтверждает деактивацию.
Страница `MF;TF-1;WizrdMCF;VariablesToDataWizard` (W):
`W;rbVarToColumns;DisplayEl`, `W;rbVarToRows;DisplayEl`, далее `btnNext`
и `btnExecute`. Дополнительных algorithm-полей у этих режимов не появилось.

После rows/Execute `Output_Data-0` открыл быстрый просмотр с тремя записями:
amount, stamp, mixed. Заголовки `Name`, `DisplayName`, `Value` видны в
`MF;TF-1;ModelForm;PreviewWindow;PreviewForm;DataSetForm;normalHeaderCt` (H).
Значения показаны как 7.50, локально отформатированная дата, 19.
Строка «19» и число 19 в preview выглядят одинаково: **subtype не доказан**.
Нельзя обещать exact Variant на основании этого чтения.

## Изменение набора без настройки преобразователя

Через редактор пользовательских переменных удалён mixed
(`VariablesEditValuesWizard;colTargetDelete_mixed`, вложенный action icon)
и добавлен added:string="Новый". Amount/stamp не изменены. Done источника
деактивировал потребителя; повторный Execute того же преобразователя без
переоткрытия его настроек показал amount, stamp, added, без mixed.
Количество строк осталось три, последнее значение — «Новый».

Caption узла при этом ещё содержал старое mixed: не использовать подпись
для доказательства состава данных. После обратного переключения в columns
preview показал **одну строку с amount, stamp, added**, не поля Name/Value.
Прежняя связь и GUID сохранены. Это ручное наблюдение обновления схемы,
не независимый типизированный readback и не PASS модельной приёмки.

## Пустота и оставшиеся границы

В исходном пользовательском наборе удалены все три переменные штатными
`colTargetDelete_amount/stamp/added`; мастер показал пустой список. Связь
выхода 4 с input 0 сохранена. Это **подключённый пустой набор**, в отличие
от неподключённого нового преобразователя предыдущего исследования.
После rows/Execute preview сохранил заголовки Name, DisplayName, Value и не
показал ни одной записи; прежних значений нет. Отдельные ожидания empty rows
и неопределённость zero-column cardinality сохранены в предложении;
типизированный cold пустоты не заявлен.

В исходном редакторе mixed имел DataType=6, DisplayValue="19"; строка rows
дошла до preview. Точный native subtype на табличном выходе, все варианты
Variant (числа/дата/NULL), roundtrip Variant и наличие полноценного нулевого
табличного набора требуют отдельного typed чтения. Прямой доступ к серверу
для обхода этих ограничений не использовался. Custom mappings при смене
ориентации не исследованы: ранний отказ безопаснее молчаливого сброса.

## Предлагаемые критерии и файлы

`fixtures/modes.json`, `acceptance/task-switch.md`, `task-variant-empty.md`,
`acceptance/modes/{oracle.py,expected.json}` — независимые авторские входы и
предложение результата до модельных прогонов. Наблюдённый пример 7.5/«Новый»
не извлекался в oracle. Старые accepted expected не менялись.
Новый `.lgp` с подготовленным существующим конвертером для run-check ещё нужен:
JSON описывает данные, а не утверждает их загрузку в runner.

Положительный срез: switch same node/port/link, полный output после add/delete,
Variant string subtype без парсинга числа, connected empty rows с тремя
полями и нулём записей, Save/reopen/cold по стандарту 2/3 + независимые 2/3
одного SHA. Empty columns и custom mappings остаются решением до реализации.

Production пути: `variables-vartodata-procedure.mjs` сейчас явно запрещает
смену mode для existing; `*-parameters` запрещает пустые/Variant input fields;
`*-output` требует равные старые source/target поля; `*-readback` и `*-context`
должны подтверждать новую схему, `*-target` — актуальный состав источника.
Общие кандидаты — `node-output-context.mjs` для Variant переменных и
`node-port-output.mjs` для доказательства empty output; необходимость правки
не утверждена. Не расширять общий transport по гипотезе.
Switch/изменение состава: **2 цикла**. Variant/empty: **2 цикла** после
подтверждения источника typed чтения; при неаддитивной общей правке stop.
Бюджеты — `mode-budgets.md`; runtime этим PR не меняется.
