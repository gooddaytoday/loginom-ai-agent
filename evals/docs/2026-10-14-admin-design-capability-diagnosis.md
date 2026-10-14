# Bootstrap admin: design capability и незавершённый dispose

Pinned-candidate research login подтверждает IsAdmin=true и IsDesigner=false.
Read-only inspect сохраняет оба boolean в private session-observations.json;
они не разрешают session close/delete. Production qualification остаётся false.

TDD: target test сначала отказал на отсутствующем ownSession.isAdmin;
после getter read-back и проверки schema — 1 PASS/17 assertions (6.42s).
Evidence: research/controller/admin-gpjKZY/session-observations.json.
Combined admin integration/unit/preflight: 48 PASS/133 assertions (36.27s),
bun typecheck и git diff --check PASS; повторное native evidence admin-wQR2Fz.

Исследовательский CreatePackage probe ошибочно использовал management-only
bootstrap account. Пакетный probe отказал на CREATE; отдельный read-back права
IsDesigner=false дал ADMIN_PROBE_DESIGN_DISABLED, dispose confirmed (6.49s).
Studio MainMenuForm.js:94–102 также проверяет IsDesigner перед созданием пакета.
Экспериментальная команда удалена из production API/driver; allowlist не расширен.
Для причинной связи Session↔managed row нужен подготовленный design user;
права bootstrap администратора не изменялись. Package ownership не доказан.

Один предшествующий live запуск admin-fYV8vv завершился test timeout90s после
probe unknown/dispose confirmed. Connection receipt остался ready; это не
подтверждённый cleanup. Matching retained launcher capsule содержит CLI exit0,
но отсутствующий сейчас PID не доказывает отсутствие процесса в момент таймаута.

diagnose-fix-tests: пять локальных channel/supervisor tests×3 — 15 PASS/63 assertions.
Два actual bundled Node/private pipe probes с текущим и переставленным порядком
await дали exit0, confirmed cleanup/capture и final00 за534/528ms.
Hang не воспроизведён; изменение порядка await не обосновано. Поздний повтор
live design-refusal и read-only target завершились, но причина исторического
hang остаётся открытой. Full harness suite в этой проверке не запускалась.

Private evidence: /tmp/evals-admin-pipe-local-signal-xblnrn3n.json и
/tmp/evals-admin-pipe-order-probe-ssi9rmfn/report.json (0600). Retained incident
journals/profiles сохраняются; общая очистка и ручные process signals не выполнялись.
