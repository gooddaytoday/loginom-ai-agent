# Renamed JavaScript graph controls — source78 investigation and bounded correction

Статус: Fix79 реализован в source `6d8b16e8c230ff5ea98ea8f4377a5cff66c34d8d`, root regression PASS (2472 client pass/10 skip,1292 main+3deny+11Python). Empty02 live запущен; результат ещё не принят. Ниже сохранены исходное обоснование и условия реализации.
Source78 HEAD `66f0ad6e732fd9e9f717284d3bf93a2c9cbcafc1`.

## Установленная причина

`native-cardinality-empty-probe-01` остановился на `Private native Preview: exact denied output control`.
В journal lines585/586 один и тот же verified prepared node GUID
`92a4b75f-3aaa-4bf9-9e8a-1a218153c817` имеет актуальный TID
`MF;TF-1;Graph;JS:_Value`; Output_Data-0 видим/enabled, scope=graph,
kind=port, native output active=true. Его `allowed_actions` равны
`[click,double_click,right_click,press,drag]`.
Исходный owned_node в report имеет label JavaScript и native icon
`bg-vendor-icon-javascript`; после Done/Execute журнал показывает label `JS: Value`.
Это наблюдённая смена label/TID. Какой именно vendor callback её произвёл,
по этим данным не установлено и для исправления не требуется.

Причинная цепочка в текущем source:

- [workspace-ui.mjs:446](../../../../.worktrees/node-javascript/packages/loginom-runtime/client/lib/workspace-ui.mjs#L446):
  `controlCodeIdentity` возвращает name/id/TID; native type туда не входит.
- [workspace-ui.mjs:465](../../../../.worktrees/node-javascript/packages/loginom-runtime/client/lib/workspace-ui.mjs#L465):
  script deny — regex `script|javascript|python|codeeditor` с границами слов.
  `JS:_Value` ему не соответствует. Расширять regex на `JS` недостаточно:
  пользовательское имя может быть любым.
- [workspace-ui.mjs:2643](../../../../.worktrees/node-javascript/packages/loginom-runtime/client/lib/workspace-ui.mjs#L2643)
  и [2772](../../../../.worktrees/node-javascript/packages/loginom-runtime/client/lib/workspace-ui.mjs#L2772):
  enabled+identity+!dangerous допускают generic actions для этого port.
- [javascript-native-roundtrip-opening.mjs:89](../../../../.worktrees/node-javascript/packages/loginom-runtime/tools/loginom-acceptance/javascript-native-roundtrip-opening.mjs#L89)
  требует exact denied control с пустым allowed_actions. Отказ происходит
  до binding/intent loop, native inspect, click и F3. Private guard сработал правильно.
- [workspace-ui.test.mjs:5189](../../../../.worktrees/node-javascript/packages/loginom-runtime/client/test/workspace-ui.test.mjs#L5189)
  проверяет только TID с буквальным `JavaScript`, без native graph owner.
  Поэтому прежний deny-test не обнаруживал зависимость от имени.

Из текущего файла извлечён и выполнен именно regex guard: JavaScript → true,
JS:_Value/Summary/Текстовый_файл → false. Это offline source probe, не live/UI тест.
Не утверждается, что public click/F3 был реально выполнен: evidence показывает
выданные действия и превентивный private отказ.

## Доступная authoritative identity

Имя, DOM class или портовая иконка не определяют vendor узла. Нужна цепочка
active native ModelForm → FDiagram/FmxGraph → exact owned container →
FNodes.FCollection → node.FCell → renderer state → DOM и cached node.FIconCls.

Уже реализованные источники:

- [node-context.mjs:47](../../../../.worktrees/node-javascript/packages/loginom-runtime/client/lib/node-context.mjs#L47):
  prepared package/workflow/GUID, ModelForm, bounded nodes≤200, same graph.container,
  `view.getState(node.FCell).shape.node` и scoped unique DOM.
- [node-target-browser.mjs:33](../../../../.worktrees/node-javascript/packages/loginom-runtime/client/lib/node-target-browser.mjs#L33):
  native graph/container binding; [48](../../../../.worktrees/node-javascript/packages/loginom-runtime/client/lib/node-target-browser.mjs#L48) —
  node cell/rendered shape; [54](../../../../.worktrees/node-javascript/packages/loginom-runtime/client/lib/node-target-browser.mjs#L54) —
  exact label cell/parent/rendered text; [62](../../../../.worktrees/node-javascript/packages/loginom-runtime/client/lib/node-target-browser.mjs#L62) —
  существующая классификация vendor по **native FIconCls**; далее native port cells.
- [node-output-context.mjs:20](../../../../.worktrees/node-javascript/packages/loginom-runtime/client/lib/node-output-context.mjs#L20):
  bounded port groups≤16/ports≤100, native FCell→shape, scoped unique port DOM/GUID.
- [javascript-native-roundtrip-owner.mjs:63](../../../../.worktrees/node-javascript/packages/loginom-runtime/tools/loginom-acceptance/javascript-native-roundtrip-owner.mjs#L63),
  [95](../../../../.worktrees/node-javascript/packages/loginom-runtime/tools/loginom-acceptance/javascript-native-roundtrip-owner.mjs#L95):
  fixed JS admission uses FGuid+`bg-vendor-icon-javascript`, затем удерживает
  node/data/cell/GUID/icon/ports. Переименование не меняет эту identity.
- [workspace-ui.mjs:2443](../../../../.worktrees/node-javascript/packages/loginom-runtime/client/lib/workspace-ui.mjs#L2443):
  graph label keys могут содержать `;`; нельзя брать первый split token.
- [workspace-ui.mjs:3274](../../../../.worktrees/node-javascript/packages/loginom-runtime/client/lib/workspace-ui.mjs#L3274):
  act проверяет свежие current.allowed_actions до получения gesture handle.
  Исправление общей observation-классификации действует и на повторную act-проверку.

Нельзя использовать `__loginomJavascriptNativeRoundtripV1` как public classifier:
это private capability, которой не обязано быть у обычного public observation.
Нельзя dereference RPC model/vendor/data proxy для определения типа.

## Предлагаемое исправление

В serialized workspace observer добавить один bounded native-derived classifier
для **node-owned graph controls**; применять его как дополнительный deny к
существующему dangerous/allowed, одинаково при observe и fresh act observation.
Старые sensitive/editor/URL/file/script-name ограничения сохраняются.

1. Один read-only native inventory на observation с действующим charge/time/work
   budget: exact active ModelForm и `graph.container===graphContainer`, nodes≤200,
   dense local collections, unique native cell/GUID и renderer associations.
   Prepared context, если задан, остаётся дополнительным обязательным guard;
   без него generic observation всё равно связывает текущий native graph/DOM.
2. Для exact bound node `FIconCls==='bg-vendor-icon-javascript'` означает denied
   JavaScript независимо от label. Другой **наблюдённый** корректный native icon
   означает non-JS только для этой дополнительной проверки: существующие запреты
   по-прежнему могут отказать. Missing/accessor/ambiguous owner/icon не считать non-JS.
3. Для body/label и каждого port сопоставить actual native cell с actual renderer
   element; port.parent===node и port.FCell.parent===node.FCell обязательны.
   Setting/Visualizers связывать только с полной текущей native node TID и unique
   scoped affordance, как существующий private selection code, без split по `;`.
   Не распространять классификацию через произвольное DOM containment или
   похожий label. Duplicate/foreign same-TID и substituted cells — unconfirmed.
4. Для связанного JS owner выдавать `allowed_actions=[]` для этих graph controls,
   включая renamed output. Для относящегося к этому scope, но unconfirmed owner —
   fail-closed actions[], не fallback на отсутствие слова JavaScript. Denial не
   удаляет контроль из inventory: private wrapper нужны kind/scope/enabled/visible.
   При подтверждённом non-JS сохранять прежние actions, не добавляя новых.
5. Retain native identities только внутри observation; наружу при необходимости
   bounded reason/status, без native handles. Новый scan не доверяет вчерашнему
   типу: reclassification должна отказать до gesture при замене node/port/owner.
   Чтение cached own descriptors не вызывает getters, vendor/model methods или RPC;
   renderer read APIs остаются теми же проверенными getState/getActiveTab.

Scope — workspace node body/label/Setting/Visualizers/ports и их generic actions.
Не менять typed prepared execution/cleanup, global toolbar, graph background,
process controls, storage, wizard fields или другие execution authorities.
Incident links/прочие маршруты не объявляются этим proposal полностью проверенными;
он не является полным security audit всех graph действий. Старый lexical deny
на них остаётся. Если реализация потребует расширить этот scope, вынести это
отдельно в root review, не маскировать как исправление output port.

**Private opening оставить строгим:** guard allowed_actions=[] не удалять и не
заменять на «любой port». Сохранить native completed/source/Done/deadline/own
port checks, exact ACK, hit-test, one click/F3 и отсутствие replay. После корректной
public classification renamed port пройдёт этот прежний guard. Не переименовывать
узел обратно, не добавлять case-specific JS:_Value allowlist, не делать public
script execution разрешённым и не менять declared-empty source/zero admission.

Fail-closed native scope — намеренное сужение прав при отсутствии доказанной
identity. Оно потребует обновить DOM-only graph fixtures до настоящей native
связки; нельзя заставлять tests проходить через bypass для отсутствующего native
model. Глобальные/неграфовые fixtures не должны затрагиваться.

## Проверки после отдельного разрешения реализации

- Production serialized workspace observe **и act**: один native JS owner с
  label JavaScript, JS: Value, Summary и кириллицей/`;`; output/input, body/label,
  Setting/Visualizers получают actions[]. Click/F3/double_click/drag запрещены
  до первого mouse/keyboard события, в том числе с подставленным старым allow snapshot.
- Genuine native non-JS import/calculator с теми же нейтральными labels остаются
  actionable по старым правилам. Native non-JS с буквальным JavaScript в TID
  остаётся denied прежним regex: proposal не отменяет старые ограничения.
- Native owner missing/wrong ModelForm/foreign container, duplicate node/GUID/TID,
  missing/accessor icon, replaced node/port/cell/parent/rendered DOM, inactive
  cached graph с тем же TID, incomplete/holey/oversized collections — refusal,
  bounded work, zero getters/RPC/gesture. Подтверждённый non-JS → JS между
  observation и act должен отменить старый actionable ref.
- Production private opening с renamed native JS: observation actions[] → прежние
  prepare/select/F3 и ACK; fake nonempty actions по-прежнему отказывают до intent.
  Native/source/execution drift и lost reply сохраняют запрет replay.
- Полный workspace-ui suite, прежние три deny-tests, весь JavaScript + collapse-native
  + variant-native и Python fixtures. Syntax/diff-check и новый source freeze.
  Нужен новый private integration test, питающий wrapper результатом реального
  workspace classifier, а не вручную заданным allowed_actions=[].
- Только после root source/pins review — fresh headed declared-empty attempt.
  Успех этого исправления сам не докажет native zero-cache shape: дальше возможен
  отдельный отказ zero admission. INPUT3/OUTPUT0/schema1/upstream3 и cleanup
  должны быть независимо подтверждены. G5/J01–J27 не закрываются.

Предполагаемые implementation files: `client/lib/workspace-ui.mjs`,
`client/test/workspace-ui.test.mjs`, private opening/integration tests
(`tools/loginom-acceptance/javascript-native-roundtrip-opening.test.mjs`).
Runtime private opening менять для обхода guard не требуется.

## Evidence и границы этого хода

Campaign: `/home/george/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu`.

- `native-cardinality-empty-probe-01/report.json` SHA256:
  `6d0ec9bd84712b3149aff2d46395cf0f1dd31ab3479758e8596bdf0dfb97a100`.
- `native-cardinality-empty-probe-01/execution-events.jsonl` SHA256:
  `f681ef42492e60535a97429ae9f53c0648556bc3e23fc500eb7b772dba6a7073`;
  непосредственно прочитаны relevant observations lines585/586.
- Root `native-cardinality-empty-probe-01-failure-verification.json` SHA256:
  `8ad0e225f1a5b59d1aa3e824b1ae56f710c5aad36472dae9c4af41be797e6369`.
  Его результаты:3 INPUT cells,586 refs,195pins; UI declaration и own completed JS
  подтверждены, OUTPUT NOT_PUBLISHED/upstream NOT_RUN, cleanup ALL_PASS.
  Полный независимый аудит586refs в этом ходе не повторялся.

Проверено непосредственно: report hash, journal observation, source причинная
цепочка/regex и неизменность всех195 source78 pins. Только этот новый документ
записан; runtime/tests/config/evidence/checkpoint, browser и commits не затронуты.

## Root review и назначение Fix79

Root повторно прочитал реальный report/последний owned observation, strict opening
precondition, workspace dangerous/allowed path, native readGraph и существующий
deny-test. Причинная цепочка подтверждена; изменения разрешены в прежней задаче.
Scope дополнительного deny принят: node-owned body/label/Setting/Visualizers/data
ports. Typed execution/cleanup, toolbar и private opening guard не расширяются.

Уточнения реализации:

- Не считать корректный service AddPort обычным data port и не требовать от него
  несуществующий data-port GUID/индекс. Отдельно покрыть фактически известный JS
  layout data0 + AddPort. Не превращать один допустимый service element в отказ
  всего native graph inventory; при неоднозначной привязке конкретного контрола
  действия этого контрола остаются запрещены. Другие подтверждённые non-JS узлы
  не должны терять действия из-за имени/служебного порта соседнего JS.
- Не вызывать getters/RPC или mutation из classifier. Scan bounded, один на
  observation, с существующими work/time limits. Native evidence не заменяется
  DOM class, label или private capability.
- Проверить observe и fresh act, в том числе valid old non-JS allow snapshot →
  current JS owner, owner/port replacement, same-TID foreign controls и labels
  с `;`. Нужен actual classifier → private opening integration, не готовый
  synthetic allowed_actions=[] вместо production classification.
- Дополнительно к полной workspace-ui и JS/native/Python регрессии выполнить
  **весь client/test/*.test.mjs** на pinned Node из client package (ограничить
  test concurrency при необходимости). Это общее изменение UI; проверить
  действительные ошибки, не переписывать ожидания без продуктового основания.
- Новый freeze79 включает изменённые production/test files и доказуемый closure;
  исходный source78 и неуспешный empty01 остаются историческими evidence.

Root выполняет независимые проверки/commit и следующий single headed run в
зарезервированном fresh profile63. Developer не запускает браузер, не меняет
private campaign/config и не коммитит. Эти промежуточные source reviews не
подменяют предусмотренный планом один итоговый этап ревью готового handler.


## Диагностика отказа source79 на empty02

Live empty02 не достиг JS: обычный NativeInput body классифицирован unconfirmed,
действия запрещены. Source-only сверка локализовала отказ в ready(click), но не
установила конкретное звено own-descriptor цепочки. Изменять guard без этой
проверки оснований нет.

Следующий шаг — private диагностический отчёт на failure prepare-typed-input.
Он привязан к последнему durable node_observation_completed с verified graph
context; выполняется до существующей очистки, не заменяет исходный отказ.
Вместо повтора действия или ослабления классификации выбран один read-only
проход по фиксированным свойствам: descriptor kind/depth/type, model/container,
плотность nodes, GUID/cell/icon predicates, renderer/DOM uniqueness. Значения
произвольных полей, функции, секреты и handles не публикуются. Геттеры не
вызываются, обход прототипов и коллекций ограничен. Недоступность диагностики
отделяется от доказанного отказа classifier; её дополнительные ограничения
не выдаются за продуктовую причину. Никаких новых жестов, RPC, retry или ожиданий.

Проверки: actual serialized diagnostic function, отсутствующие/inherited/data/
accessor descriptors без вызова getter, holey collection, неверные container и
renderer, gated failure integration с сохранением исходного error/cleanup.
Root выделил profile64; browser CLOSED. Live только после source freeze и
независимых тестов, DISPLAY=:1/headed/sandbox. Полный empty roundtrip/G5 не принят.
