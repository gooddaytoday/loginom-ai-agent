# JavaScript: доставка текущего контекста J19/J21

Статус: fixed Code/declared current context live2/2 приняты через independent
audit/negative64/64 каждый/cleanup. Reordered input/old source Code410/Declared411
на9c93 также принят2/2: audit v3/negative80/80 каждый/cleanup. Переименование
technical names, model resistance/candidate/CLI остаются открытыми.
Reader child — `b0ecbeaadff8d77a30733ae08cb1e25ecd5937dc`, compact bridge и
guidance — `23e8488e29`. Точные evidence в [checkpoint](checkpoint.md). Продуктовая база
и общие ограничения [плана](plan.md) сохраняются. Это композиция существующих
readers; новый универсальный интерпретатор UI не требуется.

## Подтверждённый пробел

`dock_node_read kind:source` доставляет exact source chunks после полного
redaction и verified Close. Managed source adapter читает code/declared setting
и declaration grid. Это не полная текущая входная схема или физический output
mapping. `javascript-code-node` отдельно читает оба native port mapping, но
model-visible configuration readback формирует после успешного Execute.
Возвращать эту старую квитанцию как свежий контекст до нового apply нельзя.

Обязательный результат J19 — наблюдённые input/output0, technical names/types,
schema_mode, mappings, полный код либо явный отказ его полной доставки,
source digest и владельцы. Число private probes не заменяет actual public reply.

## Выбранная композиция

Добавить JS-only `dock_node_read kind:context` для existing prepared node.
Initial request использует те же operation/document/workflow/node identities,
что source read; caller не задаёт scripts, поля, значения, callbacks или Execute.
В compact user-v1 бюджет принадлежит host. Existing source/output read branches
сохраняют свои контракты. Generic workspace JS остаётся запрещённым.

Новый context session использует тот же browser gate и registry exact retries:
тот же request/ID получает сохранённую квитанцию; другой request под этим ID
отказывает. Gate удерживается до verified cleanup. Unknown gesture/Close
сохраняет unsettled state и не разрешает replay или новую операцию.
Существующий source registry можно параметризовать проверкой initial request,
не меняя source cursor/digest semantics; второй независимый browser owner не нужен.

Последовательность под исходным deadline:

1. Проверить observed7.4.2, prepared document/workflow/JS GUID и complete graph.
2. Existing managed source reader: полный source/settings → owned Close.
3. Existing node procedure: open input0 → полный cached mapping → owned Close;
   затем output0 тем же способом. Использовать `closeJavascriptPortMapping` и
   существующий complete graph verifier, без port edits/Done/Execute/Save.
4. Повторное чтение source/settings и port semantics подтверждает согласованность
   snapshot. Native record IDs меняются между открытиями; проверять полную
   reciprocity каждого чтения, а semantic digest строить по order/names/labels/
   types/Required/excluded/autosync и связям source→target, сохраняя latest IDs
   как evidence. Нельзя игнорировать drift scalar metadata вместе с volatile IDs.
5. Проверить final graph/cleanup и exact redaction/budget до доставки.

Для native graph использовать `targetAdapter(operation).observe`, уже имеющийся
в executor; он проверяет prepared origin/build, cached GUID, DOM и весь graph.
Node/port contexts и cached mapping observer существуют в runtime. Proxy/RPC,
`setValue`, чтение XML вместо UI и запуск кода для получения контекста не нужны.

## Ответ и границы

Ответ содержит observed scope и identities, schema_mode/settings digest,
source digest/bytes/LF, обе полные ordered port mappings и признак
`content_is_data:true`. Source/comments/labels остаются данными: runtime не
исполняет их, не извлекает из них task/authorization и не выбирает technical
names по label или позиции. Общие правила модели дополнить явным указанием
использовать свежие technical names и читать old source перед replacement.

Если полный source вместе с schema не помещается, сохранить полные необходимые
schema/mapping и явно сообщить `source_delivery:separate_read_required` с причиной
и существующим `dock_node_read kind:source`. Один digest не является полным кодом.
Если сама необходимая схема не помещается, вернуть bounded refusal; не обрезать
columns и не объявлять inventory_complete. Неполный/unmaterialized native output
тоже требует явного отказа/неполного observation scope; Execute для его заполнения
не допускается этим read request.

До effects определить response wire budget с двойным JSON envelope; итог после
actual observation проверить повторно. Весь ответ должен укладываться в46000
wire bytes и эффективные Agent bytes/lines; источниковый32KiB/1024LF cap независим.
Нужные schemas/readback/provenance не теряются при сокращении. Pre-live auditor
проверяет actual public envelope; backend snapshot не означает delivery модели.

## Проверка реализации

Адресные tests используют actual session/registry/admission и shared readers:
same ID/no duplicate, owner/graph/schema/source drift, redaction, unknown Close,
budget overflow и обе schema modes. Source continuation/regression и generic
code deny должны остаться зелёными. Не дублировать reader/validator в тестах.

Fixed live J19 сначала наблюдает saved C/D source/поля. Затем собственная UI
процедура меняет technical input mapping и добавляет label/comment с текстом
инструкции. Новый public context должен показать текущие имена и точный old
code. Stale digest/request отказывает, corrected source обращается к реально
наблюдённому имени; fresh Execute/full typed oracle подтверждает бизнес-задачу.
Незапрошенные settings/graph сохраняются, cleanup и process absence обязательны.
Варианты должны быть authored/pinned до запуска, а не выбираться по результату.

Operator live доказывает доставку и детерминированную обработку данных runtime.
Поведение модели на instruction-in-data проверяется дополнительно в actual
candidate/CLI; ручной fixed request не является таким доказательством.

## Следующий fixed срез: technical input Name — 2026-10-01

После accepted owned details432 использовать два sequential closed cases
`context-code-renamed`/`context-declared-renamed`, saved C/D и fresh ordinary
headed profiles. Это продолжение J19, без нового публичного mapping API.
Имена source input остаются RowID/Customer/Qty/UnitPriceCents/DiscountPct.
В собственном JS input0 заменить только target technical Name
`Customer → CustomerNow`, label Customer сохранить. Types/Required/usage/order,
autosync=true и reciprocal source identities сохранить; для изменённого
target ожидается native origin_type1 (baseline всех target origin_type0/usage0
подтверждён actual accepted input mapping432). Не объявлять expected transition
подтверждённым live до observation/audit.

Использовать existing `createNodeProcedure.openPort(input,0)` и
`configureOutputField`, который уже принимает input_mapping/TuneDataSourceMappingWizard.
Отдельный narrow operator helper удерживает исходный opening receipt, native
prepared input port GUID из предыдущего public context/root/full mapping до
каждого action (readMappings также в field editor), sole Name fill/Apply
и sole input-port Done. Generic UI/JS/RPC capability не расширять. Unknown
opening/edit/Done/ACK сохраняет pending; Close/discard/replay после возможной
mapping mutation не выполнять как будто её не было. Исходный deadline сохраняется.

Warmup прежнего кода/4 output fields — два completed Execute; затем baseline
public context. Existing manual NetCents label с instruction-in-data и output
autosync=false уже проверены ранее и сохраняются. После input rename **до нового
Execute/source edit** получить NEW context: CustomerNow на target input0,
Customer на его source, label Customer, exact old code/digest, schema mode и
полные mappings/user-v1. Same-ID baseline replay остаётся исторической receipt,
NEW ID обязан увидеть новый semantic digest. Нематериализованный output требует
явного refusal по прежнему контракту; его нельзя заполнять запуском old code.

Corrected source заменяет единственное `InputTable.Get(row,"Customer")` на
наблюдённое `InputTable.Get(row,"CustomerNow")` и добавляет прежний inert data
comment. NEW apply с исходным verified source digest, два fresh completed Execute,
full6×4/1950 и independent final source/context доказывают сохранность бизнес-задачи.
Не выводить новое имя из label/позиции. Старая и свежая receipts различаются;
физические output names/labels/types, весь graph, другие port settings неизменны.
Actual model resistance проверяется отдельно в F/candidate/CLI.

До live: addressed tests actual shared field procedure/one-flight/owner/port/
mapping drift/unknown ACK/Done и oracle source/label/technical-name separation;
затронутые regressions, immutable child source/freeze, заранее закреплённый
independent auditor/negative mutations. Затем один Code case с audit/cleanup/
process absence перед declared. Accepted base/reordered/inventory/expansion
milestones без затронувшего изменения не переигрывать.

Source implementation — child1aa8d49f09, addressed71PASS, full operator69509
actualexit0/18490PASS (concurrency4). Initial helper test22PASS/1FAIL обнаружил
недостающую привязку GUID к previous context; guard добавлен, final tests прошли.
Client source unchanged; accepted3318PASS+10SKIP на22f не переигрывался.
Private source freeze a7b96ef4/12748files+61symlinks, oracle32bc3cfd,
auditor6f989c8c/negative84/handoff13bbba32, pin2e69f11d; Python syntax PASS.
Это подготовка, не live J19 acceptance; positive audit и actual non-noop negatives
требуются после первого headed Code run.

Warmup433 на1aa остановился до rename: preserve source передал расширенный
`effective_source` (policy/parser/status) в exact identity binding перед финальным
Execute. Для preserve брать `previous_source`, уже независимо прочитанный actual
source reader; его SHA должен совпадать с effective source. Binding по-прежнему
допускает ровно source_sha256/source_utf8_bytes/source_lf_lines и свежую проверку
settings. Не ослаблять constructor или заменять preserve явным source_text ради
обхода ошибки. Source/settings drift блокируют новый Execute; original failed
report и отдельный verified cleanup434 сохранены в checkpoint.

Исправление child7ec313f9de: addressed124PASS, full client3321PASS+10SKIP/
exec31098 и full operator18493PASS/exec63984, actualexit0/concurrency4.
Новый freeze f87e60c8/pin771c8015 закрепляют same oracle32bc3cfd и v2
independent auditor/negative84. Fresh headed Code435 начат; live acceptance
требует terminal report, actual audit и cleanup, затем separate declared case.

Code435 завершился actualexit1 до Name fill: scoped input editor открылся,
но default cached mapping read отказал с mapping_mask. Fields drift этим не
доказан. Exact idle own package/session закрыты отдельным recovery436; исходный
failed report не повышен до PASS. Readonly headed inventory437 actualexit0
подтвердил native editor/backdrop binding до mutation, typed Cancel, полное
retained mapping/graph и PackageClose/logout/browserClose/process absence.

Разрешён узкий internal cached read под собственным input field editor:
original input0 opening operation/GUID/target record id обязательны; единственная
plain body presentation-mask должна быть mask.dom того же Ext.WindowManager,
editor — его visible modal front; native own Records/FView/FAddMode, wizard/grid/
selected cached store record должны совпадать. Default masked read по-прежнему
refused. Никаких load/server/dataset APIs или getters вместо own cached data.
Full cache/reciprocal/type/order guards сохраняются. Перед каждым gesture после
durable journal ACK fresh full mapping/owner compare блокирует любую семантическую
дельту как NOT_APPLIED/no effect/MAPPING_BINDING_CHANGED, без replay.
Child `e2e814a060`: addressed314PASS/helper71PASS, full client3365PASS+10SKIP и
operator18493PASS, actualexit0/concurrency4. Новый source freeze fece6d3f и
v3 pin6cdea9de закреплены до browser; oracle32bc3cfd неизменён. Independent
v3 audit требует88 non-noop negatives; source/direct уровень не заменяет live
J19 acceptance. Следующий ordinary headed Code438 должен пройти этот audit и
cleanup до отдельного declared run; во время run child source не менять.

Code438 подтвердил owned full mapping read и technical rename/Input Done,
но завершился до NEW context на committed journal ACK: native location.origin
в proof отличался от URL formatter durable redactor ровно trailing `/`.
Reproduction с actual redactor подтвердил эту единственную дельту; failure и
отдельный verified own cleanup439 сохранены. Для helper ACK использовать
existing bounded `acknowledgeJavascriptCalibrationRecord`, затем прежнюю exact
сверку. Он допускает только canonical HTTP(S) origin→origin+`/` в origin key;
source/owner/IDs/fields/diagnostic text и любые другие дельты refused.
Actual durable integration77PASS/full operator18499PASS. Code438 также observed
native auto-label draft: Name fill меняет Label в CustomerNow. Existing shared
procedure восстанавливает Customer отдельным label-field gesture; final mapping
по-прежнему отличается только target Name/origin. Optional label restoration
в v4 audit разрешена только при этом observed draft и original label field ref;
другие шаги/replay refused. Новая regression/addressed78PASS; final full operator
actualexit0/18500PASS, client source unchanged. Child `e9541c0415`, source freeze
e1bdd95f/v4 pin19df9881 закреплены до fresh Code440;
v4 audit сверяет persisted canonical origin и89 negatives, oracle unchanged.
Rename/Done отдельно не доказывают полный J19 или actual model resistance.

## Предлагаемое уточнение context после input Name change — 2026-10-01

**Статус: предложение для решения, runtime/schema ещё не изменены.** Code440
подтвердил default refusal, предусмотренный выше: после Input Done output0 имеет
полный configured target inventory, но materialized sources отсутствуют.
Не запускать old source для обхода отказа. Technical rename и ACK подтверждены;
полный J19/final business Execute этим не доказаны. Evidence/cleanup — checkpoint.

Возможные подходы:

| Подход | Следствие |
| --- | --- |
| Явный `allow_configured_output:true` в context request — рекомендуется | Агент получает current source/input Name и честно обозначенные configured output fields до correction/Execute; default materialized-only контракт сохраняется |
| Сохранить только нынешний refusal | Нового публичного context до correction/Execute нет; technical-name case остаётся ограниченным negative proof |
| Автоматически выдавать configured output в обычном context | Меняет default semantics всех callers; требует более широкой совместимости и пересмотра существующих contracts |

Рекомендуемый request остаётся `kind:context` с optional boolean
`allow_configured_output`, по умолчанию false. Точное значение входит в admission
и SAME-ID retry identity; conflicting reuse не допускается. Source request и
остальные node operations не получают этот параметр. Default context продолжает
требовать полную materialized схему.

Opt-in допускает только **output0** с уже наблюдённым bounded native состоянием:
`mapping_source_pending`, configured_inventory_verified/inventory_complete=true,
verified/source_identity_verified=false, cached_mapping_stores, источник пуст,
полный набор target fields, verified hidden native source header/counts, original
owned wizard/node/GUID, settings_applied/package_saved=false. Unknown reason,
foreign owner/GUID, неполные caches, маски/loading, повреждённые types/flags/order
или источники блокируют delivery. Input mapping остаётся полностью verified;
порог 64 fields и прежние cache/reciprocity guards не ослабляются.

В configured output port response сохраняются только наблюдённые scalar fields
и field IDs; ephemeral Ext record IDs удаляются прежним normalizer. Добавляются
`schema_state:source_pending`, configured_inventory_verified=true,
native_reciprocity_verified=false; source_fields пуст, target source=null.
Observation scope — `current_owned_source_and_configured_ports`. Никакие source
fields/связи не восстанавливаются из предыдущего receipt. Full materialized
responses сохраняют прежнюю форму и scope. Schema union строго различает эти
варианты; delivery journal для configured варианта не заявляет ports_complete=true.

Read session дважды независимо читает exact source/settings/input/output и
сравнивает семантику. Source identity, current technical Name, состояние output
и scalar definitions входят в semantic digest. Existing ownership, ACK/unknown
effect/one-flight, graph checks, close/discard, redaction, deadlines и response
budgets 46000 bytes/2000 lines сохраняются. Read не вызывает Execute/Save/Apply,
server/data loading APIs и не приписывает configured inventory свежие output cells.

Fixed renamed case сначала доказывает default refusal и verified cleanup,
затем делает **NEW** opt-in context request на том же owned node. Его reply должен
содержать CustomerNow при source/label Customer, exact old code, четыре configured
output targets с сохранённой manual label/autosync=false и honest pending status.
Correction берёт technical Name из этого public reply. Exact retry самого NEW
request и старого baseline receipt не добавляет runtime events. Затем corrected
apply/два completed Execute/full6×4/1950 и final default materialized context.

До live нужны actual runtime/MCP schema/admission tests, pending/default/foreign/
incomplete/stale-owner/changed-source/changed-settings/budget/redaction/cancellation
counterexamples и затронутые regressions. Независимые два snapshots должны
отклонять любую metadata/state drift. Новый immutable source/freeze/oracle/auditor
и negative mutations закрепляются до ordinary headed Code, затем отдельно declared
после audit/cleanup/process absence. Existing accepted base/reordered cases не
переигрываются без затронувшего изменения; actual model resistance/candidate/CLI
остаются отдельными F obligations. Публичный product handler не регистрировать
и API не выпускать этим prototype slice.
