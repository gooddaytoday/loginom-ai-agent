# Fixed K1/K2: предложение источников и независимых oracle

Статус: **design only, NOT_RUN**, 2026-09-28. Исполнение/реализация требуют
отдельного назначения root после текущего B live. Основание — актуальный ROOT
`/home/george/git/loginom-ai-agent/docs/node-development/nodes/programming-javascript/native-error-attribution-design.md`,
§5/§9; SHA256 `07a8edd2bfe648d5ef7a556998057e19e92d40f23e5278451ffb47edb3284830`.
Root plan G6/J25: SHA256 `376aef02cfe1fe8e7070c0eb482c570a49c7e6a01df44b212b7bc4104b32abc7`.
Наблюдённый HEAD `f30244f37d90a2f23e61bd07d95028babacda5f7` (source86).
Этот документ не меняет source86 pins, runtime, тесты, старые документы или B outcomes.

## 1. Выбор и актуальное основание

Рекомендуются новые закрытые IDs `K1-parse-v1` и `K2-sync-v1` с точным B prefix.
Старые `engine-native-parse-error`/`engine-sync-throw` не переименовываются и не
подменяются: их Result/String, Append/Set и IIFE форма отличается от B.
Переиспользование их без изменения проще, но не проверяет нужную source форму.
Третий вариант — source runner с произвольными snippets — не нужен: он расширяет
допуск и усложняет witness. Предлагается только конечный каталог фиксированных bytes.

Прочитаны сохранённые reports относительно
`C=/home/george/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu`:

| Report | SHA256 | Наблюдение |
| --- | --- | --- |
| `native-named-get-case-probe-03/report.json` | `660eff769c3024ba49a61f83fea166dcd12654a7ec94e325b77958f73ebb0e9c` | UNRESOLVED; полный raw120 code units; native child failed; `value` |
| `native-named-get-missing-probe-01/report.json` | `db9a850fb20b9a99c3c5fa575293a6c2a9c4543b194f850f7e1811a43763d7c1` | UNRESOLVED; полный raw122 code units; native child failed; `Missing` |

Оба raw текста начинаются с `Error: Столбец ... отсутствует во входной таблице №0`,
содержат `at Anonymous function (<main>:4:1)` и `at module (<main>:1:1)`;
source hashes совпадают с фиксированными B. Reports сохраняют
`native_error_complete=true`, `not_read_failed_execution`, input/upstream exact,
cleanup package/logout/browser=true, `rejection_attributed=false`.
Root отдельно сообщил audits8cells591refs и8cells608refs; здесь эти audits заново
не исполнялись. Текущий B-getcolumn-case не опрашивался и его исход не предполагается.

Два B уже обосновывают потребность в mapping: frame4:1 пригоден как наблюдение,
но его нельзя принять за проверенную source line4 на основании самого B.
K1/K2 нужны также для parse/sync доставки G6/J25 независимо от успеха этой ветки.

## 2. Байтовый контракт и общая форма

Все snippets ниже: UTF-8 без BOM, только ASCII, разделитель строк LF (`0A`),
ровно один конечный LF, без CR, tabs, trailing spaces и внешней обёртки.
Номера строк в пояснениях однобазовые и НЕ включаются в исходник. Кодовые fences
не входят в bytes. Финальный LF создаёт пустую завершающую editor line; это не
добавочный оператор и не основание исправлять native EOF position.

Первые три строки P побайтно равны B-get-case и всем B источникам:

```javascript
import {InputTable,OutputTable,DataType} from "builtIn/Data";
if (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error("JS_NAMED_INPUT_SHAPE");
OutputTable.AssignColumns([{Name:"Value",DisplayName:"Value",DataType:DataType.Integer}]);
```

P:253 bytes,3 LF; SHA256
`9ce636119d09e082caa29b44eea6a98748a2f5d8d62ca742d5a3bf8c3fcfb9be`.
Zero-based byte offsets начал строк1–4:0,62,162,253; длины строк P без LF:61,99,90.

- Import только `builtIn/Data`, ровно InputTable/OutputTable/DataType; никаких
  других modules, wrapper functions, catch/rethrow, async, eval или console.
- `schema_mode=code`; назначается существующий code-schema режим, не declared.
  Строка3 задаёт единственный Value/Value/Integer (`native_type=4`); это ожидаемая
  форма настройки, а не обещание OUTPUT при ошибке. Нет Append/Set и output oracle.
- Тот же immutable `integer-safe`:4×1, InputTable0, техническое/отображаемое имя
  Value/Value, Integer; значения NULL,−9007199254740991,0,9007199254740991.
  CSV55 bytes, SHA256 `86983c730cec045020a014b5bd365b2cf604c5f214774eb4a31b9344f6d0865d`.
  Проверяется прежним exact native reader до настройки; не округлённым preview.
- Один новый изолированный root-assigned profile/package/JS node на calibration
  attempt. Начальный source этого узла читается и сохраняется как есть, даже если
  кажется пустым. Соседний граф/upstream и связи фиксируются до мутации.

## 3. K1-parse-v1 — фиксированная синтаксическая ошибка

```javascript
import {InputTable,OutputTable,DataType} from "builtIn/Data";
if (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error("JS_NAMED_INPUT_SHAPE");
OutputTable.AssignColumns([{Name:"Value",DisplayName:"Value",DataType:DataType.Integer}]);
const result=(1 + );
```

274 bytes,4 LF; SHA256
`721161cd4f4c0de387cefeef03b2425fd20f5645c05bff724103e330acd1620f`.
Строка4 начинается с byte253, длина20 без LF. Намеренный дефект — отсутствующий
правый операнд `+` перед `)`; `+` находится в source column17, `)` — column19.
Это исходные координаты, **не заранее ожидаемые native line/column**.
Native parser может указать другой token/EOF; это сохраняется без подгонки.

Независимый oracle состоит из двух частей:

1. До запуска root восстанавливает bytes и подтверждает один намеренный grammar
   defect при неизменном P. Это статический source oracle, не Loginom execution.
2. В назначенном run требуется fresh owned diagnostic на точный draft/committed
   source в реально наблюдённой стадии. Parse classification принимается только
   при достаточном native diagnostic, а не по ID K1 или host SyntaxError. Exact
   английский/русский текст, класс и offset не заданы. Непонятный native diagnostic
   остаётся owned/unclassified с явным gap, а не искусственным SyntaxError.

Планируемая первая точка — wizard Next после exact source read-back; диагностический
отказ Next/Done завершает эту попытку после capture и owned draft cleanup. Done/Execute
не форсируются ради ещё одной ошибки. Если мастер действительно проходит до Done,
source commit подтверждён и нет нерешённой диагностики, допустим один explicit Execute
с fresh baseline. Тогда требуются native failed child и все execute witnesses ниже.
Если точный invalid source неожиданно проходит/выполняется, сохраняется честный иной
исход; запрещены второй вариант синтаксиса и повтор в той же попытке.

K1 может дать полноценную wizard parse delivery без execution ID. Это не native
child proof и не mapping `<main>`. Отказ мастера сам по себе также не доказывает,
что code-schema pipeline ничего не исполнял. Отсутствие generated schema/OUTPUT
при parse ошибке ожидаемо и не лечится настройкой declared mode.

## 4. K2-sync-v1 — controlled throw на source line4

```javascript
import {InputTable,OutputTable,DataType} from "builtIn/Data";
if (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error("JS_NAMED_INPUT_SHAPE");
OutputTable.AssignColumns([{Name:"Value",DisplayName:"Value",DataType:DataType.Integer}]);
throw new Error("JS_CAL_K2_SYNC_V1");
```

291 bytes,4 LF; SHA256
`3f7350f5f9e7cb30107fb314643ae844477a7b87610132036e995f556fe983c2`.
Строка4: byte253,37 bytes без LF; `throw` начинается в source column1.
Marker `JS_CAL_K2_SYNC_V1` встречается ровно один раз, в единственном создающем его
literal throw. Guard строки2 — отдельный producer другого marker; ошибка guard
или AssignColumns НЕ принимается за K2 controlled throw. После P throw безусловен;
нет функции, вызов которой можно не выполнить, catch/rethrow, getters или output.

Независимый oracle: exact source + единственный marker producer + fresh owned
native error **header/message**, содержащий этот marker как ошибку, а не только
цитату source/stack. Простого `raw.includes(marker)` недостаточно. Root отдельно
проверяет header boundary по фактически наблюдённому формату. Пока формат не доказан,
в отчёте допустимы raw marker observation и execution_only, но не controlled_throw.

Основная целевая стадия — один explicit Execute после owned Done seal. Обязателен
failed child с ModelNode/Show Node; group-only, toast или wizard sentinel его не
заменяют. Ошибка с другим marker/текстом, completed либо unowned failure — иной исход,
а не PASS и не повод менять source. Если marker впервые получен как wizard diagnostic,
попытка фиксирует этот domain и закрывается без принудительного Execute: это полезная
G6/J25 delivery, но intended explicit-sync case остаётся незакрытым.

Позиции K2 сохраняются отдельно от controlled throw proof. Полный текст без позиции
может подтвердить controlled throw через уникальный producer, но не line mapping.
Ожидаемая source line4 получается из bytes выше; native coordinate НЕ берётся из
будущего parser как собственный expected. Наблюдение `<main>:4:1`, если оно будет,
ещё не разрешает перенос mapping на native call или другие schema/import формы.

## 5. Стадии, witness, полнота и cleanup

Для каждой попытки использовать существующие journal/once/deadline/capability
границы. Лимит — **не более одного explicit Execute**; это не утверждение о числе
неявных исполнений Next/Done. Preview не назначается. Каждый Next/Done имеет свой
effect identity; неизвестный эффект не повторяется. Diagnostic-stage и execution
outcome хранятся раздельно, без синтетических execution IDs.

| Область | Обязательный witness и результат |
| --- | --- |
| До mutation | Закрытый calibration ID, source bytes/SHA, build7.4.2 и наблюдённая server OS; назначенный runtime freeze; package/workflow/node/port, prior source, graph/input baseline |
| Wizard | Exact owned CodeMirror draft + read-back до действия и после diagnostic; native wizard/model/page owner; свежие message IDs относительно before; stage next/done, dispatch/terminal/ambiguity; committed/draft status отдельно |
| Execute | Exact committed source/Done seal, fresh root/process baseline, одна reservation, новые group/record IDs; failed child bound to native ModelNode + verified Show Node; возврат к своему graph, source revalidation |
| Native error | Raw child.data.ErrorDetails до trim/slice, длина в JS UTF-16 code units, повторное равенство raw, ≤1000 и nonempty для semantic proof; совпадение trim с bounded receipt; group text не подменяет child |
| Input/upstream | Exact INPUT4 до попытки; после terminal failed свежий read исходного upstream4 со старым import execution owner, без re-execute; pending0, cookies/requests/releases/idle как в текущем failed route |
| Output | При failed не открывать/не читать: `not_read_failed_execution`, OUTPUT RPC0. Wizard branch — `not_read_wizard_diagnostic`; нельзя выдать её за failed-execution branch |
| Persist/cleanup | Capture immutable proof до уничтожения UI; exact journal ACK, fsync/rename/directory fsync и persisted read-back; принадлежащий попытке draft закрыт без подмены source, package closed/logout/browser closed явно проверены |

Wizard raw diagnostic не объявляется полным лишь по ограничению текущих
`messages<=64`/`text.length<=4096`: нужно подтвердить полноту underlying сообщения
и отсутствие усечения. Для Execute raw1000 допустим только если native value сам
имеет длину1000; receipt1000 не доказывает этого. >1000, неполный канал или redaction,
убравший discriminator, дают incomplete для attribution; J25 получает bounded text
с честными length/truncated/redacted/normalization flags. Лимиты не расширяются.

`error_code=NODE_EXECUTION_FAILED` остаётся кодом адаптера; class_observed — только
native class либо reviewed parsing header с provenance. Позиция: observed raw tokens,
absent при подтверждённо полном канале без позиции, unrecognized при незнакомом
формате, incomplete при недостаточной полноте. Не синтезировать column или frame
из source. `<preview>`, wizard и `<main>` не взаимозаменяемы.

Перед owned draft discard сохраняются diagnostic/source и устанавливается, был ли
commit. После Close проверяются исходный owner/graph/связи и prior committed source;
без этого cleanup unconfirmed. На execute branch committed calibration source
остаётся тем же до package cleanup; не восстанавливать его скрытой записью и не
запускать «исправленный» код. Если wizard не позволяет безопасно подтвердить draft
discard или upstream read, это конкретный incomplete outcome, не обход guard.
Timeout, transport uncertainty, failed ACK/persist или cleanup не превращаются в
PASS. Успешный run K1/K2 не закрывает recovery/lost-reply/Stop и model delivery всего
G6/J25: эти части отдельно проверяются по основному плану.

## 6. Условные K3/K4 и отрицательные K5 fixtures

Ниже — заранее определённые кандидаты, **не очередь запусков**. Текущие B failed
обосновывают проверку mapping, но допуск K3 зависит от пригодного Execute-format K2;
K4 — также от независимого принятия K2/K3. Если K2 только wizard/absent/unrecognized,
mapping ветка останавливается, а G6/J25 observations сохраняются.

- **K3-shift-v1:** P + один дополнительный LF +
  `  throw new Error("JS_CAL_K3_SYNC_SHIFT_V1");` + LF. Здесь ровно два ASCII пробела
  перед throw, source line5/column3, начало строки byte254, начало throw byte256.
  300 bytes,5 LF; SHA256 `02b7e36c08e2d1f18fe83e60ed145d00bef83746fbe14b1328b1b6ba91ab76b3`.
  Source oracle — перенос4→5, другой уникальный marker. Native column только raw;
  разность строк и отсутствие конкурирующих frames проверяются независимо.
  При расхождении не подбирать wrapper offset и не запускать новые сдвиги.
- **K4-native-caller-v1:** P + два дополнительных LF +
  `const result=InputTable.Get(4,"Value");` + LF. Source line6/column1, byte255;
  295 bytes,6 LF; SHA256 `debb9802f3a381e3569b7a7c8857038a3a165fafacfbbcb7a5b18ed3dd17541f`.
  Четыре строки INPUT независимо зафиксированы; index4 вне0..3. Это один заранее
  выбранный native-call stimulus, не утверждение, что Get обязан бросить. Если
  возвращает значение/undefined и execution completed — mapping не калиброван,
  OUTPUT не нужен и другой API/index не подбирается. При error проверять caller
  line6 и header отдельно от module/setup frames; не переносить JS throw stack
  автоматически. Даже успех K4 доказывает только проверенный caller frame domain,
  не универсальную семантику native Get или всех GetColumn/Columns/IsNull ошибок.
- **K5:** сейчас только recorded/synthetic negative fixtures настоящего будущего
  verifier: frame на setup2/3, result-check/getter5 вместо B R4, module1 вместо caller,
  два неоднозначных caller frames, чужой `<preview>`, другой source hash/build/schema,
  marker только в цитате source, trimmed/truncated diagnostic, stale child/ACK.
  Синтетическая мутация явно помечается test fixture, не Loginom evidence. Ожидается
  refusal attribution при сохранении доступной raw диагностики. Live K5 и его source
  сейчас не назначены: нужен отдельно установленный gap нового getter/frame domain
  после K2–K4 и отдельный exact source review. Текущие два B Get такого gap не доказали.

Максимум по принятому design —5 live calibration attempts суммарно K1–K5, не5
на API/форму. Каждый требует отдельного root назначения. При неподтверждённой ветке
оставшиеся slots не расходуются автоматически. B sources/reports не заменяются;
даже успешные K2/K3/K4 не меняют старый `rejection_attributed=false` без отдельного
auditor/verifier review. Line-only proof ограничен exact expression statement;
он не доказывает, что именно внутренний native метод, а не receiver/property access,
отверг имя, и не формулирует общего правила регистра.

## 7. Минимальный будущий путь реализации

После отдельного назначения root, без новой архитектуры:

1. Добавить закрытый calibration export/lookup рядом с существующими private
   engine/execution probes, с literal bytes/hashes из §3/4. Старые probe/B catalogs
   неизменны; caller source запрещён. K3/K4 до отдельного допуска не активировать.
2. В существующем `javascript-live.mjs` переиспользовать native integer input,
   owned wizard source writer/read-back, stage admission/once/журнал и cleanup.
   Нужна отдельная конечная calibration branch: сейчас nativeRoundtrip немедленно
   отказывает при свежем wizard diagnostic, а discovery path не доказывает native
   bytes/raw completeness. Просто передать новый ID любому из них недостаточно.
   Branch сохраняет owned draft diagnostic, не ослабляя текущий B guard.
3. После реального Done seal использовать существующий executeNode и source86
   notification settlement, fresh process/failed-child proof. Raw witness/upstream
   из named-failure route переиспользовать через узкий закрытый calibration admission,
   с отдельным `calibration_id`, а не фиктивным `named_case_id=B-*`. Никаких generic
   callbacks, свободного источника или расширения completed-output verifier.
4. Pure diagnostics verifier отделяет delivery/completeness/controlled marker от
   optional mapping. Сначала сохраняет фактический формат и conservative outcome;
   parser/coordinate mapping допускается лишь по independently reviewed evidence.
   Не использовать существующий discovery `includes(marker)` как semantic proof.
5. Проверить настоящий serialized witness/pure verifier на existing fixtures:
   wrong source/owner/stage, group-only, raw1000/>1000, fresh wizard messages, no
   OUTPUT, unknown effect/no replay, cleanup/ACK. Root отдельно сверяет hashes и
   строки без проверяемого parser, назначает каждый live, проверяет raw witness и
   delivery. Новый browser runner не создаётся; публичный editor/API не расширяется.

Это план повторного использования существующих границ, не разрешение править
source86 во время B run. Исполнение snippets, runtime/unit tests, browser, CLI,
коммит и messaging в этом ходе не выполнялись. Проверены только bytes/hashes,
source numbering, P equality, сохранённые reports и неизменность прежних файлов.
Создан ровно этот новый документ; native K1/K2 outcomes пока отсутствуют.

## 8. Решение root по проверке предложения

Принято как точное предложение источников K1/K2; это **не live evidence** и не
разрешение менять frozen runtime во время оставшихся B runs. Root независимо
восстановил P/K1–K4 bytes, SHA, LF/ASCII, равенство B prefix, ссылки на hashes
плана/design и длины двух полных native errors. Host Node --check отклонил K1 и
принял K2–K4; это лишь проверка host syntax, без импорта/исполнения Loginom.
Private receipts: calibration-proposal-root-byte-check.json и
calibration-proposal-root-host-syntax.json.

K1/K2 могут быть назначены к реализации отдельно после B live; K3/K4 сохраняют
условные допуски §6, K5 остаётся отрицательными fixtures. Общий лимит5 не расширен.
Координаты из B не используются как собственный calibration oracle. Фиксированные
GetColumn cases уже отдельно вернули undefined; эти результаты не дают mapping
для Get failures и не разрешают расширять вывод на все lookup API.

ОС сервера пока **не установлена**. Ubuntu относится к оператору; поле server_os
не заполнять догадкой. Это остаётся открытым предусловием принятия engine profile
и G6/J25 по основному плану, а не выполненной проверкой этого документа.
Проверка source/data/owner/error completeness/cleanup и фактического диагностического
формата требуется в каждом назначенном live; синтаксический host oracle её не заменяет.


## 9. Допуск реализации K3 после наблюдения K2

Root независимо проверил K2/source89/profile97: exact291bytes/SHA, собственный
fresh failed execution и полный ErrorDetails88units. Наблюдаются два разных
кадра: caller `Anonymous function (<main>:4:1)` и module `<main>:1:1`.
Marker встречается один раз в заранее принятом source; перед throw находятся
только известные import/input-shape/schema statements. Это пригодный формат для
одного заранее предложенного K3 (§6), но ещё не доказательство source mapping.
Потребность — четыре прежних B Get/IsNull failed с неатрибутированным expression.

Разрешена реализация source90 с закрытым K3-shift-v1 из §6, без изменения P,
K1/K2/B и без иных snippets. Следующий live будет только после frozen handoff и
независимого source/test допуска. K4 остаётся условным до результата K3; live K5
не назначен. Использованы3 из общего maximum5 attempts (failed95,K2/97,K1/98),
так что K3 расходует четвёртую, возможный K4 — пятую. Повторных сдвигов, иных
API/index и автоматических повторов нет. Непригодный формат K3 завершает ветку.

K1/source89/profile98 дал полный retained wizard exception tree с сообщением
`SyntaxError: Syntax error at code (:4:19)`; native class — EBGException, server
stack origin не установлен. Это отдельный wizard domain; он не калибрует caller
frames Execute. Cleanup3 подтверждён, committed-source restoration/fresh upstream
после discard не доказаны; G6/J25 остаются открытыми. Исходные reports неизменны.


## 10. Допуск реализации K4 после независимой проверки K3

K3/source90/profile99, original61076 terminal exit1: DIAGNOSTIC_OBSERVED;
полный owned ErrorDetails содержит `Error: JS_CAL_K3_SYNC_SHIFT_V1`, caller
`Anonymous function (<main>:5:3)`, module `<main>:1:1`. Root независимо проверил
exact300bytes/SHA,8native cells,598journal references,source/node/process и cleanup3.
До live был зафиксирован source oracle line5/byte256; native column заранее не
назначался. K2 caller4 и K3 caller5 соответствуют source lines4→5. Это пригодный
line-only результат для этих fixed throw probes, не universal/column/native mapping.

Разрешена реализация source91 только K4-native-caller-v1 из §6: exact P + два LF +
`const result=InputTable.Get(4,"Value");` + LF,295bytes/6LF,
SHAdebb9802f3a381e3569b7a7c8857038a3a165fafacfbbcb7a5b18ed3dd17541f.
Данный вызов находится на source line6; INPUT имеет4строки. Не предполагается,
что Get обязан бросить. Completed/returned/undefined либо непригодный diagnostic
означает прекращение mapping ветки, без выбора другого API/index/сдвига.

После frozen handoff/root tests допускается отдельное назначение пятого и последнего
live calibration attempt. Четыре уже использованы (95,97,98,99). K5 live, шестая
попытка и автоматические retries не разрешены. K1/K2/K3/B sources и исходные reports
не меняются; runtime outcome остаётся observation-only. K4 не закрывает сам по себе
атрибуцию B: нужна отдельная проверка области применимости и negative verifier
fixtures. G6/J25, repair/rollback/model delivery и server OS остаются открытыми.


## 11. Итог K4 и завершение live-калибровок

K4/source91/profile100, original83246 terminalexit1: DIAGNOSTIC_OBSERVED;
полный native ErrorDetails: `Error: Номер строки 4 вне диапазона [0, 3]`,
`Anonymous function (<main>:6:1)`, `module (<main>:1:1)`. Source oracle line6
зафиксирован до live. Root проверил exact295bytes/SHA,1276pins,8native cells,
596journal references,owner/source/process и cleanup3; browser process отсутствует.
Report SHAc239e6939bb53f3fca6dc7314c3da50dd0f3fce7223759f26dea4e91e03ef516;
journal SHA55084fd4459fe7cf89de5ceee12eaaf01b499f21d9bfe2f75bafcc5c2e7d1c7b.

Наблюдения K2caller4/K3caller5/K4caller6 пригодны для отдельной реализации и review
закрытого line-only attribution verifier по native-error-attribution-design.md§7.
Это не изменение historical runtime outcome: mapping_status там unverified;
общая семантика Data API/чувствительность регистра/column mapping не доказаны.
K4 относится к выражению InputTable.Get(4,"Value"),не к любым методам/билдам/схемам.

Разрешён следующий source92: отдельный private pure verifier и offline sidecar
аудит сохранённых B failures. До признания результата он обязан связать exact
source/catalog/expression,full owned failed witness,исходный INPUT/fresh upstream,
cleanup,journal references и независимые K2/K3/K4 source/diagnostic proofs.
Профиль ограничить реально подтверждённым runtime/frontend/build/schema/source
форматом; отсутствующие сведения не заполнять предположениями. Установить явно,
достаточен ли observed caller domain для каждого Get/IsNull expression; при
неподтверждённой применимости оставить unresolved с конкретным reason.

Новое sidecar evidence отдельно от неизменных old reports; generic completed,
coercion и historical unattributed outcomes не переписывать. Negative fixtures:
setup/module/competing/preview frames,foreign source/environment/owner,отсутствующий
calibration proof,сдвиг/обрезка/очистка,stale ACK и поздний getter. Текст фразы сам
по себе не oracle. Root review final verifier/sidecars требуется до B completion.

Лимит5/5исчерпан. K5live,шестая проба,retry и alternative API/index/shift не назначены.
Следующая работа offline, без запуска Loginom. G6/J25,repair/rollback/model delivery,
C/D,engine profile и публичная CLI-приёмка остаются самостоятельными требованиями.
