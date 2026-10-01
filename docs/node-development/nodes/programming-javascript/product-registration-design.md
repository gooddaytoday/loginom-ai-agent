# JavaScript: продуктовая регистрация общего lifecycle

Scope — уже согласованное ядро plan.md, не новая функция модели. General
lifecycle-v5 source73a8 проверен new/existing Execute и saved Done/Close;
operatorfecbc подтверждён standalone new Done2/2. Fixed B/private operators
остаются acceptance sources; их нельзя регистрировать в продукте.

Выбран существующий createJavascriptCodeNodeSupport в node-support.mjs и его
штатный driver factory. Альтернативы — registration fixed trial либо второй
writer — нарушают границы fixture/ownership и дублируют implementation. General
handler получает только targetOrigin, targetBuild и redactor; internal forced
native details probe не передаётся. Bridge передаёт свой redactor с known secrets;
при source-only callers без redactor используется обычный createRedactor(),
без identity fallback. JS support добавляется только при targetBuild=7.4.2 и
заданном targetOrigin: offline/другой build не рекламирует validated JS и не
ломает остальные handlers. Constructor/dependency guards общего JS неизменны.

Проверить product registry/actual describe+knowledge/preflight/driver routing
для code/declared/new/existing/Done/Close/Execute и отсутствие operator imports,
fixture pin/forced-details. Неверный build, отсутствие origin, unsupported scopes
и module policy должны отказать до effects; остальные14 handlers сохраняются.
Адресные tests, полный client suite для затронутых registry/bridge и provenance
mapped files обязательны. Source registry не является выпуском или CLI-приёмкой;
canonical registry readiness повышать только после подтверждённой приёмки, не по
появлению handler в разработческом child. После source readiness — один same-task
Astra/medium review, исправления, immutable candidate/J01/J21/J27 и Sol CLI.
