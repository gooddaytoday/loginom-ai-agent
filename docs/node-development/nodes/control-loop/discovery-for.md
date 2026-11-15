# Цикл: native-проба FOR и переменной входа Подмодели

15.11.2026, LAB-1691, mas. База `v040@1f62bea68436ff96d3861fe2e7e6a44eb217b6cf`,
Loginom **7.4.2** (`LoginForm;Login;lblProductVersion`), Chromium 1246,
Node 24.19.0. Только `https://app.loginom.ai/app/?testable=true`, worker пары
`fca26310-b42b-43ed-b004-39a566e99e30`. Созданы собственные
`lab1691-for-offline.lgp`, `lab1691-for-rest.lgp`, `lab1691-groups.lgp`
в разрешённом каталоге worker. На старте load1/load5 = 0.40/1.66, 12 ядер;
браузер под `nice -n 19`. Сборок, изменений продукта и модельных прогонов нет.

**Native-срез выполним:** FOR на 3 итерации, вход переменных Подмодели
с integer Page и Limit, табличный выход; внутри переменные преобразуются в одну
строку, Калькулятор непосредственно читает `Var.Page * Var.Limit`.
REST получает вычисленный Skip как поле таблицы. Оба FOR-пакета после Save,
Close, logout и открытия в новом браузерном контексте повторили результаты
без настройки. Это ручная native-проверка, не PASS runtime/run-check.

Сырые DOM-доказательства приложены к карточке как `native-probe.jsonl`;
ниже указаны их строки и устойчивые `data-tid`. В Git сырые доказательства
и пакеты не включены. `G = MF;TF-N;Graph`, `W = MF;TF-N;WizrdMCF`;
FOR наблюдался в TF-1, группы — TF-4. Номер вкладки нельзя фиксировать в коде.

## Граница переменных и тело

У Подмодели создан **один вход переменных и один выход таблицы**, без табличного
входа. Это отдельный предлагаемый срез; прежняя граница table-in/table-out
сохраняет свой сценарий этапа 1.

| Действие | Наблюдённый data-tid / результат |
|---|---|
| Добавить вход | `W;GenericModelComponentWizard;grdModelPorts;tbl;GroupHeader;0;AddButton` → `W;GenericModelComponentWizard;mnAddSocket;ba746e45-732e-4115-b420-f8f645b94c8d` |
| Добавить выход таблицы | `…;GroupHeader;1;AddButton` → `…;mnAddSocket;d2278de3-ce0b-407b-9839-c05d14a1debe` |
| Настроить переменные | двойной щелчок по `G;Подмодель;Input_Var-0` → `W;TuneVariablesMappingWizard` |
| Добавить определение | `…;btnAddMappingColumn` → `EditTuneVariableForm;edtName`, `cbxDataType;trg_picker` → `cbxDataType;boundlist;Целый`, `pgcValue;Int64Field`, `btnApply`; завершение `W;btnDone` |
| Определения пробы | Page integer = **99**, Limit integer = **2**, не NULL; метки Page / Limit |
| Внутреннее зеркало | `G;Входной_узел;Output_Var-0`, наружный `Input_Var-0`; `native-probe.jsonl:1` |
| Внутренняя переменная в Калькуляторе | `W;CalcDataWizard;btnVariables` → `colFieldName_Var.Page`, `colFieldValue_Var.Page` = 99; `colFieldName_Var.Limit`, `colFieldValue_Var.Limit` = 2; строка 2 |

Во внутреннем графе локальные связи:

```text
Входной_узел|Output_Var-0|В_столбцы:_Page_Limit|Input_Var-0
В_столбцы:_Page_Limit|Output_Data-0|Skip|Input_Data-0
Входной_узел|Output_Var-0|Skip|Input_Var-1
Skip|Output_Data-0|Выходной_узел|Input_Data-0
```

`В_столбцы:_Page_Limit` — «Переменные в таблицу», режим «В столбцы»:
`W;VariablesToDataWizard;rbVarToColumns;DisplayEl`. Получается одна строка
Page/Limit. `Skip` — автоматическая подпись Калькулятора после добавления
единственного integer-выражения Skip; формула **`Var.Page * Var.Limit`**,
без промежуточности и кэширования. Редактор `W;CalcDataWizard;cmpExpression`,
параметры `W;ExprDataEditForm;edtName/edtDisplayName/cbxDataType/btnApply`.
Текст формулы принят native Next; выполнение исходного тела дало Skip=198,
Page=99, Limit=2. Это подтверждает чтение **переменных**, а не одноимённых полей.

В префиксе Калькулятора обычный переменный вход native — `Input_Var-1`;
его логический W1 ordinal — 0 (табличный вход отдельно имеет ordinal 0).
Внутренние связи не являются межсценарными: входное зеркало и оба потребителя
принадлежат одному внутреннему workflow. В пробе внешний источник переменных
не подключался: используются определения и значения входного порта Подмодели.
Обязательность и связь с внешним источником отдельно не проверялись.

## FOR: выбор, старт, результат

Первый шаг — checkbox исходной Подмодели
`W;LoopNodeWizard;colText_Root>Узлы_в_текущем_модуле>Подмодель;TreeCheckbox`.
Второй шаг имеет префикс `W;LoopParamsWizard;`:

| Суффикс data-tid | Наблюдение |
|---|---|
| `pedLoopKind;ValueControl;radiofield;DisplayEl` | «Заданные итерации», выбран по умолчанию |
| `pedIterationCount;ValueControl` | 10 по умолчанию, установлено 3 |
| `cbxLoopVariable;trg_picker` | доступны Page и Limit из входа Подмодели |
| `cbxLoopVariable;boundlist;Переменные_1.Page` | выбран Page; input readback «Переменные 1.Page» |
| `cbxLoopVariable;boundlist;Переменные_1.Limit` | вторая доступная переменная; не выбрана |
| `pedParallelProcessing;ValueControl;DisplayEl` | выключено |
| `pedIgnoreErrors;ValueControl;DisplayEl` | выключено |
| `pedAppendIterationIdentifiers;ValueControl;DisplayEl` | сначала выключено, затем включено отдельным выполнением |

Настройки — `native-probe.jsonl:4`. Состояние radio/checkbox читается по
`x-form-cb-checked` родительского `.x-form-item`, не по HTML `input.checked`.
Отдельного поля старта/шага переменной на посещённой странице не наблюдалось.
**Page=99 во входе не задаёт старт:** Цикл передал телу **0,1,2**.
Изменяемый старт, шаг и другие типы переменной этой пробой не проверены.
Шаг сопоставления выходных переменных не появился: у тела их нет.

Подпись после мастера — `↶Подмодель_(итерационный)`; порты
`G;↶Подмодель_(итерационный);Input_Var-0` и `Output_Data-0`.
Табличного входа у этого Цикла нет. Цикл исполняется без отдельного выполнения
исходного экземпляра Подмодели и без внешней переменной связи.

Выход 0 накоплен в последовательности итераций. Для
`R = MF;TF-1;ModelForm;PreviewWindow;PreviewForm;DataSetForm;normalHeaderCt`
наблюдались `R;Skip_0/1/2 = 0/2/4`, `R;Page_0/1/2 = 0/1/2`,
`R;Limit_0/1/2 = 2/2/2` (`native-probe.jsonl:5`). Порядок по умолчанию:
**Skip, Page, Limit**, все integer; заголовки имеют класс
`bg-TBGDataType-dtInteger-before`. Комплект FOR явно запрашивает этот порядок.

При включении идентификаторов добавляется последнее поле **IterationId**,
integer, метка «Идентификатор итерации», значения **0,1,2**;
`R;IterationId`, `R;IterationId_0/1/2`, строка 6. Это независимо от Page,
хотя в данной пробе значения совпали.

## REST и Save/cold

В том же теле выход Калькулятора подключён к `G;REST-запрос;Input_Data-2`,
а `REST-запрос;Output_Data-0` — к `Выходной_узел;Input_Data-0` (строка 12).
Создано собственное подключение в **модуле Подмодели**, GET
`https://httpbin.org/response-headers`, query-параметры limit и skip.
Его reference связан через `Output_Connection-0` → `Input_Connection-0`.

Сначала выполнен Калькулятор исходного тела: после cold его схема до выполнения
показывала REST только вычисляемый Skip. После выполнения в мастере появились
все три поля. В `W;RESTRequestWizard;ParamLinks` проведены связи
`colColumnName_2` (Limit) → `colParam_limit`,
`colColumnName_0` (Skip) → `colParam_skip` (строка 11).
Native принял integer-поля. Это query из **вычисленной таблицы**, не прямая
привязка настройки подключения к Var.Page; такая прямая привязка не проверялась.

Повторный Execute уже настроенного Цикла без повторного выбора тела дал:

| Итерация | RequestID | limit в Response | skip в Response | IterationId |
|---|---|---|---|---|
| 0 | 0 | "2" | "0" | 0 |
| 1 | 0 | "2" | "2" | 1 |
| 2 | 0 | "2" | "4" | 2 |

Порядок полей **RequestID integer, Response string, IterationId integer**.
Каждый Response через DOM `textContent` точно совпал с эталоном этапа 1:
98 UTF-8 байт, pretty JSON, `Content-Length: 98`, конечный LF (строка 13).

Оба пакета сохранены штатными `MF;MainMenuForm;btnSavePackage/btnSaveAsPackage`,
`SaveDialogForm;edtFileName/btnOpen`. Каждый закрыт, выполнен logout,
контекст браузера уничтожен; новый контекст вошёл тем же worker и открыл файл
через `OpenDialogForm;edtFileName/btnOpen`. Первым действием был Execute
сохранённого Цикла, **без мастера и повторной настройки**.

- offline: все 3×4 integer-значения повторились (строка 8).
- Затем readback мастера: FOR, count=3, «Переменные 1.Page», identifiers=true,
  остальные флаги false; мастер отменён (строка 9).
- rest: все три Response побайтно совпали с прежним `expected.json`,
  RequestID=0, IterationId=0,1,2 (строка 14).

CSV-экспорт в этой ручной пробе не проверялся; Save/cold не заменяет будущие
полные typed-read/CSV и ≥2/3 модельных прогонов на одном SHA.

## Фиксированное количество групп и ключевые поля

Отдельный пакет: импорт копии прежнего `fixtures/pages.csv` (integer
PageNo/Limit/Skip), Подмодель table-in/table-out с прямой внутренней связью,
Цикл с тем же табличным источником. Это не FOR и не переменное тело.
На странице `W;LoopParamsWizard` выбрана групповая обработка
`pedLoopKind;ValueControl;radiofield-2;DisplayEl`.

В `pedGroupProcessingKind;ValueControl;trg_picker` наблюдены варианты:
`…;boundlist;Фиксированный_размер_групп`,
`…;boundlist;Фиксированное_количество_групп`,
`…;boundlist;Разбиение_по_уникальным_значениям_полей`.

**Количество групп:** второй вариант, `pedGroupCount;ValueControl = 2`,
идентификаторы включены, parallel/ignore_errors выключены (строка 15).
Результат в исходном порядке PageNo=1,2,3, Limit=2,2,2, Skip=0,2,4;
последний IterationId **0,1,1** (строка 16). Значит, именно в этой точке
размеры групп **1 и 2**; предположение «сначала большая группа» неверно.
Общая формула распределения, пустые группы и count > числа строк не проверялись.

**Ключ:** третий вариант, отмечен только Limit через
`W;LoopParamsWizard;grdDataSet;headercontainer;Col0_Limit`; имена доступны в
`colColumnName_PageNo/Limit/Skip`, метки — `colColumnLabel_…` (строка 17).
Все три строки имеют Limit=2, поэтому IterationId=0,0,0.
С identifiers=true в конец добавились **IterationId**, затем **Limit_1**
(integer, метка «Limit», значения 2,2,2), сохранив исходный Limit (строка 18).
Native избегает совпадения имён полей результата суффиксом `_1`.
`R;Limit_1` может одновременно встретиться как заголовок нового поля и ячейка
исходного Limit в строке 1: нужен scoped header/cell read, не глобальный tid-only.
Несколько ключей, сортировка групп, NULL и не соседние повторяющиеся ключи
не проверялись; переносить на них наблюдённый порядок нельзя.

Пакет групп сохранён; cold для него не заявляется. Все собственные пакеты
закрыты, выполнен logout, видна `LoginForm;Login;btnLogin`, браузер и процесс
пробы завершены (`native-probe.jsonl:19`).

## Что уже есть в базе, что добавить

Все пути ниже относительно `packages/loginom-runtime/client/lib/`, строки
относятся к базовому SHA. Это чтение production-кода, не живая проверка NW1.

| Область | Нынешнее поведение и минимальная доработка |
|---|---|
| NW1 scope | `workspace.mjs:397` выбирает ближайший workflow, `:435` отзывает старые receipts и выдаёт новый scoped ref. Переход enter/leave уже есть; новая навигация не нужна. |
| NW1 границы и переменные | `node-target-browser.mjs:67` определяет input/output по native identity; `:149` читает Var-порты, `:170` назначает логические ordinal, `:185` возвращает boundary_role и variable_outputs. Входное зеркало остаётся nullvendor с ролью input; новую публичную разновидность узла проба не обосновывает. Проверить этот путь живым NW1 после расширения границы. |
| Локальная variable-связь | `node-contracts.mjs:132` уже требует одинаковый document/workflow. `node-target.mjs:276` проверяет наблюдённый variable output. Сохранять эти проверки: нельзя связывать внешний источник прямо с внутренним узлом. |
| Создание границы | `supernode-parameters.mjs:2` допускает только table-in/table-out, `:7` запрещает variable_inputs/bindings; `supernode-procedure.mjs:39` предполагает ровно два порта, `:65` требует табличные. Нужен отдельный ограниченный var-in/table-out срез и определения integer-переменных входа. |
| Чтение/сохранение границы | `supernode-context.mjs:40` принимает только VendorGUID таблицы, `:49` возвращает kind=table; `supernode-readback.mjs:15` требует table. Добавить наблюдаемые Var identity, определения, значения/NULL и readback сохранённых GUID. Удаление/перестановку связанных портов не разрешать. |
| Калькулятор | `calculator-parameters.mjs:51` уже допускает один ordinary variable mapping и `:53` один variable input. Новый язык формул не нужен: native `Var.Page * Var.Limit` работает. |
| Цикл | `loop-parameters.mjs:7` допускает лишь group_rows; `loop-node.mjs:38` отклоняет variable body; `loop-procedure.mjs:33` требует два табличных порта, `:147` настраивает только поддержанный group_rows. Добавить проверяемые FOR/count/входную переменную по identity и реальные порты var-in/table-out. |
| Readback/reread | `loop-readback.mjs:13` запрещает identifiers и variable, `node-read-contract.mjs:44` привязан к group_rows/size=1. Расширить только утверждённым срезом; не объявлять режим поддержанным по одному UI-флагу. |
| Приёмка | `scripts/node-acceptance/supernode-audit.mjs:18` проверяет именно табличную цепочку Input→Calculator→Output. В существующей оснастке нужен аудит **наблюдённых** локальных variable_links и сохранённого FOR; новый XML-oracle не нужен. |

Срез, отказы до мутации, последовательность работ и вопросы владельцу —
[подплан, разделы 4 и 7](plan.md). Комплект — [acceptance/README.md](acceptance/README.md).
