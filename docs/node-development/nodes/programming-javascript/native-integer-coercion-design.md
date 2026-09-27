# Предложение: bounded Integer coercion characterization

Статус: **ROOT REVIEWED — разрешена реализация семи bounded случаев; live ещё не начат**. База исходников: `14a9df5fcee360fd551c36e6410bd0bd6fa429b2` (source81). Root сообщил independent empty04 OBSERVED/cleanup3/3 и аудит6 native cells [3,0,3]; этот результат не закрывает Integer coercion, public handler, CLI и весь G5.

## Основания и границы

Авторитетный ROOT plan: `/home/george/git/loginom-ai-agent/docs/node-development/nodes/programming-javascript/plan.md:240` требует fraction/string/NaN/±Infinity и сохранения exact integer oracle. Прочитаны существующие typed-cases.json, ROOT typed-native-oracle.json, native-integer-design.md, private fixture catalogue, roundtrip contract/binding/owner/driver, execution runtime и failed-child verifier.

Официальные страницы проверены 2026-09-27:

- [Output tables: Set](https://help.loginom.ru/userguide/processors/programming/java-script/output-tables.html): запись в последнюю Append-строку; перечислены допустимые JS-типы аргумента. Правила конкретного Integer coercion там не заданы.
- [API: IOutputColumn/IOutputTable.Set](https://help.loginom.ru/userguide/processors/programming/java-script/api-description.html): сигнатуры не устанавливают результат преобразования.
- [DataType](https://help.loginom.ru/userguide/processors/programming/java-script/enum.html): Integer=4, Float=3, String=5.
- [JavaScript](https://help.loginom.ru/userguide/processors/programming/java-script/index.html): структура задаётся до первого Append; ошибки выполнения имеют позицию кода; ограничения IEEE754 не заменяют oracle для Set.
- [Compatibility](https://help.loginom.ru/userguide/data/compatibility.html) описывает сопоставление портов; это не спецификация преобразования аргумента JS Set.

ROOT `references/js_node_loginom_system_prompt.md:185` требует соответствия значений типам и запрещает полагаться на неявные несовместимые преобразования. Это нормативная public guidance, не доказательство engine rejection. Она остаётся неизменной даже при успешной private characterization.

## Выбор подхода

1. Один многострочный скрипт со всеми значениями отвергнут: ранняя ошибка скрывает последующие Set; catch-and-continue изменяет проверяемое исполнение.
2. Только literals на старом Integer fixture дешевле, но не доказывает настоящий typed input для fraction/string; импорт NaN/Infinity смешивает coercion с поведением CSV parser.
3. **Предлагаются семь независимых immutable однострочных случаев**. Fraction и строки поступают из своих точно аттестованных входов. NaN/±Infinity выводятся из конечных точно аттестованных operands внутри fixed script. Это не тест native nonfinite INPUT.

Случаи: +1.75, −1.75, строка "42", строка "not-an-integer", NaN из0/0, +Infinity из1/0, −Infinity из−1/0. Две дроби показывают оба знака, но не доказывают общее правило округления/ties. Две строки разделяют numeric text и заведомо nonnumeric text; locale/whitespace/empty-string вне этой bounded матрицы. Все семь обязательны; никаких SKIP для неудобных значений.

Каждый case — отдельные root-assigned свежие profile/evidence/package/node и одна explicit JS Execute. До неё разрешено отдельное выполнение typed import для аттестации входа. Next/Done должны быть доказаны как не запускающие JS; Preview wizard не используется. Ни автоматического batch, ни переиспользования failed node, ни повторного Execute после неопределённого результата. После подтверждённого terminal и cleanup3/3 root независимо назначает следующий case. Если cleanup/transport unresolved, следующий case получает статус not_run_pending_resolution, а не PASS/SKIP; closure матрицы запрещена до его отдельного разрешённого запуска.

## Точные входы и source pins

Каждый CSV: UTF-8 без BOM, LF и один завершающий LF, delimiter `;`, quote `"`, first_line_as_title=true, rows_to_skip=0, null_marker=`__JS_NULL__`, encoding=UTF-8. Ровно поле name/label Value, одна non-NULL строка. Real/type3 — Continuous, String/type5 — Discrete. Строка "42" обязательно импортируется как String, без числового auto-inference. Полное artifact/upload/settings/readback provenance, bytes/SHA и typed UI должны совпасть до создания JS.

Native INPUT — отдельный полный read до JS; original completed import node/port/source/helper/connection/process owner, schema1×1, row0/column0, lifecycle release1/1/1. Real: tag5, exact finite IEEE754 binary64 LE; String: tag8, exact UTF-8 bytes, без trim/normalization. Значения и bytes ниже вычислены математически через Python struct/UTF-8; они ещё не live evidence. NULL недопустим во всех INPUT; zero не подменяет NULL. На upstream повторно требуются эти же bytes/type/tag и первоначальная import execution identity.

Для nonfinite case только operand является native-attested input. Перед Set fixed script проверяет класс candidate. JSON не сериализует NaN/Infinity как число: report хранит case enum/expression/source hash и доказательство прохождения guard, а не JSON null. При error до guard значение candidate не считается установленным.

### Канонический шаблон source

Подставить ровно TYPE, INPUT, EXPR, CHECK из записи case вместо `@@...@@`. TYPE уже содержит кавычки. Никаких дополнительных пробелов/комментариев/переводов строк. UTF-8 без BOM, LF; после последней строки один LF. Публикуется только fixed enum case, произвольный source/count/schema/value не принимается. Источник имеет9 строк; единственный исследуемый Set — строка9. Чтение/проверки входа — строки2–4; candidate —5–6; AssignColumns/Append —7–8. Ни try/catch, ни parseInt/Number/round/trunc, ни console side channel, Promise, Calc/FS/Fetch/globals.

```javascript
import {InputTable,OutputTable,DataType} from "builtIn/Data";
if (InputTable.RowCount !== 1 || InputTable.ColumnCount !== 1 || InputTable.IsNull(0,"Value")) throw Error("JS_INT_COERCION_INPUT_SHAPE");
const input=InputTable.Get(0,"Value");
if (typeof input !== @@TYPE@@ || input !== @@INPUT@@) throw Error("JS_INT_COERCION_INPUT_VALUE");
const candidate=@@EXPR@@;
if (!(@@CHECK@@)) throw Error("JS_INT_COERCION_CANDIDATE");
OutputTable.AssignColumns([{Name:"Value",DataType:DataType.Integer}]);
OutputTable.Append();
OutputTable.Set("Value",candidate);
```

### Immutable записи (проект спецификации, не новый runtime catalogue)

Ни CSV, ни executable snippets на этом этапе не создаются; ниже точные будущие байты и source hashes.

```json
[
  {
    "id": "integer-coercion-fraction-positive",
    "input_type": "real",
    "input_native_type": 3,
    "input_native_tag": 5,
    "input_native_bytes": "000000000000fc3f",
    "csv_utf8": "Value\n1.75\n",
    "csv_bytes": 11,
    "csv_sha256": "8bef552b1ef66cdeaf5e382ffc56658cb6c6117ff9e8ffd7bb2bf1a2f3bee765",
    "TYPE": "\"number\"",
    "INPUT": "1.75",
    "EXPR": "input",
    "CHECK": "typeof candidate === \"number\" && candidate === 1.75",
    "source_bytes": 587,
    "source_sha256": "6392d7bd6ecfb37351160aef70a94fa52f4786124daf2d14d789120292173e4e"
  },
  {
    "id": "integer-coercion-fraction-negative",
    "input_type": "real",
    "input_native_type": 3,
    "input_native_tag": 5,
    "input_native_bytes": "000000000000fcbf",
    "csv_utf8": "Value\n-1.75\n",
    "csv_bytes": 12,
    "csv_sha256": "903706717263f47c0a16baf6780062e1334cd12b76e59c9a7b9ad8147ec4f66b",
    "TYPE": "\"number\"",
    "INPUT": "-1.75",
    "EXPR": "input",
    "CHECK": "typeof candidate === \"number\" && candidate === -1.75",
    "source_bytes": 589,
    "source_sha256": "c6cc020cb53965aec934f072c82ecc0ea5fcaebe0385b650adfa889e478a15fa"
  },
  {
    "id": "integer-coercion-string-numeric",
    "input_type": "string",
    "input_native_type": 5,
    "input_native_tag": 8,
    "input_native_bytes": "3432",
    "csv_utf8": "Value\n\"42\"\n",
    "csv_bytes": 11,
    "csv_sha256": "97a11b225d4b86224e07f533e327c4e1d8d9da458818a2dca5b76d170504ca19",
    "TYPE": "\"string\"",
    "INPUT": "\"42\"",
    "EXPR": "input",
    "CHECK": "typeof candidate === \"string\" && candidate === \"42\"",
    "source_bytes": 587,
    "source_sha256": "263d9de6fa75ce6c1ac9379eabeca1114407998ec00c5ff6fcaffe4a001306c6"
  },
  {
    "id": "integer-coercion-string-invalid",
    "input_type": "string",
    "input_native_type": 5,
    "input_native_tag": 8,
    "input_native_bytes": "6e6f742d616e2d696e7465676572",
    "csv_utf8": "Value\n\"not-an-integer\"\n",
    "csv_bytes": 23,
    "csv_sha256": "0b95bd2da8b44656df1d42d2734d0c7aa462a2802293e18b732e8db4515dfe89",
    "TYPE": "\"string\"",
    "INPUT": "\"not-an-integer\"",
    "EXPR": "input",
    "CHECK": "typeof candidate === \"string\" && candidate === \"not-an-integer\"",
    "source_bytes": 611,
    "source_sha256": "cc7cbdfd0262956f66896395b8ad85e48879e8b5fac70a70be7bf21712b68fd2"
  },
  {
    "id": "integer-coercion-nan",
    "input_type": "real",
    "input_native_type": 3,
    "input_native_tag": 5,
    "input_native_bytes": "0000000000000000",
    "csv_utf8": "Value\n0\n",
    "csv_bytes": 8,
    "csv_sha256": "cbae8bbee4380c47abea5ce84baeaf1391c345a8950e731fc77935afe4e4bad6",
    "TYPE": "\"number\"",
    "INPUT": "0",
    "EXPR": "input / input",
    "CHECK": "typeof candidate === \"number\" && candidate !== candidate",
    "source_bytes": 597,
    "source_sha256": "e145174ca2472dab41c0d1433fd27c87aca7a2391459f04a0e579930ac7085ff"
  },
  {
    "id": "integer-coercion-positive-infinity",
    "input_type": "real",
    "input_native_type": 3,
    "input_native_tag": 5,
    "input_native_bytes": "000000000000f03f",
    "csv_utf8": "Value\n1\n",
    "csv_bytes": 8,
    "csv_sha256": "c4b301392924e65794be7ce5ade35a17462cefb36ea095c95b91a36d03c1bcf6",
    "TYPE": "\"number\"",
    "INPUT": "1",
    "EXPR": "input / 0",
    "CHECK": "typeof candidate === \"number\" && candidate === 1 / 0",
    "source_bytes": 589,
    "source_sha256": "7cae6b72caeadcc28d7c6a87e4cf7b9eb2c94daf5901369d2f099a239e3cdf16"
  },
  {
    "id": "integer-coercion-negative-infinity",
    "input_type": "real",
    "input_native_type": 3,
    "input_native_tag": 5,
    "input_native_bytes": "000000000000f0bf",
    "csv_utf8": "Value\n-1\n",
    "csv_bytes": 9,
    "csv_sha256": "ca5f305ca67f9fc14d2b368007174be77607635eb3c5e5f6cbb9fcd779352a2c",
    "TYPE": "\"number\"",
    "INPUT": "-1",
    "EXPR": "input / 0",
    "CHECK": "typeof candidate === \"number\" && candidate === -1 / 0",
    "source_bytes": 591,
    "source_sha256": "d75c797c0915f0796b267e9b9a46c99db29b192db3aa2e3ef7a4cc0efb04e2d1"
  }
]
```

## Ожидания и классификация результата

**Обязательные structural expectations**: output0, ровно Value/Integer/native type4, code-generated schema до первого Append, одна строка при normal completion, точные source/fixture/case pins, собственный fresh JS child и один Execute. Ожидаемое scalar value для всех семи пока `unknown`; expected-error allowlist пуста. Даже для "42" число42 не объявляется oracle без источника/live evidence.

| Наблюдение | Итог и обязательные доказательства |
| --- | --- |
| completed + полный Integer OUTPUT | `integer_value_observed`: canonical signed decimal string, tag20, bits64, signed-int64-le, exactly8 bytes; независимый Python signed64 decode == decimal. Не прогонять через Number, не требовать safe range и не объявлять rounding algorithm по одному значению. |
| completed + native NULL | `integer_null_observed`: schema type4, null flag/tag1; отсутствие integer bytes и отличие от zero. Это наблюдение, не ожидаемый результат для NaN. |
| owned failed child с ошибкой на строке9 | `integer_set_rejection_observed`: native child ErrorDetails, source identity/позиция и точный fresh owner подтверждены; OUTPUT не читается и не объявляется empty/NULL. Требуется exact upstream read. |
| failed child, но позиция отсутствует/усечена/не привязана к этому source | `owned_execution_failure_unattributed`: сохранить evidence, case остаётся incomplete; нельзя приписывать ошибку coercion или считать expected rejection. |
| input/candidate guard, syntax/import, AssignColumns/Append error, wrong schema/count/tag, stale owner, transport/ACK/lifecycle | `case_failed` или `case_unresolved`, не characterization PASS; факт failure остаётся видимым в полной матрице. |

Во всех завершённых characterization: `characterization_only=true`, `exact_pass=false`, `g5_complete=false`, `general_integer_precision_guarantee=false`. Отдельно `input_exact=true`, `upstream_exact=true`; для успешного integer native read `output_encoding_verified=true`. Успешный terminal без native OUTPUT не устанавливает scalar conversion. Не подгонять ожидаемый byte/value после запуска и не переклассифицировать failed run в expected-error задним числом. Будущий strict regression oracle — отдельный reviewed revision с ссылкой на принятую characterization.

## Доказательства и порядок

1. Pin release/build/frontend/source closure, document/package/workflow/import GUID/port, exact CSV/settings и полный native INPUT. Только затем private JS capability, node/source readback и exact input edge/mapping. Входной тип сохраняется Real/String; output type отдельно Integer — не менять input mapping на Integer и не маскировать coercion upstream conversion.
2. Связать source hash, generation=true, exact output0 и собственные node/port/cell/renderer. Сохранить Next/Done no-execution seals, baseline process roots и свежую launch identity. Допускается только synchronous fixed script и один explicit Execute.
3. Existing executeNode использует verifyFailedChild=true: для обоих terminal нужны fresh execution/group/process/record IDs, связь child с actual JS ModelNode, Show Node proof, cleanup console. Смена исходника, owner, execution или второй запуск отвергаются. Позицию ошибки сравнивать с точным source/readback и наблюдённым line mapping; не выдумывать offset и не матчить общий текст "conversion". ErrorDetails сейчас ограничены1000 символами: если нужная позиция усечена, characterization неполна.
4. Success: private native Preview opening сохраняет свои guard и deny публичного click/F3; читать все1×1 OUTPUT native, проверить lifecycle releases. Затем пассивно заново прочитать1×1 upstream по исходному import process/source owner без исполнения upstream. Все3 cell reads: INPUT1+OUTPUT1+upstream1. Никакого JS OutputTable.Get как единственного oracle.
5. Owned Set failure: не открывать JS OUTPUT, не вызывать completed-only reader и не присваивать failed статус completed. Нужен **отдельный private failed-terminal witness и upstream-only маршрут**: original completed import owner остаётся; JS terminal immutable failed child/ErrorDetails/source подтверждены; исходный edge/topology/connection/source неизменны, pending native=0. Затем свежий upstream read с полным lifecycle. Два cell reads: INPUT1+upstream1; OUTPUT status=`not_read_failed_execution`. Если read безопасно невозможен или upstream изменён, case incomplete/refused. Не отключать проверку running/owner для получения отчёта.
6. После read revalidate source/native topology/execution witnesses; не должно появиться нового upstream execution. Финальный exact journal ACK содержит input proof + output либо attributed failed proof + upstream proof + runtime/source/case pins. Cleanup3/3 отдельно, затем независимый root audit всей цепочки. Только после этого конкретный case считается characterized.

Семь слотов покрытия заранее перечислены. Отчёт включает каждый case с not_run/failed/unresolved/characterized статусом, ссылкой на собственный evidence и причину. Бounded coverage_complete=true только если все семь имеют принятые native value/null либо attributed rejection proofs и exact upstream; это всё ещё не full G5 и не public handler acceptance.

## Точки будущей реализации без ослабления текущих правил

- Отдельный private fixed coercion catalogue/resolver с enum7 и role-specific input/output metadata. Текущие javascriptNativeFixture/readFixture и immutable exact oracle не переопределять; либо новый узкий resolver, либо явные private entries с отдельной outcome policy. Нельзя использовать общий флаг "allow any output".
- `javascript-native-roundtrip-contract.mjs` сейчас сравнивает OUTPUT с INPUT (кроме outside-safe), а `javascript-native-roundtrip-binding.mjs` использует одну type для обеих сторон. Coercion потребует отдельного role-specific contract: input/upstream type3/5; output только4, count1. Canonical signed64 decoder остаётся точным; characterization не означает relaxed transport validation.
- `javascript-native-roundtrip-owner.mjs` completed witness требует Status3/empty ErrorDetails; `verifyNativeRoundtripExecution` и `completeJavascriptNativeRoundtrip` допускают только completed. Не расширять их до failed. Добавить отдельный private terminal-error witness/upstream binding, переиспользуя immutable node/source/edge/lifecycle проверки и existing failed-child evidence.
- `javascript-live.mjs` private family ветвится по proved terminal до native output opening; старые real/bool/string/integer/date/cardinality пути неизменны. Infrastructure exception не превращается в value/rejection outcome. Ни public schema/action catalog, ни system prompt, ни CLI behavior здесь не расширяются.

## План проверок до live

1. Independent Python audit всех семи CSV length/SHA, schema/input bytes и source hashes; запрет BOM/CRLF/подмены case. Node tests сверяют exact source, enum-only,9 строк/один Set/один Append; VM лишь проверяет candidate guards и calls, не симулирует conversion oracle.
2. INPUT refusal: numeric "42" вместо String, NULL вместо0, иной sign/fraction/UTF-8, wrong row/schema/tag/bytes, stale artifact/import/source/connection/process. JS mutation запрещена до отказа input attestation.
3. Каждая fixed source достигает Set с ожидаемым JS kind; NaN не равен себе, infinities различаются по знаку, guards отсекают другой operand. JSON nonfinite→null не допускается как доказательство.
4. Success outcome tests: различные native int64 значения, включая вне-safe canonical decimals, и NULL сохраняются как observation без exact-value PASS; malformed8-byte payload/tag/count/type/NULL flag/decimal mismatch отвергается. Изменённый upstream отказывает даже при допустимом output.
5. Failed outcome tests: только exact fresh child + ErrorDetails + source/line9 дают attributed rejection. Wrong child, predecessor terminal, пустые/усечённые details, line2/4/6/7/8, syntax/import error, generic notification, timeout, cancellation, unknown transport не допускают success/rejection. OUTPUT method invocation count0 для failed branch.
6. Both terminal branches завершают exact upstream и lifecycle/ACK; failed witness не проходит completed verifier; source/edge/port/cookie replacement между terminal/read отказ. Потеря/retirement buffer, pending request, release/ACK mismatch не переигрываются.
7. Isolation harness доказывает независимость семи run records: отказ первой дроби не удаляет остальные slots; no runtime batch/retry/skip. Только root назначает последующие fresh runs после cleanup.
8. Полный client suite, JS/native main, public deny и Python fixtures на pinned Node; existing exact integer/input/upstream oracles и renamed-JS/public guards неизменны. Root independent pin audit, отдельные команды и fresh profiles перед live; один case за раз.

## Handoff

Это один proposed design для review; executable fixtures/catalogue/runtime/tests ещё не изменены. Source/CSV pins выше вычислены и воспроизводимы из текста, но не являются execution evidence. После принятия root потребуется отдельно разрешённая реализация и затем отдельные headed runs. Public handler/CLI/full G5 остаются обязательными следующими этапами.


## Root review и независимая проверка

Исходный proposal SHA `940637f5d1667105ee843d40ab6c0d109618d9bbd0741de95f9dcce820dc12d6`.
Root независимо восстановил7 sources из шаблона и записей, проверил их length/SHA,
CSV length/SHA, реальные Python binary64/UTF-8 bytes и syntax pinned Node.
Все7 PASS; Set действительно единственный и находится на строке9. Это preflight,
не наблюдение ChakraCore. Private receipt integer-coercion-design-preflight.json.

Разрешена реализация предложенного bounded каталога и обоих terminal маршрутов.
Дополнительные условия: строка9 без подтверждённого runtime error и привязки
к точному исполнявшемуся source не доказывает отказ Set; неизвестный line offset
не угадывать. Characterized NULL/целое значение нельзя представлять как strict
exact-value PASS. Для failed маршрута запрещены OUTPUT read и переиспользование
completed witness. Ожидаемые значения не менять по результату первого запуска.
Все7 слотов сохраняются, в том числе failed/unresolved/not_run. Полный набор
проверок из раздела выше обязателен; root принимает frozen source перед каждым
live запуском. Public handler/CLI и остальные G5 пункты не исключаются из цели.


## Наблюдённые исполнения (Ubuntu operator)

Source `87332cec9804c761465dad766f989fb458c4d997`, pinned Loginom frontend7.4.2.
Первый отдельный headed run fraction-positive01/profile66: native Real1.75
перед JS и после него upstream точны; native Integer OUTPUT равен1
(signed64 LE0100000000000000). Root проверил3 native cells,625 journal refs,
1259 source pins и cleanup3/3. Report SHA
29aa1bd6c1f9c0de7b2436607fa0860264201a8699ab27b86092147faa461c93.
Это characterization одного fixed case; никакой общий rounding/truncation
алгоритм и внутренний механизм ChakraCore не объявляются доказанными.
Матрица6/7 characterized, последний случай not_run. Подробности и актуальное
продолжение — [checkpoint](checkpoint.md); full G5/handler/CLI не закрыты.

Отдельный fraction-negative01/profile67 на том же source: native Real−1.75
INPUT/upstream exact, Integer OUTPUT−1 (ffffffffffffffff). Root audit3 cells,
628 refs,1259 pins,cleanup3/3; report SHA
5b43823fd0bd64e936de486e834cb0073251c912daac006b69da22eb2b6ef1e0.

Отдельный string-numeric01/profile68: native String «42» INPUT/upstream exact
(UTF-8 3432), Integer OUTPUT42 (2a00000000000000). Root audit3 cells,578 refs,
1259 pins,cleanup3/3; report SHA
396ab09e70812da53ad804a5e9257950a4bda83127874392265b6232cd6dc562.
Общий parsing algorithm по этому одному строковому значению не устанавливается.

Отдельный string-invalid01/profile69: native String «not-an-integer» INPUT/upstream
exact; successful JS terminal и Integer1×1 OUTPUT с native NULL/tag1, не ноль.
Root audit3 cells,559 refs,1259 pins,cleanup3/3; report SHA
e56fe58eb78f1fdcdbf6f05ee40a5dc78741ddace477dce5f3fbb59686918d9a.
Это конкретное наблюдение, не универсальное правило для всех неверных строк.

Отдельный NaN01/profile70: native Real+0 INPUT/upstream exact, fixed source
вычисляет NaN=input/input; Integer1×1 OUTPUT native NULL/tag1. Root audit3 cells,
616 refs,1259 pins,cleanup3/3; report SHA
d082d1dcda98860569efac8772b0dd66a37677e839d242ce4cf68ea282594e75.
Проверка не устанавливает native nonfinite INPUT или общий floating-point bridge.

Отдельный positive-infinity01/profile71: native Real1 INPUT/upstream exact;
fixed source candidate +Infinity=input/0, Integer OUTPUT−9223372036854775808
(signed64 LE0000000000000080), не NULL. Root audit3 cells,646 refs,1259 pins,
cleanup3/3; report SHA
f981135e99df70b88af12637ee4ad5309ef2a1bd4ca7a1d921ddc74f5be7fa6f.
Внутренний механизм и общий overflow/clamping algorithm этим не доказываются.
