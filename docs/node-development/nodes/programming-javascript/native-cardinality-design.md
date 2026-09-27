# JavaScript native cardinality — bounded proposal

Статус: **source75 реализовал непустые случаи; keep2 и duplicate независимо проверены live; odd остановлен до JS source на блокировке выбора узла; declared-empty не проверен live**.
Актуальные evidence и границы — в [checkpoint](checkpoint.md). Описание исходных ограничений ниже относится к source74 перед реализацией.
Source74 HEAD `cb3e608baac8ca9f0270540ac4c65e7930d08d21`.
Координатор сообщил terminal OBSERVED для Date roundtrip02/source74/profile56:
independent 9 native + 9 civil / 1025 refs / 190 pins PASS, baseline matched,
cleanup3/3, browser CLOSED. Report SHA256
`82b3201a689a026513631366ea3c638cc9e947b285be6032c79f33c9d2b66527`.
Это результат независимой проверки координатора, не новый audit в этом ходе. Runtime/tests/fixtures/private evidence не
меняются. Единственная запись этого этапа — данный документ.

Основания:

- Authoritative root `docs/node-development/nodes/programming-javascript/plan.md`,
  J08: empty и 0/1/N rows, полная schema, верное число/порядок, complete read.
  Прочитанная версия SHA256 `f22a711b102c5e817d9834ded87e09f96fdde974a6833b7d4f6d6fe78b0d2463`.
- `fixtures/operator-only/typed-cases.json`, case `cardinality`, SHA256
  `35dd2d1e145ff186b83582b8981af3e8510cfbc53cd078ae660d2bbfb4fd1046`.
- Existing private typed INPUT/roundtrip contracts и общий native reader.
  Исторические успехи других типов не доказывают cardinality/empty JS.

## Четыре фиксированных случая

Предлагается один независимый imported INPUT 3×1, `Value` integer/native type4,
JS DataType.Integer; Value представляет ID из canonical case. Имя `Value`
сохраняет существующую fixed schema и не вводит отдельную проверку named ID API.
CSV-кандидат `Value\n1\n2\n3\n`, UTF-8, explicit integer/Дискретный, прежние
фиксированные import settings. CSV/hash фиксируются до реализации/live. Root уже создал authoritative
`cardinality-preflight.json`: exact arrays/counts/signed64 bytes совпадают с
таблицей ниже; empty_schema требует сохранения declared columns. Файл прочитан
только для сверки и не менялся. Здесь fixture не создаётся.

На host/UI/native границе значения — decimal strings `"1","2","3"`, tag20,
64-bit signed LE, bytes соответственно `0100000000000000`, `0200000000000000`,
`0300000000000000`. Все три значения точно представимы JS Number; вычисления
не затрагивают outside-safe integers и не расширяют гарантию int64.

| Предлагаемый private selector | Условие/операция fixed source | Exact OUTPUT | INPUT row indices для проверки bytes | OUTPUT count | Native cells всего |
| --- | --- | --- | --- | --- | --- |
| `cardinality-keep2` | Emit при `value === 2` | `[2]` | `[1]` | 1 | 3+1+3 = 7 |
| `cardinality-odd` | Emit при `value % 2 === 1` | `[1,3]` | `[0,2]` | 2 | 3+2+3 = 8 |
| `cardinality-duplicate` | Дважды emit каждый вход в исходном порядке | `[1,1,2,2,3,3]` | `[0,0,1,1,2,2]` | 6 | 3+6+3 = 12 |
| `cardinality-empty` | **UI declared** Value integer, fixed source без AssignColumns/Append/Set | `[]` | `[]` | 0 | 3+0+3 = 6 |

Каждый selector — отдельный immutable source/hash и самостоятельный свежий
root-owned run. Если все четыре будут выполнены, это 33 native cells суммарно;
нулевой OUTPUT имеет отдельную count/schema attestation, не фиктивную ячейку.
Нет batch loop, произвольного script/rows/columns CLI или разрешения всей матрицы.

Три непустых fixed scripts работают в code mode: сначала
`OutputTable.AssignColumns` с единственным `Value: DataType.Integer`, вне row loop.
Get читает INPUT; перед каждым Set обязательно Append. Duplicate вызывает
Append+Set дважды, а не Set дважды в одну текущую строку.

**Canonical `cardinality-empty` обязателен именно в UI declared mode.**
До source/Execute в JavaScriptColumnsWizard настроить ровно одну выходную колонку
Value (name/label), Integer/type4 и generation checkbox=false. Fixed source не
содержит AssignColumns, Append, Set или иных структурных изменений. Допустимый
bounded snippet — `import {InputTable,OutputTable} from "builtIn/Data";` плюс
неизменяемый комментарий; импорт сам не объявляет выходную schema и не создаёт
строк. Схема должна поступить из подтверждённой UI настройки и сохраниться при0.
Фактическое принятие такого snippet проверяется отдельным root live; никаких
автоматических замен source после отказа.

Code-empty с AssignColumns может быть лишь отдельно согласованным промежуточным
probe zero-reader. Он **не заменяет** canonical declared-empty, не входит в
четыре обязательных cases и не закрывает этот пункт. В текущем предложении
дополнительный selector/прогон code-empty не назначается. Другие проверки
переключения declared↔code остаются отдельными требованиями полного плана.

Ожидаемые arrays/row maps/counts закрепляются отдельно от source. Verifier не
исполняет проверяемый JS для получения ожидаемого результата и не сортирует
результат. При выходе `[1,2,3,1,2,3]` duplicate обязан отказать.

## Наблюдаемые ограничения текущих исходников

Пути далее относительно `packages/loginom-runtime/`.

| Источник/функция | Текущее ограничение |
| --- | --- |
| `tools/loginom-acceptance/javascript-native-fixtures.mjs` | Один rows/values/expected_bytes для каждой identity fixture; cardinality selector отсутствует. |
| `javascript-native-input-contract.mjs`, `verifyNativeFixtureCells`, `verifyNativeInputUi` | Полное точное сравнение с фиксированным INPUT. Подходит как принцип admission, но нового integer123 case нет. |
| `javascript-native-roundtrip-contract.mjs`, `javascriptNativeRoundtripProbe`, `verifyNativeRoundtripRead` | Probe делает identity Get/Set; OUTPUT проверяется тем же fixture oracle и побайтно с той же позицией INPUT. Это несовместимо с count1/2/6/0. |
| `javascript-native-input-binding.mjs` и `javascript-native-input-read.mjs` | Serialized allowlist содержит только прежние typed fixtures, fixed Value/schema/count. INPUT нового случая должен оставаться 3×1. |
| `javascript-native-roundtrip-binding.mjs`, snapshot | Тот же count используется для обеих ролей. Проверяются `dt.FTotalRowCount` и `helper.$FRowCount`; требуется `$FCacheInitialized===true` и truthy `$FData`, всегда извлекаются два subscription cookie. Это сейчас закрывает empty OUTPUT. |
| `javascript-native-roundtrip-binding.mjs`, `bindJavascriptNativeRoundtrip` | Перед upstream completed OUTPUT release counts сравниваются с `state.input.count`, а должны — с count закреплённого OUTPUT binding. |
| `javascript-native-roundtrip-read.mjs` | Fixed slice count одинаков для обеих ролей. Generic bounds допускают 0, но whitelist не допускает empty case. `captured.readStarted=true` выставляется внутри cell loop: при нуле итераций успешное чтение не резервирует binding от нового read ID. |
| `javascript-native-roundtrip-driver.mjs` | rows/row_count в args и ожидаемые releasedRequests/Responses берутся из `fixture.rows`, включая finally cleanup. Нужен role-specific count. |
| `javascript-execution-runtime.mjs`, `readNativeRoundtrip` | Lifecycle uncertainty callback также ожидает INPUT fixture.rows для OUTPUT. Отдельно INPUT support правильно должен продолжать ожидать 3. |
| `javascript-native-roundtrip-owner.mjs` | Удерживает INPUT count/cache/source, topology и точный script. INPUT cache должен оставаться непустым и неизменным; ослаблять upstream guard ради пустого OUTPUT нельзя. Сейчас code mode hardcoded; source ≤32 lines уже проверяется. Для canonical empty обязателен отдельный fixed declared witness. |
| `client/lib/variant-native-read.mjs`, zero branch | Уже есть отдельная count/schema аттестация zero в Collapse reader. Она не является реализованной JS admission и не должна обходить JS owner/source capability. |
| `client/lib/variant-native-values.mjs`, `adaptRead` | При row_count0 требует empty_count_attested=true, непустую schema, cells0 и completed published lifecycle0. Coverage table_complete=true возможно с rows_read=0, columns_read=0; schema.length всё равно 1. |

`javascript-native-input-driver.mjs::verifyNativeInputCountLoaders` уже закрепляет
исходники PrepareColumnInfoAndRowCount, InitOutput, DataSourceProxyRead.
Сохранить эти pins и наблюдённый путь получения count, не вызывать model/RPC
methods напрямую и не присваивать count самому.

Shared tests `client/test/variant-native-read.test.mjs` демонстрируют zero read
без cell RPC и отказ при missing count/pending operations/pages/wrong field map.
Это прочитанный source precedent, не новый тестовый прогон и не доказательство
того, что JS empty OUTPUT имеет точно ту же frontend форму.

## Контракты и порядок будущего допуска

1. Для каждого fixed selector импортировать один и тот же закреплённый CSV.
   Собственный import Execute, exact full UI INPUT (integer decimal strings),
   observed import settings/source/upload lineage, then full native INPUT3.
   Type/tag/count/order/bytes должны совпасть с независимым oracle до JS creation.
2. Зафиксировать immutable INPUT raw/binding/lifecycle/provenance и source pins,
   case selector, exact source hash, полный completed child и journal ACK.
   Проверить baseline перед JS. Сохранить compact/full execution association;
   не брать полный child из позднего snapshot.
3. Создать единственный JS node/edge, применить fixed schema/source выбранного
   case: code для1/2/6, UI declared для0,
   подтвердить readback и Done seal. Ровно один explicit Execute с fresh owned
   completed child. Empty output — успешный completed Execute, не «не было запуска».
4. Прочитать OUTPUT полностью согласно роли: 1/2/6 cells или count/schema0.
   Проверить fixed ordered values и bytes по заранее объявленной row map к
   frozen INPUT, а также независимому scalar oracle. Journal ACK обязателен.
5. После completed OUTPUT выполнить native upstream3; сравнить с оригинальным
   INPUT по count/schema/order/значащим bytes и original child/source/cache.
   Не пересоздавать binding baseline или импорт для обхода отказа.
6. Final verifier заново декодирует raw evidence всех стадий, сверяет exact
   per-case OUTPUT oracle и исходный upstream, IDs/roles/source/ownership,
   lifecycle counts, baseline и journal ACK. В отчёте явно указать case,
   input/output/upstream counts и scope. Предлагаемый outcome
   `fixed_cardinality_observed`, exact_pass=true только при полном успехе,
   g5_complete=false. Unknown cleanup не допускает completed PASS.

Role-specific counts должны определяться host-owned fixed catalogue и тем же
bounded serialized allowlist, а не доверенным пользователю числом в args.
Рекомендуется маленький private resolver `(fixedSelector, role)` для ожидаемых
input/output shape/oracle; прежние typed selectors сохраняют identity contract.
Четыре новых selectors могут ссылаться на один CSV без четырёх копий файла.
Нельзя заменять INPUT `.rows` на OUTPUT count глобально.

Source74 урок: port GUID может совпасть у разных узлов. Сохраняются composite
(document, workflow, node, port), held native objects, source owner/object,
execution и role; не вводить глобальную GUID uniqueness. Integer1/2/3 не должны
разрешать чужой native source просто потому, что числа совпали.

## Обязательный UI declared-empty: существующие пути и будущая граница

Дополнительные source-backed ограничения в `tools/loginom-acceptance/`:

- `javascript-live.mjs` сейчас выбирает для любого nativeRoundtrip
  `executionCase='code-table-execute'`. Wizard вызывает
  `configureJavascriptSchema(..., mode:executionCase.split('-')[0])`, затем
  native schema/source binders. Mode нужно получать из фиксированного case
  descriptor: только cardinality-empty имеет `declared-table-execute`.
  Не добавлять пользовательский произвольный mode/schema переключатель.
- `javascript-schema-probe.mjs::readJavascriptSchema` уже проверяет тот же tab,
  native wizard, nodeData и root; complete unfiltered/unbuffered Ext store,
  уникальные record IDs/names, type/index/Required/Broken и mapping reciprocity.
  Generation checkbox связывается с Ext control, DOM/input/checked class.
  Это подходящая основа live readback, не готовый Value-only declared contract.
- `configureJavascriptSchema` умеет выключить generation и последовательно
  добавлять declared fields, но жёстко использует две колонки ObservedID/type4 и
  PhaseMarker/type5. `javascriptDeclaredColumnsMatch` также ожидает именно их.
  Нельзя заменить глобально старый oracle или посчитать его Value-only oracle.
  Нужен отдельный fixed cardinality declared path либо bounded selector внутри
  private configurator при сохранении старого default. Не передавать arbitrary
  columns array как новый public/native capability.
- `javascript-column-editor.mjs` уже даёт `openJavascriptColumnEditor`,
  `verifyJavascriptColumnEditor`, `fillJavascriptColumnField`,
  `openJavascriptColumnTypePicker`, `selectJavascriptColumnTypeOption`,
  `settleJavascriptColumnEditor`, `recordJavascriptColumnHelperSource`.
  Переиспользовать их ownership, pinned helper, once, apply/settlement/deadline
  и cleanup правила для ровно одной Value integer column.
- `javascript-execution-probes.mjs` уже различает code/declared source:
  AssignColumns добавляется только code. Его sales/sentinel probes используют
  другую schema/задачу; они служат примером mode separation, не canonical empty.
- `javascript-native-roundtrip-owner.mjs::armJavascriptNativeRoundtrip` сейчас
  принимает binding/source/hash, не сохраняет ожидаемый schema_mode.
  `bindJavascriptNativeRoundtripSchema`, `bindJavascriptNativeRoundtripSource`,
  `prepareJavascriptNativeRoundtripWizard`, `sealJavascriptNativeRoundtripDone`
  требуют checked=true и/или literal schema_mode=code. Только переключить
  executionCase недостаточно: этот owner path закономерно откажет declared.

Будущий owner contract должен до JS creation закрепить immutable fixed case,
expected schema_mode и exact expected schema вместе с source hash и INPUT baseline.
Mode связан с case allowlist; нельзя принимать произвольный schema_mode из args.
Для nonempty/prior typed сохранить checked=true; для canonical empty требовать
checked=false, без ослабления остальных same-owner/source guards.

UI admission для empty:

1. В том же owned JavaScriptColumnsWizard подтвердить generation=false и
   исходно пустую output schema; неизвестные существующие поля не удалять вслепую.
2. Добавить только Value/Value, выбрать Целый/type4 через bound picker,
   выполнить own Apply и settlement. Полный readback подтверждает одну запись,
   index0, name/label/type, boolean Required, Broken!=true, отсутствие hidden
   или filtered records. Значение Required наблюдать и закрепить в witness;
   не объявлять неустановленное значение проверенным. Для нулевого OUTPUT это
   не меняет обязанности сохранить колонку.
3. Retain generation control/DOM и observed field store/record identities,
   original wizard/nodeData/root. В schema witness включить exact field projection
   (name/label/type/index/Required и соответствующие record identities), case/mode,
   digest и verified Apply/readback receipt. Numeric store counts и complete
   inventory обязательны, одного `generation.checked=false` недостаточно.
4. Source readback должен совпадать с fixed empty snippet; никаких AssignColumns,
   Append/Set, sentinels, mutations или другой программы. Перед собственными
   Next/Done заново проверить same wizard, mode и declared field witness.
   `readJavascriptSchema` требует видимую schema page: на другой странице нельзя
   вызвать его и трактовать отказ как разрешение. Нужна bounded проверка held
   local store/records в том же wizard либо подтверждённые собственные переходы
   с сохранённой pre-transition attestation. При необъяснённой disposal/replacement
   — отказ; не доверять одному старому snapshot и не делать лишний Next/reopen.
5. Prepared Done receipt и sealed receipt содержат expected mode и exact declared
   schema witness digest вместе с source/effect/node/deadline. Собственный Done
   должен быть подтверждён terminal/quiet return в исходный graph, без новых
   сообщений. Если controls/records живы — проверять их; их штатная disposal
   допускается только на matched settled собственном Done boundary, не сама по себе.
6. Before Execute и при complete/final revalidation сохраняются fixed source/mode/
   schema receipt, exact fresh JS child и прежние owner/runtime/upstream checks.
   Native OUTPUT schema при0 обязана быть Value integer и совпадать с UI declaration,
   а не только с expected string в host. Report/journal явно показывают
   schema_mode=declared и declaration evidence до Execute.

Новые негативные mode/schema тесты должны доказать: code-empty и пустая
недекларированная schema не могут получить canonical declared-empty PASS;
чужой record/store, drift name/label/type/Required/count, checked flip после
Apply, другой source/case/mode в Done seal, disposal без собственного terminal
Done и отсутствие schema на native0 закрывают admission. Старые code cases и
двухколоночный declared sales path должны сохранять прежние проверки.

## Нулевой OUTPUT: отдельная fail-closed admission

Пустой cells array сам по себе ничего не доказывает. Не подменять zero отсутствием
Preview, inactive port, error/timeout, незагруженным count или schema без полей.
Сохранить тот же bound JS node, active output0, interface116 datasource/owner,
full fresh completed JS execution и pinned runtime/count loaders.

Предлагаемый zero branch **только для role=output fixed cardinality-empty**:

- Schema metadata полностью присутствует: один Value integer/type4, field records
  и identities удерживаются до final recheck. INPUT/upstream не используют этот branch.
- Наблюдаются согласованные нули `dc.FTotalRowCount`, `dt.FTotalRowCount`,
  proxy.FTotalRowCount, store.totalCount и helper.$FRowCount. Missing/undefined,
  NaN или fallback `count || 0` запрещены.
- store.loading=false; proxy.FDataFieldNames точно `["Value"]`; FValueGetters
  содержит ровно один function; pendingOperations/pageRequests существуют и пусты.
- Shared precedent использует helper.$FCacheInitialized=false и $FData=null.
  Это отдельное завершённое zero state с доказанными count/schema, не разрешение
  любого незагруженного cache. Подтвердить actual JS shape в root-owned live;
  если она иная — сохранить отказ и отдельно исследовать, не угадывать форму.
- Current private snapshot/publisher безусловно читает subscription cookies и
  cookie_sources. Для zero нельзя просто вызвать nonempty cookie validator на
  отсутствующем cookie или сочинить proxy. Нужна явно отдельная zero attestation
  с count/schema/loader provenance. Runtime/subscription class pins исходного
  INPUT сохраняются; отсутствие output subscription не объявляется доказательством
  его наличия. Если output cookie фактически существует, удержать его наблюдённую
  identity; форму допуска определить по source/наблюдению, не универсальным bypass.
- Retain references dc/dt/ds/store/proxy/helper/identity/field maps/getter array,
  их безопасные own-property values и native process/topology. Повторить snapshot
  до публикации и проверку после return-to-graph. Не инициализировать cache
  принудительно и не делать cell RPC «для подтверждения пустоты».
- Зарезервировать successful read binding **до cell loop**, чтобы cells0 нельзя
  было перечитать под новым operation ID. Role binding тоже остаётся single-use.
  Reused ID, другой ID с тем же binding, replay zero OUTPUT до upstream — отказ.
- Publish row_count0, schema1, cells[], empty_count_attested=true; lifecycle
  completed/published, requests/releasedRequests/releasedResponses=0, pending0,
  retired=false. Это zero cell transport, не отсутствие lifecycle.
- Upstream gate использует `output.initial.count===0` и его exact read ID,
  а затем возвращается к original INPUT count3. Не применять truthy checks
  к zero count. Coverage.columns_read=0 закономерен; schema.length=1 обязательна.

Для независимого root audit будущий proof должен сохранять **наблюдённый
bounded scalar zero-admission receipt до и после чтения**, а не только
`empty_count_attested=true` и переданный ожидаемый rows0. Предлагаемая запись
`zero_admission.before` / `zero_admission.final` включает:

- case/role/read ID, composite document/workflow/node/port и native source
  owner/object/interface, exact completed execution IDs и source/schema witness digest;
- отдельные фактические значения count из dc/dt/proxy/store/helper, не одно
  скопированное expected число; store loading, helper cache_initialized и
  cache_is_null как наблюдённые scalar states;
- actual schema projection Value/name/label/type/index и число полей; observed
  field-name array, getter count и признак, что каждый getter является function;
- pendingOperations/pageRequests counts, idle/process completion/reexecution
  checks, результаты same-owner/source/held-identity comparison и loader pins;
- phase/read association и exact journal ACK/digest для связывания с raw empty
  result и его lifecycle0. Before/final должны согласовываться по count/schema/
  source/execution; оба сохраняются даже когда ожидаемые counts заранее равны0.

Native object handles, функции/getters, credentials или произвольные объекты
не сериализуются. Retained references остаются page-local; наружу выходят только
bounded scalar projections и результаты проверок. Root проверяет фактические
zero counts, schema1, idle/pending0, cache state, обе ассоциации и source pins;
сам success boolean не заменяет это доказательство. При отказе допустима
bounded diagnostic receipt наблюдённого состояния с явным unverified/refused,
но её нельзя переиспользовать как успешный admission.

Непустые OUTPUT1/2/6 продолжают прежний strict loaded-cache/cookies path.
Публичный/shared reader не расширяется. Atomic snapshot и исключение unobserved
ABA не заявляются; сохраняются observed_local/no_server_snapshot ограничения.

## Необходимые будущие файлы и проверки

В `tools/loginom-acceptance/`:

- `javascript-native-fixtures.mjs`, новый fixed integer123 CSV, Python CSV audit:
  INPUT oracle и четыре fixed role/output descriptors.
- `javascript-native-input-contract.mjs`, input binding/read allowlists:
  independent integer123 admission; input driver проверяет прежние source/UI/native
  receipts, без переменного OUTPUT count в INPUT логике.
- `javascript-native-roundtrip-contract.mjs`: четыре immutable probes, отдельные
  output order/row map/schema/count oracles, final raw-evidence revalidation.
- `javascript-native-roundtrip-binding.mjs`, `javascript-native-roundtrip-read.mjs`:
  role-specific count, bounded zero state attestation и pre-loop reservation;
  upstream gate проверяет завершение фактического OUTPUT count.
- `javascript-native-roundtrip-driver.mjs`, `javascript-execution-runtime.mjs`,
  `javascript-live.mjs`: role-specific args/lifecycle/cleanup/report и четыре
  private selectors, без произвольных rows/script/schema options.
- `javascript-native-roundtrip-owner.mjs`: fixed case/mode/declared-schema witness
  от arm до prepared/sealed Done и fresh execution; сохранить original nonempty
  INPUT/cache/topology. `javascript-schema-probe.mjs` и при необходимости отдельный
  private fixed helper: Value-only declared setup с existing column editor.
  `javascript-live.mjs`: mode из fixed case и routing в этот configurator.
  Private Preview opening переиспользовать.
- Новые targeted cardinality tests плюс предыдущие typed families/public deny;
  shared zero-reader tests служат regression, не заменяют private JS zero tests.

Обязательные отрицательные случаи: неверный count/order/duplicates, потеря
schema при0, NULL/string/real вместо int64, неверные source/case/hash/role/mode, code-empty вместо declared-empty,
лишняя/неверная declared column, generation checkbox=true, изменение schema
после Apply/до Done, foreign declared store/record,
zero вместо timeout/inactive/loading, отсутствующий или conflicting count,
pending count/page, foreign field/getter map, неверный helper/cache state,
смена owner/native source/cache/process между snapshots, reused IDs/binding,
nonzero requests у empty, fake lifecycle0 у nonempty, OUTPUT lifecycle count
ошибочно равен INPUT3, stale child, same port GUID с wrong node, изменённый
upstream, baseline mutation и journal ACK mismatch. Для duplicate отдельный
отказ на `[1,2,3,1,2,3]`, для keep2 — на `[1]` при правильном count1.

Нужны положительные serialized tests для counts1/2/6/0 и schema1 при0,
проверка отсутствия cell RPC у0, успешный original upstream3 после lifecycle0,
и невозможность повторного zero read с другим ID. Не считать только exit0
или отсутствие исключения доказательством cardinality.

## Граница следующего шага

Сейчас — только root review этого proposal. После отдельного поручения допустимы две стадии реализации:
сначала nonempty1/2/6 с code mode; затем nativezero + обязательный UI declared-empty.
У каждой стадии свои source/tests/freeze и root-owned свежие профили по одному
случаю. Пока declared-empty не прошёл, canonical cardinality остаётся неполным. Root независимые
expected arrays/bytes/schema/counts фиксируются заранее. При ошибке zero shape
останавливается этот case; generic reader не ослабляется и baseline не меняется.

Четыре случая не закрывают весь G5/план: Integer coercion, named access/case,
other type semantics, прочие UI declared-mode/переключение схем, freshness/recovery/persistence
и другие требования J01–J15 сохраняют собственные доказательства и статусы.

Authoritative root cardinality-preflight SHA256: `afad47f2c7c60fd0f94433b5acc5ba5514bbb790efa8c59e60a801d82fc67d8e`.

## Назначенный порядок реализации

Root подтвердил исходные ограничения по source74 и принимает разделение на два
обязательных этапа. Fix75: только nonempty keep2/odd/duplicate (counts1/2/6),
fixed integer123 INPUT, отдельные source/hash/role count/order contracts,
замороженный baseline и точный original upstream. После source/tests/freeze root
проверяет каждый случай отдельно в свежем headed профиле. Нулевой selector
не должен приниматься этим промежуточным исполнителем.

Следующий обязательный этап — native zero admission вместе с UI declared-empty
и наблюдаемыми before/final count/schema receipts. Он остаётся частью цели;
успех первых трёх случаев не закрывает cardinality/J08/G5. Code-empty не подменяет
canonical declared-empty. Commits, профили и live принадлежат root.
