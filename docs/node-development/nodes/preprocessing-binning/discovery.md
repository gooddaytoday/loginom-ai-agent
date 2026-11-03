# Квантование: этап 0, LAB-645

31.10.2026, mas, Linux x64. База `v039@3377e6b164bcf509a050fb1536bae8dbf8bece39`.
Живой стенд только `https://app.loginom.ai/app/?testable=true`, worker назначенной
пары `~/.config/loginom-multica/cards/01a124e5-1623-7a32-93c7-a3754c7dbdd7/`.
Первая сессия Chromium 1243, следующая — pinned 1246.
Наблюдены Loginom **7.4.2 Enterprise**, иконка `bg-vendor-icon-binning`.
Все действия выполнялись через `data-tid` в собственном диагностическом пакете.
CLI не собирался, runtime не изменён, модельных прогонов и приёмки нет.
Численные наблюдения ниже — discovery; критерии предлагаются владельцу до этапа 1.

## Палитра, страницы и адресация

Component ID назначения: `component.preprocessing.Binning`.
Runtime proposal: `preprocessing.binning`, режимы `internal` и существующий `apply`.
Native fulltype движка **`TBGBinningEngine`**, VendorGuid
`a0c05046-e72b-4d8f-8689-1385fa7f14d6` подтверждены в `Engine/@xsi:type` и записи
узла штатного сохранения собственного пакета (`Unit_0/Unit.xml`). Отдельное свойство
FullType RPC-прокси не вызывалось; имя JS proxy не подменяет native type.
В сохранённой конфигурации плитки: `TBGBinningTileNumericMethodSettings`,
`rlNoRound`, UserTileCount=3; материализованные `TBGBinningLinearContinuousBins`.
Сам пакет и сырые доказательства в Git не включены.
Палитра: `ModelForm;colVendors_Компоненты>Предобработка>Квантование;TreeText`.
Префикс исследования `MF;TF-1`, корень мастера `MF;TF-1;WizrdMCF`.

В графе есть основной `Input_Data-0`, служебный `Input_Add` для внешних диапазонов,
выходы `Output_Data-0` («Выходной набор данных») и `Output_Data-1`
(«Диапазоны для квантования»). Внешний вход не входит в предлагаемый срез.
После Done метка стала «Квантование: X»; адресовать по GUID, перечитывая DOM-метку.

Инвентарь мастера: `TuneDataSourceInputPortWizard`, `MethodSettingsWizard`
(внешние интервалы), `MethodSettingsWizard-1` (основная настройка),
два `DerivedDataSourceMappingEngineOutputPortWizard` (второй с `-1`), `DoneWizard`.
При связанном импорте пустая страница входа пропускается; внешняя страница скрыта,
если дополнительных входов нет. Скрытое наличие страницы в DOM не означает её
готовности. Конец — `btnDone`, а не скрытый `btnNext`.
У grid editingPlugin наблюдён clicksToEdit=2. Немедленные снимки после жеста
могут не содержать inline editor; его появление асинхронное. Сначала выбрать поле
и дождаться стабильной строки, затем открыть редактор и дождаться видимого picker.
Перед переходом перечитать связь редактора с полем; отсутствие в раннем снимке
не означает завершённого открытия или разрешения повторить мутацию.

В собственной странице `MethodSettingsWizard-1;grdColumns` видны только пригодные
поля RowID/X; строковое Note отсутствует. Строки адресуются индексом (`colDisplayName_1`
для X в этом входе), поэтому индекс нужно связать с текущим полным списком полей.
`btnEditMethodSettings` раскрывает настройки выбранной строки. Без выбранного метода
раскрывать нечего: сначала `colMethodType_1` → inline combo → точный пункт.

Настройки строки имеют самостоятельный префикс **`MethodSettingFrame;`**,
без префикса сценария. Его нельзя искать как `WizrdMCF;MethodSettingFrame`.
При нескольких раскрытых строках одинаковые TID нужно связывать с их владельцами;
`first()` не является разрешением неоднозначности. Пробелов `data-tid` у настроек
исследованного числового среза не обнаружено; вложенные input адресуются от своего control.

## Числовые методы и параметры

Список метода наблюдён в inline combo: `<Не определён>` (0), **Ширина** (2),
**Количество** (3), **Плитка** (4), **Коэффициенты СКО** (5).
Отдельного метода «Границы пользователя» нет. У count/width задаются крайние
пределы; редактирование рассчитанных интервалов — отдельная возможность мастера.
SD, внешние диапазоны и произвольное редактирование не входят в первый контракт.

| TID относительно MethodSettingFrame | Наблюдение |
|---|---|
| `cbbCountBins;ValueControl` | count default 5; числовой control, UI min/max ±9007199254740991 |
| `chkStrictLowerLimit`, `chkStrictUpperLimit` | false; включают ручные пределы |
| `edtLowerLimit;ValueContainer;Int64Field` | Integer control; исходно 0, disabled через родителя |
| `edtUpperLimit;ValueContainer;Int64Field` | Integer control; исходно 10, disabled через родителя |
| `chkLowerLimitOpen;ValueControl`, `chkUpperLimitOpen;ValueControl` | false |
| `chkRoundingLevel` | Integer=true, Real=false; для критериев явно отключать |
| `edtBinWidth;ValueControl` | Real width вручную задан 10; крайние пределы отдельными controls |

UI min/max не заменяют проверку алгоритма. count=0 → Next оставляет страницу;
**`WizrdMCF;btnError/@data-qtip`: «Количество интервалов должно быть больше 0»**.
Причина прочитана из кнопки ошибки. Изменённый диагностический draft закрыт с отказом
от сохранения; корректная конфигурация не заменялась нулём.

## Обучение и применение

На Integer X с явными пределами 0/20 и count=2, без округления/открытых краёв,
обычный Execute дал строки, но после повторного открытия `BinsCount=0`.
Штатное контекстное действие `mn;mniTeachNode` («Обучить узел») создало
`BinsCount=2`; после выбора X таблица `grdBins` содержит `[0..10]`, `(10..20]`.
Следовательно, configured, вычисленный выход и материализованная модель различаются.

При count=2 без ручных пределов проведён отдельный lifecycle опыт: обучение на
исходных данных, смена файла **того же импорта** на update.csv, применение **того же
узла** без обучения. Новые RowID 201…206/X=100…150 дали шесть `X_OutOfBins=1`,
номер/метка/границы NULL. После явного обучения и нового Execute номера стали
`[0,0,0,1,1,1]`, интервалы `[75..125]`, `(125..175]`.
Автопределы шире входных min/max; универсальная формула этим опытом не установлена.
В предлагаемом этапе 1 у count/width ручные пределы обязательны.

Обучение активного узла не обновляет уже открытый preview. После него требуется
отдельное свежее выполнение: штатная деактивация, затем Execute. Старый preview
не доказывает новый результат. Apply должен закрывать просмотренный draft без
коммита и не вызывать обучение, по образцу `linregression-node.mjs`.

## Плитка / Real

На явном Real X (тип 3), frequency.csv `[0,2,4,6,8,10]`, «Плитка»=3,
совпадения «Добавлять в следующий», sums=false, rounding=false, open=false:
порты 0/1 подтвердили `[0..4)`, `[4..8)`, `[8..10]`, номера `[0,0,1,1,2,2]`.
Независимый oracle сортирует значения, делит на равные группы и берёт первое
значение следующей группы как очередной нижний предел. Для данного набора
это rank 0/2/4 → 0/4/8, последняя верхняя 10. Обобщение на неделимое число
наблюдений и вырожденные интервалы не объявляется принятым.
После смены того же Real-импорта на frequency-ties.csv `[0,2,2,6,8,10]` и явного
переобучения получены `[0..2)`, `[2..8)`, `[8..10]`, номера `[0,1,1,1,2,2]`.
Оба одинаковых значения 2 ушли в следующий интервал, как предсказал rank oracle.

Controls: `MethodSettingFrame;cbbTileCount;ValueControl` (default 5),
`cbbMatchingObservationsMode;ValueControl` (default 0, «Добавлять в следующий»),
`chkSummTile;ValueControl`=false. Прочитаны все пять пунктов совпадений:
следующий, текущий, случайно, как есть, одинаковые плитки; реализовать предлагается
только следующий. У Real `chkRoundingLevel` исходно false (у Integer был true).

## Схема и значения

На исследованных Integer и Real входах schema появилась до Execute в обеих страницах
выходных отображений. Поля и порядок порта 0:

`RowID integer, X integer, X_BinsID string, X_Number integer, X_Label string,
X_LowBound integer, X_UppBound integer, X_LowBoundIncl boolean,
X_UppBoundIncl boolean, X_LowLimOpen boolean, X_UppLimOpen boolean,
X_OutOfBins integer, Note string`.

Исходное поле остаётся на месте; его 10 производных полей следуют сразу за ним,
затем продолжаются исходные поля. Не превращать это в «все входные, потом все новые».
Номер интервала с нуля, BinsID — имя поля X, не случайный GUID.
Граница 10 принадлежит нижнему интервалу, оба повторения обрабатываются одинаково.
По values.csv номера `[0,0,0,0,1,1,NULL,0]`; порядок RowID 1…8 сохранён.
При NULL X остаются BinsID=X и флаги открытых краёв=false, остальные производные
значения NULL. Note=NULL и Note="" различаются и сохраняются.

Порт 1, порядок:
`BinsID string, BoundsDataType integer, Number integer, LowBound integer,
UppBound integer, Label string, LowBoundQuota real, UppBoundQuota real,
BinQuota real, LowDev integer, UppDev integer, LowLimitOpen boolean,
UppLimitOpen boolean`.
На двух обычных интервалах код типа 4; квоты нижней границы `[1,0]`, верхней `[1,1]`,
BinQuota=NULL. LowDev/UppDev в этом случае совпали с пределами интервалов.
Эти поля не следует угадывать по названию как разность от входного значения.
На Real X поля X/LowBound/UppBound/LowDev/UppDev имеют тип real,
BoundsDataType=3; Boolean и номера сохраняют свои типы. Тип квот всегда real.

При ручной подготовке свежего Real-импорта стандартный десятичный разделитель
оказался запятой: 5.25 превратилось в NULL ещё во входном preview. Это ошибка
настройки диагностического источника, не результат квантования. Во всех task
зафиксирована десятичная точка; исходный preview необходимо проверить до обучения.
После выбора «Точка (.)» и штатного пересчёта типов входной preview показал
5.25 с типом Real. После коммита источника и нового Execute все 8×13 ячеек
порта 0 и 2×13 ячеек порта 1 совпали с независимым expected-real;
последняя X=5.25, номер=0, Note="".
Oracle и 5.25 из fixture из-за этого не меняются.
Затем на том же Real-входе того же узла выбран метод «Ширина», width=10,
ручные 0/20, rounding=false. После обучения и свежего Execute все 8×13 ячеек
порта 0 и 2×13 ячеек порта 1 совпали с независимым expected-width.
После замены файла того же Real-импорта на holdout.csv, без обучения/пересоздания
Binning, свежий Execute дал 7 строк, полностью совпавших с независимым expected-holdout; порт 1 сохранил прежние два интервала.
OutOfBins=`[-1,0,0,0,1,NULL,0]`, Number=`[NULL,0,0,1,NULL,NULL,0]`; 0/20
попали в крайние интервалы, 10 в нижний. Note=NULL/empty сохранены.

Чтения discovery использовали полный кеш native preview, связанный с видимым
гридом; это не подтверждение production-reader или точности бинарного Real.
На этапе 1 полные таблицы читает существующий точный reader, включая cold-check.

## Предлагаемые критерии и реализация

Численные ожидания генерирует независимый Python oracle, без Loginom/runtime.
Файлы `acceptance/task*.md`, `fixtures/` и `expected*.json` — предложение,
не результат приёмки. Утверждение владельца требуется до реализации.

Предложение: одна выбранная Integer/Real колонка; count/width с явными крайними
пределами, frequency по количеству строк с детерминированным правилом «Добавлять в
следующий»; без округления, открытых краёв и переменных. Для остальных колонок
метод не назначается. DateTime, SD, суммы, случайные tie policies, внешние таблицы,
произвольные ручные границы/метки — отдельный срез после решения владельца.

Публичный `NODE_TYPES.semantics` должен объяснять: «Квантование одного Integer/Real
поля. parameters.binning: field, method count/width/frequency, size и обязательные
limits для count/width. internal обучает текущий вход, затем выполняет; apply
применяет существующие сохранённые интервалы без коммита настроек и обучения.
Оба табличных выхода 0/1 обязательны. Порядок исходных строк сохраняется; NULL не
становится нулём. Числовые коды native enum не передавать».

Каждое поле [предлагаемой схемы](acceptance/parameter-schema.json) имеет description,
enum строковые. Комбинации проверяются до мутации: целый size для count/frequency,
положительный width, limits только для count/width, lower<upper, конечные числа,
поле существующее числовое. Existing apply принимает `{}` и проверяет наличие
сохранённых интервалов; если есть только настройки, отказ с причиной и способом
явного обучения. Не выдавать execute текущих настроек за saved-model apply.

Компактный readback: kind=binning, mode, field/type, method/size/limits, rounding=false,
open_ends=false, tie policy, отдельное состояние `settings`/`materialized`,
наблюдённые интервалы, настройка включённых пределов, источник/порт обучения,
training requested или not_requested, обе точные output mappings. Apply сохраняет
материализованные интервалы; schema не включает необоснованных хешей/receipts.

W1 уже имеет `trainConfiguredNode` и образец apply в линейной регрессии.
W2/W3 уже поддержаны `expected-outputs.mjs`: tolerance, ordered, node_id+output_port.
Новый механизм проверки не нужен. План этапа 1 — собственные binning-модули и
аддитивные регистрации/наблюдения собственной страницы в существующих узловых
контрактах, свой раздел навыка, сценарии run-check. Общие алгоритмы, packages/agent,
публичный контракт, бюджеты и deadlines не менять. Если реализация выявит нужду
в иной общей правке — остановиться с вопросом по правилам назначения.

Старые ссылки подплана на отсутствующий W1/W2/W3 и на 15 типов описывают старую базу,
а не текущий v039. Оценка этапа 1: 3 цикла — count/width и UI-контракт, frequency/ties,
сохранённая модель/cold; обязательные 2/3 на одном SHA и независимые 2/3 затем.

Справка отделена от live-наблюдений: [описание компонента](https://help.loginom.ru/userguide/processors/preprocessing/binning.html),
[выходные поля](https://help.loginom.ru/userguide/processors/preprocessing/binning/calculated-columns.html),
[квоты и коды типов](https://help.loginom.ru/userguide/processors/preprocessing/binning/parameters-of-binning-ranges.html).
Справка не является oracle численных результатов и не заменяет наблюдение стенда.

## Размер полной apply-схемы

`node --test test/node-caption-schema.test.mjs` из client: **4/4 PASS**, база **43329 Б**.
Измерение JSON.stringify/Buffer.byteLength UTF-8 на той же полной схеме с клоном
`acceptance/parameter-schema.json` под parameters.binning, новым type в target.enum и
новым mode internal: **44189 Б**, приращение **860 Б** (814 Б сам объект параметров).
Режим apply уже присутствует и повторно не начисляется. Runtime-регистрация не сделана.
Оба ограничения выполнены: прирост ≤1050 Б, текущая итоговая оценка <46000 Б.
Будущие добавления других типов это измерение не покрывает.

Из корня checkout, Node 24.19.0 (воспроизводит принцип теста sizing):

```sh
node --input-type=module - <<'JS'
import {readFileSync} from 'node:fs';
import {nodeApiTools} from './packages/loginom-runtime/client/lib/node-api.mjs';
const s=structuredClone(nodeApiTools.find(t=>t.name==='dock_node_apply').inputSchema);
const bytes=v=>Buffer.byteLength(JSON.stringify(v)), before=bytes(s);
s.properties.target.properties.type.enum.push('preprocessing.binning');
s.properties.mode.enum.push('internal');
s.properties.parameters.properties.binning=JSON.parse(readFileSync(
 'docs/node-development/nodes/preprocessing-binning/acceptance/parameter-schema.json'));
console.log({before,after:bytes(s),growth:bytes(s)-before});
JS
```
