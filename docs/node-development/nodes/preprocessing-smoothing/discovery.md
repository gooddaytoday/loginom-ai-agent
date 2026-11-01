# Сглаживание: исследование этапа 0

2026-10-31, mas3, LAB-642. Назначенная база:
`v039@3377e6b164bcf509a050fb1536bae8dbf8bece39`.
Стенд — https://app.loginom.ai/app/?testable=true, Loginom 7.4.2
(`LoginForm;Login;lblProductVersion`). Только собственные исследовательские
пакеты назначенной пары. CLI не собирался, модельной приёмки нет.
Ниже отделены живые наблюдения от предлагаемого контракта этапа 1.

## Идентичность и страницы

Палитра содержит
`MF;TF-1;ModelForm;colVendors_Компоненты>Предобработка>Сглаживание;TreeText`.
Узел создан именно из этой строки. Component ID назначения:
`component.preprocessing.Smoothing`; runtime-предложение:
`preprocessing.smoothing`, mode `hodrick_prescott`.
Нативный fulltype сохранённого собственного узла — **TBGCustomModelComponentEngine**,
`Engine/@xsi:type` в `Unit_0/Unit.xml`; это общий движок, не отдельный
TBGSmoothingEngine. Тот же узел сопоставлен по его native GUID с живым DOM.
VendorGuid: `73aad18e-9b22-4667-9feb-94ee1cae948e`.
Настройки полей сериализованы как `TBGSmoothingDefExtension`; X/R имеют
UsageType=utActive, Lambda=1; остальные поля без активной роли.
Входной socket — TBGTuneDataSourceSocket, выходной — TBGDerivedDataSourceOutputSocket,
оба с SyncThroughColumns=true. Пакет получен только через Files UI:
colName → btnDownload → mniDownload, со штатным browserDownloadScript базы.
Ранние ожидания download без этой настройки не доказывали отказ Loginom:
браузер выбирал File System Access picker.
Один табличный `Input_Data-0` и один `Output_Data-0`.
Связь подтверждена DOM:
`Graph;series.csv|Output_Data-0|Сглаживание|Input_Data-0`.
Совместимость портов проверяется асинхронно: перед отпусканием перетаскивания
наблюдалось изменение изображения входного порта на `input_table_hover.svg`.

В собственном мастере наблюдались страницы:

1. `TuneDataSourceInputPortWizard` — настройка входных столбцов, если вход пуст.
2. `SmoothingWizard` — Сглаживание; при настроенном источнике открывается сразу.
3. `DerivedDataSourceMappingEngineOutputPortWizard` — соответствие столбцов.
4. `DoneWizard` — описание узла, `btnDone` и `btnExecute`.

Префикс мастера далее — `MF;TF-1;WizrdMCF;SmoothingWizard;`;
номер TF не является постоянной идентичностью.
`grdColumnsSettings`, `colDisplayName_X`, `colUsable_X`, `colAlgorithm_X`
задают выбор поля и метод. Флаг — `colUsable_X` с вложенным `img`.
Настройки справа появляются после включения поля и выбора его строки.
По умолчанию все флаги выключены. В списке были RowID, X, R;
строковый Tag отсутствовал. Импорт: RowID/X — integer continuous,
R — real continuous, Tag — string discrete.

## HP, ошибки и численный результат

Параметры выбранного поля:
`rbLambda;ValueControl;InputEl`, `edtLambda;ValueControl`,
`rbPeriod;ValueControl;InputEl`, `edtPeriod;ValueControl`.
Наблюдались Lambda=1600, период 39.7; редактирование Lambda включено,
периода — отключено. При Lambda=1 период стал 6.
У R был собственный default Lambda=1600 после настройки X=1.

Lambda=0.01 дала ошибку редактора и отказ перехода Далее:
`edtLambda;ValueControl input/@data-errorqtip`,
`WizrdMCF;btnError/@data-qtip` и `msgbox;cnt;cnt;MessagesView`:
«Значение этого поля не может быть меньше 0.0625».
При настройке импорта отдельно прочитан отказ из `btnError`:
«Имя файла не может быть пустым». После повторного ввода пути импорт настроен.

Для `fixtures/series.csv`, X/R с Lambda=1 выполнен обычный `btnExecute`;
обучение не запускалось. Выход прочитан через контекстное меню
`Graph;<метка>;Output_Data-0` → `mn;mniShowDataPreview`.
Автометка стала «Сглаживание: X, R», её tid — `Сглаживание:_X_R`.
До Execute мастер уже показывал будущие поля результата.

| Порядок | Техническое имя | Метка | Тип |
|---|---|---|---|
| 1 | RowID | RowID | integer (4) |
| 2 | X | X | integer (4) |
| 3 | X_S | X_smoothed | real (3) |
| 4 | R | R | real (3) |
| 5 | R_S | R_smoothed | real (3) |
| 6 | Tag | Tag | string (5) |

Сглаженные копии располагаются сразу после соответствующих исходных полей.
DOM заголовка `normalHeaderCt;X_S` содержит `bg-TBGDataType-dtFloat-before`.
Схема дополнительно сверена с `FColumnInfosStore` именно видимого
`ModelForm;PreviewWindow;PreviewForm;DataSetForm`.
Все 8 строк/48 ячеек сверены с независимым oracle; числа читались из уже
загруженного кэша этого DataSetForm, без вызова вычислителей Loginom,
перехвата или подмены его JS. Отображение округляет real до 2 знаков и
само по себе не доказывает точность. Максимальная абсолютная ошибка
для X_S/R_S относительно рационального решения — `8.881784197001252e-16`.

X_S: 1.2741398446170922, 3.253479040382481, 4.9586783915307775,
4.862119013062410, 4.477503628447025, 4.456415948091864,
5.972936053957142, 7.744728079911210. R_S=X_S/4.
Исходные RowID/X/R/Tag и их порядок сохранены.

## Предлагаемый контракт

`NODE_TYPES.semantics`:

> Smooth selected continuous integer/real series with Hodrick–Prescott.
> Each rule supplies lambda OR linked period. Preserve input rows, original
> values and row order; add real `<field>_S`, label `<label>_smoothed`.
> Read actual output mapping; use existing mappings for explicit column order.
> Execute current input without training; read table port 0. NULL observations
> have zero residual weight. Wavelets and bindings are
> outside this slice.

Каждое поле предлагаемой `parameter_schema` имеет description:
`parameter-schema.proposal.json`. Mode — строковый enum `hodrick_prescott`,
внутренние числовые коды алгоритмов модели не передавать.
Правила уникальны по техническому имени поля; lambda/period взаимоисключающие.
Новый узел требует полный список; существующий сохраняет список при пропуске,
пустой список выключает сглаживание. Неподдержанные методы, типы, переменные
и неоднозначные параметры отклоняются до UI. Штатный top-level `mappings`
уже описывает полный порядок полей; отдельной схемы для этого не нужно.

Компактный readback: node/source identity, mode, правила в порядке входных
полей (field, lambda, period, выбранный редактор), output_port=0,
реальные имена/типы результата. Табличные данные в readback не дублируются.

Oracle — `acceptance/oracle.py`, Python stdlib `fractions.Fraction`:
точное решение `(W + lambda D2ᵀD2)t = Wx`, W=1 для наблюдений, 0 для NULL.
Внутренний NULL проверен на null.csv: исходные X/R в строке 3 остались
NULL, X_S≈3 и R_S≈0.75. Все 48 ячеек совпали с oracle, максимальная
ошибка 1.7763568394002505e-15. Это не подстановка нуля и не удаление строки.
Краевые NULL (`edge-null.csv`) также проверены на прежнем узле без настройки:
исходные X/R в строках 1 и 8 остались NULL, X_S≈1 и 8, R_S≈0.25 и 2.
Все 48 ячеек совпали с oracle, max abs=1.7763568394002505e-15.
Для N≥2 при <2 известных значениях функционал не даёт единственного тренда;
oracle явно отказывается, не придумывает результат для all-null.
Живой all-null.csv (8 строк, X/R целиком NULL) не активировал узел:
Graph;Сглаживание:_X_R;Status → msgbox;cnt;cnt;MessagesView:
«Ошибка в алгоритме сглаживания». Preview сообщил «Узел не активирован».
Это ожидаемый отрицательный случай: не принимать старые значения либо нули
за результат. Независимая причина — вырожденная матрица при W=0.

Основной приёмочный результат после замены источника на update.csv:
8 строк/6 полей; X_S ≈ 7.764705882352941, 6.755656108597285,
5.981900452488688, 4.923076923076923, 4.076923076923077,
3.018099547511312, 2.244343891402715, 1.235294117647059; R_S=X_S/4.
После замены источника в том же импорте и выполнения прежнего узла без
перенастройки все 48 ячеек совпали с oracle (max abs 8.881784197001252e-16).
При исходном сопоставлении без сглаженных полей новые X_S/R_S добавились
в конец: RowID,X,R,Tag,X_S,R_S. Поэтому естественный порядок зависит от
истории выходного сопоставления. task.md явно закрепляет этот финальный
порядок; этап 1 использует существующий top-level mappings для него,
а не предполагает постоянную позицию новых полей. После закрытия пакета,
logout и открытия в новом профиле его авто-сопоставление вновь дало
RowID,X,X_S,R,R_S,Tag при тех же числах NULL-сценария.
Следовательно, для точного заданного порядка в этапе 1 требуется штатное
mappings.fields с autosync=false; естественное autosync=true не гарантирует
постоянства порядка между текущим и новым профилем. Это адресная настройка
порта нового узла через существующий контракт, не изменение общей оснастки.
ordered=true, column_order=exact, output_port=0. Исходные поля/NULL — точно;
для сглаженных real предлагается abs=1e-8, rel=1e-10. Метки, не заданные
пользовательским заданием, label_any=true. До этапа 1 критерии утверждает владелец.

## Общие изменения и стоимость

На базе уже имеются ordered, output_port и tolerance в expected-outputs.mjs;
старый W2 из подплана больше не требует общей реализации. Для выбранного
среза предполагаются аддитивная регистрация, свой обработчик, раздел навыка
и сценарий существующего run-check. Новые механизмы верификации не нужны.
Любая необходимость общей правки сверх этого — отдельное решение владельца.
Этап 1 оценивается в 1–2 цикла реализации + 1 цикл приёмки.

Полная inputSchema `dock_node_apply` на базе — 43329 Б. Предложение добавляет
тип, mode и properties из parameter-schema.proposal.json в клоне схемы;
runtime не регистрируется. Окончательное приращение **770 Б**: 43329 → 44099 Б, запас до 46000 — 1901 Б.
В оценку входят новый type, строковый mode и полная параметризация ниже.
Регистрации в runtime нет; прибавление измерено только в клоне inputSchema.
`node-caption-schema.test.mjs`: 4/4, exit 0.

Воспроизведение из корня checkout:

```sh
node --input-type=module - <<'JS'
import {readFileSync} from 'node:fs';
import {nodeApiTools} from './packages/loginom-runtime/client/lib/node-api.mjs';
const base=nodeApiTools.find(t=>t.name==='dock_node_apply').inputSchema;
const proposed=structuredClone(base);
proposed.properties.target.properties.type.enum.push('preprocessing.smoothing');
proposed.properties.mode.enum.push('hodrick_prescott');
Object.assign(proposed.properties.parameters.properties,JSON.parse(readFileSync(
 'docs/node-development/nodes/preprocessing-smoothing/parameter-schema.proposal.json'
)).properties);
const bytes=x=>Buffer.byteLength(JSON.stringify(x));
console.log({baseline:bytes(base),candidate:bytes(proposed),delta:bytes(proposed)-bytes(base)});
JS
```

Границы прочитаны у связанных с DOM нативных редакторов (read-only minValue,
maxValue, step, decimalPrecision): Lambda 0.0625…102659800000000, period 2…20000,
шаг обоих 0.1, allowBlank=false. Это границы редакторов, не гарантия исполнения
максимальных параметров. Пустое значение запрещено. Period=6 был выбран через
rbPeriod и дал Lambda=1; главный численный комплект использует Lambda=1.

В colAlgorithm наблюдались HP и Вейвлет-сглаживание. У последнего видны
радиокнопки Добеши, Койфлеты, CDF 9/7; поля edtWaveletOrder,
edtDecompositionLevel, edtEdgeExtension. Начальные значения: order=1, depth=1,
extension=Симметричное. Меню extension содержит Симметричное, Антисимметричное,
Продолжение нулями, Константное, Периодическое, Симметричное без крайней точки,
Антисимметричное без крайней точки. Нативный редактор order/depth показал 1…10.
Зависимые пределы Койфлетов и отключение порядка CDF не подтверждены отдельно;
wavelet вычисления и их NULL-интерполяция не проверялись, это этап 2.

Документированный контекст: [Loginom Help](https://help.loginom.ru/userguide/processors/preprocessing/smoothing.html).
Help не заменяет живые измерения и не использован как источник expected-чисел.


## Матрица этапа 0 и ограничения

| Случай | Живой итог | Независимый ожидаемый результат |
|---|---|---|
| series, lambda=1 | выполнен, все 48 ячеек совпали | exact rational HP, max abs 8.88e-16 |
| update в том же импорте/узле | выполнен без настройки сглаживания | 8 строк, новые значения, max abs 8.88e-16 |
| внутренний NULL | исходный NULL сохранён, сглаженное значение заполнено | линейный тренд, max abs 1.78e-15 |
| краевые NULL | исходные NULL сохранены | линейная экстраполяция 1/8, max abs 1.78e-15 |
| all-null | native отказ «Ошибка в алгоритме сглаживания» | вырожденная задача, нет численного PASS |
| empty | выполнен: 0 строк, те же 6 полей и типы | expected-empty.json, пустой список строк |
| Save/logout/new profile | повтор NULL без перенастройки дал те же числа | persistence настроек; порядок autosync восстановлен |
| period=6 | UI readback Lambda=1 | связанная настройка, не отдельный алгоритм |
| constant/linear | not_checked в UI | oracle даёт исходный constant/linear без изменения |
| неподдержанный Tag:string | отсутствует в списке сглаживания | до мутации отказ в будущем handler |
| lambda/period верхние границы | прочитаны у редактора | исполнение максимума not_checked |
| wavelets | только UI-инвентарь | расчёты и oracle этапа 2 not_checked |

Первые два браузерных сеанса завершены по сообщению
msgbox;cnt;cnt;cmp «Обнаружен разрыв связи. Восстановить сессию?»;
нажато «Закрыть», восстановления не было. После второго продолжено исследование
на новой копии ранее сохранённого собственного пакета. Это исследовательские
сеансы, не модельные FAIL/PASS. Позднее пакет штатно сохранён, закрыт и logout
подтверждён появлением LoginForm перед новым профилем.
Один ранний переход Files до загрузки Home открыл штатную ошибку
msgbox;cnt;cnt;MessagesView: Cannot read properties of null (reading 'NodeIndex').
Диалог закрыт; после загрузки Home Files открылся штатно, runtime не менялся.
Окончательная проверка фиксированного сопоставления — ниже.

Фиксированное сопоставление настроено штатно: контекстное меню Output_Data-0
→ mniConfigurePort → DerivedDataSourceOutputSocketWizard,
btnAutoSyncThroughColumns выключен, colName_X_S/R_S перемещены через
btnMoveMappingColumnDown. Readback списка colName: RowID,X,R,Tag,X_S,R_S.

После Save, закрытия пакета и logout файл вновь открыт в новом профиле.
Обычный Execute пустого источника вернул 0 строк с полями
**RowID,X,R,Tag,X_S,R_S** и типами integer,integer,real,string,real,real.
Порядок с autosync=false пережил новое открытие без повторной настройки.
Это подтверждает осуществимость предложенного column_order=exact через
существующие mappings; самостоятельного общего изменения не требуется.

Финальная уборка: Preview закрыт, собственный пакет закрыт через btnClosePackage;
видимых ModelForm не осталось. btnLogOut вернул LoginForm с видимой btnLogin.
Браузерные context/browser завершены. Сборок CLI этой карточки нет.

Точки этапа 1 по образцу базы: createTabularTransformNodeSupport уже принимает
собственные validate/preflight/configure/configureOutput/readback и
configurationObservation. Для Smoothing нужны свои field-specific callbacks
и аддитивная привязка новой страницы/readback; прежнюю логику узлов менять
по наблюдениям не требуется. Если реализация обнаружит необходимость общей
правки сверх этого, это stop, а не разрешение из исследовательского документа.
