# G5 native types: текущие доказательства и следующие проверки

Статус на 2026-09-27: private INPUT и identity JS roundtrip подтверждены для
real/NULL, boolean, string, safe int64 и двух canonical Date значений сNULL.
Это ограниченные observed_local проверки; полныйG5, публичный handler и CLI
ещё не подтверждены. Точные receipts/hashes находятся в [checkpoint](checkpoint.md).

- Source70 `c1ae171e50`: real/profile49,12native cells/627journalrefs/75pins.
- Source71 `0115eccd20`: boolean/profile50,9cells/570refs; string/profile51,
  24cells/556refs;81pins. Сохранены NULL/false/empty/Unicode/multiline.
- Source72 `7982cc3542`: safe int64/profile52,12cells/632refs; outside-safe/profile53,
  9cells/619refs/85pins. Наблюдено9007199254740993→9007199254740992 при точных
  INPUT/upstream. Это characterization, exactPASS=false, не гарантия int64.
- Source73 `c642e6bab3`: отдельный Date INPUT-only/profile54,3native+3civil cells,
  465refs/190pins; NULL и123/999ms проверены до JS.
- Source74 `cb3e608baa`: Date roundtrip02/profile56,9native+9civil observations,
  1025refs/190pins. Civil values и significant bytes совпали с pre-JS INPUT
  на OUTPUT/upstream. Epoch/timezone не выводились. Root1042main+3deny+7Python
  PASS; неизменённые shared import/output ранее228PASS на source73.
- Source75 `f4603ad552`: keep2/profile57,7cells/618refs и duplicate/profile59,
  12cells/620refs;192pins. OUTPUT соответственно[2] и[1,1,2,2,3,3], INPUT/upstream
  [1,2,3] неизменны. Root1146main+3deny+11Python PASS. Odd/profile58 остановлен
  до JS source по visible blocker выбора узла, его OUTPUT не проверен.
- Source77 `f297b74d03`: odd03/profile61,8cells/625refs/193pins, OUTPUT[1,3],
  INPUT/upstream[1,2,3] точны; initial opening lifecycle/journal проверены.
  Root1207main+3deny+11Python PASS. Старые odd01/02 не объявляются успешными.

Original cleanup3/3 подтверждён у каждого перечисленного прогона, включая
остановленный odd. Его отказ не является проверкой JavaScript результата.
Source73 Date roundtrip01 ранее отказал из-за ошибочной global port-GUID
inequality. Source74 исправил её: один output0 GUID встречается у разных узлов,
принадлежность проверяется полным контекстом node/port/source/execution.
Runtime/source seals, native ownership и single-use guards сохранены.

Следующие проверки: пустой OUTPUT с UI declared-схемой,
Integer coercion и оставшаяся матрица плана. INPUT нельзя заменять JS-генератором
или менять expected под поведение импорта. Atomic server snapshot и отсутствие
unobserved ABA не доказаны. [Date/civil дизайн](native-datetime-design.md)
описывает соответствующий ограниченный контракт.

Далее сохранён дизайн и анализ **исходного source55**, поэтому указания
«текущий» внутри анализа относятся к этой базе, а не к source63.
Основание source55: `520ce1f78ce39859d3ce30a65db93e80c9081747`.
Текущие42 pins сохраняются для root engine probes. Их UI/string PASS не закрывает G5.

Решение: сначала независимо аттестовать native typed **INPUT**, затем допускать
один JS identity-copy Execute и сравнивать полный native OUTPUT. Не создавать
вход JavaScript-кодом, проверяемым тем же JS-механизмом. CSV — только кандидат
доставки, его bytes и column settings не являются доказательством native типов.

## Что реально переиспользовать

Пути ниже относительно `packages/loginom-runtime/`.

| Source contract | Повторное использование / необходимая граница |
| --- | --- |
| `client/lib/variant-native-decode.mjs`, `decodeVariantFrame` | Чистый bounded decoder. Frame60..65536, payload=frame−12; tag1 NULL,20 signed int64,5 binary64,7 date serial,8 UTF-8,11 bool. Int64 остаётся decimal string/BigInt, не Number. Decoder также знает3/4, но это **не** разрешение adapter принимать32-bit integer/float. |
| `client/lib/variant-native-values.mjs`, `adaptCell`, `adaptRead`, `nativeUserPort` | Проверка significant bytes, tags1/5/7/8/11/20, schema/subtype, unique cell/message IDs, full coverage и release accounting. Date — `native_serial_only`, epoch/civil/timezone не доказаны. `adaptRead` возвращает contract=`collapse-native-full-1`: для JS нужна честная host projection, не переименование чужого receipt. |
| `client/lib/collapse-native-runtime.mjs`, `collectNativeRuntime`, `bindLoadedNativeRuntime`, `verifyLoadedNativeRuntime` | SHA фактически загруженных функций/констант; сохраняются identity session/socket/prototypes/functions, transport live checks до/после dispatch. Не достаточно скачать одинаковые source files. Текущий global namespace Collapse требует отдельного решения для JS и изоляции lifecycle. |
| `client/lib/collapse-native-output.mjs`, `nativeFrontendPins`, `recordNativeProof`, `readCollapseNativeOutput` | Образец orchestration:5 same-origin frontend pins,3 count-loader pins, exclusive operation lock, bounded Preview/open/read/Close, journal acknowledgement. Не вызывается как готовый JS reader. |
| `client/lib/collapse-native-source.mjs`, `completedStaticImports` | Приватная цепочка artifact→upload lineage→последний successful import/config/readback/execution, cleanup confirmed. Более поздняя failed/unfinished операция инвалидирует старое подтверждение. Один storage path или caller JSON не дают provenance. |
| Там же `bindCollapseNative` | Жёстко требует один text-import и output node icon=`columnflipping`. Нужны новые INPUT/JS-OUTPUT binders; заменить icon недостаточно. |
| `client/lib/variant-native-read.mjs`, `readNativeVariant` | Fixed method321/interface116/port0. **Внутри `snapshot()` тоже зашиты** source import, ровно одна native edge, topology/import execution, отсутствие других dynamic nodes. Требуется пересмотр владельца каждого read, не только начального binder. |
| Там же `cancelNativeVariant`, `nativeVariantStatus` | Полезна модель local cancellation/retirement, но она привязана к Collapse state. Нет server cancel или atomic snapshot. Не сбрасывать poisoned state ради продолжения. |

Общие пределы: ≤50 rows,≤8 columns,≤400 cells,≤1MiB, read≤30s внутри исходной
operation deadline. Возвращать весь `exact_table`, а не только10-row sample.
Сохранить `observed_local`, `no_server_snapshot`, `unobserved_aba_risk`.
Object/cache identity не доказывает отсутствие невидимого изменения и возврата.

## Два новых private binding, а не generic RPC

**INPUT:** completed owned text-import output port0, exact private import/upload
lineage, full configured schema/count, native dataset/session and latest process
root/group/child. Первая аттестация до создания/открытия JS, чтобы даже Next/Done
с неизвестными эффектами не могли предшествовать проверке input. В topology
import-only нет фиктивного Collapse или фиктивной edge. После соединения с JS
вновь сверить тот же native import node/data/port, latest execution и dataset;
если output datasource изменился — прежний input receipt не переносить автоматически.

**OUTPUT:** тот же owned document/package/workflow, единственный новый JS node,
exact imported source→JS input0 edge и JS output0 GUID; native objects/data/cells,
full source SHA/code mode и mappings, новый completed JS child через ShowNode,
совпадающие process root/group/record IDs и отсутствие более поздних executions.
Первый script — только identity copy по observed technical name, с фиксированным
типом выхода; никакого Number/string/Date преобразования, async, FS или globals.
Source hash и upstream input attestation — части read capability, не UI label.

Оба binding проверять до каждого request, после response и перед публикацией:
workflow receipt, node/port/execution, session, Preview controller↔model↔datasource,
remote source owner/object/interface, schema/count/cache identities и loading.
Уточнение live probe07 и клиентского source: data/state cookies здесь — direct
`TIBGDelegateConnectionCookie_Proxy`, handles подписок с `Unadvise`, interface206.
Они **не являются доказанными счётчиками поколений данных**. Проверять точный
класс/own shape, session identity, объекты proxy/remote identity и скалярные поля
между запросами; не сериализовать рекурсивно `$S`. Это проверка стабильности
подписок/владельца, не deep immutability данных. Отдельные проверки cache/schema,
execution и границы `observed_local`/ABA по-прежнему обязательны. Source62 прошёл этот допуск в probe08; source63 в probe09 подтвердил также
durable journal acknowledgement и полную очистку input-only прогона.
Повторный input read после JS — новый read ID при доказанном неизменном upstream;
он выявляет наблюдаемое изменение, но не устраняет ABA/отсутствие server snapshot.

Рекомендуемая будущая структура: сохранить публичный Collapse admission без
расширений; вынести transport/lifecycle core только вместе с regression tests,
передавать ему внутренние проверенные INPUT/OUTPUT ownership snapshots. Не давать
пользователю произвольный callback/predicate, method/interface или source handles.
Ни один из этих runtime refactors сейчас не сделан.

## Независимая подготовка typed input

1. Матрица — `fixtures/operator-only/typed-cases.json`, SHA
   `35dd2d1e145ff186b83582b8981af3e8510cfbc53cd078ae660d2bbfb4fd1046`.
   Root main-checkout `typed-native-oracle.json`, SHA
   `382097f8c5491c1c30208c5c799d06c096a12496fb85298c43cc5b97b899e1ff`,
   ссылается на тот же fixture hash. Это mathematical encodings, не live proof.
2. Отдельный малый файл на семейство, UTF-8 и immutable SHA; int64 записывать
   непосредственно из decimal strings. Доставлять через существующую verified
   artifact/upload lineage и независимо подтверждать server file bytes.
3. Text-import settings фиксировать до исполнения: явные `type`, delimiter,
   decimal separator, quote, null marker, exact names/labels/order/used flags.
   Выбрать marker, отсутствующий в строковых значениях, например `__JS_NULL__`;
   NULL не кодировать пустой CSV ячейкой. Строки `null`/`NULL`/`0`/`false` и
   quoted empty `""` должны пройти отдельный native admission, без trim/coercion.
4. После собственного import Execute проверить полный native output **до JS**:
   null tag1 отдельно от string8 length0 и boolean11 byte00; exact UTF-8 strings;
   real tag5 bytes против root binary64 oracle; integer tag20 bytes/decimal
   против root signed-int64 oracle. Любая потеря/другой tag — fixture отказ,
   не ошибка JavaScript и не повод подправить ожидания. Не предполагать заранее,
   что text import сохранит quoted empty, multiline string или большие int64.
5. Date: native datetime schema + независимый civil UI read с миллисекундами
   подтверждают заданные civil components; native tag7 bytes снимаются с этого
   INPUT, замораживаются до JS и сравниваются с OUTPUT побайтно. Не вычислять
   epoch/timezone из имени `oadate`. Import API сейчас задаёт только четыре
   format fields, без явного date/time mask; текущий Date parser/defaults надо
   наблюдать и подтвердить. Если civil read неоднозначен — Date admission закрыт.
6. Для safe integers и real0/−1.25/10.125 required roundtrip exact value+bytes.
   Для outside-safe root bytes доказывают **точность INPUT**, а JS roundtrip
   лишь характеризуется; `9007199254740993` нельзя сначала превратить в Number.
   Null сравнивается по tag/value, не по незначащим padding/unused slots.

Если importer не создаёт нужное native значение, остановить это семейство.
Запасной путь — отдельно исследованный native table constructor/editor или
проверенный заранее подготовленный native package с provenance и тем же input
read admission. Такого готового доказанного пути здесь не найдено. JS-generator
или display-only CSV audit не заменяют независимый native input.

## Реальные предшествующие source-only примеры

- `tools/loginom-acceptance/node-import-done-live.mjs`: `--typed-fixture`, bytes
  `Flag;Moment;Note`, true/false/NULL, dates с milliseconds; строки159 и346–347
  явно задают boolean/datetime/string. Это образец подготовки и public import
  settings, не проверка нового JS input и не гарантия всех date defaults.
- `tools/loginom-acceptance/collapse/fixtures/types.csv` + `README.md` различают
  integer1/real1/string1, quoted empty/NULL, bool/date. Acceptance-kit
  `import-profile.json` задаёт типы явно; это другая конфигурация, нельзя
  механически соединять её column indexes с `types.csv` (там есть Zone).
- `collapse/variant-contract/observed.json`, `provenance.json`, `replay.mjs`,
  `audit.py`:38 significant native cells из3 SHA-bound prior artifacts,
  replay и Python scalar audit. Synthetic whole-table envelopes не live full read.
- `fixtures/replacement/input.csv` различает NULL/quoted empty/lowercase null;
  `test_import_output_evidence.py` содержит independent decimal-string int64
  checks. Это полезные negatives, но unit fixture не доказывает сохранность native
  INPUT. `date-time-public-fixture-schema.mjs` прямо помечен synthetic/model-free.

## Первый будущий bounded executable slice

**Сначала input-only admission**, новый root-assigned isolated profile/package:
одна колонка `Value: real`, четыре строки `[null,0,-1.25,10.125]`, explicit marker,
один completed import Execute; typed UI + полный native4-cell read и независимый
root binary64/null oracle. До PASS не создавать JS. Это минимально проверяет
новый import-only binding без смешивания int64/Date/CSV empty semantics.

После отдельного review этого slice — в новом назначенном run повторить input
admission, создать один JS identity-copy node и один явный Execute, прочитать
native4-cell OUTPUT и повторно проверить upstream. Затем отдельно bool/string,
safe int64, outside-safe characterization и Date. Не запускать матрицу автоматически.

Текущий `javascript-execution-runtime.prepareInput()` закреплён на sales.csv,
а `javascript-live.inspectWizardPages()` требует5 полей и RowID. Поэтому это
**не готовая опция** нынешнего `--discovery-probe`; нужен отдельный private typed
fixture operator/admission, сохраняющий sales guards без общего ослабления.

Исходная deadline включает подготовку/снятие bindings/reads; каждый timeout —
min(remaining,30000), без продления на retries. Перед dispatch reserve уникальный
read ID; на unknown response не повторять cell request, read или Execute.
`cancelNativeVariant` — local latch: поздний response должен освобождаться,
request buffers живут до callback. Pending/retired/неполное release accounting
не дают результата или cleanup PASS; profile retire/own browser close координирует
root. После подтверждённого read — scoped own Preview Close и same graph proof.

## Проверки перед допуском live

- Pure frames: int64±safe/outside boundaries без Number; IEEE bytes, null/empty/
  false/zero; malformed/truncated/unknown tags; Date serial без выдуманного epoch.
- Input lineage: подмена файла/settings/schema/type/row order, invalidated import,
  stale execution; неправильный CSV empty/null не достигает JS admission.
- Оба native binders: foreign/recreated same-GUID node/port/dataset/session,
  process root/record/last execution, source digest, edge, cache/cookie mutation,
  loading и mismatched Preview owner — отказ до следующего request/publication.
- Lifecycle: exact release counts, unique IDs, timeout/cancel/late response,
  byte/cell bounds, journal lost acknowledgement, no replay, full coverage.
  Существующие `client/test/{collapse-native-source,collapse-native-runtime,
  variant-native-read,variant-native-values,variant-native-public,collapse-native-journal}.test.mjs`
  — regression base; новые JS-specific tests нужны отдельно.
- Result audit: INPUT matches independent oracle прежде OUTPUT сравнения;
  partial sample не PASS; failed JS без refreshed output; outside-safe не получает
  false precision guarantee; original cleanup и server-cancel status раздельны.

Probe08 подтвердил получение native frames через interface116/method321 для
import-only Preview и tags1/5 четырёх real/NULL ячеек. Source63/probe09 подтвердил также полный журналируемый input-only admission. Неизвестны применимость этого пути к JS-output,
parser empty/date/int64,
стабильность datasource после JS, Date civil↔serial связь и full native cleanup.
ОС сервера также не установлена. Ни G5, ни persistence/полный discovery не закрыты.
