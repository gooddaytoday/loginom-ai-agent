# Соединение (переменные): этап 0, LAB-838

04.11.2026, mas/Linux x64, Chromium 1246, Loginom **7.4.2** (`bg.app.Version`).
База `origin/v040@5d3860bfd542c44a2875ae61d03dab6ecdb64ec6`.
Только `https://app.loginom.ai/app/?testable=true`, worker назначенной пары
`~/.config/loginom-multica/cards/412fbafd-e49a-427b-bcbb-c107ebe51b8a/`.
Исследованы только собственные новые пакеты этой пары. Использованы штатные
login/prepare/cleanup и UI-жесты Playwright по `data-tid`, DOM и локальные
stores открытого UI. Удалённые getters/RPC для исследования не вызывались;
JS приложения не подменялся. Для bootstrap использован существующий cache
точной базы; CLI не собирался. Модель и run-check не запускались.

## Компонент, native тип и порты — наблюдено

Палитра:
`MF;TF-1;ModelForm;colVendors_Компоненты>Переменные>Соединение_(переменные);TreeText`.
Иконка **`bg-vendor-icon-unionvariables`**. Component ID назначения
`component.variables.ColunionDataVar`; runtime type `variables.column_union`,
режим `append_variables` предлагаются контрактом этапа 1.

Штатно сохранённый и скачанный собственный `.lgp`, `Unit_0/Unit.xml`,
сопоставлен по GUID исследованного узла:
`Component/Engine/@xsi:type` = **`TBGCustomModelComponentEngine`**,
VendorGuid **`b4432322-a745-46b0-93cb-83ac194d8adb`**.
Это сериализованный fulltype Engine; удалённый getter FullType не вызывался.
Общий fulltype не различает некоторые узлы переменных, поэтому сохранять
проверку vendor/палитры, не угадывать класс `TBGColunionDataVar`.

| Направление | Ordinal / DOM | Native имя / метка | Socket |
|---|---|---|---|
| Вход | 0 / `Input_Var-0` | Variables / Входные переменные | TBGTuneVariablesSocket |
| Вход | 1 / `Input_Var-1` | JoinedVariables / Добавляемые переменные | TBGTuneVariablesSocket |
| Выход | 0 / `Output_Var-0` | Variables / Выходные переменные | TBGDerivedVariablesOutputSocket |

На графе виден `Input_Add`; это создание порта, его не нажимали. W2 и
максимальное число входов не исследовались. В сохранении есть служебные
порты порядка выполнения/компонента/зависимых узлов; они не наборы данных.
Для входных и выходного sockets сохранено `SyncThroughVariables="true"`,
`Elements` пусты — это автоматическое сквозное соответствие, не пустой вывод.
У разных узлов совпадают GUID выходного socket: владелец NodeRef обязателен.

## Мастер и lifecycle — наблюдено

Корень `MF;TF-1;WizrdMCF`. Без источников мастер открылся и разрешил Done.
Первая страница **`DerivedVariablesMappingEngineOutputPortWizard`**,
«Настройка соответствия между переменными», затем **`DoneWizard`**,
«Описание узла», `btnDone` / `btnExecute` / `btnView`.
Отдельной страницы алгоритма, Train или применения обученной модели нет.
Execute штатно выполнил соединение и источники с константами.

На первой странице видны `rbTable`, `rbLinks`, `grdTargetColumns`,
`btnAddMappingColumn`, `btnEditMappingColumn`, `btnTargetAutoLink`,
`btnTargetClearLinks`, `btnAutoSyncThroughColumns`, кнопки порядка.
Их ручное редактирование вне среза; настройки оставлены по умолчанию.
Grids этой страницы показывали «Загрузка…» с локальным count=0 даже при
готовой схеме графа. Это **не** источник доказательства пустого результата.
Next/Done/Execute прошли; полное соответствие подтверждено сохранением и
выходным VariablesForm. Этап 1 должен читать результат W1 и подтверждать
автосинхронизацию, не строить свой reader по этому пустому grid.
Отказа мастера и `btnError` на выбранном пути не возникло; причины ошибки
нет. Невалидные ручные mappings не проверялись.

Два источника — Калькуляторы переменных без табличного входа. Рёбра
source output 0 → union input 0/1 подтверждены свежими DOM по `data-tid`.
При одном подключённом левом входе появилась схема с шестью переменными;
выполнение одновходного случая не проводилось. После второго подключения
подпись соединения изменилась на «Параметр, Заголовок, Пустая строка (+9)».
Подпись/DOM suffix не являются identity; GUID остался прежним.
При настройке выполненного источника возникло штатное подтверждение
деактивации (`msgbox;tlb;yes`), затем редактирование прошло.

## Полный типизированный результат — наблюдено

После Execute двойной щелчок `Output_Var-0` открыл
`ModelForm;PreviewWindow;PreviewForm;VariablesForm;grdValuePreview`.
Локальный bound store содержит Name/DisplayName/DataType/ValueVariant/Index.
Прочитаны **все 12** записей, Index=0…11; native type 4 integer,
5 string, 1 boolean, 3 real. Метки сохранены из fixtures/inputs.json.

| Index | Выходное имя | Тип | Первое значение | После patch правого a0 |
|---:|---|---|---|---|
| 0 | a0 | integer | 11 | 11 |
| 1 | title | string | Левый | Левый |
| 2 | empty | string | `""` | `""` |
| 3 | enabled | boolean | true | true |
| 4 | ratio | real | 0.125 | 0.125 |
| 5 | missing | integer | NULL | NULL |
| 6 | a1 | integer | 29 | 41 |
| 7 | a2 | integer | 37 | 37 |
| 8 | title_1 | string | Правый | Правый |
| 9 | enabled_1 | boolean | false | false |
| 10 | ratio_1 | real | 0.1 | 0.1 |
| 11 | zero | integer | 0 | 0 |

Левый набор целиком предшествует правому. Коллизии выделяются последовательно:
a0/a0/a1 → a0/a1/a2; имя без цифр получает `_1`. Совпавшие метки не
нумеруются и не теряют значений. NULL сохранил integer type, пустая строка,
false и 0 не стали NULL. Числа прочитаны из typed store, без округления DOM.
Иные коллизии, регистр/Unicode/ведущие нули и unsafe Int64 не исследованы.

Изменён только правый a0: 29→41. После Done источника и Launch соединения,
без повторной настройки соединения и его связей, повторный полный вывод
изменил только a1. Пакет сохранён штатным Save As и Save после чтения.

В **новом browser profile** выполнены login → open сохранённого пакета →
Launch того же узла → чтение native output 0. Все 12 записей совпали с
обновлённым выводом, настройки не восстанавливались. Это ручное cold-discovery,
не независимая модельная приёмка или PASS run-check.
Оба browser context закрыты после штатного cleanup:
`package_closed=true`, `logged_out=true`, без discard.

Пробел `data-tid`: у пунктов выпадающего Download menu нет собственного tid;
«Скачать» выбран по точному тексту внутри привязанного `btnDownload;mn`.
Геометрия output socket после возврата с файловой вкладки однажды перекрывалась
перерисованной иконкой без tid; ручное открытие выполнено в точке исходного
socket по его data-tid. Это ограничение ручного discovery, не доказательство
работоспособности будущего production driver.

## Комплект и предлагаемый объём

[Контракт](contract.md), [карточка](node-card-proposal.json),
[приёмка](acceptance/README.md). JSON входов, task и первоначальный oracle
созданы до первого выполнения соединения. В ходе discovery уточнено правило
суффикса `_1` для имён без цифр; числовые значения oracle не извлекались из
Loginom. Окончательные expected и входной source.lgp подготовлены до любых
модельных прогонов. Source fixture 6 625 Б содержит только два источника,
исходный правый a0=29, без соединения и связей. Его XML проверяет oracle.

Предлагаются только automatic mapping и два fixed inputs, простые типы/NULL.
Полные ожидания initial/updated, точный порядок и real tolerance 1e-12 заданы
заранее для этапа 1. Typed inputs/read/cold остаются в W1; сверх W1 нужны
узловой lifecycle/ограничения/readback и аддитивная регистрация, свой файл
навыка и сценарий run-check. Основания для общего рефакторинга не обнаружены.

`not_checked`: динамические/пустые наборы, выполнение без одного входа,
ошибочный источник, ручные mappings, смена имени/типа источника, максимумы
Loginom, train/apply иных режимов, модельная приёмка и production typed cold.
Эти случаи не добавляются в предлагаемые критерии текущего среза.

## Размеры модели — измерение и оценка

UTF-8; JSON измерен после компактной сериализации, не размер pretty-файла.
Для текущего apply использованы `userNodeTool` и node-api точного cached SHA;
их байты совпадают с исходниками checkout. Runtime не менялся.

| Объект | Байты | Предел / смысл |
|---|---:|---|
| Текущий compact dock_node_apply (name+description+inputSchema) | 13 331 | ≤20 000, запас 6 669 |
| Полная внутренняя inputSchema | 53 748 | только измерение, лимита нет |
| Узловое содержимое карточки-проекта | 1 675 | ≤12 000 |
| Проекция полного describe с обычными metadata, пустыми pins | 2 543 | оценка; +1 024 Б reserve pins = 3 567 |
| Текущий SKILL.md | 38 215 | ≤40 000 |
| Строка маршрутизации-проект, с LF | 136 | около ≤200 |
| SKILL после только этой строки | 38 351 | запас 1 649, не учитывает параллельные PR |
| skill-proposal.md, будущий node reference | 2 678 | ≤6 000 |

Проекция describe использует обычную оболочку `describeNodeTypes` табличного
Соединения с заменой type/title/palette/icon, semantics, port counts,
mode/schema и help path, с revision `variables-column-union-v1`.
Это оценка **незарегистрированного** типа, не ответ существующего runtime.
Для итогового compact apply резерв добавлений узла ≤512 Б поверх принятого
W1; сам parameter_schema доставляется карточкой, не compact apply.
Фактические apply/describe/SKILL после W1 повторно измеряются на этапе 1,
бюджеты не повышаются. Оценка реализации после W1: **1–2 цикла**, затем
независимая приёмка по регламенту.
