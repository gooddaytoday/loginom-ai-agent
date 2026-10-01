# JavaScript: синтаксический допуск исходника

Решение source98, 2026-09-28. Реализует часть §1A/J26 согласованного plan.md.
Основа: source97 `3d922b5f4a8e731191dcbbb2e5fdce92270c392b`.

## Выбор и границы

Использовать Acorn 8.15.0 как прямую production dependency runtime/client,
согласовав package.json/package-lock.json. Та же версия уже закреплена в
loginom-host; его dependency не является доступностью в отдельном runtime.
Regex не отличает синтаксис от литералов; самостоятельный lexer/parser
добавляет неподтверждённую грамматику. Код не исполняется для проверки.
Официальный контракт parse/ESTree и strict module syntax:
https://github.com/acornjs/acorn/tree/8.15.0/acorn#interface

Парсить весь исходник как module с фиксированным ecmaVersion:2025, без
allowImportExportEverywhere/allowReturnOutsideFunction и parser plugins.
Это синтаксический фильтр, не профиль ChakraCore и не sandbox.
Сначала применить javascriptSourceIdentity:32KiB UTF8/1024LF, без CR/NUL и
одиноких surrogates. Пустой исходник допустим. Parser failure/stack exhaustion
даёт отдельный bounded preflight refusal, не разрешение по умолчанию.

Разрешён ровно decoded module specifier builtIn/Data у static import и
re-export; никакой нормализации регистра/пути. Все остальные module specifiers,
ImportExpression и прямой CallExpression с callee Identifier require запрещены
(также escaped identifier, parentheses и optional call). Shadowed require
также отвергается по синтаксическому контракту. Member/alias/indirect calls
не анализируются как sandbox; не обещать отсутствия косвенных эффектов.
Обход включает executable template substitutions, computed keys, defaults,
вложенные функции и optional chains; plain template/string/comment не считаются
импортами. AST не отдаётся модели и не журналируется; отказ содержит bounded
reason/location без исходника, parser message и секретов. Успех привязан к raw
source SHA256/bytes/lines и версии policy/parser. Обход предпочтительно iterative.

## Effective source и включение в lifecycle

Новый узел: перед созданием проверить переданный source_text.
Existing: сначала полностью прочесть своим source97 reader и закрыть черновик;
для замены сверить expected_source_sha256 с текущим исходником, затем проверить
новый текст. При omitted source (включая {} и synthetic output-read) проверить
именно полный прочитанный текст; пустая строка означает замену, не omission.
Перед materialization/Execute перечитать и проверить digest/policy того же
owner и оригинальный deadline. Drift — отказ, не автоматическая новая попытка.
Навигация/Close могут быть UI effects: не маркировать их как отсутствие эффектов.

Текущий node-apply.mjs:source→workflow→target→input_mapping→open→configure.
Проверка только в configure слишком поздняя. До публичного включения требуется
выделить admission после наблюдения identity, но до prepareTarget/mapPorts
мутаций; перед finish/materialization второй boundary. Source98 добавляет
переиспользуемый host admission и проверяет его с реальным source reader через
adapter fixtures. Публичная маршрутизация остаётся выключенной до завершения
G1–G7. Эти тесты не закрывают общий shell/output-read integration и J26 целиком.

## Уточнённые точки включения по текущему коду

`executor.mjs` prepareTarget wrapper уже имеет `nodeApplyDrivers.beforeTarget`:
после verifyWorkflow и полного graph observe, до prepareNodeTarget. Это подходящая
точка для owned existing-source admission; новая generic phase не обязательна.
При её подключении сохранить учёт подтверждённых UI effects в refusal/cleanup.
Текущий wrapper возвращает effect_possible из targetPhase и имеет специальные
ветки для прежних preflight; нельзя потерять факт открытого/закрытого JS wizard.

`createNodeReadDrivers` создаёт отдельный набор drivers, а не оборачивает JS driver:
verifySource проверяет completed local receipt, wizard methods запрещены,
finishGraph сразу prepare/finishConfiguredGraph с fresh execute. Следовательно,
добавление beforeTarget только в JS apply driver не защитит output-read.
Для JS нужен отдельный обязательный admission/recheck в этом пути, без снятия
wizard-запрета для остальных типов. Source-read остаётся отдельным kind и ничего
не исполняет. Это source-review findings, не реализованные публичные гарантии.

## Уточнение после проверки реализации

Admission фиксирует параметры до первого await: изменение объекта вызывающей
стороной не меняет согласованный effective source/expected digest.
Для разрешённой смены настроек внутренний driver передаёт settingsTransition
с kind:replace и полным expected_after до начала admission. Этот объект
канонизируется/копируется/замораживается; его digest входит в receipt. Он
формируется доверенным driver из валидированного запроса и observed settings,
не выдаётся модели как обход проверки. Отсутствие transition сохраняет прежние
settings для existing; заданный transition требует observed post-state,
совпадающего с плановым. Произвольное изменение после mutation — отказ.
Generated schema нельзя заранее выдумывать в expected_after: сравниваются
доказанные настройки; фактическая generated schema читается после materialization.

После awaited mutation/effect-dispatch ACK повторно проверить actual source
и settings перед callback. ACK подтверждает запись журнала, не свежесть кода.
Final browser driver всё равно обязан проверить native owner/epoch и фактические
предусловия при dispatch; два отдельных UI вызова не дают атомарной защиты от
клика пользователя между ними. Не объявлять более сильную гарантию host helper.

## Проверки и packaging

Проверить positive/negative AST corpus, decoded strings, templates с imports
в substitutions, require variants, re-exports, malformed/unclassifiable input,
максимальные bytes/lines/depth, точные digest, отсутствие leakage/execute/eval.
Admission tests: new/missing/empty; existing omitted/replace/stale digest;
owner/deadline/source/settings drift; lost ACK; запрет mutation callback до
успешного source-read/Close и policy; повторный boundary с неизвестным текстом.
Не имитировать проход всего публичного shell тестом отдельного helper.

Проверить production npm ci в отдельной временной копии client manifest/lock
с --ignore-scripts --omit=dev --workspaces=false, разрешение Acorn из неё и
реальный parse. Не полагаться на monorepo node_modules. Смена runtime lock
требует новой runtimeLockSha256 в candidate release inputs и проверки staging;
не объявлять текущий release manifest совместимым с новым lock и не обновлять
исторические pins. Node/Chromium/Playwright не менять. Полная сборка и platform
acceptance остаются обязательными при подготовке итогового candidate.

Следующий шаг: source98 implementation в существующей задаче разработчика;
ROOT проверяет код, тесты и production dependency closure. Live на этом этапе
не нужен; следующий браузер — только headed с новым профилем115.

## Продолжение J26 на текущем runtime — 2026-10-01

На child276c новый текст уже проверяется в validate/verifySource и owned writer;
existing beforeTarget полностью читает/discard source до mappings/configuration.
Materialization и final Execute используют source admission с повторной проверкой
после dispatch ACK. Эти пути заново не разрабатывать. Пробел — synthetic output
`dock_node_read`: node-read-contract пока запрещает JavaScript, generic read driver
сразу выполняет узел без source admission.

Связать JS reread только с завершённым локальным результатом своего handler:
проверенные configuration readback/phase receipts, прежняя полная source identity
и retained mapping/schema. Модель передаёт лишь source_operation_id и bounded
read options; source binding формирует host. В beforeTarget прочесть/discard
полный preserved source, проверить policy и прежний digest; перед fresh Execute
повторить actual read/policy/settings под оригинальным deadline. При расхождении
не выполнять неизвестную редакцию. Драйвер сохраняет запрет configure/port
mapping/wizard commit; остальные узлы продолжают прежний read lifecycle.

Проверка идёт перед Execute, который обслуживает output-read. Дополнительный
Setting после него не является безопасным read-only guard: фактический
openManagedJavascriptExistingWizard допускает native deactivation confirmation.
Такое открытие могло бы разрушить активный результат. Финальный apply read уже
привязан к своему fresh final Execute и output port; чтение таблицы не получает
ещё один цикл Setting/Execute и не выдаётся за атомарную защиту от внешних edits.
Отдельный kind:source сохраняет существующий open/read/discard без Execute.

Локальные проверки должны покрыть retained JS receipts и schema при отсутствии
preview, forged/foreign/stale binding, preserved source с неподдержанным import,
source/settings drift перед dispatch, неоднозначный Close/ACK и запрет replay.
В фиксированных headed Code/Declared cases проверить public apply и отдельный
source-bound output reread, его собственный fresh Execute, typed output и source
после операции. Pure parser corpus отличает executable AST от comments/strings/
plain templates; source/direct и live уровни записывать отдельно. Это выполнение
утверждённого J26, а не регистрация candidate или объявление полного gate PASS.

### Реализация и direct проверка — child3b59423f1a

`node-read-contract` строит host source binding из локального SUCCEEDED apply:
configuration/readback, unique own phase IDs, completed materialization/final
Execute и полного retained mapping. Caller не задаёт reread source. JS routing
использует существующий `createNodeReadDrivers`; beforeTarget выполняет полный
owned read/discard, перед fresh Execute admission сравнивает исходную identity и
settings baseline, повторяя проверку после journal dispatch ACK. Source marker
сохраняется в diagnostic/user-v1 output; budget fence отказывает всему ответу
вместо обрезания строк. Финальное чтение apply остаётся связано с его fresh
Execute без дополнительного Setting.

`javascript_source_closed_check_refused` возникает только после verified
read/discard и exact ACK, когда callback текущей проверки ещё не отправлен.
Wrapper связывает его с own phase/node/deadline и сохраняет прежние эффекты;
эта квитанция не утверждает, что более ранних source writes/Execute не было.
Unknown read/Close/ACK/dispatch не становятся clean refusal. Обычный source
read и admission recheck используют прежний reader, без второй реализации.

Actual final addressed415, client3246PASS/10SKIP, operator18411PASS; все exit0.
Локальный corpus и actual public API boundary проверяют unsupported new/existing
source до browser/journal, inert comments/strings/templates, template substitutions,
receipt forgery/drift/unknown cleanup/no replay и actual serialized MCP budget.
Это не проверка полной ChakraCore grammar и не sandbox. Live подготовлен отдельно:
Code и Declared public apply, восемь preflight refusals, source-bound output
reread/новый owned Execute/full typed6×4/user-v1/same-ID delivery retry, final
source read и cleanup. Независимый oracle авторский; full tracked source,
auditor и negative checker закреплены private pin. Headed ещё не выполнен,
состояние и exact hashes — в актуальном checkpoint. Сохранённый unsupported
source/closed policy refusal доказан direct tests, не live editor injection.

### Headed public apply/refusals/reread — 2026-10-01

Code422 и Declared423 на immutable3b59423f1a завершились actual exit0/OBSERVED:
public apply13 verified phases,8public new/existing parameter preflight refusals
без editor/Execute/journal additions, output reread6 phases,3distinct owned
explicit Execute каждого, original source/configuration/retained physical port,
оба full typed6×4/user-v1, same-ID delivery retry без нового эффекта и independent
full source read. Журнал доказывает все full-source delivery с matching prior
discard, admissions/digest/settings/policy до и после dispatch ACK. PackageClose/
logout/browser/process absence подтверждены. Independent audit v3/PASS и14/14
counterfactual refusals каждого; v1/v2 auditor errors и исправления сохранены
отдельно, runtime/browser не переигрывались. Hashes/aggregate — в checkpoint.

Live проверяет public unsupported parameter preflight и effective source на
поддержанных apply/Execute/reread путях. Уже сохранённый unsupported source,
source/settings drift, closed policy refusal и unknown ACK/Close проверены
direct tests, без live editor injection. Candidate/CLI, native bytes, Save/cold,
full engine grammar, sandbox и атомарность против внешнего editor не заявлены.
