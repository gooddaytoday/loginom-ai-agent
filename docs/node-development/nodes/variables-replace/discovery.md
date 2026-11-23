# Замена (переменные): этап 0, LAB-840

04.11.2026, mas/Linux x64, Loginom **7.4.2**, Chromium 1246, Node 24.19.0.
База `origin/v040@5d3860bfd542c44a2875ae61d03dab6ecdb64ec6`.
Только `https://app.loginom.ai/app/?testable=true`; worker назначенной пары
`5328915d-43f3-4539-aa20-8fef72983c5d`, собственный новый пакет
`lab840-variables-replace-20261104.lgp`. Жесты — по наблюдённым `data-tid`;
локальные Ext stores читались только у собственного мастера/preview.
Скрытые RPC, подмена JS и чужие пакеты не использовались.

Это прямое исследование UI, **не PASS модели или runtime handler**.
CLI не собирался; для браузера использован существующий закреплённый runtime.
Run-check и модельные прогоны не запускались. Fixture/task/oracle/expected
подготовлены до первого выполнения узла.

## Идентичность и порты — наблюдено

Палитра: `MF;TF-1;ModelForm;colVendors_Компоненты>Переменные>Замена_(переменные);TreeText`.
Component ID назначения `component.variables.Replace`; иконка
`bg-vendor-icon-replacevariables`; VendorGuid
`f2c44372-4b7c-41ae-99f5-a3d52d418d90`.

В собственном штатно сохранённом и скачанном `.lgp`, `Unit_0/Unit.xml`,
`Component/Engine/@xsi:type` = **`TBGCustomModelComponentEngine`**.
Компонент сопоставлен с тем же живым GUID. Это сериализованный fulltype;
RPC-свойство FullType не вызывалось. Общий fulltype не различает несколько
компонентов переменных: нужны vendor/иконка и узловая identity.

`Graph;<подпись>;Input_Var-0` → `Output_Var-0`: native subtype 3,
направления 0/1, индекс 0. Есть отдельный скрытый управляющий вход subtype 4;
в `.lgp` он `ControlVariables`. Service-порты порядка выполнения/компонента/
зависимых узлов не являются входом значений. Связь построена от пользовательского
выхода 4 встроенных «Переменных сценария», без таблицы-посредника.

Настройка замены читает набор связанного variables-входа. Отсутствующий вход
и потеря источника отдельно не проверялись. После настройки подпись узла
автоматически сменилась; повторные операции адресованы по прежнему GUID.
Не закреплять подпись, `TF-1` или номер таба как долговечную identity.

## Мастер — наблюдено

Корень `MF;TF-1;WizrdMCF`. Три страницы:

1. `ReplaceVariablesWizard` — «Замена».
2. `DerivedVariablesMappingEngineOutputPortWizard` — «Настройка соответствия
   между переменными».
3. `DoneWizard` — описание; кнопки `btnDone`, `btnExecute`, `btnView`.

Основные суффиксы `data-tid` относительно `ReplaceVariablesWizard`:

| Суффикс | Действие / наблюдение |
|---|---|
| `grdDataList`, `colInputData_<name>` | Полный список переменных, выбор по имени |
| `colReplaceSource_<name>` | Одним щелчком открыть редактор способа |
| `grdDataList;tbl;celleditor;cbx;boundlist;Не_заменять` / `Ввод_вручную` | Два способа; default — не заменять |
| `grdReplaceItems;tbl;GroupHeader;0;AddButton` | Добавить точную пару |
| `colReplaceValue_<index>`, `colReplaceBy_<index>`, `colReplaceDelete_<index>` | Пары; двойной щелчок открывает row editor |
| `ReplaceEditor[/-1];fldVariant;ValueContainer;Int64Field` / `num` / `txt` / `cbx` | Типизированные from/to; второй редактор — `ReplaceEditor-1` |
| `…;trg_SetNullTrigger` | Явный NULL; очистка строкового поля оставляет `""` |
| Boolean `cbx;trg_picker` → `cbx;boundlist;false` / `true` | Boolean значения; не текстовые литералы |
| `roweditorbuttons;update` / `cancel` | Применение/отмена пары; отдельный общий root |
| `cbxReplaceOther`, `edPrecision`, `chkCaseSensitivity;DisplayEl` | Остальные, числовая точность, регистр |
| `btnLoad`, `btnSave`, `btnSort`, `btnTypeChange`, `btnUniqueValues` | Видимы, вне назначенного среза; функциональность не проверялась |

У новой manual-таблицы наблюдались other=0 (не заменять), precision=0,
case_sensitive=false. Для проверки регистра у Color и Case включено true.
NULL/пустая строка вводились штатными разными UI-действиями. На странице
mapping по умолчанию добавляется **«Замена» к меткам изменяемых переменных**;
имена и типы остаются прежними. Метки были явно возвращены к fixture через
`colDisplayName_<name>` → `EditVariableForm;edtDisplayName` → `btnApply`.

Значения источника редактируются через context menu выхода 4:
`mn;mniConfigurePort` → `VariablesEditValuesWizard` → `EditVariableForm`.
Ввод имени нового источника может автоматически заполнить метку: завершить
редактирование имени перед заданием собственной метки и проверить readback.

## Значения, типы, порядок и повторное выполнение — наблюдено

Вход — [fixtures/variables.json](fixtures/variables.json), восемь таблиц
из [rules.json](fixtures/rules.json), девять точных пар. В таблице приведены
typed-значения полного output-порта 0, а не округлённый текст DOM.

| Имя | Тип | Исходное | initial | updated | source_updated |
|---|---|---|---|---|---|
| Count | integer | 2 | 5 | 8 | 8 |
| Amount | real | 1.25 | 2.5 | 2.5 | 2.5 |
| Color | string | red, затем blue | blue | blue | green |
| Case | string | Red | Red | Red | Red |
| Enabled | boolean | true | false | false | false |
| Missing | string | NULL | missing | missing | missing |
| Empty | string | `""` | blank | blank | blank |
| Zero | integer | 0 | NULL | NULL | NULL |
| Untouched | integer | 7 | 7 | 7 | 7 |
| NullInt | integer | NULL | NULL | NULL | NULL |

Порядок — как в таблице, ровно 10 переменных во всех трёх состояниях.
Типы и явно заданные fixture-метки совпали во всех трёх полных чтениях.
initial: первое выполнение; updated: в том же узле изменена только пара
Count 2→5 на 2→8; source_updated: изменено только исходное Color на blue,
затем выполнен прежний узел без перенастройки. Все три состояния совпали
с заранее подготовленным независимым oracle.

Пары red→blue и blue→green не образуют каскад: исходное red дало blue.
Red не совпало с red при включённом регистре. NULL→missing и `""`→blank
различаются; 0→NULL сохраняет integer, неизменённый NullInt тоже integer.
Default «Не заменять» сохранил Untouched/NullInt.

После Execute двойной щелчок `Output_Var-0` открывает
`ModelForm;PreviewWindow;PreviewForm;VariablesForm;grdValuePreview`.
Native bound store содержит Name/DisplayName/DataType/ValueVariant:
4 integer, 3 real, 5 string, 1 boolean. У Amount native value=2.5,
DOM показывает 2.50; NULL-клетки визуально пусты. Чтение полного store
подтвердило порядок/тип/NULL; это поверхность W1, новый reader не добавлен.

## Отказ и lifecycle — наблюдено

В Count временно добавлена вторая пара с ключом 2. «Далее» отказал;
`WizrdMCF;btnError` открыл `msgbox;cnt;cnt;MessagesView` с причиной:
**«Значение дублируется в таблице замен»**. После удаления дубликата
тем же UI переход прошёл. Это native red→green исследования, не регрессия
реализованного handler. Дубликаты следует отклонять до мутации.

Done завершает настройки; Execute вычисляет значения. Повторная настройка
активного узла/источника требует штатного подтверждения деактивации.
Отдельное обучение не понадобилось; train/apply обученной модели не заявляется.
Пакет сохранён после последнего чтения, скачан штатной командой файлового
раздела. Cleanup подтвердил `package_closed=true`, `logged_out=true`,
`modified_before_close=false`, без discard; браузер закрыт.

## Границы и зависимости

`not_checked`: ненулевая точность сравнения, insensitive Unicode/collation,
пустой набор, потерянный вход, большая Int64/граница 2^53, NaN/Infinity,
NULL→NULL, длинные/многострочные строки, импорт/экспорт правил, regex,
смена типа, другие политики остальных, новый профиль/cold, модельная приёмка.
Видимые элементы дополнительных режимов не означают поддержку среза.

[Контракт](contract.md) и [комплект приёмки](acceptance/README.md) — предложение.
W1 из [общего discovery](../../variables/discovery.md) обеспечивает typed refs,
`variable_inputs`, `read.variable_ports` и cold; карта возможностей из PR #722
подтверждает тот же компонент и мастер. Его ветка просмотрена read-only;
в текущей фиксированной базе файла capabilities ещё нет.
Сверх W1 нужны только узловые редакторы/проверки/mapping, аддитивная регистрация,
reference навыка и сценарий run-check. Общие изменения поведения сейчас не нужны
по наблюдённому сценарию; если необходимость обнаружится — стоп до кода.

## Бюджеты предложения

UTF-8, карточка — JSON без пробелов. Это **предложение тела карточки**,
не реальный wire-ответ `dock_action_describe`: envelope и handler metadata
замеряются после регистрации на этапе 1.

| Объект | Байты | Лимит / запас |
|---|---:|---|
| `node-card-proposal.json`, compact | 3854 | ≤12000; запас 8146 |
| `skill-reference-proposal.md` → `references/nodes/variables.replace.md` | 2792 | ≤6000; запас 3208 |
| `skill-route-proposal.txt`, одна строка | 125 | ~200 |
| `SKILL.md` базы | 38215 | ≤40000; запас 1785 |
| `SKILL.md` базы + строка | 38340 | ≤40000; запас 1660 |
| Базовый compact `dock_node_apply`, `model_tool_bytes` | 13331 | ≤20000; запас 6669 |
| `full_input_schema_bytes` базы | 53748 | Модели не отправляется; предела нет |

Замер apply — `node --test test/model-schema-budget.test.mjs` из client,
закреплённый Node 24.19.0: **45 PASS**, exit 0. Полная схема не используется
для сравнения с лимитом 20000. Дельта будущей регистрации не измерена;
аддитивный compact reserve предлагается ≤1500 Б, прогноз ≤14831 Б без учёта
отдельной дельты W1. Измерение повторить на фактической базе этапа 1.
Оценка узла после W1 — **2 цикла + 1 резервный**; подробности в контракте.
