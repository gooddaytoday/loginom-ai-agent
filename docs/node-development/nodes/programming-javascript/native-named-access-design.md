# G5: доступ по имени/индексу/регистру; J24: технические имена

Статус: **дизайн для root review, без реализации и без live-проверки новых случаев**.
Дата: 2026-09-27. Проверенный HEAD worktree: `87332cec9804c761465dad766f989fb458c4d997` (source82).
Прочитаны текущие root plan/review/e2e-coverage и root native-integer-coercion-design из
`/home/george/git/loginom-ai-agent/docs/node-development/nodes/programming-javascript/`.
Root сообщил о документирующем commit `8f0ea4e427`; этот commit не является HEAD данного worktree.
Семь Integer coercion runs приняты root; это предшествующий результат, а не проверка named access.
Полный G5, public handler и CLI остаются открытыми. Этот документ не сокращает основной plan.

## 1. Решение и границы

Выбран поэтапный закрытый каталог случаев: один case — один свежий owned запуск, один
фиксированный исходник, собственные INPUT/OUTPUT/upstream и журнал. Минимальное ядро —
25 запусков: A=8 положительных input probes, B=8 независимых wrong-case/missing probes,
C=4 OutputTable.Set probes, D=5 случаев AssignColumns Name/DisplayName. Порядок допуска:
A → B; A → C → D. Это порядок проверки зависимостей, не цикл автоматических запусков.
Неудача одного case оставляет остальные слоты `not_run`, координатор назначает их отдельно.
Ни один источник не выполняет последовательно несколько разных исследуемых lookup API.
Цикл по четырём строкам внутри положительного case проверяет один и тот же accessor;
lookup столбца через GetColumn/Columns выполняется ровно один раз перед этим циклом.

Рассмотрены альтернативы:

- Сразу расширить весь reader на произвольные поля/источники: слишком большая область
  допуска, потеря связи с прежними exact guards. Не выбран.
- Один общий JS с try/catch вокруг всех probes: ранний отказ/побочные эффекты осложняют
  атрибуцию и маскируют неполное покрытие. Не выбран.
- Закрытые стадии с сохранением одноимённой схемы в A–C и отдельным контрактом схемы D:
  выбран. Потребует небольших additive case branches, но сохраняет независимость доказательств.

Сначала реализуется только A после отдельного решения root. Этот документ фиксирует
источники остальных стадий для review, но не разрешает их запуск. Параметры API/Name не
принимаются от вызывающего кода: только case ID из каталога с exact source/CSV SHA256.
Поздние дополнения (§9) также закрытые и отдельно ревьюируются; это оставшиеся проверки,
а не неявное обещание, что ядро доказывает весь интерфейс.

## 2. Документация и исторические гипотезы

[Help: входные наборы](https://help.loginom.ru/userguide/processors/programming/java-script/input-tables.html)
описывает Get, GetColumn, IsNull с номером либо именем столбца, а также коллекцию Columns.
Отсюда следует положительное ожидание для существующего точного имени и корректного
индекса. Поиск «регистр» на этой странице совпадений не дал; это не доказательство
чувствительности или нечувствительности runtime. Missing-name outcomes страница не задаёт.

[Help: выходные наборы](https://help.loginom.ru/userguide/processors/programming/java-script/output-tables.html)
описывает Set для текущей добавленной строки, AssignColumns и AddColumn как разные методы.
Документированные index/name overloads дают положительные контроли C; преобразование
недопустимого Name и точные сообщения об ошибках из этого описания не выводятся.

[Help: описание API](https://help.loginom.ru/userguide/processors/programming/java-script/api-description.html)
разделяет Name и DisplayName, задаёт index/name в коллекциях и свойства Index/Get у
столбца. Integer имеет код 4. Эти определения используются для дизайна источников,
а не как доказательство поведения закреплённой сборки 7.4.2. Онлайн Help прочитан
2026-09-27, не закреплён за этой сборкой; runtime observation имеет приоритет.

Root plan: G5 в строке 195, открытый named/index/case/J24 в строках 245–246,
J24 в строке 697. Review-recommendations: строки 157–160 требуют фактические имена
в readback и правило Name в знаниях. Утверждение supplied prompt о регистре — гипотеза
для runtime-проверки; нельзя превращать его в заранее известную ошибку движка.

Прочитаны внешние исторические источники (без запуска):

- `/home/george/git/testing/e2e-tests/tests/toreview/acceptance/wizards/javascript/js_data_input.ts`:
  видимый test.skip про InputVariables, не oracle входных таблиц данного дизайна.
- `js_data_output.ts` в том же каталоге, строки 56–75: active-тест ожидает «Инт» → «Int»
  по заголовку preview. Это историческое ожидание, не свежая native-проверка Name.
- Строки 307–400: оба сценария разных имён/меток и проблемных имён — **test.skip**, TODO2332.
  В них заложены РусскиеБуквы→RusskieBukvy, 124→_124, пустое имя→COL,
  omitted→COL3/COL4 и ΘΔΣ_Greek→____Greek. Эти правила не переносятся в oracle.
  Проблемные имена создаются через AddColumn; D ниже использует AssignColumns.
- `js_errors.ts`, строки 31–35: сообщения для отсутствующих выходных столбцов получены
  историческим сценарием с иными состояниями таблицы. Их текст и позиции не копируются
  в expected error данного эксперимента.

## 3. Реальные пределы source82 и точные точки расширения

Полные пути в таблице относительны `packages/loginom-runtime/`; имена `javascript-*.mjs`
без каталога находятся в `tools/loginom-acceptance/`. Номера относятся к source82.
Нынешние readers **не исполнят новые case IDs без реализации**. Верхняя транспортная
граница 8 столбцов/50 строк не означает, что частный допуск уже поддерживает такие таблицы.

| Место | Наблюдаемое ограничение | Предлагаемое изменение после review |
| --- | --- | --- |
| `tools/loginom-acceptance/javascript-native-fixtures.mjs`, javascriptNativeFixture / javascriptNativeReadFixture | Закрытые fixture IDs; по роли различаются тип/число строк, не произвольная схема | Отдельный закрытый named case catalogue, вход A–D ссылается на неизменённый integer-safe CSV; case ID и input fixture ID различаются явно |
| `javascript-native-input-contract.mjs`:35,63–67,94–97 | Один Value/Value; exact import settings, output mapping, клетки | Для A–D сохраняется старый input contract integer-safe. Не добавлять общий allowName/allowSchema |
| `javascript-native-input-binding.mjs`:53–55,134; `javascript-native-input-read.mjs`:15–18 | Fixed slice/enum; held field Name/DisplayName, columns=[0] | Сохранять input fixture ID integer-safe; новую trial identity привязывать отдельно в named capability, не подменять старый fixture |
| `javascript-native-roundtrip-owner.mjs`:2–54,171–201,226–257 | Один held upstream field Value/Value, pinned source/mode, Done и completed child | Переиспользовать owner/upstream/Done checks; добавить immutable named case ID + input fixture ID + source pin, новый отдельный output policy |
| `javascript-native-roundtrip-contract.mjs`:11–22,26–53,55–99,142–163 | Источник выбирается по fixture; одна identity mapping; output по умолчанию равен input | Отдельные verifyNamedInput/Outcome и explicit case registry. A-copy oracle, A-IsNull oracle, B marker oracle, C one-cell oracle, D schema characterization. Старые equality не ослаблять |
| `javascript-native-roundtrip-binding.mjs`:50–54,156; `javascript-native-roundtrip-read.mjs`:16–20 | Enum, row count, ровно Value/Value/один столбец | A: fixed 4-row output; B/C: fixed 1-row output; D: отдельная sealed schema capability на единственный наблюдённый столбец; upstream всегда прежние 4 строки Value/Value |
| `javascript-native-roundtrip-driver.mjs`:22–25,50–57 | failed разрешён только coercion upstream; preview и args жёстко Value/Value | Named dispatcher с раздельным выбором input/output policy; D связывает preview с native metadata, не подставляет Name из текста заголовка |
| `javascript-native-coercion-failure.mjs`:30–45,122–146 и `javascript-native-coercion-failure-driver.mjs` | Capability семи coercion pins; failure сейчас unattributed/incomplete | Новый named failed-witness family с собственными pins, переиспользующий проверенные owner/error mechanics. Не выдавать named case за coercion |
| `javascript-native-coercion-run.mjs`:14–71,74+ | Один запуск, fixed seven slots, exact ACK и fsync отчёта | Отдельный named coordinator с фиксированными 25 слотами; семь coercion slots/отчётов не менять |
| `javascript-execution-runtime.mjs`, `javascript-live.mjs`, `javascript-native-roundtrip-live.mjs` | Соединяют case selection, prepared JS, execution и native read | Additive private named wiring с closed ID; public arbitrary source API не вводится |
| `client/lib/variant-native-values.mjs`:33–49 | Generic decoder допускает ≤8 columns/≤400 cells и exact native tags | Переиспользовать decode/adapt и int64/NULL validation; общий decoder не предоставляет named capability и не определяет semantic oracle |

Метод 321/interface116 читает физические координаты. Наблюдение клетки по индексу 0
доказывает bytes именно этой клетки при сохранённом owner, но ничего само по себе не
говорит о `InputTable.Get(row,"Value")`. JS source pin + owned execution + независимый
input/native output связывают named API с результатом. Прежние Unicode string **values**
также не доказывают Unicode technical Name. Source82 owner допускает ≤32 строки исходника;
все исходники ядра ниже короче. Ограничения bytes/deadline/release/no-replay сохраняются.

## 4. Стадия A: восемь положительных случаев, точные байты

Переиспользуется существующий файл
`packages/loginom-runtime/tools/loginom-acceptance/fixtures/javascript-native-input-integer-safe.csv`.
Новый CSV не создаётся. UTF-8 без BOM, LF, последняя LF обязательна, 55 байт.
SHA256: `86983c730cec045020a014b5bd365b2cf604c5f214774eb4a31b9344f6d0865d`.
Нормативное байтовое представление в JSON:

```json
"Value\n__JS_NULL__\n-9007199254740991\n0\n9007199254740991\n"
```

Импорт до создания JS: Integer (native DataType=4), Name=DisplayName=Value, used=true,
вид данных из существующей integer-safe fixture, delimiter `;`, quote `"`, UTF-8,
первая строка — заголовок, NULL token `__JS_NULL__`; все остальные параметры и provenance
без изменения из nativeInputRequest(integer-safe). Не угадывать schema по CSV preview.
Readback настроек/связей + complete native INPUT обязательны до JS; сравнение после JS
использует свежий native upstream того же исходного import child.

Независимый oracle INPUT/upstream (4×1), не вычисляется из JS output:

| row | Значение | Native representation |
| --- | --- | --- |
| 0 | NULL | tag=1, native_null; не строка NULL token |
| 1 | −9007199254740991 | tag=20, signed-int64-le, `010000000000e0ff` |
| 2 | 0 | tag=20, signed-int64-le, `0000000000000000` |
| 3 | 9007199254740991 | tag=20, signed-int64-le, `ffffffffffff1f00` |

OUTPUT в A тоже Integer Value/Value, 4×1. Для Get/GetColumn/Columns он обязан точно
совпасть с INPUT, включая NULL и int64 bytes. Для IsNull independent expected vector
`[1,0,0,0]`: tag20 у всех клеток, 1=`0100000000000000`, 0=`0000000000000000`.
Boolean→Integer кодирование намеренное и контролируемое: source предварительно требует
`typeof missing === "boolean"`; не тестируем implicit coercion. Для ненулевых Get
source требует number; поэтому строка с теми же цифрами не сможет пройти за счёт Set conversion.
Копирование NULL не различает JS undefined/null; A этого не утверждает. Для каждой пары
index/exact сверяется один и тот же заранее заданный oracle, а не просто равенство двух runs.

Все блоки A ниже задают **полные** source bytes: UTF-8 без BOM, LF, одна завершающая LF,
без fence-маркеров, без добавочного пустого ряда. Никакой форматтер/trim или автоимпорт
не допускается. SHA и длины вычислены при создании документа, не результат выполнения JS.

| Case | OUTPUT oracle | Bytes | Source SHA256 |
| --- | --- | --- | --- |
| A-get-index | NULL, −9007199254740991, 0, 9007199254740991 | 501 | `ade8e3b5195f4c6cd81c09ced0836e909d1ad037b99b40ac152805630ffd8782` |
| A-get-exact | NULL, −9007199254740991, 0, 9007199254740991 | 507 | `6befc43d503c85db5063fe2ae128cdbfc52db37f26cf449610639e3280079ab5` |
| A-getcolumn-index | NULL, −9007199254740991, 0, 9007199254740991 | 659 | `bb2b3bbd7adf0204483b9a3367ba1506f2fc4fd9b89d45ce9381147ac8868766` |
| A-getcolumn-exact | NULL, −9007199254740991, 0, 9007199254740991 | 665 | `ddda422a0d6a06aa08ad0743fdfb616f18641e232aaa5b9921d8b752aa777ee1` |
| A-columns-index | NULL, −9007199254740991, 0, 9007199254740991 | 657 | `5410965b02be2a044a1973b31ca2290d60ee935a817109329728a4fa21021032` |
| A-columns-exact | NULL, −9007199254740991, 0, 9007199254740991 | 663 | `752e74be9ab4fb53adece872ec1492ee7fd761f4ec086229187965120eec902e` |
| A-isnull-index | 1, 0, 0, 0 | 487 | `1ab38e09307a876f96b6e3b83e2a46f3b34da9cb4f90a759413cd4d36dd0dc98` |
| A-isnull-exact | 1, 0, 0, 0 | 493 | `57ceade9570a31dc76f0e2a94e514c1ad7d4474470467ba69649d3dc2b4fb34c` |

### A-get-index

```javascript
import {InputTable,OutputTable,DataType} from "builtIn/Data";
if (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error("JS_NAMED_INPUT_SHAPE");
OutputTable.AssignColumns([{Name:"Value",DisplayName:"Value",DataType:DataType.Integer}]);
for (let row=0;row<4;row++) {
  const value=InputTable.Get(row,0);
  if (row === 0 ? value !== undefined && value !== null : typeof value !== "number") throw Error("JS_NAMED_VALUE_KIND");
  OutputTable.Append();
  OutputTable.Set("Value",value);
}
```

### A-get-exact

```javascript
import {InputTable,OutputTable,DataType} from "builtIn/Data";
if (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error("JS_NAMED_INPUT_SHAPE");
OutputTable.AssignColumns([{Name:"Value",DisplayName:"Value",DataType:DataType.Integer}]);
for (let row=0;row<4;row++) {
  const value=InputTable.Get(row,"Value");
  if (row === 0 ? value !== undefined && value !== null : typeof value !== "number") throw Error("JS_NAMED_VALUE_KIND");
  OutputTable.Append();
  OutputTable.Set("Value",value);
}
```

### A-getcolumn-index

```javascript
import {InputTable,OutputTable,DataType} from "builtIn/Data";
if (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error("JS_NAMED_INPUT_SHAPE");
OutputTable.AssignColumns([{Name:"Value",DisplayName:"Value",DataType:DataType.Integer}]);
const column=InputTable.GetColumn(0);
if (column.Index !== 0 || column.Name !== "Value" || column.DisplayName !== "Value") throw Error("JS_NAMED_COLUMN_IDENTITY");
for (let row=0;row<4;row++) {
  const value=column.Get(row);
  if (row === 0 ? value !== undefined && value !== null : typeof value !== "number") throw Error("JS_NAMED_VALUE_KIND");
  OutputTable.Append();
  OutputTable.Set("Value",value);
}
```

### A-getcolumn-exact

```javascript
import {InputTable,OutputTable,DataType} from "builtIn/Data";
if (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error("JS_NAMED_INPUT_SHAPE");
OutputTable.AssignColumns([{Name:"Value",DisplayName:"Value",DataType:DataType.Integer}]);
const column=InputTable.GetColumn("Value");
if (column.Index !== 0 || column.Name !== "Value" || column.DisplayName !== "Value") throw Error("JS_NAMED_COLUMN_IDENTITY");
for (let row=0;row<4;row++) {
  const value=column.Get(row);
  if (row === 0 ? value !== undefined && value !== null : typeof value !== "number") throw Error("JS_NAMED_VALUE_KIND");
  OutputTable.Append();
  OutputTable.Set("Value",value);
}
```

### A-columns-index

```javascript
import {InputTable,OutputTable,DataType} from "builtIn/Data";
if (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error("JS_NAMED_INPUT_SHAPE");
OutputTable.AssignColumns([{Name:"Value",DisplayName:"Value",DataType:DataType.Integer}]);
const column=InputTable.Columns[0];
if (column.Index !== 0 || column.Name !== "Value" || column.DisplayName !== "Value") throw Error("JS_NAMED_COLUMN_IDENTITY");
for (let row=0;row<4;row++) {
  const value=column.Get(row);
  if (row === 0 ? value !== undefined && value !== null : typeof value !== "number") throw Error("JS_NAMED_VALUE_KIND");
  OutputTable.Append();
  OutputTable.Set("Value",value);
}
```

### A-columns-exact

```javascript
import {InputTable,OutputTable,DataType} from "builtIn/Data";
if (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error("JS_NAMED_INPUT_SHAPE");
OutputTable.AssignColumns([{Name:"Value",DisplayName:"Value",DataType:DataType.Integer}]);
const column=InputTable.Columns["Value"];
if (column.Index !== 0 || column.Name !== "Value" || column.DisplayName !== "Value") throw Error("JS_NAMED_COLUMN_IDENTITY");
for (let row=0;row<4;row++) {
  const value=column.Get(row);
  if (row === 0 ? value !== undefined && value !== null : typeof value !== "number") throw Error("JS_NAMED_VALUE_KIND");
  OutputTable.Append();
  OutputTable.Set("Value",value);
}
```

### A-isnull-index

```javascript
import {InputTable,OutputTable,DataType} from "builtIn/Data";
if (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error("JS_NAMED_INPUT_SHAPE");
OutputTable.AssignColumns([{Name:"Value",DisplayName:"Value",DataType:DataType.Integer}]);
for (let row=0;row<4;row++) {
  const missing=InputTable.IsNull(row,0);
  if (typeof missing !== "boolean") throw Error("JS_NAMED_NULL_KIND");
  const value=missing ? 1 : 0;
  OutputTable.Append();
  OutputTable.Set("Value",value);
}
```

### A-isnull-exact

```javascript
import {InputTable,OutputTable,DataType} from "builtIn/Data";
if (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error("JS_NAMED_INPUT_SHAPE");
OutputTable.AssignColumns([{Name:"Value",DisplayName:"Value",DataType:DataType.Integer}]);
for (let row=0;row<4;row++) {
  const missing=InputTable.IsNull(row,"Value");
  if (typeof missing !== "boolean") throw Error("JS_NAMED_NULL_KIND");
  const value=missing ? 1 : 0;
  OutputTable.Append();
  OutputTable.Set("Value",value);
}
```

## 5. Стадия B: wrong-case и отсутствующее имя — отдельные наблюдения

Восемь случаев: каждый API отдельно для `"value"` и отдельно для `"Missing"`.
Это строковые literals, не вычисление lower/upperCase. Exact `"Value"` остаётся контролем A.
Никакой case-folding, fallback на индекс или попытки второго ключа после ошибки.
INPUT/upstream неизменно integer-safe. OUTPUT, если execution завершился, — один Integer
Value/Value, одна строка с marker; результат lookup не передаётся прямо в Integer Set.
Это позволяет различить undefined/null от implicit conversion в NULL.

Нормативный источник B — точная конкатенация блоков P + R + T.
P и T заканчиваются одной LF; R — `const result=` + выражение из таблицы + `;` + LF.
Замена выражения допустима только на перечисленные литералы при сборке каталога;
runtime принимает только готовый pinned source по case ID.

P:

```javascript
import {InputTable,OutputTable,DataType} from "builtIn/Data";
if (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error("JS_NAMED_INPUT_SHAPE");
OutputTable.AssignColumns([{Name:"Value",DisplayName:"Value",DataType:DataType.Integer}]);
```

T-get:

```javascript
const code=result === undefined ? 10 : result === null ? 11 : result === -9007199254740991 ? 12 : 99;
OutputTable.Append();
OutputTable.Set("Value",code);
```

T-column (для GetColumn и Columns):

```javascript
const code=result === undefined ? 10 : result === null ? 11 : (typeof result === "object" && result.Index === 0 && result.Name === "Value" && result.DisplayName === "Value" && result.Get(1) === -9007199254740991) ? 13 : 99;
OutputTable.Append();
OutputTable.Set("Value",code);
```

T-isnull:

```javascript
const code=result === true ? 14 : result === false ? 15 : result === undefined ? 10 : result === null ? 11 : 99;
OutputTable.Append();
OutputTable.Set("Value",code);
```

| Case | Выражение R | T | Bytes | Source SHA256 |
| --- | --- | --- | --- | --- |
| B-get-case | `InputTable.Get(1,"value")` | get | 448 | `ca569c1320bf7c160803b9031524feaadf4adecf87f1bd00ee4eff043599c505` |
| B-get-missing | `InputTable.Get(1,"Missing")` | get | 450 | `8e2ed7bf78ccb567121f257dc43058dddc284ef7384df4a45eeabdbfa0e7329c` |
| B-getcolumn-case | `InputTable.GetColumn("value")` | column | 574 | `08054f2f62477f665c8b92bd0414755dc0e66e3ba8008439aa05d28500c3eb30` |
| B-getcolumn-missing | `InputTable.GetColumn("Missing")` | column | 576 | `4832a8582d5af517d8f60c2a2c8499ce8b4c131a3ba78b952bcd3f9dfd3f038d` |
| B-columns-case | `InputTable.Columns["value"]` | column | 572 | `d60e2aa72f3585e87c09073c0c002cc465846b39a146f719c494276f8271cc19` |
| B-columns-missing | `InputTable.Columns["Missing"]` | column | 574 | `13c5ccc3c6aec7723b5401b1853ee4d2f343444a566e0d37a7f520e4173e766f` |
| B-isnull-case | `InputTable.IsNull(0,"value")` | isnull | 462 | `dc8be58b76ab183e2b3be3921886a2bac1fc37eb0ea30470d763c37522cf4c1b` |
| B-isnull-missing | `InputTable.IsNull(0,"Missing")` | isnull | 464 | `7133ef6538cd9f2d09e652df0eafcdba8fe89d8619b8a8be22fa898368b577c4` |

Заранее заданы только структурный oracle и декодирование marker, а не ожидаемый исход:

| Marker | Что наблюдено | Политика |
| --- | --- | --- |
| 10 | Возврат undefined | CHARACTERIZED_RETURN при полном evidence; не считать исключением |
| 11 | Возврат null | CHARACTERIZED_RETURN; не отождествлять с undefined |
| 12 | Get вернул число −9007199254740991 | CHARACTERIZED_RETURN; не объявлять case-insensitive lookup |
| 13 | Получен объект со свойствами Value/Value, Index=0 и ожидаемым Get(1) | CHARACTERIZED_RETURN для этого ключа и API; не доказывает правило для других имён |
| 14 / 15 | IsNull вернул соответственно true / false | CHARACTERIZED_RETURN даже если результат неожиданен; не трактовать автоматически как отсутствие/наличие столбца |
| 99 | Иное значение/форма результата | UNRESOLVED_UNSUPPORTED_RETURN, case_complete=false; не терять строку из coverage |

Нативный Integer marker проверяется как tag20, exact decimal и точные 8 LE bytes,
не по отображению preview. Допустимые маркеры привязаны к API: Get={10,11,12},
GetColumn/Columns={10,11,13}, IsNull={10,11,14,15}; 99 всегда incomplete.
GetColumn/Columns здесь включает последующую проверку идентичности **того же** результата;
если getter/метод этого объекта выбросит ошибку, нельзя утверждать, что ошибся сам lookup.
Весь owned failed run остаётся unattributed до отдельного source-position proof.
Нет catch, который превратил бы исключение в marker 10/11/99.

Одного столбца недостаточно для общего вывода о регистре: одинаковый результат для
`value` и `Missing` может означать fallback. Этот эксперимент характеризует точный
вызов, а не реализует resolver для public handler. Для общего правила требуется §9.

## 6. Стадия C: независимый index/name Set перед J24

Четыре отдельных источника. INPUT прежний; берётся наблюдённый InputTable.Get(1,"Value")
и проверяется number/−9007199254740991. В единственной выходной строке сначала записывается
sentinel 0 через ранее проверенный exact `Set("Value",0)`, затем единственный исследуемый Set.
Один столбец Value/Value, Integer; второй Set не вызывается при исключении первого.
Нельзя в одном run проверить index, затем exact и wrong-case: результат последней записи
скрыл бы предыдущие вызовы.

Точный source — H + V + S + три строки записи. H — первые две строки P выше; V ниже;
S — третья строка P (AssignColumns). Последняя строка `OutputTable.Set(KEY,value);` с LF.

V:

```javascript
const value=InputTable.Get(1,"Value");
if (typeof value !== "number" || value !== -9007199254740991) throw Error("JS_NAMED_INPUT_VALUE");
```

Три строки записи:

```javascript
OutputTable.Append();
OutputTable.Set("Value",0);
OutputTable.Set(KEY,value);
```

| Case | KEY (точные source characters) | Независимое ожидание | Bytes | Source SHA256 |
| --- | --- | --- | --- | --- |
| C-set-index | `0` | −9007199254740991, strict exact control | 467 | `83cac05c5b23db232bd5a89d522e15a6665997cb9083b451c855e914f3186b2e` |
| C-set-exact | `"Value"` | −9007199254740991, strict exact control | 473 | `3e840949275b92e7a275458ee0abb27d02fd16fc8483b7877a1d927338ccd05d` |
| C-set-case | `"value"` | Исход неизвестен; native one-cell observation или failed | 473 | `f7ddd2dec629713271d2158b23e9f923ab152c538601b38c9b114a1797599557` |
| C-set-missing | `"Missing"` | Исход неизвестен; native one-cell observation или failed | 475 | `511b1301e74288974c138b8af0207b332277d0d95af9e7daa5f066375b4d6a26` |

Для exact/index completed + native expected bytes даёт PASS_EXACT_CASE. Для wrong-case/
missing completed допускает характеристику **любого валидного int64 либо native NULL**
в этой единственной клетке: сохранить decimal/bytes, отдельно отметить sentinel_unchanged,
candidate_written или other_value. Это независимый observation policy, не разрешение
менять oracle положительных случаев. Изменение числа строк/столбцов/типа — UNRESOLVED,
а не автоматическое расширение read bounds. Failed policy общая (§8), не заранее rejection.
D допускается только после независимого успешного C-set-index: создание неизвестного
имени и использование неизвестного lookup не должны смешиваться в одном источнике.

## 7. Стадия D: J24, AssignColumns и раздельные Name/DisplayName

Пять отдельных sources. INPUT/upstream прежний. Source — H + V из §6 + одна строка
AssignColumns с конкретными literals из таблицы + `OutputTable.Append();` LF +
`OutputTable.Set(0,value);` LF. Пример строки схемы для кириллицы:

```javascript
OutputTable.AssignColumns([{Name:"Сумма",DisplayName:"Value",DataType:DataType.Integer}]);
```

| Case | Requested Name | Requested DisplayName | Bytes | Source SHA256 |
| --- | --- | --- | --- | --- |
| D-name-control | `Value` | `Value` | 439 | `d42cda64166d8e17856ad60220d556e742af9d10d3e2a0f1d5c0182c988d6587` |
| D-name-cyrillic | `Сумма` | `Value` | 444 | `0f66ba92096cf71e5d5d9a96218b2cac98e1991f4c80cde8296a22b22143e61b` |
| D-name-space | `Value Total` | `Value` | 445 | `f9bc16b37a284d9938f2604a8b06009a0fbcefba317cb9a450b2c2dd9f5e2adf` |
| D-name-leading-digit | `1Value` | `Value` | 440 | `9a76f29eab40121335d2d5897e5776d16d34c7645c247d6123a93f8d74f9be10` |
| D-name-unicode-label | `Value` | `Сумма ё` | 447 | `b47eef980b4cef947c7de9ccfed4e73babd7d1f6899446c9594310002f627cfb` |

Cyrillic `Сумма` записана буквами U+0421 U+0443 U+043C U+043C U+0430, без латинского C.
`Value Total` содержит один ASCII space U+0020. `1Value` начинается с U+0031.
`Сумма ё` — отдельная Unicode **метка** допустимого ASCII Name, space U+0020 и ё U+0451.
Нормализация Unicode/транслитерация на стороне harness запрещена, JSON escape и raw UTF-8
не взаимозаменяются при source hashing. В source используется raw UTF-8, двойные кавычки.

Успешный control: один Integer Value/Value, одна клетка −9007199254740991 с exact bytes.
Unicode-label control ожидает тот же Name Value и точную метку `Сумма ё` плюс ту же клетку;
если observation отличается, сохранить actual metadata, но не объявлять PASS_EXACT_CASE.
Для Cyrillic/space/leading-digit заранее неизвестны завершение, фактический Name и реакция.
При completed обязательны одна строка/один столбец, Integer, exact payload, exact original
INPUT/upstream. Нельзя выводить actual technical Name из requested literal или заголовка.

### Отдельный schema contract D

Старые Value equality сохраняются для A–C и upstream D. Новая ограниченная capability
допускается только для пяти D source hashes, schema_mode=code, generation=true,
наблюдённого autosync=true и одного owned output0 после его completed child.
Она не принимает caller-supplied expected name. Имя результата — **данные наблюдения**,
а не oracle, синтезированный из результата.

1. До запуска закрепить requested Name/DisplayName/Integer, полный source hash, настройки
   generation/autosync, input mapping, owner и Done witness. Не задавать выходные поля
   вручную поверх code schema: это подменило бы исследуемую нормализацию.
2. После materialization получить полный bounded набор metadata: native physical output
   field (index, Name, DisplayName, DataType, held field identity), node+port, dataset
   source identity, cookies и completed child. Имя и метка не более 128 UTF-16 units и
   512 UTF-8 bytes каждое, один столбец; имена сериализуются с JSON escaping без trim.
   Не вводить regex «только латиница», который отверг бы предмет наблюдения. Пустое или
   необычное имя сохраняется как observation при валидном native контракте, а не чинится.
3. Отдельно получить read-only materialized mapping source→physical target с record/field
   identity. Code dataset и физический output port могут иметь разные имена/метки.
   Требуется доказанная связь source field с code dataset и target с native physical field.
   Нужен отдельный bounded metadata witness существующего cache/port mapping, со source
   audit; текущий roundtrip verifier проверяет **input** mapping и этого не доказывает.
   Повторное Apply/Done/выполнение JS ради получения schema запрещено. Если доступный
   wizard автоматически выполняет узел, он не используется для такого readback.
4. Capture замыкает реальные объекты field/schema/mapping и точные строковые значения в
   page-local capability. Экспортируется сериализованный digest, но native read admission
   опирается также на held identities, не на переданный снаружи digest. Данные revalidate
   до/после каждого RPC, после upstream и при финальном отчёте. Нельзя просто передать
   наблюдённое имя как новый произвольный параметр существующему reader.
5. Native value читается исключительно по physical index=0, method321/interface116.
   Сохраняется paired actual source/target Name/DisplayName/тип; preview — corroboration,
   не scalar/schema oracle. В report разделены requested/code-source/physical-target.

Если physical Name наблюдён, а происхождение code-source имени не установлено, можно
сообщить physical observation, но J24 `case_complete=false`, причина
`code_to_physical_schema_link_unverified`. Иначе можно ошибочно назвать mapping rename
нормализацией движка. До аудита реального механизма этого witness D заблокирован для live;
в этом design не изобретаются скрытые property paths или новые RPC методы.

При всех доказательствах completed Cyrillic/space/digit классифицируется как
CHARACTERIZED_SCHEMA: actual name equals_requested или differs_requested, без guessed
transliteration rule. Payload обязан быть exact независимо от имени. Изменение DisplayName
тоже фиксируется раздельно; не выдаётся за изменение Name. Ошибка AssignColumns/Append/Set
не различается по предположению: source attribution необходима по общему правилу.

AssignColumns result не распространяется на AddColumn, InsertColumn, empty/omitted names,
дубликаты, Unicode case folding, Greek/emoji/combining sequences или все допустимые символы.
Они не объявляются проверенными и остаются отдельными пунктами полного handler coverage.

## 8. Политика terminal outcomes и lifecycle для всех 25 случаев

В отчёте отдельны `execution_status`, `evidence_status`, `semantic_status`, `case_complete`.
Наличие зелёного terminal execution не означает semantic PASS. Допустимые состояния:

| Ситуация | Semantic result | case_complete |
| --- | --- | --- |
| Case не запускался | NOT_RUN с собственным source hash | false |
| A/C-positive/D-control+label: completed, независимый oracle совпал, все proofs/cleanup сохранены | PASS_EXACT_CASE | true |
| B: completed, допустимый marker данного API, все proofs/cleanup | CHARACTERIZED_RETURN | true, только точный вызов |
| C-wrong/missing: completed, полная one-cell int64/NULL observation, все proofs/cleanup | CHARACTERIZED_VALUE | true, без общего resolver rule |
| D-invalid: completed, paired schema witness + exact payload, все proofs/cleanup | CHARACTERIZED_SCHEMA | true, только данный AssignColumns source |
| Completed, но strict oracle не совпал | OBSERVED_MISMATCH, отчёт UNRESOLVED | false; oracle не переписывается |
| Owned failed child с полным native ErrorDetails, source и upstream, но без доказанного source-position mapping | OWNED_EXECUTION_FAILURE_UNATTRIBUTED, отчёт UNRESOLVED | false |
| Failed с позднее независимо доказанной атрибуцией к единственному исследуемому вызову | CHARACTERIZED_REJECTION только после отдельного review такого verifier | в текущем source82 false |
| Неполный error text, marker99, неподдержанная схема, stale owner/cookie, deadline/transport/ACK/cleanup failure | UNRESOLVED с конкретной причиной | false |

Формат верхнего report можно сохранить совместимым с source82: успешно доказанные
семантические observations → CHARACTERIZED; любое неполное доказательство → UNRESOLVED.
Поле exact_pass относится только к положительному case, никогда ко всей матрице.
`g5_complete=false`, `public_handler_accepted=false`, `cli_accepted=false` во всех reports.
Bounded coverage_complete для ядра только когда все 25 обязательных slots имеют полный
принятый результат; даже это не full G5. Успешный marker undefined считается результатом
только для точного unknown case, а не позитивным доказательством правильности всех API.

Неизменяемые ограничения исполнения:

- Отдельный свежий run, один selected case, один explicit execution reservation. Запрет
  replay сохраняется после исключения/таймаута и при смене operation ID; никакой петли
  retry и автоматического перехода к следующему случаю. Координатор агрегирует отдельные evidence.
- INPUT полностью типизирован и native-attested **до создания/исполнения JS**. CSV digest,
  import settings/readback, original completed child, node/port pair, source owner/object,
  topology/input mapping и exclusive operation должны совпасть до и после выполнения.
- Исходник считывается целиком из owned editor, сопоставляется exact bytes/SHA с каталогом;
  generation/mode/Done sealed source и execution trial association неизменны. Никаких
  прямых mutating hidden API для обхода UI, eval caller source или произвольного JS runner.
- Success path: INPUT → один JS child → native OUTPUT → **свежий original upstream**.
  Число cells: A=4+4+4=12; B/C/D=4+1+4=9. Source82 completed guards остаются completed guards.
  Native request/response counts должны соответствовать фактическим cells каждого чтения.
- Failed path: INPUT → один owned failed JS child → native failed-node witness → свежий
  original upstream. OUTPUT имеет только `not_read_failed_execution`, **никакого OUTPUT RPC**
  и никакого чтения потенциально частично сформированной таблицы. 4+4=8 native data cells.
  Новая named failed capability предоставляет только upstream и остаётся связанной с исходным
  import child; она не превращает failed JS в completed. Старый coercion capability не переиспользуется по ID.
- Error witness: собственный showNode/полный ErrorDetails, ≤1000 символов как в текущем
  bounded failure contract, связь document/workflow/node/group/process/execution/source.
  Больший или обрезанный текст → incomplete. Ни английские/русские фразы из исторических
  e2e, ни номер строки нашего source не задают runtime offset. Не угадывать wrapper/import
  offsets. Даже guard Error с известным нами текстом сам по себе не доказывает engine mapping.
- Сопоставление source/error должно быть независимо установлено на текущем runtime прежде,
  чем failure будет назван отказом конкретного lookup/AssignColumns/Set. Guards, выбор
  столбца и чтение его свойств имеют разные причины отказа; source hash недостаточен.
- Held identities/schema/cookies revalidate перед/после RPC, оригинальные deadlines,
  строгий request/response ID, Release, pending=0/retired=false. Pending/retired канал не
  «лечится» UI cleanup; закрыть только owned browser по текущему безопасному lifecycle,
  incomplete result остаётся incomplete. Поздние responses освобождаются, не публикуются.
- Exact journal ACK после каждого proof, frozen evidence, fsync и read-back финального
  отчёта по модели source82. Cleanup подтверждается по каждому применимому ресурсу;
  success требует прежнего cleanup3/3, failed — всех собственных обязательных cleanup
  receipts без выдуманного OUTPUT cleanup. Финальный status назначается после этого.

## 9. Что ещё необходимо наблюдать до общих правил/public handler

Ядро минимально по запрошенным API/именам и безопасному допуску первой стадии. Оно не
даёт права объявлять «имена всегда чувствительны к регистру» или «Unicode транслитерируется».
Следующие ограничения должны оставаться видимыми в основном plan; здесь они не снимаются.

1. **Независимость выбора столбца и имени/метки.** Следующий закрытый input — два Integer
   столбца Value/Other, две строки `[17,29]`, `[NULL,31]`, метки `Левая метка`/`Правая метка`.
   Точные CSV bytes UTF-8/LF: `Value;Other\n17;29\n__JS_NULL__;31\n`.
   Метки назначаются явно импортом, не берутся из CSV. Для каждого из четырёх input API
   отдельные cases с keys `0`, `1`, `"Value"`, `"Other"`, `"value"`, `"other"`, `"Missing"`,
   `"Левая метка"` (32 finite slots, не свободный key). Exact cases должны различать 17 и 29,
   NULL и 31; остальные outcomes неизвестны. Нужны held identity для **обоих** полей,
   complete mapping source/target, native cells=4 и фиксированные schema/count на каждой
   границе. Простое снятие проверки columns.length===1 недопустимо. Это отдельный review
   после ядра; его исходники/хеши ещё не закреплены, live запрещён до их фиксации.
2. **Output readers не тождественны Input readers.** Прежде чем handler/knowledge обещает
   их общие named/index/case semantics, нужна отдельная fixed output matrix: четыре
   API Get/GetColumn/Columns/IsNull × четыре keys `0`, `"Value"`, `"value"`, `"Missing"`.
   Таблица и sentinel rows формируются до единственного исследуемого lookup. Diagnostic
   result отделяется от целевого столбца через заранее закреплённую output schema/row,
   native читает оба; это требует отдельного pinned design, не включается в 25-core coverage.
   C доказывает только Set. Чтение native RPC не заменяет эти 16 JS API observations.
3. **AddColumn отдельно.** Пять D Name/DisplayName пар повторяются в отдельных источниках
   с AddColumn вместо AssignColumns, каждый с чистой таблицей и index Set. Это конечные
   пять дополнительных slots, не общий factory method switch в runtime. Empty/omitted,
   duplicates и normalization collisions тоже не наследуют D; нужны отдельные требования
   полного J24/handler и fixed probes до обещания соответствующей поддержки.
4. **Атрибуция failures.** Независимая calibration/mapping на текущем engine для начала
   source, импортов и runtime positions с доказанным scope. Без неё не утверждать
   ожидаемые rejection messages, code ranges или конкретный отказ имени.
5. **Реальное materialization/readback.** D обязан установить связь code dataset schema →
   output port и exact Unicode label. Затем handler возвращает actual technical names из
   readback, а knowledge фиксирует только проверенные правила с API/build/scope. Нельзя
   заранее переименовать пользовательское поле по историческому transliteration example.
6. **Полный acceptance plan.** После закрытых probes остаются public configuration handler,
   G2 materialization/editor checks, прочие G5 семантики и независимый standalone CLI
   acceptance из текущего root plan. Ни один статус этого документа не заменяет их.

## 10. Передача и следующий допуск

Документ содержит 25 конкретных источников (8 полных блоков A и точные templates/closed
literal tables B–D) с вычисленными hashes, independent input/output oracles и всеми
terminal policies. Это source specification, не новый executable catalogue. Для будущей
реализации root сначала ревьюирует A и additive case identity, затем отдельно B/C и
новый D schema witness. Источники не исполнялись; браузер и тесты не запускались.

Единственный создаваемый файл этого хода — этот дизайн. Существующие source82 runtime,
fixtures, tests, manifests, dirty checkpoint/документы не изменяются; commit не создаётся.
После записи выполняется только проверка целостности документа и сравнение прежних
1259 source pins/хешей старых dirty файлов. Такие проверки не являются Loginom execution
или новой приёмкой source82.


## 11. Root review: допуск стадии A

Root независимо восстановил все25 источников из блоков/templates, сверил каждый
SHA256/byte length и синтаксис pinned Node24.19.0. Проверены exact55-byte CSV,
его SHA256 и Python signed64 LE bytes трёх non-NULL значений. Receipt вне Git:
`named-design-preflight.json`, исходный proposal SHA
`8a1b6c035a06380cccf9af41fe612d401c6f334b882e8b7ff3f956da28319bb5`.
Это статический preflight, не engine execution. Developer revision55 завершён,
файл фактически существует; исторический bootstrap не заменяет этот результат.

Разрешена additive реализация **стадии A**, без live до нового source freeze и
root-проверки. Восьми cases нужны отдельные case/source identities при общем
immutable integer-safe input. Старые exact guards/семь coercion cases не ослаблять.
Unit tests проверяют настоящий catalogue, native outcome и lifecycle, различают
copy oracle и IsNull [1,0,0,0], отказывают при неверном case/source/input/execution/
schema/count/bytes/upstream/ACK. Unexpected failed execution остаётся unresolved
и не допускает OUTPUT RPC; не выдавать его за semantic rejection.

Перед handoff: полный client suite, JS/native main, public deny и Python fixtures;
source closure включает новые imports, manifest сохраняет1259 прежних paths и
пины нового candidate. Browser/root ownership и одно выполнение на свежий run
сохраняются. B/C/D источники прошли статический preflight, но их runtime допуск
не выдан: отдельно требуются failure attribution и D metadata/mapping witness.

§9 перечисляет пределы обобщения результатов, а не автоматически добавляет все
комбинаторные варианты к обязательной приёмке. Следующие cases выбираются по
реальным требованиям основного плана и обещаниям handler/knowledge. Нельзя ни
объявлять весь интерфейс доказанным по одному Value, ни подменять выполнение
основного плана бесконечным расширением диагностической матрицы.


## 12. Наблюдённые исполнения стадии A

Source83 commit562f8ffebf8f5c4e1d38eff6c65beddbfd087fbc.
A-get-index/profile73, original session28189 terminal exit0/CHARACTERIZED,
cleanup3/3. Independent live audit:12 native cells,620 journal refs,1265pins.
INPUT/OUTPUT/upstream exact [NULL,−9007199254740991,0,9007199254740991].
Report SHA ef8a559d5d992d0585131331ee868605e7f101d2c9e45215bb0f7004d74e5589.
Root-computed baseline SHA
c67e5a8abb884352ef16076178e23e9b3a7d44f95be1428c302cf47ada4d58ba;
integer-safe input contract не выдаёт coercion/cardinality native_baseline_sha256.
Root сравнил полный before proof с предшествующей JS записью журнала, отдельно
вычислил digest; не заявляет сравнение с отсутствующим runtime полем.
Один случай из8 A принят, весь G5/J24/handler/CLI остаётся открытым.
