# Локальная приёмка выбора узлов Loginom — промежуточный отчёт

Статус: приёмка не завершена. Новая пара203142-5bf175 статически проверена;
native prerequisites pending, новых model attempts0. Серия192418-c71363
остановлена после2baseline/0candidate: salesPASS, ABC group-target runtime blocker.
Independent paired/pins/native core подтверждены, model acceptance pending.
Full private native driver exit1 сохранён отдельно от подтверждённого core.

Исторически: Исходная серия `20261013T093809Z-f5d429`
остановлена после трёх baseline; её результаты сохранены отдельно. Пользователь
поручил самостоятельно устранять блокеры: дефект `imports.text.date_format`
исправлен по TDD в `263df9620`, 144 теста PASS. После проверки отсутствия
собственных Loginom-сессий адресно архивирован также guard monthly.
Серия `20261013T132356Z-0a3983` остановлена: два baseline неуспешны, candidate 0/25.
Обнаружен и исправлен второй общий runtime-блокер `c2c898aca5` (dataset output
socket в overflow), TDD/310 tests/independent review PASS. Следующая сопоставимая
серия `20261013T142936Z-072953`: завершены baseline 18/18, oracle/calculation 18;
ABC CLI exit 0, wrapper exit 2, evidence восстановлены offline; candidate 2/25 начаты: sales full PASS, ABC runtime-blocked без JS.
Обе сборки/pins и native overflow proof проверены.
Ни один старый провал
не переименован в успех и не включён в новую серию.

## Подготовка новой пары203142 после managed JS preview fix

Общий source `dd8d480706e4f2a391524f2dee05818bdd41e2cc`, version0.1.17/prod;
baseline source dirty только двумя exact old skill файлами, candidate clean.
Оба build/verify exit0, baseline verify выполнен до restore skill. Raw
attestation JSON сохранён без изменений. Manifest SHA baseline
`c04abca3e1f323ee742ed61ccd26ce4fea2c7ff8a45586aa1451312c17580331`, candidate
`77f51a21b0168f4b380fda930e61ef506238e28ba04371b1f9587b609a2e69d0`.
Immutable pins SHA baseline `9cb0c002fa64ed50c7a81a5da1b5309ac7935f919cc7f75e563b8330bea622e5`,
candidate `6f34460ba8d6e3b1b6251bbf944f767de141dfeae14a810a45842b8fbe5ad02c`.
Runtime revision `47b87152dba39d7449f9669e5ea7c4d1f38cfed89c919f67dc2c146af0086a14`,
288filescommon. Independent pair review SHA
`47f9f35b0577c9ba17be85f46f6fc39fdf518cca05b66c9708f1ce9fe7f4e953`:
5726CLI entries/4729resource entries обеих фаз, SHA/modes/symlinks/source tree
PASS; compiledCLI/runtime/deps equal, разница2skills+3metadata.
Pins review SHA `305a8573b5cc516cc485a1fb5a0241fc6f060b1b1ef9df8dc2b2ef5aa1b6454e`:
actual selectionAttempt/loadTasks43unique свободныхslots18+25, unchanged72+2
sources/model/seed/task/input/oracle/audit2654, oldOutcomesTransferred0.
Lock SHA `e6eedea28a4c6fba1e38fc66091951e3d56706a386314042199c6b8a967c2fc4`.
Native JS→Group/directJS→newSort, обе Join hiddenroles, actual catalog/schema
binding и model18+25 pending. current-run остаётся192418 до нового допуска.

Actual candidate describe probe203142 exit0:16raw replies/15standard schemas,
Host closeACK/exit0, explicitLogoutfalse(no package). Первый новый private Join
driver exit1 до создания первого import: initial empty-draftSave SUCCEEDED,
workflow_continuations:[], следующий shortworkflowId остался с navigationPackage1
и дал NOT_APPLIED/effectfalse/cleanuptrue, `Prepared workflow navigation changed`.
Это ошибка дополнительного privatefixture шага, не модельный слот/JSruntimefix.
Own emptypackage закрыт с actual package_closed/logged_outtrue/nodiscard и
transportACK/exit0/nosignal. Original result не меняется; его старое поле
explicitLogoutVerified:false не переписывается — actual cleanup receipt проверен
отдельно. Diagnosis SHA `4b39b1d9b0032f5ab3357e4be66435dd2250928cf9c1d31e971cc30c8db7495e`.
Отдельный минимальный Join core fixture сохранит Save после completed imports,
оба hiddenroles/fresh exact output/Save/cleanup; initial emptySave и standalone
stale postSave rereads из него исключаются. Сохранность входных значений
проверяется их проекциями в точном fresh Join output; standalone reread не заявляется.
Runtime/build/pins/43modelslots прежние, model acceptance ещёpending.

Первый privateJS downstream exit1 после successful import/JS/двухSave и
проверенного beforepackage(full JS Component/source/declared schema). Проверка
generic guard остановилась на `EXACT_DELIVERED_GRAPH_ROOT_REQUIRED`: actual
public roots page offset0/returned32/total92 имела next_cursor, но fixture искал
Graph root до чтения остальных страниц. Downstream/genericdeny/managedpreview
ещё не запускались. Actual ownpackageclose/logout/nodiscard и transportACK/exit0
подтверждены; исходный result SHA
`b274cbb2af43ece8237d21db31e2615ea548e2551ab0fb9d8d11f5bc7af40443` не меняется.
Independent stop review SHA
`3fea73a46586b2c9f661a8d375d93a4059018a4c301c077e1c52e6f4c574308f`:
21receipts/3runtime hashes/53sources/beforefullXML/exactrows unchanged.
Отдельный privateJS proof-2 исправляет только roots pagination на actual021
fixture (5Bun+1Python/typecheck0, independent5Bun+6protocol cases PASS).
Review SHA `0da1570936587e0504fd442c7b61ec1ee1971555c97b355111d6b226ab416efa`;
его live и mandatory JS→Group/directSort gates ещёpending, Product/pins unchanged.

Join core proof-2 завершёнexit0, independent live review SHA
`2bbc5532d6ae5ccdc859370c4d4205e4ec98cf528dcb5603024f908284809e21` PASS:
actualобеhiddenroles+nearestnative GUID/index/opening/time brackets, fresh rows
[[1,5,15],[1,10,15]], inputs projections/Save/cleanup/logout/ACKexit0 verified.
Result SHA `a257e643a899433c72cfe92fcb98613b057fdf6ab382be036fec8a5b4e068c1c`,
ownpackage `/user/JD31103263.lgp` readbackSHA
`ad460c7f4f42463ffb50feb708daec29f5caf0bc74f9d1f14f4741d88a627a45`:
14ZIPmembers/3nodes(2imports+Join)/2correctlinks/noJS. StandaloneInputReread=false.

PrivateJS proof-2 тожеexit1 до downstream: roots3pages(92records) и details2pages
(24records) полностью прочитаны, ownJSoutput0 unique/delivered/actions[].
Первый intentionallyforbidden genericclick вызвал общий IPCerror
LOGINOM_RUNTIME_FAILED; managed-entry247 скрывает текст. Первоначальная гипотеза
bridge366→uiAct→validateUiAction не учитывала user-profile tool filtering и
позднее опровергнута. Live точный validator message не наблюдался.
Independentstop review SHA
`e2cebed02404848c81f721a015196d2db575eb5a656133a3fa0f97505329c12a`:
53sources/25receipts/3journals unchanged; no downstream/managedpreview effects,
actualclose/logout/nodiscard/ACKexit0. Instrumentedproof-3 также exit1 до Group/
Sort; ownclose/logout/ACKexit0 подтверждены, исходные файлы сохранены.
Bridge185 удаляет dock_ui_action из user catalog,196 не добавляет его route,
210–212 отклоняет неизвестный tool с -32602 до uiAct. Private wrapper ожидал
-32603 и поэтому не мог подтвердить отрицательную проверку в этом профиле.
Privateproof-4 использует обычный managed-entry и actual list catalog без genericUI;
live JS port allowed_actions:[] плюс отдельный actual pure guard на live snapshot
проверяют ограничения разных слоёв. Это не live UI refusal receipt. Главные
Group/directSort идут штатными node calls; Product/runtime/pins unchanged.
JS3 independent stop review SHA
`f28a8ebf49d7964b4561d3537994224f458ca32711cceb1799a07d878959070d`:
actual24-tool catalog/route,25receipts/3journals/56source hashes сохранены,
888events без downstream/managedpreview; прежняя ошибка static review признана.

Privateproof-4 originalexit3, resultSHA
`e34ab9ed7051bc2bc0e6e2c9e3746e433c27dfadc66a407ff39e02e796b95798`:
raw019 Save SUCCEEDED; raw022 Group admitted, raw023 AMBIGUOUS с Managed preview
native port changed. Journal889 selectprepared/890 mouse.click ACK/891 failed
inspect;892rows, F3/open0, Groupnode=null, Sort0. ACK подтверждает возврат клика,
не успешную native selection. Originalcleanup BLOCKED/HostACKfalse exit1 сохранены.
Собственная user:90 initialization21:39:48.808Z/дваnativeGUID/exact packageSave
строгоbound; Root adminclosure+дваfreshabsence+logout21:44:42.271Z/MCPexit0 выполнены.
Writer отсутствует, профиль/history/storage не менялись. Конкретный compoundguard
predicate неизвестен. Privateproof-5 добавит только bounded tuple к error.message
в exact generated failing inspect через private transport seam; без изменения
guard/controlflow/runtime/pins. Это инструментированная диагностика, не gatePASS.
Independent stop review SHA
`56da0b1375992bc207c066b9dcc2351adc436ff1b5149f70673f775f761c8ca2`:
53sources/23raw/3journals/catalog/fullXML-before/exactJSrows проверены;
точный conjunct остаётся UNKNOWN, административное восстановление отдельно.
Independent recovery review SHA
`f81ff164799032b1315b28987754b2bb2e5006ee554f147660e6a84d7bd5a14d`:
ownuser90 closed21:44:11.150Z безreinit, ownadmin91 closed21:44:42.264Z;
other3inventory rows сохранены,30protectedraw/source+5runtime files unchanged,
PID189026 отсутствует/.writer absent. Исходныйcleanupfalse не повышается до PASS.

Instrumentedproof-5 root56624exit3, resultSHA
`e2c41540b0b6a644a66015cc3519b0401bca961c1450090b2faf81a3c4ea6406`:
actualraw023 содержит полный preview-tuple-v1 до усечённого stack. Native
type/subtype1/nativeIndex0/portIndex0, selectedcount1/s0Porttrue;
sameShape/Port/Data/Cell=true, sameElement=false, oldElementConnected=false,
currentElementConnected=true. Единственный сработавший conjunct — сохранённый
DOM portElement identity после native redraw. F3/Groupcreation/Sort отсутствуют,
originalcleanupfalse/HostACKfalse сохранены. SourceTDDfix в работе: повторно
подтверждать текущий own DOM после select и использовать его для F3, сохраняя
прочие guards. Privatecandidate proof перед пересборкой не является final gate.
Ownuser92/init21:58:53.562Z/nativeGUID bound, rootclosed/freshabsence2/adminlogout
22:03:20.891Z/MCP90801exit0; независимый postclosure review ещёpending.
Independent stop review SHA
`991cdcc922e53166edcb4fbb378f697a2b368461f0ec98f785abea18ce788a02`:
56sources/10testfixtures/23raw/4journals/895events сохранены; exact original/
rewritten outgoing code восстановлен offline из actualtask/transport/storage
binding и совпал с instrumentation record. Остальные compoundguard conditions
не сработали; конкретный DOM identity conjunct подтверждён.
Independent proof5 recovery review SHA
`2e649a27d3713d2db1941f9dd663bc805abf0fa1809808b4c618cc7ff9c4bacd`:
user92 closed22:03:06.753Z безreinit, admin93 closed22:03:20.811Z, UI login/MCP0
bound;37raw/56sourceClosure/4397immutableRuntime paths unchanged. Текущая
разрешённая sourceправка отдельно отмечена; originalcleanupfalse сохранён.
SourceDOMfix frozen helperSHA
`bf5dd67412b86f04c33ac03272b39509a2bcc5a56d3aa3000da6ad64b2116289`,
verificationSHA `17e58845dbce2eaf36b65d75947f11627ddb080b0cb475e30f49e4f3e9929022`:
два RED→GREEN/53focused/218relevantPASS/diff0. Изменены helper/test/actualtuple
fixture; source review/privateproof6/native результат/upstream/commit ещёpending.
Source review SHA `f2a80fb9c339df5afd4eb33e48398df363ea17cb39ef9bb26006344ea3e0006a`
Approved/independent53PASS. Privateproof6 root56504exit1, resultSHA
`d29c6a18ec51e907b334d1779f84869789aa11f8c802273a43192d7ac3ace36c`:
raw028 Group SUCCEEDED/freshschema2rows, raw029 Save SUCCEEDED. Total native real,
values17/21, decimal1.7E+01/2.1E+01, binary64/17_significant_digits/numbers_verified,
sample_complete/limitations[]; privateintegerreader rejected legitimate SUM type.
Sort не вызван. Actualcleanup/explicitLogout/HostACKexit0 verified, recovery не
требуется. Separateproof7 меняет по actual028 только exactrealcell assertion;
sourcebf5/immutablepair47/producerSortintegerchecks/expectedvalues остаются.
Independent stop review SHA
`d658d19c545a62ce9083699d99f6a8bf6d926e143afa41f5a6333ad5d40bf48a`:
actualGroup fullpreflight select/openF3/freshcompleteSchema/Close/graphrestore
прошёл, nativeGroupA17/B21 и Save подтверждены; integerreader mismatch воспроизведён
offline.1259events/5sourceoverride records/58sources/12fixtures/29receipts/
4journals/2cleanup preserved. Packageclosed/logout/nodiscard/HostACKexit0;
Sort/export/afterXML pending, originalexit1/nonacceptance остаётся.

Privateproof7 root14182exit3, resultSHA
`627a0fcfee003d653139b41858dadf9685ee0cd4dd44bd5042759bb59fbda61d`;
independent stop review SHA
`f7825c7e5056a816f46784547f09d8612d882f89caf8c0004cd3dde21f0e8d02`:
оба Group/directSort sourceoverride preflights PASS (F3/completefreshschema/
Close/graphrestore), Group A17/B21 и Sort B21/A11/A6, обаSave.10overlayrecords/
59sources/13fixtures/39raw/4journals/1685events preserved. First export-group
039 AMBIGUOUS input_mapping до execution. Actual input open и mapping2/2 verified,
Done enabledtrue, но input_port_context unobserved и finish_wizard отсутствует;
точный native predicate UNKNOWN. Диагноз5673994a…/publicschemaPASS.
Originalcleanup/logout/shutdownfalse/HostACKfalse exit1 preserved. Rootownuser95
closed/admin2freshabsence/logout22:36:14.799Z/MCP80355exit0; postreviewpending.
Root lastSave037 package readbackSHA
`218bb0b8c59fc77ab6d7de2dfaf6de485692cb032cc164a241b355e244239282`
подтвердил fullJScomponent/source/schema unchanged после обеих ветвей; CSV/final
exportgraph всё ещёpending. Source DOMfix полный upstream:3828tests/3818PASS/
0FAIL/10SKIP/exit0, pinnedNode24.19; verificationSHA
`98cdb115ff3acbf6e29fd83a238cc2213e77bcdfb3304cf99041fb703d120a43`.
Sourcefix completion не закрывает ordinary rebuilt native или model18+25 gate.
Independent recovery/component preservation review SHA
`cf1fbfc87dc0aa380d9eac2fc1b1bf8c9437e41bd6a3e75fb259f6ea001467a5`:
user95 closed22:36:03.790Z/admin96 closed22:36:14.791Z/noReinit/others preserved;
54raw/59source/4397runtime files unchanged. Existing saved-js.py independently
прочитал actual before/package.lgp и lastSave037 saved-after-sort.lgp; весь
normalized JS component/source/2columnschema равен beforeJSON. Это не CSV gate.
Proof8 готовится как минимальные Import→Group→Export, без JS/Sort: тот же Group
source/typed schema/labels/breadcrumb width, bounded readonly native navigation
tuple; product guard не менять до confirmed predicate.

## Историческая пара после Join fix — допуск серии

Run `20261013T192418Z-c71363` собран из общего source `05b645eec9`, версия0.1.17;
baseline source dirty только двумя прежними skill файлами, candidate clean.
`verify-cli-candidate` обоих exit0; baseline проверен до восстановления skill.
Compiled payload/runtime/resources, pins и closure проверяются независимо.
Baseline manifest SHA `4a8126f1f2ef47485695609de8a8aa919e3480f45a06e532a222abfe02acf99b`,
candidate SHA `f06ab58ff3e585c066ad1f903bc436602063d98298b18d02df2b83ff19d0ffcd`.
Pins SHA baseline `4207532acd2c0626c05187418f5022989736c81a0d07d0b1361a494a377dd80a`,
candidate `f23c6e0cb6ba5b060ec693900d37f7bf9f375fc2974ef7dda07fbe1d9d14b5d4`.
Обе skill версии, tasks/model/reviewSeed сохранены; новый denominator43слота,
старые18+2 исхода в него не включаются. Effective lock SHA
`c9863b1d0b146c4b918baedbca85c0061787636816cfb21e8e90639c6158ab07` закрепляет
финальный audit2654…; historical locks/frozen-models сохранены побайтно.

Model-free describe probe новой candidate завершился exit0:16 raw replies,
15 стандартных parameter_schema, Host closed ACK/exit0. Result SHA
`0c63b641f2ad2161171c9e13ce2e8ebff45fc825c4acf3011133bc0695d5c46e`.
Explicit Loginom logout этим no-package probe не подтверждён. Actual prepare
нового native proof и итоговая gap binding ещё pending. Probe reuse изменяет
только pinned SHA и путь historical parser-shape fixture:2 tests/4expects и
typecheck0, independent static review Approved. Новых model calls нет.

Первый build остановился до mkdtemp из-за отсутствующего собственного parent
каталога; original stderr/stdout сохранены `.missing-parent`. После mkdir build
успешен. Это operator build incident, не модельная попытка.
Independent pair/pins Approved: review SHA3a8996bf… и9f8b6a84… . Native
canonical core подтверждён независимо: обе реальные скрытые роли с same native
node/GUID/opening brackets, Join SUCCEEDED, exact2rows [1,5,15]/[1,10,15],
Save SUCCEEDED; Docker readback SHA6212e48d… содержит2imports/Join/2links/noJS.
Package cleanup реально package_closed/logged_out true, discardfalse;
transport closed ACK/exit0/nosignal. Review SHA
`0e622b9d3cea7ba935dbdaf6ad3857c42a95ea9874f2664c6ccff7d111d89422`.

Full private driver остаётся diagnostic-stopped/exit1: optional reread import0
вернул NOT_APPLIED/NODE_APPLY_STOPPED из-за retained workflow navigation Package1
после Save renameJD8179e022. Параметр source_operation_id валиден, effectfalse/
cleanuptrue; неизменность input после Join не подтверждена. Diagnosis SHA
`fbdc61b655cbbe866f23252aee3f26d84fe76eabee6bf32826a66d4bab15a588`.
Original result SHA
`f505d53c6008abc97ebcec214a899d5cc5c23b61c8115a05043b3030c89ccf8b` неизменён.
Это не весь driver PASS: обязательный plan/spec core аттестован отдельно.
Новый live не повторяется ради optional проверки; Product/pair/runtime не меняются.

Actual gap prerequisite complete: newprepare baee2503… и describe ae898537…,
разные Sessions/same immutable runtime/catalog/handlers;15cache keys пересчитаны
после skillRevision null→ff18… . Attestation SHA
`c485ce087dc6ff9495c9ca1caf7eda7731828c717ef6aa89761936be98ae58f6`.
Pending predecessor сохранён;1241probe/2837native files unchanged. Tags/calculation/
role review ещёpending; per-node limits не являются global/fixed151 proof.

`current-run.txt` теперь192418, series-admission SHA
`d42bccf0c4b94ec77813955e3586a886af7ed15ce8f348ab0689868dc0ff28c0`.
Модельная baseline начинается заново; historical18+2 не включены в новые слоты.

## Серия192418: baseline1/18

sales-by-category/1: CLI0/wrapper0, cleanuptrue, timeoutfalse,
Session `ses_ec930295affezmSkcSMYMMkfSI`, CLI337.121s (19:49:09.689–19:54:46.810Z).
Audit2654… complete: oracle/calculation/history/runtime/identity/graph/export PASS,
policy passed, failures[], JSnodes/calls/success0/0/0. Package SHA
`88282df240afb3a0515adaa3e7110713c98b4dbcd0bf7ae17c0e4c2929ae9674`.
Actual baseline prepare подтвердил16types/7.4.2/programming.javascript applyavailable;
baseline-catalog-attestation SHA
`a81a317b9eac9d44e581281e2dd1051b60bf651874f3884433e3ecee38658bd9`.
Baseline semantic review не выполнялся; это штатный machine audit новой попытки.
abc-pareto-groups/1 запущен следующим отдельным CLI; candidate0/25.

## Серия192418: ABC1 runtime blocker

Session `ses_ec92a595affeAmCk6ZCQSA00tU`, CLI1/wrapper3/cleanupfalse,
CLI362.070s (19:55:30.744–20:01:32.814Z), timeoutfalse. Package/resultnull,
oracleunverified/calculationfalse/policyincomplete. Import9f015907… и managedJS
b169b022… SUCCEEDED (JS terminal redelivery после response-budget отказа).
Group-001 AMBIGUOUS/target до нового node/Execute: `Upstream port is not interactable`.

Exact own runtime1358/1359: JS output0/nativeGUID58f7e6c3…/verified owner,
active/enabled/visible/pointbound, native_graph script/jsicon, allowed_actions[].
Grouping requires genericclick/F3, publicscriptdeny намеренно запрещает это;
request validate/resolve PASS. NewSort(keys required) использует ту же preview;
это общий runtime-блокер обязательных JS→nativeGroup/Sort, не policy revision.
Forensic SHA70579325… и actualtrace a63c069f…; designreview c9e0075f… .
Freshness_verified:false не повышен до true по одному active marker.

Own server user:81/init19:55:47.707Z установлен по двум executedGUID/log/runtime.
Админ CreateTime07:55PM/точный confirm сверены; закрытие20:15:37.094Z и refreshed
absence20:15:37.234Z подтверждены независимо, остальные UIrows сохранены.
Closure review SHA86b9bd1a… . Только own guard архивирован после nonce SHA/mtime
и no-own-process checks,19 originalfiles unchanged; recovery SHAd3891697… .
Status0 (config starting/browserunknown), check0 (LOGINOM_CONNECTION_VALID/Helpready/browserverified); adminlogout20:19:38.404Z/MCPexit0. Первые management
команды с неподдержанным --profile далиCLI_ARGUMENT_INVALID/exit2 и сохранены
`.invalid-argument`; корректный envCLI_PROFILE используется затем. Original
ABCcleanupfalse/CLI1/wrapper3 не переписаны; новая попытка не запускается.
Independent recovery review SHA
`22e95b237b7f15a5d71ff9bceef8d99a2ea749c1d47719c8cc98a336e9ef5cab` PASS:
archived owner SHA/mtime/modes exact, writerabsent/oldPIDabsent,19 originals unchanged.
Management verification SHA
`922d769c55ac1812eba131450ae2aadb09ae9d873e412ad56c9656916aa55f08`.
Atomic rename подтверждён root syscall/result, но его историческую атомарность
независимый reviewer не выводит только из конечных файлов.


Private managed preview Group+newSort исправлен в `dd8d480706`. Managed execution
history допускает владельца; retained schema не подменяет fresh native preview.
Fixed native output0 gestures/ACK, lock guard, schema/Close/graph restore проверены.
Общий publicJS click/F3deny, Calculator/Union, Protocol и skill не изменены.
TDD и независимое review APPROVED; pinned Node24.19 upstream3820tests:
3810PASS/0FAIL/10SKIP, exit0. Verification SHA
`a1c91ba28f775d83b90f0be0e6dc680f6d46a64813247f642c7964be18d1603a`, review
`fdd3a83d6c85bce0b938b7172ab996c07015f73cdc59effd3faad178807c3897`.
Новая matched пара `20261013T203142Z-5bf175` готовится на общем source;
native JS→Group/directJS→newSort/обе hidden Join роли и полный18+25 pending.
Historical locks/model bytes и72+2 acceptance source hashes подтверждены;
пока newpins/admission нет. Исходные2слота192418 остаются диагностикой.

## Историческая вторая сопоставимая пара

Обе сборки выполнены последовательно в одном managed worktree `node-selection-build`
на общем source `6768520a0`, версия `0.1.17`. Baseline использует точные два старых
skill-файла; затем они восстановлены к HEAD для candidate. Source verification
обоих payload завершилась exit 0. Манифесты SHA256: baseline
`861ce1594806414b1a40a3339a787cb893b1d583f79c990738ea565d4857b522`, candidate
`ffc4a0d09e9d6787115f42f920e5d0c5b69f753897bb9973fc18a14481c6107b`.
Skill digests прежние; baseline dirty, candidate clean отражены честно.

Независимая проверка каждого payload: 5725/5725 CLI entries, 4728/4728 resource
entries, SHA256/modes/symlinks PASS. Полная разница — шесть файлов: два skill,
два манифеста и два build-inputs. Runtime, compiled CLI/Host, dependencies,
Node/Chromium побайтно одинаковы. Разница build-inputs касается только
представления import paths; входные inventories и outputs совпадают.
Private evidence: `baseline-attestation.json`, `candidate-attestation.json`,
обе skill inventories и `pair-independent-review.json` в новом run.

Immutable baseline/candidate pins проверены независимо: 43 уникальных слота,
72/72 source lock hashes PASS; task/model/seed fields неизменны. Frozen models
и исторический lock сохранены побайтно; новая привязка — в
`pins-preparation-review.json`. Actual baseline native prepare подтвердил build
7.4.2 и 16 типов с доступным `programming.javascript` (`baseline-catalog-attestation.json`).
`current-run.txt` переключён на новый run; первый `sales-by-category/1` запущен.

## Историческая вторая серия: модельные исходы

`sales-by-category/1`, Session `ses_eca6f32d6ffeMWoNUZKw5hyJuQ`: CLI exit 1,
wrapper exit 3, modelStarted true, cleanupConfirmed false. Offline audit exit 2:
history/identity подтверждены, JS calls/successful calls 0/0, JS nodes неизвестны
без XML, policy incomplete, calculation false, oracle не проверен без CSV.
Импорт выполнен (500 строк). Группировка создана и связана с импортом, но
`group-category-1` остановилась в фазе open с `WIZARD_OPEN_NOT_CONFIRMED`.
Configure/Execute группировки не начинались, пакет и CSV не сохранены.

Source review исключил коллизию позиций и не подтвердил ошибочный выбор узла.
Позднее UI-наблюдение показывает нужный мастер, но catch повторно читает UI;
исходный snapshot отказа отсутствует. `grouping_structure_unverifiable` не
объясняет opening: DOM reader ожидает непустые keys и measures у ещё не
настроенного узла. Конкретный failed conjunct не установлен; спекулятивной
runtime-правки нет. Evidence: `forensic/group-category-1-diagnosis.json` и
`forensic/source-analysis.json` внутри попытки.

Точный GUID собственного импорта связывает попытку с `user:21`, созданной
14:01:05.859 UTC. Текущая admin inventory подтверждена; закрыта только эта
сессия, server close и отсутствие после refresh проверены. `user:20` не трогали.
После проверки отсутствия own процессов и nonce/mtime архивирован только guard
этой попытки. Хеши исходных attempt/events/parts/pins не изменились;
`forensic/profile-recovery.json` фиксирует восстановление отдельно от исходного
cleanup=false. Admin logout и закрытие MCP подтверждены. Это первый из 18
baseline, повтор его слота не выполняется. Следующий плановый ABC/1 запущен.

`abc-pareto-groups/1`, Session `ses_eca65e74effehzx2YIw9HkvGOz`: CLI exit 1,
wrapper exit 3, modelStarted true, cleanupConfirmed false; offline audit exit 1.
History/identity подтверждены, один JS apply и ноль terminal-confirmed successful
JS calls; XML/CSV отсутствуют, calculation false, policy failed у старого skill.
Это baseline-замер, не причина менять candidate policy. Импорт/сортировка успешно
выполнены. Declared JS дошёл до materialization execute и native mapping verified,
но output port_context unobserved отклонил Close до жеста; Save не состоялся.

Два ABC forensic журнала воспроизвели одну boundary. Публичный offline RED
подтвердил missing dataset overflow icon; минимальная правка добавляет один
selector, сохраняя guards. Existing matrix 28 случаев и полные 310 tests PASS;
независимый review PASS. Evidence: `forensic/diagnosis.json`, `source-analysis.json`
и `evidence/dataset-output-fix/{verification,independent-review}.json`.
Native DOM style/class в историческом incident не сохранены, поэтому native proof
именно repaired overflow-ветки ещё требуется.

Собственная `user:24`, init 14:11:06.719 UTC, привязана точными JS/import GUID.
Закрытие подтверждено server log; после промежуточной строки «Удаляется» выполнен
ещё один refresh, отсутствие всей записи проверено и снят `admin-after-settled.png`.
Guard архивирован после проверки own процессов, nonce/mtime в own CLI window;
исторические hashes/cleanup=false не изменены. `user:20` и `user:23` не трогали,
admin logout проверен. Серия stopped 2/18 сохранена отдельно от следующей полной.

## Native proof обоих исправлений на третьей паре

Host без LLM выполнил импорт `EventDate,Amount` и declared JS (passthrough даты,
Amount+1). Native операции SUCCEEDED/cleanup true, Save и package close/logout
подтверждены. Строгий offline audit проверил actual DataSet+hidden overflow marker,
GUID/index/opening ID и последующий Close/graph verification. JS output: две строки,
целые значения 11/21 exact, календарные даты 13–14.10.2026. Import retains display
precision limitations; JS local datetime/millisecond/timezone unspecified.

Исходный native driver exit 1 не скрыт и не переписан: он ожидал одинаковое
display date в discrete import и continuous JS. Save предшествовал assertions,
finally подтвердил package cleanup, ACK и runtime exit 0. Native не повторялся.
Независимая проверка 25 evidence hashes и 287 runtime sources, затем root offline
verification завершились exit 0. Evidence в третьем run:
`native-proof-offline-review.json`, `native-proof-offline-verify.py`, исходные
`native-proof.{ts,stdout.txt,stderr.txt}` и receipts. Persisted reopen, обычный
CLI teardown и модельная политика этим smoke не подтверждаются.

## Третья сопоставимая серия и очистка

Source обеих сборок `1bfc1354306a418d33b9710718edc455f3d188d7`, версия `0.1.17`.
Baseline source tree `a5ec8ab3c0a14dc2cb25fa1893ccd943ea14d0dba7d23ffe6baf432940f1cc07`
dirty; candidate `a0fda2e9dad55807c8ee7a531d5fb6082e46143cda8e7225a3a2e08cb7495fc4`
clean. Manifest SHA baseline `e0210ac2fceb6e44cea32f5683f5bf880cf78ffa574ff6be50a180ddd64eb473`,
candidate `4b53a39397c2921de89e59bf7ca2041dd78c032cbe51a242c5cd29b381aead67`.
Source verification обоих exit 0; full independent inventories 5725/5725 и
4728/4728 PASS. Runtime/CLI/Host/dependencies/browser совпали; различаются два
skill, два manifests, два build-inputs. Pins 0400, прежние inputs/model/seed;
72 hashes и 43 уникальных слота проверены. `current-run` переключён, первый
sales baseline запущен. Пять старых попыток двух остановленных серий отдельно.

Неиспользованный candidate второй серии сжат в `obsolete-candidate.tar.gz`
(SHA `c4953583424ea3e4964a034480f6f0795d6b9180c84c8f5a7deac0b6c208afc9`).
Перед удалением собственного каталога проверены все 5725 manifest entries,
modes/symlinks и точное совпадение cli-manifest. Активных ссылок процессов нет;
baseline и browser source сохранены, model evidence/pins не менялись. Удалено
765055067 байт исходных файлов, архив 331404633 байт; другие агенты не затронуты.
Квитанция `obsolete-candidate-cleanup.json` в старом run. Первая попытка очистки
остановилась до удаления из-за Python 3.10/hashlib.file_digest; после совместимого
streaming SHA256 архив повторно проверен и операция завершена.

`sales-by-category/1` третьей серии, Session `ses_eca4160a6ffetc3GcVPs4aXuGm`:
CLI/wrapper exit 0, cleanupConfirmed true. Полный audit PASS: JS nodes/calls 0/0,
oracle/calculation/history/runtime/identity/graph/export identity true, failures [].
Сохранены пакет и CSV с новым prefix; package SHA
`dbccff922600803df11431203f36106895a935f0659ca1733c768790c3534b1e`.
CLI время 336.384 секунды, без timeout. Это первый из новых 18 baseline;
следующий `abc-pareto-groups/1` завершился и оценён отдельно ниже.

## ABC третьей серии: восстановление collection failure

Session `ses_eca3a1284ffeZGQg7hUjWiiokX`: CLI exit 0, cleanupConfirmed true,
wrapper exit 2 (`SELECTION_COLLECTION_FAILED`), время CLI 417.524 секунды.
Save/Export и managed package close/logout SUCCEEDED. Причина wrapper failure —
текст `loginom_find` с named import `{ OutputTable, DataType }`, ошибочно переданный
в JSON-парсер managed receipts. Полный Help и история сохранены; модель не повторяли.

После независимой сверки public/runtime bindings скопированы только два точных
собственных пути. Пакет: 11333 bytes, SHA
`dddd3fc96c6036cc74cf9096efd3a596a863b8d45e5417cc006e895d82b48e2a`;
CSV: 228 bytes, SHA
`45a56e494b383ff377cbfd792a1db899717f3bcfbf207c707302f0bf5482ac03`, совпал с receipt.
Original `attempt.json` и source evidence hashes неизменны. В отдельной проекции
`evidence/abc-collector-recovery` восстановлены только package/result paths;
исходные CLI0/wrapper2/blocker сохранены и явно привязаны к original SHA.

Первый offline audit до распаковки сохранил PACKAGE_XML_INVALID; это ошибка
оператора copyout, а не исходного пакета. Результат оставлен в
`selection-audit-before-unpack.json`. После существующего unzip повторный audit
exit 1: oracle/calculation/history/runtime/identity/graph/export true, JS 2 nodes,
2 successful calls; единственный отказ JAVASCRIPT_NOT_ALLOWED. Это baseline
с прежним skill, его JS policy failure не блокирует измерение «до».
Evidence: `forensic/receipt-recovery.json`, `copyout-recovery.json`,
`collector-diagnosis.json` и отдельная audit-проекция. Исправление collector
`f5eb5373e2` выполнено по TDD: RED → GREEN, 4 suites/88 tests/206 assertions,
typecheck/diff-check PASS. Независимый review Approved: 4 regressions/8 assertions
PASS, actual 68 parts дают 16 managed calls без ошибок; испорченный managed JSON
по-прежнему отклоняется. Изменены только runner и его tests; общие payload/runtime
не пересобираются. `collector-fix-lock.json` SHA
`3296113f675d8d87505feb2cd402dc2f08eca7c1d277c0b74b1944cf026ca438`
фиксирует новое sourceHead/runner, 71 неизменённый historical hash и прежние pins.
Независимый `forensic/copyout-recovery-review.json` подтвердил 11 original hashes,
21 shared evidence file и все 14 ZIP members; pure audit/oracle повторно прошли.
Изменения проекции исчерпываются двумя receipt paths и явным collectorRecovery.

## Monthly-demand третьей серии

Session `ses_eca1a7be2ffejnqGRJRYOiKoix`: CLI/wrapper exit 0, cleanupConfirmed true,
CLI время 392.816 секунды, timeout false. Стандартные импорт дат, калькулятор
месяца, группировка, сортировка и экспорт; JS nodes/calls 0/0. Audit PASS: весь
oracle, calculation/history/runtime/identity/graph/export identity true, failures [].
Package SHA `f2f13e6958323961bd6f74122db0e5b287a71b124ef72e663320e5507c57a35a`.
Обе ранее исправленные runtime boundaries прошли в текущей сопоставимой серии;
исходные отказы сохранены. Это третий baseline, candidate ещё не выполнялся.
Следующий risky-approved-claims/1 завершился, исход ниже.

Независимый `collector-fix-lock-review.json` SHA
`ec2ee550f2ed7a8605ecb2d111b23e596e0e3304eca4dff325b1e4a603636323`
подтвердил byte-equal historical lock, committed runner/test, прежние pins,
auditVersion и task/prompt/input/oracle bindings. Полные payload inventories
не повторялись; сверены прежние attestation и critical payload hashes.

## Risky-approved-claims третьей серии

Session `ses_eca13c7e1ffeH14ploooTK0n9G`: CLI/wrapper exit 0, cleanupConfirmed true,
CLI 460.428 секунды, timeout false. JS nodes/calls 0/0, сплошной oracle и полный
audit PASS: calculation/history/runtime/identity/graph/export true, failures [].
Package SHA `9dc6980b08cbe131d5fcc2f8ec515e92fac7cd0b665c8a681d64c336ad9f1f63`.
Первый фильтр NOT_APPLIED/REQUEST_REJECTED из-за Unsupported node label,
effect_possible false, cleanup true. Агент исправил название и повторил стандартный
фильтр с новым operation ID; успешные фильтрация/группировка/сортировка/экспорт
подтверждены. Это естественная ошибка baseline, не замена обязательного recovery
candidate. Следующий campaign-roi-by-channel/1 завершился; candidate 0/25.

## Campaign-roi-by-channel третьей серии

Session `ses_eca0bfffbffe314nanPq1R43k8`: CLI/wrapper exit 0, cleanupConfirmed true,
CLI 409.688 секунды, timeout false. JS nodes/calls 0/0; oracle и полный audit PASS:
calculation/history/runtime/identity/graph/export true, failures []. Package SHA
`160782e00d1096a173d6b050c15b46dc11133ac71fa7b09e4014367adfdb7e3b`.
Стандартные импорт, группировка, калькулятор, сортировка и экспорт подтверждены.
Следующий first-last-touch/1 завершился — первый проход baseline завершён.

## First-last-touch и итоги первого прохода baseline

Session `ses_eca0538c6ffegD2qIgKCab6nuk`: CLI exit 0, wrapper exit 1,
cleanupConfirmed true, CLI 241.446 секунды, timeout false. JS nodes/calls 1/1,
successful JS calls 1. Oracle/calculation/history/runtime/identity/graph/export
true; единственный отказ JAVASCRIPT_NOT_ALLOWED у старого skill. Package SHA
`f0b446c8267b1e79c2acd1e877b651346be2fb5b5f41ac02a9be2f8c0416f8db`.
Это baseline-замер; wrapper1 по политике не останавливает серию «до».

Шесть разных baseline cases первого прохода: oracle/calculation 6/6, cleanup 6/6,
standard policy 4/6, JS суммарно 3 nodes/3 successful calls в двух сценариях.
Original ABC wrapper2 остаётся collection failure с отдельной проверенной
audit-проекцией, остальные outcomes не переписаны. Начат sales-by-category/2.
Среднее CLI время шести попыток 376.381 секунды (около 6.3 минуты). Грубый прогноз
оставшихся 12 baseline + 25 candidate — около 3.9 часа модельных попыток плюс
review/overhead; первые 9 candidate — около 56 минут. Это экстраполяция малой
выборки: candidate композиции и исключения могут иметь другие длительности.

## Второй проход baseline: sales-by-category/2

Session `ses_ec9ffdc34ffe6tL6k6RpX3wCom`: CLI/wrapper exit 0, cleanupConfirmed true,
CLI 343.882 секунды, timeout false. JS nodes/calls 0/0; oracle и полный audit PASS:
calculation/history/runtime/identity/graph/export true, failures []. Package SHA
`1c0eb77f14a3eb05ce98cfebed0d32872352887a669b9df8378c6ee565fb64a1`.
Начат abc-pareto-groups/2; сборка, pins, inputs/model/oracle прежние.

## ABC/2: неподтверждённое согласование операции

Session `ses_ec9f9ea4fffe3ennmoDQkOo9Ht`: CLI exit 0, wrapper exit 1,
cleanupConfirmed true, CLI 459.388 секунды, timeout false. JS nodes/calls 2/2,
successful JS calls 1. Oracle/history/identity/graph/export true, но runtimeSettled
и calculation false: RUNTIME_APPLY_MISMATCH, TOOL_OPERATION_UNSETTLED,
TOOL_RECEIPT_INCOMPLETE; JAVASCRIPT_NOT_ALLOWED ожидаем для старого skill.
Package SHA `dd9604cf371586fd9092f0cd885805dead3f4a81b03101fdb4cf51b80b890513`.
Первая JS-операция после running wait проверена через operation_inspect,
затем выполнена сводка. Save/Export и CLI cleanup подтверждены; отличие формы
квитанции или недостающий public settlement требуют диагностики, успех не подменён.
Следующая модель пока не запускается, candidate 0/25.

Collector fix подтверждён в обычном live CLI: один полный loginom_find содержит
named import `{ OutputTable, DataType }`, но сбор Save/Export/пакета/CSV и audit
завершился без collection failure. Исходные outcomes и audit сохранены.

Диагностика доказала delivery-path false negative: wait получил USER_RESPONSE_BUDGET
с next_step operation_inspect; успешная resolved/verified inspection содержит
полный canonical node.apply outcome, deep-equal runtime completed.outcome.
Все original hashes совпали. `e871bf81d2` исправил разбор только в auditor/test:
106 tests/236 assertions PASS, final 18 regressions/30 assertions, typecheck/diff
PASS. Independent review Approved, 38 отрицательных mutations прошли.
Для inspect проверены operation ID, внутренний status, cleanup, node/execution
и runtime; generic error не скрывается. Raw outcomes не менялись.

Новый lock SHA `cf81c625a3dd354e8cd4659b636fc5a8ac231acc814f6aab858805b5569ca140`,
auditVersion `2654bfc1c61d4d0ecc73c7a6f4fa9613b5d5244ea83a7fdb8712be2ed452e445`.
70 historical hashes неизменны; изменены только runner и node-selection,
historical locks и оба pins сохранены. Runtime/payload/skill не пересобирались.

Восемь сохранённых baseline переоценены в отдельных hardlink-проекциях
`evidence/settlement-reassessment-e871bf81d2`, без overwrite прежних audits.
Original inventory SHA `361a0dc13228d7b0fa4fb437635031ddebcbbfb7601bdf96ee7554aec48c26d6`;
`settlement-reassessment.json` SHA
`0ac9ee23bb8286d4221534cb281caed75fb58a9f0380dd7f18bc6ee5e345939c`.
Итог: oracle/calculation 8/8, policy 5/8, JS nodes/calls/successful calls 5/5/5.
ABC/2 теперь runtimeSettled/calculation true, единственный отказ JAVASCRIPT_NOT_ALLOWED;
исходный wrapper1/calculationfalse отдельно сохранён. Повтора модели нет.
Независимый review reassessment PASS, findings 0; receipt SHA
`2298dca182655fc5a7406148a9e6f0d832e18aab96c664cbaf3b8ec87ab27084`.
96 protected original files и восемь prior audits сохранили hashes. Новые
attempt metadata побайтно равны prior assessment (ABC/1 сохраняет explicit
collector projection); CLI/wrapper/blocker не подменены. У семи изменился только
auditVersion, у ABC/2 — successfulJS 1→2, runtime/calculation true и сняты три
settlement errors. Pins/model/tasks/oracle и build metadata прежние.
Повторных тестов/audits и semantic review reviewer не делал. Monthly-demand/2 запущен.

## Monthly-demand/2 на финальном аудиторе

Session `ses_ec9e08ac3ffelGiTyxf3V91hSd`: CLI/wrapper exit 0, cleanupConfirmed true,
CLI 562.562 секунды, timeout false. JS nodes/calls 0/0; oracle/calculation/history/
runtime/identity/graph/export true, failures []. AuditVersion `2654bfc1…`.
Package SHA `4265528b5bd90861aaad00e5e0da3aa889a1d728a092ec6b864387b8f5599941`.
Стандартная цепочка включает reform_columns для целочисленного promo_days;
inputs/model/oracle прежние. Завершены 9/18 baseline, policy старого skill 6/9;
следующий risky-approved-claims/2 запущен, candidate 0/25.

## Risky-approved-claims/2

Session `ses_ec9d670ecffeA544O9qLGHk1IR`: CLI/wrapper exit 0, cleanupConfirmed true,
CLI 488.485 секунды, timeout false. JS nodes/calls 0/0; oracle/calculation/history/
runtime/identity/graph/export true, failures []. Package SHA
`a6dcdfe312b67ce4a34cbbd9718260cc22dd48cb15e7fd9fe5e6cb3a42991749`.
Unsupported node label вернул NOT_APPLIED/REQUEST_REJECTED с effect_possible false;
агент повторил стандартный фильтр с исправленным названием и новым operation ID.
История отказа сохранена. Всего baseline 10/18, policy 7/10, JS5/5/5;
следующий campaign-roi-by-channel/2 запущен, candidate 0/25.

## Campaign-roi-by-channel/2

Session `ses_ec9cb31b8ffeQ6G3RHEHj9VsbS`: CLI/wrapper exit 0, cleanupConfirmed true,
CLI 412.373 секунды, timeout false. JS nodes/calls 0/0; oracle/calculation/history/
runtime/identity/graph/export true, failures []. Package SHA
`b98dabdc3abe538adb45351aea55a127af7b3ffbb9f30fa19a30ecaec23e3f4c`.
Завершены 11/18 baseline, policy 8/11; следующий first-last-touch/2 запущен.

## First-last-touch/2 и итоги двух проходов

Session `ses_ec9c2d2e2ffeFIgWa5RLVXOyjG`: CLI exit 0, wrapper exit 1,
cleanupConfirmed true, CLI 244.122 секунды, timeout false. JS nodes/calls/successful
calls 1/1/1; oracle/calculation/history/runtime/identity/graph/export true.
Единственный отказ JAVASCRIPT_NOT_ALLOWED у старого skill. Package SHA
`6c5fdf953dc36b3c1ae9b18858a722b817c1106f62fa49bceec2e0436b1a6a79`.
Baseline 12/18: oracle/calculation/cleanup 12/12, policy 8/12, JS6/6/6 в четырёх
ABC/attribution попытках. Первые восемь используют отдельный final reassessment,
дальнейшие четыре — тот же auditVersion непосредственно; original outcomes
не переписаны. Начат третий проход, sales-by-category/3; candidate 0/25.
Среднее CLI время 12 попыток — 397.425 секунды (6.6 минуты). Грубая оценка
оставшихся 6 baseline + 25 candidate — 3.4 часа модели плюс review/overhead;
первая candidate-волна по этой выборке около 60 минут. Это не гарантированная ETA.

## Sales-by-category/3

Session `ses_ec9bd7697ffe6a6nL92XuL3hNC`: CLI/wrapper exit 0, cleanupConfirmed true,
CLI 342.201 секунды, timeout false. JS nodes/calls 0/0; oracle/calculation/history/
runtime/identity/graph/export true, failures []. Package SHA
`608ce38c6b0a1d5f013e99eeeedefebcb011f59aa498a92f3c6c8a6406cb174a`.
Все три sales baseline успешны без JS. Всего 13/18, policy 9/13, JS6/6/6;
следующий abc-pareto-groups/3 запущен, candidate 0/25.

## ABC/3

Session `ses_ec9b742dbffed3h1gEHM1LxaMi`: CLI exit 0, wrapper exit 1,
cleanupConfirmed true, CLI 369.017 секунды, timeout false. JS nodes/calls/successful
calls 2/2/2; oracle/calculation/history/runtime/identity/graph/export true.
Единственный отказ JAVASCRIPT_NOT_ALLOWED. Package SHA
`98190084e2374d4e88ee02b84b2486e366cb21e96ef7d20aedeb9a924b07de38`.
Все три ABC расчётно успешны; original ABC/1 collection failure и ABC/2 prior
settlement assessment сохранены отдельно. Всего 14/18, policy 9/14, JS8/8/8;
следующий monthly-demand/3 запущен, candidate 0/25.

## Monthly-demand/3

Session `ses_ec9b11270ffeU4LKty64fCXG8F`: CLI/wrapper exit 0, cleanupConfirmed true,
CLI 474.881 секунды, timeout false. JS nodes/calls 0/0; oracle/calculation/history/
runtime/identity/graph/export true, failures []. Package SHA
`10d9312119e3258164f948130df59223f773642ccdd022e219ed764fc85901fd`.
Все три monthly baseline успешны без JS. Всего 15/18, policy 10/15, JS8/8/8;
следующий risky-approved-claims/3 запущен, candidate 0/25.

## Risky-approved-claims/3

Session `ses_ec9a93e6affeZNu00G2ctcWpxH`: CLI/wrapper exit 0, cleanupConfirmed true,
CLI 497.751 секунды, timeout false. JS nodes/calls 0/0; oracle/calculation/history/
runtime/identity/graph/export true, failures []. Package SHA
`ef211840d5cbdd5eb6f3e74a26795a8e8cb61381c91b7cc41cff68a1b4f7495f`.
Все три risky baseline успешны без JS. Всего 16/18, policy 11/16, JS8/8/8;
следующий campaign-roi-by-channel/3 запущен, candidate 0/25.

## Campaign-roi-by-channel/3

Session `ses_ec9a007a3ffeSrwEoRYQIFAEBY`: CLI/wrapper exit 0, cleanupConfirmed true,
CLI 421.374 секунды, timeout false. JS nodes/calls 0/0; oracle/calculation/history/
runtime/identity/graph/export true, failures []. Package SHA
`a80221fb50d3a1db9e08ab2f6091a029b020b77068150f83f8d865d1e5b46355`.
Все три campaign baseline успешны без JS. Всего 17/18, policy 12/17, JS8/8/8;
следующий first-last-touch/3 запущен, candidate 0/25.

## First-last-touch/3 и итог baseline

Session `ses_ec9991e6fffevrkgnHx3umenbP`: CLI exit 0, wrapper exit 1, cleanupConfirmed true,
CLI 237.150 секунды, timeout false. JS nodes/calls/successful calls 1/1/1;
oracle/calculation/history/runtime/identity/graph/export true. Единственный отказ
JAVASCRIPT_NOT_ALLOWED. Package SHA
`4b025d52f8689cde0ecac0ef3e397cd9c537886f705ece24fbab9b553058871d`.
Все 18 baseline завершены: oracle/calculation 18/18, cleanup 18/18, policy 12/18;
JS nodes/calls/successful calls 9/9/9 в шести попытках (ABC и first-last-touch).
Все CLI exit 0, timeouts нет; original ABC/1 collection failure и ABC/2 prior
settlement assessment сохранены отдельно от итоговой offline-переоценки.
Baseline не проходил ручное semantic review. Independent machine review всех 18 PASS:
358 protected hashes неизменны, 252 ZIP members проверены, unique identity/order
и own receipt lineage подтверждены. Evidence `baseline-final-review.json`, SHA256
`03846e4b366f7cfe3bc580d3740211ab63fac865947adbeec58210ac3c4169fc`.
Candidate 0/25, итоговая приёмка остаётся незавершённой.

Task 3: подтверждены 18 уникальных workspaces/Session/prefix и input-only файлы; independent baseline-final-review PASS.

Task 3: 18 отдельных CLI-процессов шли последовательно без пересечений; все CLI0, cleanup true и без timeout.

Task 3: у всех 18 сохранены единственная own Session, полная история и read-only snapshot; runtime identity/settlement подтверждены.

Task 3: 18 пакетов/CSV привязаны к own Save/Export receipts; SHA, exporter/execution lineage и 252 ZIP members проверены.

Task 3 завершён: 18 слотов в исходном порядке, oracle/calculation18, policy12, JS9/9/9; final audit2654bfc1 и addenda, исходные outcomes сохранены.

## Подготовка первой candidate-волны

Final static review двух skill-файлов и контракта аудита — Approved-static-only,
findings []. Candidate digest `ff18dc5f…`, auditVersion `2654bfc1…`, pins и source
соответствуют закреплённой сборке. Evidence `final-static-review.json`, SHA256
`964fb9e87222f680b55994f10650359b2ce521630ecc47b553ebb70929d1c2a2`.
Live semantic review этим не закрыт.

Single native candidate schema probe через настоящий Host без LLM — exit 0:
16 available types, 15 стандартных parameter_schema, raw receipts и candidate
resource handshake сохранены; Host close ACK/exit0. Evidence
`candidate-schema-probe/result.json`, SHA256
`6c82026fb8103030ce72d656f507f48db7bcc1ca9b38818c57eacd5d764a0980`.
Штатный authenticated startup выполнен; prepare/admit/package/model calls 0.
Explicit Loginom logout и actual prepare catalog этим probe не подтверждаются.
Private driver прошёл TDD (2 tests/4 assertions), typecheck и independent review
перед запуском. Для tags остаётся связать реальные схемы с successful candidate
prepare. Первый candidate sales-by-category/1 запущен; completed candidate 0/25.

Baseline: 7111.472 секунды суммарного CLI-времени, среднее 395.082 секунды.
Ориентир первой волны — 59.3 минуты модельных процессов, всех 25 — 2.74 часа
плюс сбор артефактов/review; сроки не гарантированы.

## Candidate sales-by-category/1

Session `ses_ec992fe2effeCSAp2IHU9Jamok`: CLI/wrapper exit 0, cleanupConfirmed true,
CLI 343.331 секунды, timeout false. Candidate digest `ff18dc5f…`, auditVersion
`2654bfc1…`. JS nodes/calls 0/0; oracle/calculation/history/runtime/identity/graph/
export true, failures []. Package SHA
`529f80b6d7d23aa3a86ce07024b840fffbd125426b29603d387ee1c72d1a0567`.
Первая candidate-волна: 1/9 завершена чисто; standard policy/oracle 1/1,
completed candidate 1/25. Следующий ABC/1 запущен. Повторы пока не разрешены.

## Actual candidate catalog/schema — предпосылка tags

`actual-candidate-gap-attestation.json`: actual-candidate-gap-supported, SHA256
`0384b22c01366bf6d50f11171bae54927d7979a204b159d76ad83e27a7b85d50`.
Проверены 16 raw describe receipts, 15 schemas и все 5725 CLI/4728 resource
entries. Successful sales/1 prepare подтвердил build 7.4.2 и 16 типов;
связь с probe — одна immutable сборка/digest/catalog/runtime pins, разные browser
Session указаны явно. У 14 схем static bytes совпадают, у exports.text добавлено
только user-v1 description. General variable split-to-rows среди известных
стандартных handlers не найдено. Пределы 128/15 — на один узел, не доказательство
невозможности конечной композиции для 151 элемента. Этот пункт закрывает только
предусловие до tags; роль JS, oracle и граф каждой tags-попытки ещё предстоит
проверить. Отдельного Help retrieval, cold reuse и explicit probe logout не было.

## Candidate ABC/1: стандартный узел, runtime-блокер

Session `ses_ec98d483fffe34m8OF1Sp2FA2W`: CLI exit 1, wrapper exit 3,
CLI 560.048 секунды, timeout false; cleanupConfirmed false,
SELECTION_CLEANUP_UNCONFIRMED. Импорт, сортировка, Калькулятор накопленной суммы
и Группировка выполнялись стандартными узлами. Первый запрос Соединения
`abc-join-1` отклонён до эффекта: REQUEST_REJECTED, Explicit join keys and options
required, cleanup true. Новый стандартный `abc-join-2` остановился AMBIGUOUS
в input_mapping: Node procedure readiness timeout: calculator done available;
no mutation was authorized. Inspect/resume/recover/cancel не разрешили состояние;
partial Save заблокирован. JS apply calls 0, успешных JS 0; пакет/CSV не сохранены,
JS nodes неизвестны, oracle не проверен, calculation false.

Исходный attempt сохранился: policy incomplete. Дополнительный offline audit
exit2 подтверждает history/identity, но settlement/graph/export не подтверждены;
TOOL_OUTPUT_MANIFEST_INVALID ожидает отдельного выяснения, итоговый успешный
audit не заявляется. Evidence `candidate/abc-pareto-groups/1/`. Live-серия
приостановлена на двух начатых candidate; это runtime-блокер, не доказанное
нарушение политики и не основание менять skill. Проверка причины и собственная
server-session recovery выполняются отдельно; исходные outcomes не переписываются.

## Join forensic

`forensic/join-diagnosis.json` SHA256
`5bd0562275400f8cd4be775795da17807fb93a2a1dbc2204907635ddaf218b2c`:
corrected request и оба upstream preflight valid; input1 native mapping/owner
verified. Во всех 44 финальных polls Done visible/enabled, но input_port_context
unobserved, finish_wizard отсутствует. Input0 в том же runtime был observed
с caption «Главная таблица». Exact breadcrumb DOM второго входа не сериализован:
конкретный failed conjunct пока не доказан, product patch преждевременен.
Сохранённые source/runtime hashes сверены с immutable candidate. Отдельный
instrumented diagnostic с fixed read-only NavigationPanel capture готовится
без LLM и без изменения acceptance payload.

## Join: адресное восстановление

Четыре GUID import/sort/calculator/group связывают own user:67 с init
18:07:44.200 UTC; Join ещё не исполнялся и его GUID отсутствует в server log.
Admin сверил точное имя/CreateTime, закрыл только own user:67. Server close
18:22:08.767 UTC и отсутствие после refresh18:22:19.194 подтверждены независимо
по log continuity и screenshots; server immutable GUID неизвестен (не выдуман).
User61/63/64/66 не трогали. `server-session-binding.json` SHA256
`8de63d95c1b5d76932e41247a7d697c73baf0c21f12fca62a4b555012cf57bdc`.

Exact guard SHA/mtime соответствуют initial observation; own процессов нет,
он атомарно перенесён в `profile-guard-archive/candidate-abc-1.writer`.
Original attempt/events/parts/pins/runtime hashes неизменны. `profile-recovery.json`
SHA256 `a11971af9878734774e5887df9a9b2c3f9706650a9755ee7e29c7eb99e3af1eb`.
Admin logout/Browser close/MCP exit0 подтверждены. Model-free `loginom status`
и `loginom check --headless --format json` exit0, Help ready/browser verified,
writer absent. `profile-management-verification.json` SHA256
`525aa7bd088329162072d957182b03c89eeb51e0703601100d0cdfbfa91cb743`.
Первый operator status вызов ошибочно использовал --json (exit2); исходные
логи `.invalid-option` сохранены, исправлена только команда. Recovery не
изменяет original CLI1/wrapper3/cleanupfalse и не подтверждает ABC oracle.

## Join native diagnostic: ошибка проверки preview

Первый instrumented diagnostic остановился до Join: импорт SUCCEEDED и
exact_integer preview содержал value:"1"/"5"/"10", decimal_integer, is_null:false.
Private assertion ошибочно читала отсутствующее display_text и получила NaN.
Save не состоялся; package cleanup BLOCKED/CONFIRMED_SAVE_REQUIRED, exit3.
Это ошибка operator driver, не воспроизведение Join. Original result
`forensic/join-native-diagnostic/result.json` SHA256
`9c09ed7d295dce8c15f1337a22c580b130079ab9ce4b186795ea606748923e90`
и все raw receipts сохранены; модельный слот не повторялся.

Driver исправлен TDD по actual08 receipt: строгий BigInt reader exact_integer,
Save после каждого successful/cleanup import до preview assertions. Итоговые
5 tests/typecheck/syntax PASS, независимый review Approved. Entry с fixed
read-only capture не менялся (`15a753a5…`), Product/resources/pins неизменны.
Новый driver SHA `31e81fe39533289ae1270fc30089f81b299160d97bbcbf8ae4fcbf90315bacee`;
review SHA `526b30546372ddf92e5de5e7504551816f201c477a9187a811aa5003d33a362b`.
Первый source snapshot сохранён отдельно.

Own native import GUID62584e00… связан server log с user:70/init18:38:09.993Z;
admin сверил CreateTime06:38 PM, закрыл только user70; fresh refresh18:44:46.852Z
подтвердил отсутствие, user69 остался. Admin logout18:45:04.441Z и MCP exit0,
own native процессов нет, профиль свободен; guard не создавался.
Сверка свежего server close выполняется независимо. Второй отдельный native
запуск в `join-native-diagnostic-2` начат; причина Join пока не доказана.

## Join native diagnostic/2: отказ воспроизведён, capture blocked

Второй instrumented run: обе таблицы импортированы/прочитаны успешно, оба Save
подтверждены (`/user/JD18fef2b4.lgp`). Join `join-repro` остановился AMBIGUOUS
input_mapping с тем же calculator done readiness timeout; Execute не начат.
Затем private read_navigation_panel ошибочно заблокировался
LOGINOM_DIAGNOSTIC_BUSY: guard счёл unresolved terminal effect активной работой.
DOM после отказа не получен. Cleanup BLOCKED/CLEANUP_OR_OPERATION_UNCONFIRMED,
native exit3. Original result `join-native-diagnostic-2/result.json` SHA256
`ec9cfb304fd970fba437e56db4659f328e134625d2d2b0e88ce61302f816a8df`
сохранён. Это подтверждает воспроизведение отказа, но не конкретный DOM conjunct.
Правка касается только private диагностического guard: fixed read-only capture
собственного prepared мастера после stopped/ambiguous outcome. Product/runtime
и immutable candidate всё ещё не менялись; native/3 ещё не запускался.

Первый native recovery дополнительно подтверждён server close user70
18:44:37.180 UTC и независимым review; original 1749 files/hashes неизменны.
`native-first-server-binding.json` SHA256
`e0769c609c181b029fac3736e22bd69b72dbe157f128539385358aaefa15ba7c`.

## Join diagnostic/3: исправление private capture guard

Private capture больше не запрещается из-за unresolved terminal effect.
Concurrent IPC dispatch, fixed args {}, own prepared page/URL и fixed read-only
NavigationPanel остаются ограничениями; running-only гарантия не заявляется.
Actual native2 settled AMBIGUOUS + activeWork/recoveryPending привязан к RED;
6tests/typecheck/syntax GREEN, independent Approved. Entry SHA256
`2a9c6f9f844edaebd89cf7ab7a66a95e105741bc490c11cd201d7bd14c0f5662`,
review SHA `acb6c3b65c1480dc789693ed469a15c4c1cfd934f442b68c976cf5a9c383c0f3`.
Все source snapshots и результаты первых двух native сохранены.

Own native2 user72/init18:45:26.926 UTC привязана к двум GUID и двум Save
`/user/JD18fef2b4.lgp`. Admin сверил CreateTime06:45PM и закрыл только user72;
fresh second refresh18:52:57.948 подтвердил отсутствие, user69 остался.
Admin logout18:53:18.557/MCP exit0, own native процессов нет, guard отсутствует.
Сверка fresh server close выполняется независимо. Третий instrumented native
начат в `join-native-diagnostic-3`; Product/candidate/resources/pins неизменны.
Это source diagnostic, не модельная попытка и не acceptance.

## Join diagnostic/3: фактический DOM и failed predicate

Native3 воспроизвёл AMBIGUOUS/input_mapping, captured NavPanel без DOM-мутирования.
9 breadcrumbs: первые7 внутри панели и visible, crumbs7 «Присоединяемая таблица»
и8 «Настройка» display:none/rect0. Node icon joindata, port tunedatasourcesocketdef,
wizard icon правильный; current predicate для hidden input допускает лишь
«Входной источник данных», поэтому port.label пустая. Prepared own input1,
GUID54ae…, opening join-repro:n26 и43 failed readiness samples подтверждены.
Native result SHA `5c9e2601e20c4527f6572415a05544ba9e0bfb4b2d4c7771418a4c8ce072118e`,
Nav SHA `b6d9cfb3a1cdd5dee8e814768beade867ee7fabc9d2295a2747a309da3d4f839`;
`join-hidden-input-diagnosis.json` SHA
`db5fc0e30f2353fb2f49578a8cc72600542220cf7e4f276327e192aa432c2e7b`.

Own user74 закрыт19:02:44.920 UTC; fresh server log и admin absence после
refresh19:02:46.045 проверены независимо. Binding SHA
`8ce8ccc714a18b60bfc2118c8e72bfaa5c6e94e495d5a924a754677b34548430`;
1824 original files unchanged. Admin logout19:03:17.386/MCP exit0. Native
cleanup false остаётся исходным outcome; operator capture отличается от
acceptance entry и package caption JD отличается от несохранённого Package1.

Итоговый source fix `05b645eec9` допускает обе точные известные Join роли:
«Главная таблица» только native input0 и «Присоединяемая таблица» только input1,
обе с единственной Join icon. Все identity/opening/index/ancestry guards сохранены.
Actual Main caption/binding наблюдались 10 раз; hidden Main пока проверен fixture,
поэтому live обеих скрытых ролей ещё не заявлен. 5 focused tests/32 negatives PASS;
полный upstream 3775 total/3765 PASS/10 SKIP/0 FAIL/exit0, syntax/diff-check0 и
независимый review Approved. Verification SHA
`0b6f02d06403fadc7e029757a68e23329088e346d7c1936736914391aef85a90`, review SHA
`5b44bdc9eb383a6079cae069009b5159fd1b26d6cb7ea5c777a4bd94154230a4`.
Source SHA `80d27a8b318cc1ed800331dda82285aef4a3eab907732fe29eb52e7e036904a2`.
Новый run `20261013T192418Z-c71363` готовится с теми же model/fixtures/seed. После новой общей runtime-правки нужны matched builds,
native positive proof и новая полная18+25 серия. Текущие18 baseline/2 candidate
сохраняются отдельно, ни один начатый model slot не заменяется. Skill policy
не меняется из-за ошибки стандартного узла; это не policy revision.

## Native proof исправления дат

`date-format-native-2` через настоящий Host без LLM завершился exit 0.
`imports.text` SUCCEEDED/settled/cleanup_complete: readback `yyyy/mm/dd` и
`Слэш (/)`, datetime schema, две ненулевые даты `13.10.2026`, `14.10.2026`.
Save SUCCEEDED/save_completed; package cleanup SUCCEEDED/package_closed,
logged_out true, unsaved_changes_discarded false. Точность времени preview
не подтверждает (`datetime_display_precision`); она здесь не заявляется.

Первый smoke сохранён как неуспешный: импорт был успешен, но проверка ошибочно
ожидала ISO `cell.value` вместо публичного formatted display и остановилась
до Save. Cleanup BLOCKED/CONFIRMED_SAVE_REQUIRED не переименован в успех.
Точный native GUID связал собственную сессию `user:17` с init 13:39:18.798 UTC;
после проверки текущей admin inventory она адресно закрыта в 13:54:11.952 UTC.
Readback отсутствия и серверный close закреплены в `native-first-session-closure.json`
и before/after PNG. Admin logout проверен, MCP завершён. Сторонние сессии,
storage и профиль не изменялись. Ни один smoke не занимает модельный слот.

## Изменение и проверки

Product skill изменён только в `SKILL.md` и `references/workflow.md`, коммит
`fdb90ca1e`: стандартные узлы и их композиции по умолчанию; JS только в явно
запрошенной части или для подтверждённого функционального пробела. Ошибка узла
не разрешает fallback на JS. Существующие JS-узлы не удаляются автоматически.

Root checks из `evals/`: 95 целевых тестов, 219 assertions, 0 failures;
`bun typecheck` и `git diff --check` — exit 0. Проверены audit, runner, graph,
fixtures и oracle. Независимый review закрыл две ошибки привязки evidence:
экспортёр CSV к сохранённому XML (`80d55e0c7`) и публичный запрос к runtime
document/workflow/node (`0d44e677a`); повторные пять регрессий прошли.

Bundled skills: 9/9 до и после; полный staging 13/13 без SKIP, host typecheck PASS.
Для Task 6 независимая read-only сверка подтвердила сохранение этих результатов
в историческом report `53e471ddf4` и неизменность skill/host/dependencies.
Отдельный raw host-test receipt не найден; новые host tests не запускались.
Актуальный eval collector проверен отдельно: 88 tests/206 assertions/typecheck/
diff PASS, source hashes и все 72 файла addendum совпали. Runtime 310-test source,
build verification и native offline evidence также сверены. Прежний native driver
exit 1 сохранён, самостоятельный offline validator exit 0 — отдельный результат.
Baseline и candidate собраны и проверены. Node/Bun/Chromium dependencies совпали;
различия Product-исходников между payload commits — ровно два skill-файла.
Время сборки исходники были заморожены. `acceptance-lock.json` закрепляет 72 файла.

Статические tags-контракты candidate сверены: пять файлов побайтно совпали с
baseline и исходниками, проверены экспорты 16 типов узлов и релевантные схемы.
Генератор, цикл и dynamic split-to-rows не объявлены. Статус
`static-gap-supported` относится к требованию общего разворачивания списков
произвольной длины, не к невозможности всех мыслимых композиций. Evidence:
`candidate-gap-attestation.json` в private run, SHA256
`0d2bdcdb35e8c5d8af595cc19cb34424998a368c163dd7f094bd22935a01c0aa`.
Фактические `prepare.knowledge.node_types` и `action_describe.parameter_schema`
ещё нужно сверить в candidate Session до tags; live-доступность и поведение
модели эта проверка не подтверждает. CLI, профиль и браузер не запускались.

Audit version: `1f1e63ba844350aa21b9722ced44579050d12eaade0b78217085d5ae797eb34d`.
Baseline skill digest: `74cc9ac0b5a22724909bd1ba3123e8f6e3abedbe85a3b87dee6596119bbfb340`.
Candidate skill digest: `ff18dc5f2b4da3d7b6c66d0419d48aae7590b2a07e0d2e50f7a01cd9f3f34261`.

## Условия и сохранённые попытки исходной серии

Текущий местный Loginom: `http://localhost/app/`, user, `/user`, существующий
`loginom-server-7.4.2-test`. Нового стенда нет. CLI использует frozen payload,
`openai/gpt-6-sol-fast`, `medium`; alias запрашивает API model `gpt-6-sol` и
priority tier. Фактически обслуженный tier по имени alias не предполагается.
Модельный каталог, inputs/prompts/oracle, manifest и seed закреплены в отдельных
baseline/candidate pins. Одна попытка — один процесс, без модельных retries.

Private run: `evals/results/node-selection-local/20261013T093809Z-f5d429/`.
Сырые журналы, профиль и секреты в Git не включены.

- `sales-by-category/1`, Session `ses_ecb36b60fffelEBfHHVtrg0Wbw`: CLI exit 0,
  335.392 секунды. JS nodes/calls 0/0; oracle, policy, calculation, history,
  settlement, identity, export identity и graph PASS. Артефакты сохранены.
  Исходный wrapper exit 2 относится к минимальному Task 1A; финальный offline
  audit exit 0. Исторический `attempt.json` не переписан. Evidence:
  `baseline/sales-by-category/1/selection-audit.json`.
- `abc-pareto-groups/1`, Session `ses_ecb0f6648ffeNtALKokieQR6xW`: CLI exit 1,
  wrapper exit 3, 429.086 секунды. History/provenance подтверждены; один JS apply,
  ни одного подтверждённого успешного JS. Policy failed для старого baseline;
  это измерение исходного поведения, не основание исправлять candidate skill.
  JS nodes неизвестны: пакет не сохранён. Oracle не проверен, calculation не
  подтверждён, runtime settlement false. Evidence:
  `baseline/abc-pareto-groups/1/forensic/summary.json` и `readonly-audit.json`.

Таким образом, среди трёх начатых baseline один полный расчётный успех и один
oracle-pass. Это промежуточные числа, не результат всей матрицы 18/25.
Первый отказ OAuth до inference сохранён отдельно в `incidents/`; после успешной
авторизации по коду этот запланированный слот впервые дошёл до модели.

## Исходный блокер ABC и его восстановление

`pareto-cumulative-1` осталась `AMBIGUOUS` на `output_mapping` с
`cleanup_complete:false`. Собственный package cleanup завершился
`BLOCKED/CLEANUP_OR_OPERATION_UNCONFIRMED`; runtime close отверг cleanup.
Source editors закрыты, но это не закрывает внешнюю node operation. Поздний
context read также неопределён. Resume/cancel/recover уже отказали;
`recovery_options:[]`, `internal_resume_available:false`.

CLI и runtime процессы завершены. `.writer` первоначально сохранён намеренно;
отсутствие процессов не доказывает закрытие Loginom-пакета. Штатный `loginom recover` сначала
требует свободный writer, не снимает guard и не возобновляет node operation.
Recovery UUID-записей нет. История, storage и сервер не очищались.

Для продолжения требовалось проверенное завершение собственной Loginom-сессии и
адресное offline-восстановление профиля, разрешённое пользователем.
Сохранённый Dock document UUID не является серверным Session GUID, а уникального
пути сохранённого пакета нет. Имя `user:<номер>`, время и `Package1` сами по себе
не дают надёжной привязки. Диагностическое подключение с сохранённым `user`
установлено, но чтение списка сессий и logout не подтверждены; исходный guard
не менялся до проверки. Встроенный браузер не отвечал до формы входа; затем по
запросу пользователя установлен официальный `@playwright/mcp` 0.0.83 в Codex,
с существующим Chrome и отдельным временным профилем. MCP handshake, каталог,
навигация, административные вход и выход проверены. Для этой UI-проверки применён
глобальный `loginom-automation`; оценочные baseline/candidate payload не менялись.
Остальная конфигурация Codex семантически сохранена, backup создан.

Точный native GUID ABC-узла связан серверным журналом с экземпляром `user:8`,
созданным 11:05:58.329 UTC и окончательно закрытым сервером по тайм-ауту
11:42:50.547 UTC. Серверный GUID в журнале отсутствует; связь подтверждена
последовательностью init/own-node/disconnect/final-close без переинициализации.
Обновлённый admin-диспетчер до восстановления показал только собственную
`admin:12`, без user-сессий. Источники и хэши закреплены в
`server-session-closure-attestation.json`, `admin-sessions-inventory.yml` и PNG.

После повторной проверки nonce/mtime собственного guard и отсутствия own процессов
он атомарно перенесён в `profile-guard-archive/analytic-evals.writer` текущего run.
Исторические `attempt.json` не изменились; чужие сессии и пакеты не закрывались.
Модель-free `loginom status` и `loginom check` завершились exit 0: failure/recoveries
нет, Help ready, browser verified, новые guards освобождены. Evidence:
`profile-recovery-attestation.json`, `recovery-status.json`, `recovery-check.json`,
`playwright-mcp-installation.json`. Техническое восстановление не превращает
исторический runtime cleanup ABC в успешный и не подтверждает её oracle.
Провалы ABC и monthly остаются в исходной остановленной серии; её слоты 1
не повторяются. После общей runtime-правки начата подготовка новой полной
сопоставимой серии. Candidate начинается после нового baseline: сначала девять
случаев, затем повторы только после чистой первой волны.

## Исходный runtime-блокер monthly и принятое решение

`monthly-demand/1`, Session `ses_ecac06e84ffet1Rxb3IuG67J54`: CLI exit 1,
wrapper exit 3, 111.993 секунды; modelStarted true, cleanupConfirmed false.
Операция `monthly-import-001`, native GUID `75355558-68d1-4885-a9e5-489c546a0335`,
осталась `AMBIGUOUS/configure`, `Unsupported import format field`.
Замороженный `text-import-procedure.mjs` принимает `date_format` в validator,
но направляет его в setter, поддерживающий лишь delimiter/text_qualifier/
null_marker/decimal_separator. Это дефект настройки стандартного импорта,
а не основание переходить на JavaScript или менять правило skill.

Evidence: `baseline/monthly-demand/1/forensic/monthly-import-001-diagnosis.json`.
Тогда строгая server identity не была подтверждена: own GUID/input path/Dock IDs
в server log отсутствовали, backups были пусты. Одного совпадения времени
`user:15` недостаточно для CloseSession, поэтому адресного закрытия не выполняли.
Позднее свежая admin inventory показала только собственную admin-сессию и
отсутствие всех user-сессий; после проверки own процессов и nonce архивирован
только monthly guard. Evidence: `monthly-profile-recovery-attestation.json`.
Пользователь затем поручил самостоятельно устранять блокеры; принято решение
о минимальном TDD-исправлении runtime и новой сопоставимой паре, описанной выше.
Исходные frozen payload/pins и первоначальные evidence не изменены.

Не проверены live explicit-js/tags/recovery, candidate no-JS 18/18, сравнение
oracle-pass всей серии и обязательное содержательное review. Не проверены
Desktop/natural activation и cold reuse tags. Итоговая приёмка не заявляется.


## Checkpoint: private artifact delivery и обязательная Sort-ветвь

Proof8 остановился до Import/Group/Export: original result45f825bc…/exit3/
cleanupfalse сохранён. CSV prepared/upload/checkpoint совпадают (27bytes/
SHA c5235fe2…); private navigation shim ошибочно требует standalone frame
у artifact download wrapper. Offline pinned generator воспроизводит
PINNED_WORKSPACE_CODE_MISMATCH до browser send; непосредственно записан
BROWSER_CALL_UNCERTAIN. Это не доказательство Product Export regression.
Proof9 сохраняет обязательные JS→Group и прямой JS→Sort→ExportSort,
full JS before/after, afterproducer read и CSV/5nodes4links. Дополнительный
ExportGroup для этого gate не требуется; его прежний failure остаётся аномалией.
Independent proof9 review8e2d847c… Approved, preview-only override byteequal7,
60source/32fixtures/104protected match; ошибочного navigation shim здесь нет.
Обе private fixtures diagnostic/nonacceptance; обычная rebuilt проверка обязательна.
Independent delivery review7030b977… подтвердил private shim failure; source
правка не нужна. Strict ownership user97 не установлена, сессия сохранена;
ownadmin98 logout/MCPexit0 подтверждены. Это не recoveryPASS: originalfalse
остаётся. Root proof9 запущен отдельно после fresh no.writer/deadoldruntime/
60+32hash checks/newstate+chat+browser; independent review разрешает эту
изоляцию без изменения user97. Model calls по паре203142 остаются0.
Условная новая matched пара225648-cc76ca собирается параллельно на общем
committed source3a33edcae8; текущий stopped pointer192418 не меняется.

Proof9 original0547cd7e…/root7470exit3: Group/directSort/Save прошли,
обязательный ExportSort AMBIGUOUS/input_mapping до CSV. Cleanup/logout/ACKfalse
сохранены. LastSave036 readback f4313494… подтвердил полное равенство JS
component/source/declaredschema после обеих ветвей; это не CSV/finalgate.
Теперь Export blocker воспроизведён на обязательной ветви; нужен bounded readonly
capture точного native predicate перед surgical TDD fix. Product guards/skill
не менять по предположениям. Пара225648 source3a33/runtimef262e52c… собрана/
bothverify0, но остаётся условной: commonruntime fix потребует следующую пару
и полные18+25. Ownproof9 recovery independently48163591… подтверждён:
строго bound user99 closed/admin100logout/MCPexit0, unknownuser97 сохранён.
44raw/60source/4397runtime unchanged; full savedJS before/after равен.
Pair225648 independent43b494ad…/pins3b56a9b3… Approved после mode0400 freeze,
0models/0outcomes. Static Product/primaryaudit783c7650… Approved; runner/graph
в этом review имеют self-review limitation и проверяются отдельно.
Proof10 readonly capture дополнен exact rawcrumbset/effective labels/полным
predicate и bounded projection; verification4957c301…/review9f466a29… Approved,
62source/37fixtures/132historical hashes match,19tests/typecheck/syntax PASS.
Root81926 live запущен после ready/status-only activation72c602c4…;
моделей0, guards/source/pins unchanged. Это diagnosis, не ordinary acceptance.


Proof10 original468c4235…/root81926exit3 изолировал exact caption conjunct:
final export-sort:n5 имеет verified own native input logical0/native_index1;
unique/bounded/chain/icons=true, exact=false. Hidden crumb7 raw «Источник данных»
получил effectiveLabel пустую/hiddenCaption=false, а crumb8 «Настройка» распознан.
Old workspaceUI80d27… принимает длинную «Входной источник данных», но не actual
короткую подпись. Surgical TDD fix ограничен этой подписью verified prepared port0;
owner/native/chain/icons/sensitivity/uniqueness и publicJSdeny сохраняются.
Rootownuser101 строго bound41b9b3a8… и адресноclosed/admin102logout/MCPexit0;
originalcleanupfalse сохранён. Неизвестный user97 завершил сам сервер по timeout
23:19:16Z; root его не закрывал и ownership не утверждает. LastSave036 readback
7f377888… подтвердил full savedJScomponent/source/schema equal после Group/Sort.
Sourcefix ещё не завершён; commonruntime change потребует новой matched пары и18+25.

Source Export caption fix завершён: workspaceUI1d7f27a7… содержит один alias
для verified logical input0; actualfixturea2f562ad…/test994249ab… дали RED→GREEN
и15negativevariants.350focusedPASS/verificationa8fc54e1…, independent09e5c7f9…
Approved. Root pinnedNode24.19 fullupstream3830tests/3820PASS/0FAIL/10SKIP/exit0,
verificationc67cde34…; три source hashes проверены повторно после suite.
Proof10 recovery independentlyf85a02cf… подтверждён,1993raw/4729resources unchanged,
full savedJScomponent equal; currentworkspaceUI изменён только намеренной правкой,
old80d27immutable цел. Ordinary rebuilt nativeExport/CSV и новая matched18+25
по-прежнему обязательны. Sourcefix не меняет skill/policy/Protocol/publicJSdeny.


Новая matched пара233119-4699a5 source41101ae0b2/runtimebf2fd06b… собрана/
bothverify0 и independently Approved pair130d7d7f…/pins791829db… . Pins6944fa22…/
8ceb74b8…/locke2776d98…/provenancefd1ec5a5… frozen0400;72+2/model/seed/tasks/
43slots unchanged,0models/0oldoutcome transfers. OrdinaryJS root72815exit0,
result507286da…: оба native Group/directSort, ExportSortCSV/5nodes4links,
fullsavedJSsource/component/schema unchanged, publicgenericJSdeny и actual
packageclose/logout/shutdown confirmed. Независимый live review ещёpending.
OrdinaryJoin root22971 running после e6d39d2a… preflight; newrawhiddenDOM capture
не заявляется — проверяются nativeopening ACK/preparedrole context/граф/oracle.
Freshschema probe67472exit0/15standard schemas,0c2166c3… result; actualprepare16
изordinaryJS связан в gap prerequisitef958175b… разныхSession той же immutable
сборки. ProbeexplicitLogout=false сохранён, не подменяется ACK; gapreviewpending.
Current-run192418 остаётся stopped доordinarygates; полные18+25 не запускались.
