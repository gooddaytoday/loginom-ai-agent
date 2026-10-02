# JavaScript: рабочее исследование на Loginom 7.4.2

Статус на 2026-10-01: **`discovery_required`**. Это сводка прямых наблюдений
фазы 0B [подплана](plan.md), а не допуск публичного обработчика или автономной
CLI-приёмки. Стенд — `http://logi-test-plan.bg.local/app/`, Loginom Enterprise
7.4.2; оператор — Ubuntu, только видимый headed Chromium. ОС **сервера** —
Linux по принадлежащему `Session.Version.IsWindows=false`; дистрибутив и версия
ядра неизвестны. Продуктовая база кампании остаётся
`a8ad59766dbdb4f2da0b54367a755ce00891dd71`; более новая база документации
`3f35c5f232` добавила общее [чтение ошибки мастера](../../workflow/lifecycle.md#отказ-мастера-и-кнопка-ошибки).
Исходные отчёты и журналы находятся в приватной кампании; подтверждённые SHA,
ревизии операторов и границы каждой попытки перечислены в [checkpoint](checkpoint.md).

Исходная сводка обновлена по [acceleration review](acceleration-review.md) на docs
`13a02e8be2` / code `7b8e19bee0`; позже выполнен B-live на code `f8ceebcac9`.
Решение 0B доказывает осуществимость/выбирает контракт; последняя колонка
остаётся проверкой реализации и приёмки. Непроверенные пункты в ней не возвращают
закрытое решение исследования в начало.

Общий Done/Close lifecycle-v5 на **73a8e9df31** проверен fresh ordinary headed
Code447/declared4482/2: public Done→Close→NEW preserve Execute, exact same-ID
retry zero events, full source/settings/graph, full6×4/1950 и default materialized
context. Independent v2 audit/36 non-noop negatives каждого и cleanup приняты.
Done не обещает fresh output; explicit=false/internal=null. Эти trials используют
existing saved nodes, новый generic Done покрыт source tests; product registration,
review/candidate/CLI остаются открыты. [Границы и hashes](checkpoint.md#текущее-состояние),
[design](configuration-lifecycle-design.md). Failed444 и verified recovery не
превращены в PASS.

Public C run05 на `97098322a1` подтвердил все13 phases, две owned completed
Execute, полные native mappings и owned Views/full typed UI6×4. Независимый
output-only audit подтвердил business oracle1950 и graph preservation.
Исходный run целиком не принят: operator schema требовала отсутствующий native
input `excluded`; original CLEANUP_UNCONFIRMED сохранён, own recovery verified.
Контракт исправлен в `e615f4df7f`; `ed56268a6d` подключил owner-bound Save после
public Code и независимого source-read. Fresh headed Code → Save прошёл
полный независимый audit и ordinary cleanup3/3; independent cold reader
подтвердил source/settings/fresh Execute/read6×4 и cleanup3/3. Fixed C принят
в isolated runtime. D05/source `418abc95c0` прошёл полный independent audit
public declared6×4/metadata/DefaultUsageType/Save и cleanup3/3; собственный
independent cold подтвердил source/settings/new Execute/all6×4 cells и
cleanup3/3. Fixed D принят на том же isolated уровне; E/F и aggregate
gates открыты; evidence/hashes и следующий шаг — в текущей части checkpoint.

E/J26 Code422/Declared423 на3b59423f1a приняты2/2: actual public apply,8new/
existing parameter preflight refusals без editor/Execute, отдельный source-bound
output reread,3distinct owned Execute, оба full typed6×4/user-v1, same-ID retry
без эффекта и final full source. v3 independent audit/negative14 каждого и
PackageClose/logout/browser/process absence подтверждены. Source/configuration/
retained physical mapping binding и actual source/settings/policy до/после
dispatch ACK проверены на этих paths. Saved unsupported source/drift/closed
policy refusal/unknown cleanup — direct tests, не live injection. Sandbox/
full engine grammar/candidate/CLI не заявлены; exact hashes в checkpoint,
fixed J23 long source принят ниже; остаток natural diagnostics/Done refusal/model resistance/E/F.

E/J23 fixed long-source persistence принят: public new Code writer424/Save на
060a и независимый path-only cold428 на6531 (actual exit0) подтвердили exact
32768bytes/1024LF/source SHA, native settings,1fresh cold Execute/full6×4 и
cleanup/process absence. v6/v7 independent audits/negative16 each;24 cold source
chunks delivered после Close. Source revisions разделены, writer не повторён;
failed425 сохранён и exact recovery завершён. Native LGP bytes/candidate/CLI/
aggregate Gates остаются открытыми; hashes и pre-body redraw fix — в checkpoint.

E/J19 technical-name freshness Code441/declared442 принят2/2 на9bc52b9468:
default materialized-only refusal/две port Closes → NEW explicit configured-output
context/old source/current CustomerNow → correction из public Name → два corrected
completed Execute/full6×4/1950 → final default materialized context. Pending output
имеет source_pending/reciprocity=false; configured targets не приписаны выполнению.
Exact new/baseline retries без events, manual label/autosync=false, graph и полная
уборка/process absence подтверждены. Full client3419+10SKIP/operator18502PASS;
v7 independent audits/119 negatives каждого. Code re-audit strengthened post-live
после failed v5 negative checker, declared v7 pre-pinned. Actual model resistance,
product handler/candidate/CLI и aggregate Gates остаются открытыми; SHA в checkpoint.

E/J25 read-only native details inventory431 на1a754aa192 принят independent v4
audit/negative20/20/actualexit0/cleanup/process absence. Fresh Code Next
SyntaxError → owned error modal/OK/discard → retained source/settings/graph →
NEW repair/two fresh Execute/full6×4 проверены. Actual button namespace —
`DetailPanel;btnDetais` внутри exact native ErrorMsg modal, panel/text hidden;
это не expansion или insufficient-primary/Done failure proof. Import429 прошёл
Next/Done и отказал before Execute; original failure сохранён, exact own idle
package/session закрыты отдельно. Owned details expansion432/22f2cffa89 принят:
один native toggle,202UTF8bytes без truncation, public/user-v1 delivery,
SyntaxError/(:17:26), source/settings/graph retained, NEW repair/2fresh Execute/
full6×4. v2 independent audit/negative25/25/actualexit0/cleanup/process absence.
Default policy и hidden Done покрыты direct tests, live — fixed internal
required-details; natural insufficient-primary/Done refusal не доказаны.
Далее remaining natural diagnostics и F; §12
[native error design](native-error-attribution-design.md);
J25/candidate/CLI/Gates остаются открытыми. Точные SHA в checkpoint.

E/J12/J25 source/local milestone `010dca575d`: runtime распознаёт свежий
owned Code Next refusal, читает native error dialog, закрывает его OK и
разрешает один discard своего draft. Existing handler независимо перечитывает
полный committed source/settings/schema и complete graph перед typed FAILED;
диагностика доставляется через bounded redacted user-v1. Full client3094PASS/
10SKIP, operator18192PASS. Первый public native-error live отказал после btnError:
plain Ext modal mask ошибочно считалась pending; original failed evidence
сохранён, свой пакет/сеанс закрыт через headed dispatcher. Source-backed fix
`cf78f5b61a` допускает только native ZIndexManager mask exact error dialog;
foreign masks/owner/editor/source/gesture/ACK guards сохранены. Full client
3106PASS/10SKIP, operator18201PASS. Fresh Code public native SyntaxError17:26 /
typed FAILED/discard/independent committed baseline и NEW same-node repair /
2 fresh Execute/full6×4 прошли independent audit/cleanup, auditor negatives57/57.
Declared отдельный live также PASS: native SyntaxError16:26, independent retained
source/native settings/schema/graph, NEW same-node repair/2 fresh Execute/full6×4,
both audits/negative57/57 и cleanup. Source fix подтверждён этими fixed paths;
Done refusal/technical details/public throw/Stop/recovery и прочий J/F остаток
сохраняются. Точные hashes — в checkpoint.

| Gate | Непосредственно наблюдено | Решение / точный остаток 0B и следующий тест | Реализация / приёмка (фазы 1–6) |
| --- | --- | --- | --- |
| G1 — узел и редактор | Собственный JS GUID, иконка `bg-vendor-icon-javascript`. Для несоединённого узла fresh headed проход подтвердил страницы `TuneDataSourceInputPortWizard` index0 → `JavaScriptColumnsWizard` index1 → `JavaScriptCodeWizard` index2 → `DoneWizard` index4 с условно пропущенным index3. При уже подключённом input0 первая страница пропускается. CodeMirror 4.11.1, `mode=javascript`, `readOnly=false`, отступ 4, `smartIndent/electricChars=true`; код прочитан целиком и восстановлен после G4 probe. Собственный code controller держит `FEngine`/`FModuleSystem`: native proxy одного сеанса, но разных remote objects и interfaces. Два сохранённых `.lgp` 7.4.2 содержат JS `VendorGuid=28865f89-eea0-4143-b155-291791324a4b` и сериализованный `TBGJavaScriptEngine`.  Current8acf UI Code414/Declared415: native own GUID/controller/DOM/cache и source/settings preservation подтверждены2/2;15 Columns/9 Code controls, indices0→1/four indicators. | Current existing connected input0 identity question разрешён явным bounded contract на7.4.2/Linux: prepared package/workflow/native GUID + fresh icon + retained own Code controller/DOM + cached engine/module proxy witness. Runtime FullType остаётся null/false; icon/XML не подменяют его. В observed visible inventory assistant/engine selector не обнаружены, helper/switch не вызваны. Unopened menus/другие conditional routes/global absence и engine conformance не заявлены; candidate/CLI — F. | Owned navigation/focus/foreign UI во всех поддержанных путях new/existing; J22 по наблюдению, без вызова помощника. Ещё не покрытые маршруты проверять при их реализации. |
| G2 — моменты исполнения | В обоих режимах `code`/`declared` переходы `Next` и `Done` наблюдены. `Preview` и отдельный `Execute` положительно подтвердили исполнение собственными sentinel/child evidence. | Принято консервативное решение: Next/Done потенциально эффектны, каждый жест one-shot с ACK/receipt; отсутствие sentinel не является отрицательным proof. Done не обещает свежий output. Порядок materialization зависит от G3; probes только ради доказательства отсутствия скрытого исполнения не требуются. | Сначала согласовать JS-specific finish с общим apply: неизвестный internal Verify не превращать в execution_started=false. Журнал/operation/deadline и runtime settlement Next/Done; lost replies, bounded Stop/cancel, диагностика и независимый Execute/read. Возврат клика не равен подтверждённому переходу. |
| G3 — схема и связи | Оба schema mode дали полный результат 6×2. Ручной output mapping с `autosync=false` сохранился; при несовместимой смене исходного поля новый Execute вернул собственную ошибку о пропавшем `PhaseMarker`, связь не переназначилась молча. Пять отдельных двухколоночных проб наблюдали фактические имена/метки до и после записи. На пустой declared-схеме отдельно наблюдены native списки `Вид данных` и `Назначение`; последний связан с `DefaultUsageType`. Собственный picker назначения открывался одним жестом: 7/7 native records соответствовали 7/7 видимым options, включая `4 — Выходное`; список закрыт до Cancel. В отдельном проходе выбор `Выходное` сменил cached value с 0 на 4 и автоматически свернул picker до Cancel. Фиксированный Apply подтвердил в native grid `DefaultUsageType=4` при отдельном `UsageType=0`. Отдельная writer/cold/bytes пара с первой колонкой `ObservedID` типа «Целый» подтвердила `DefaultUsageType=4` после двух Save и нового открытия; XML пакета содержит `DefaultUsageType="utPredicted"`. | C0 live02/source `f2d02cafad` подтвердил empty → materialized4 cached source/target, reciprocal IDs и schema bound physical output0 Table после двух собственных Execute; business6×4 и cleanup3/3 независимо проверены. G3 live01/source `1965b71edd` подтвердил actual GetColumn index/name/display_name/data_type before/after во всех6 строках → complete source/reciprocal targets → bound physical output0 schema пяти полей; отдельный business oracle6×4 и cleanup3/3 независимо PASS. `bridge_verified=true` только у этого fixed code/ASCII case; native bytes=false/gates_closed=[]. Открыто: полный public lifecycle и неподтверждённые name/type/declared случаи. | New/existing, declared/code, смена схемы, manual/required/autosync и сохранность соседнего графа. Фиксированный declared usage не доказывает все типы/назначения. |
| G4 — точность кода | `keyboard.insertText` на реальном CodeMirror передал 849 байт/8 строк и граничные 32768 байт/1024 строки с полным readback; `keyboard.type` изменил контрольный текст и отклонён. Отдельный source97 дважды выполнил принадлежащий узлу полный open/read/Close без нового явного Execute/Done. В G7 последняя редакция прочитана после холодного открытия. Публичный host `dock_node_read kind:source` (`0c513c445a`) проверен headed full/user-v1; managed write/discard (`1e0da9265a`) и Code Next/Done (`7b8e19bee0`) завершились точным source-read. MCP bridge `d17723e59c` проверен с подставленным browser adapter. | Осуществимость принята: insertText + полный readback, UTF-8/LF digest, immutable receipt и отказ при изменении текста redactor. Базовый публичный source-read уже есть; исследовать заново не нужно. Отсутствие явного Execute не обещает отсутствия внутренних эффектов UI. | Public configure/write/read; empty/limits/chunks/Unicode/redaction, повторы после затронувшего изменения, candidate/CLI delivery и cold fidelity. |
| G5 — типы и доступ | Индексированная discovery-матрица имеет наблюдения для всех 30/30 закреплённых snippets; отдельные native/typed пробы показали scalar, NULL/empty/undefined, safe/unsafe int64, Date, именованный доступ и пустой output. | Required primitives текущего knowledge1.0 и sales business сопоставлены с actual public proofs в engine-profile.required_runtime_subset: два exact examples Code401/declared402 наbc649/full6×2/user-v1/source, audit/negative32/32 каждый/cleanup. Дополнительные свойства вне subset остаются отдельными observations. Для native/named и D/J24 отделить семантический вопрос, требующий G3 bridge, от непроверенной матрицы реализации. Выход 0B — решение об осуществимости обязательного API/точности, не прохождение всех cases; 30/30 observations его не заменяют. Ранний 6×4 уточняет арифметику/строки/input mappings. | Оставшиеся native/named и D/J24 cases, затем те же typed свойства через handler и независимый oracle; полный J06–J08/J20/J24. Native precision не заменять округлённым preview или 30/30 observations. |
| G6 — ошибки и восстановление | Private run08; public finite Stop/repair fresh393 на `69c1f3d60c`; public local read cancel/SAME-ID continuation fresh394 на `56f8df0250`: те же root/group/child records, один Raw Execute, native cancelled13,976s/NEW repair6×4, audit/negative87/87 и cleanup/process absence. Public Code Next SyntaxError и explicit sync throw/NEW repair обоих modes также приняты; hashes в checkpoint. | Next/Done потенциально эффектны; неизвестные gestures не повторять. Конечный цикл ≤60s, server Stop — только own native terminal; JS resume — только proved read-only pause и те же native records под исходным deadline. Public caller apply reply loss/retained backend Stop/settlement/inspect/NEW repair6×4 на 90c3bdd7c6 принят, audit/negative88/88 и cleanup. | Полный G6/CLI не закрыт. Public caller reply loss принят в fresh398; первоначальный failed395 и отдельная recovery сохранены. Fixed J09 Code399/declared400 на052909/238 addressed+18270 full принят2/2: source Required=true/target Required=false, manual label/autosync false, public mapping refusal/source edit/full6×4, audit v2/negative38/38 каждый/cleanup. Следующий — J19 current context/inert labels/comments. Потерянный browser gesture receipt остаётся fail-closed. Owned details expansion432 принят в fixed required scope; natural insufficient-primary/Done refusal и прочие recovery cases открыты. |
| G7 — сохранение | Для `code` и `declared` выполнены отдельные writer/cold пары: последнее S2-состояние открыто в новом профиле, source/settings/schema прочитаны без передачи кода в reader, новый Execute дал полный результат 6×2. После каждого из двух Save native `IsPackageModified=false`. Дополнительный read-only audit скачал точные `.lgp` обоих режимов через штатный `FileDownloader`: ZIP/CRC, GUID узла, decoded `Engine.Code`, mode и объявленные колонки сверены с writer и cold reader. Отдельный фиксированный `usage`-вариант declared-схемы прошёл тот же writer/cold/bytes цикл; первая колонка сохранила `DefaultUsageType=4` в UI, новом сеансе и XML. Все три private byte audits имеют `package_bytes_verified=true` и `dirty_state_verified=true`; девять процессов подтвердили package close/logout/browser close. | Осуществимость обоих режимов принята по private writer/cold/bytes и dirty-state; повторять эти же пакеты ради 0B не нужно. Доказательство ограничено фиксированными случаями 6×2. | Save/cold на public handler с результатом 6×4 в каждом режиме, затем candidate/CLI. `public_handler_verified=false`; частные proofs не равны принятию G7. |

Наблюдения G1 и G4 подробно записаны в [checkpoint](checkpoint.md) (operator15/16,
source97). Для G2/G3 авторитетная сводка — [переходы и эффекты](execution-effects.md),
для имён — [schema telemetry](schema-telemetry-observations.md) и
[D witness audit](native-output-schema-witness-design.md), для G5/J20 —
[engine profile](engine-profile.json), для G7 — [persistence design](persistence-design.md)
и подтверждённые writer/cold записи в checkpoint. Документы с формулировкой
«дизайн» не превращаются в живое доказательство. Неподтверждённый `FullType`,
кодовую source→physical связь или отсутствие эффекта `Next`/`Done`
нельзя восстанавливать из названия узла, браузерной ОС или предполагаемого API.

В headed profile214/source `3a50a79a5c` пустой declared editor показал
`cbxDataKind`: 0 «Неопределенное», 1 «Непрерывный», 2 «Дискретный»; для новой
строковой колонки выбран 2, а само поле выключено. `cbxUsageType` показал
0 «Не задано», 3 «Активное», 4 «Выходное», 6 «Группа», 7 «Показатель»,
8 «Транзакция», 9 «Элемент»; выбран 0. В сохранённом frontend Loginom
7.4.2 `CodeColumnsWizard` показывает `colDefaultUsageType`, а
`EditColumnDefForm.ApplyUsageType` пишет `DefaultUsageType` и использует
`fpDefaultUsageType`. Следовательно, будущий публичный параметр назначения
столбца должен проверяться по `DefaultUsageType`, а не по похожему полю
`UsageType`. Эти варианты наблюдены только для конкретного пустого declared
editor; доступность вариантов для других типов отдельно не проверена. После
`Cancel` локальная коллекция пуста и чиста, но native `totalCount` оставался
равным 1. Оператор принял только эту точную комбинацию квитанции Cancel и
диагностики store; Save и Execute не вызывались. SHA и cleanup — в checkpoint.
Profile216 подтвердил для `cbxUsageType` единственный собственный видимый
trigger `EditColumnDefForm;cbxUsageType;trg_picker` (`rendered=true`,
`repeatClick=false`, `disabled=false`). В отдельных headed попытках 217–219
предусловие открытия выявило ленивое создание DOM picker; все отказали до
клика и закрылись штатно. Source `81179bd1e5` допустил только эту наблюдённую
форму связи поля и store без DOM перед кликом. Profile220 подтвердил один
`usage-picker-open`, все семь собственных видимых вариантов и закрытие списка
до `Cancel` с нулём локальных записей и cleanup 3/3. В profile221 один
`usage-option-select` сменил native cached value 0 → 4; picker закрылся
автоматически, `Cancel` оставил ноль локальных записей, cleanup 3/3. В отдельном profile222 создана колонка `UsageValue` типа «Целый»; после
одного Apply собственная запись grid содержала `DefaultUsageType=4`, а
`UsageType=0`. Там Save и Execute не вызывались. В отдельном `usage`-варианте
двухколоночной declared-схемы (profiles 223–225) writer дважды сохранил пакет,
новый процесс прочитал `DefaultUsageType=4` и выполнил свежий Execute, а
независимый byte-auditor подтвердил `DefaultUsageType="utPredicted"` в сохранённом
`Unit.xml`. Точные SHA и граница доказательства — в [checkpoint](checkpoint.md).

Ограниченный B public configure existing подтверждён в испытательном runtime:
headed `public-node-apply-03`, независимый public source-read, сохранённые
settings/input mapping/связи и cleanup 3/3. `configured_only` относится к
output mapping evidence; публичный Done вернул `output.status=not_refreshed`,
`execution.status=not_requested` и сохранил неизвестность внутренних эффектов
как `execution_started=null`. Точные SHA и границы — в [checkpoint](checkpoint.md).
Ранние private P1 code/base и declared/base 6×4 прошли: полные typed UI
input/output, независимый unchanged oracle, отдельные owned Execute и cleanup
3/3. Это не native byte или public handler evidence. Source `ba46d2ecda`,
точные report/journal/receipt SHA и ограничения — в [checkpoint](checkpoint.md).
Code changed/reordered также прошли с тем же source SHA: полный pinned input,
fresh owned Execute и unchanged independent oracle, cleanup 3/3.
Fixed public C/D writer/Save/independent cold уже приняты в checkpoint.
На source `467da5ab9a` fixed isolated public existing comment edit/Execute/read
для code и declared отдельно прошёл independent audit: full native settings,
input5/output4 mappings/graph, fresh6×4, public source-read и cleanup3/3/process
absence. На `e1fd122320` отдельно приняты все4 public existing freshness
варианта Code/declared × changed/reordered: полный input6×5/output6×4,
сохранённые GUID/settings/graph, новые executions и cleanup независимо проверены.
Это не закрывает всю матрицу schema edits или product candidate/CLI.
На `bccc8a0a08` отдельно приняты public Code scalar output5/5, named access
и empty output: independent typed audits и cleanup, без native bytes/candidate/CLI.
Fixed Code one-row output и empty input также приняты на `2eef052e7a`/
`64221b01c8`. На `d4898cac03` отдельно приняты все пять fixed declared scalar outputs
(String NULL/empty, Boolean, real, safe integer, civil Date) с native metadata/
source/full typed audits и cleanup. Следующий результат E —
public source fidelity/schema refusals и точный остаток E/J/F.
Public native real input bytes/identity-copy Code/declared2/2 приняты на
`a679a63595`; native Boolean2/2 также принят на `14965ef148`, independent
audits/cleanup; native String2/2 принят на `800381592a` с тем же уровнем
evidence, включая NULL/empty/Unicode/LF. Native safe-int642/2 принят на
`0be6a698c1` с input bytes/exact decimal strings/audits/cleanup.
Native civil Date2/2 принят на `7d43cea036`: input bytes/owned civil attestation
и полный identity-copy output с milliseconds, без UTC/epoch claims.
Public outside-safe2/2 characterized на `81b4bfef74`: точный native input,
9007199254740993→9007199254740992 в обоих modes; общей гарантии int64 нет.
Public native cardinality4/4 на `3bfbd9968b` принят: whole native input baseline,
ordered typed keep2/odd/duplicate Code и canonical declared-empty с полной
schema/cleanup; auditor77/77 refusals. Native output bytes не проверены. Fixed declared named access/
output0/1/N/empty input тоже приняты на `d4898cac03` (9/9 runs, independent audit
и cleanup); P1 Stop/cancel принят
ранее и без затрагивающего изменения не повторяется. Реализация продолжается;
наличие этого кода не закрывает неизвестные G1/G3/G5/G6, а отсутствие CLI не
блокирует выход 0B. `ready_for_development` требует решений по точным вопросам
третьей колонки; окончательное закрытие gates — по четвёртой.

В каждом новом browser-прогоне нужен свежий профиль, один владелец, обычный
headed-режим по последнему указанию пользователя, подтверждённое закрытие
именно своего пакета, logout и browser close. Правила неизвестного эффекта и
памяти сохраняются; новые gates и повторный bootstrap не вводятся.

### E: public source fidelity/empty — 2026-09-30

Frozen child `88ddfc958e`: public existing Code32KiB/1024lines/8chunks сохранил
Unicode/emoji/LF/URL/quotes/backslash/tabs/trailing spaces и business6×4;
declared-empty сохранил4-column native schema при0rows. Оба actual exit0/OBSERVED,
independent audit/2 fresh Execute/settings/mappings/graph/Views/cleanup/process
absence. Source-read session original deadline/operation ID, whole digest и
16KiB response bounds проверены; auditor25+23 mutations refused. Local handler
cap+1/line+1/module/columns и driver redaction отказали до browser effects.
No Save/native output bytes/candidate/CLI; mode-flip owned refusal — следующий
шаг J09. Полный JavaScript operator suite18120PASS; broader all-operator5 legacy
fault-wrapper failures не считать PASS. Точные SHA/profiles — checkpoint.

### E: public existing schema-mode refusal — 2026-09-30

`b17c5b7719`: explicit code↔declared requests2/2 independently refused via
public handler после owned full effective-source read/discard/native baseline
and durable proof ACK. FAILED/cleanup=true/pending=null; possible UI activity
effect сохранён. Source/native settings/default usage/Required/fullgraph
preserved, independent before/after source, no editor mutation/explicit Execute/
Save; package/logout/browser/process absence verified. Это отказ mode change,
не его поддержка. Runtime guards unknown owner/digest/Close/ACK/deadline/foreign
type остаются uncertain. Full client3014PASS10SKIP/operator JS18121PASS;
broader legacy fault-wrapper5FAIL открыт. Точные evidence/SHA — checkpoint.

### E: public native sync throw/NEW repair — 2026-09-30

На `5e55e53f8a` ordinary headed Code02 и Declared01 прошли fixed sync throw и
NEW same-node repair. Next/Done приняты; ошибка возникла при explicit
materialization Execute. Native failed JS child identity и Show Node доказаны,
публичный FAILED передал `Error: E_JS_SYNC_THROW` с native stack; position не
атрибутирована. После Done throw source остаётся applied; ремонт использует его
digest, без обещания rollback. Два fresh repair executions дали business6×4/1950;
source/settings/schema/complete graph и cleanup/process absence проверены.
Pre-live independent v5 audit PASS2/2, meaningful mutations47/47 refused в каждом.
Точные reports/receipts/hashes — в checkpoint. Это частичное закрытие G6/J12/J25;
live Done refusal/Stop/lost reply/same-ID/candidate/CLI открыты.

## Граница перед F review — 2026-10-01

General lifecycle-v5 существующих Code447/declared448 Done/Close и new standalone
Done Code449/declared450 принят2/2 каждый: ordinary headed/full source/settings/
exact-ID zero events/NEW preserve Execute/full6×4/1950/independent audit+negatives/
cleanup. J02 public full input6×5/whitespace/types/order подтверждён actual C/D
writer receipts; runtime/profile limits и редкие natural errors — в checkpoint.

Source product registry child161353dadef6 подключает общий handler/driver/knowledge
и bridge redactor без fixed trials; addressed65, client3442PASS+10SKIP, operator
18583PASS и provenance5045 actualexit0. Это source/direct boundary, не повышение
старых исторических rows до global PASS и не compiled candidate/CLI. Next —
один same-task Astra/medium review; current model gpt-6.1-sol/high, переключение
запрошено. Natural insufficient-primary/Done refusals not_observed, TestCafe not_run.
Normal CLI package shutdown source на49dcfa0d99: native Close/logout по last
confirmed own Save до browser closure; runtime30/Client25/Host13/actual CLI
preflight3/typechecks PASS. Fresh Loginom/native cleanup/candidate/model здесь
не проверены. [Checkpoint](checkpoint.md#фаза-4-штатный-cli-package-shutdown--2026-10-02).
Canonical accepted registry пока14, product branch не merged/released.
