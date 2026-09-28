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
