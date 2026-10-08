# Диагностика отказа process supervision

Formal v5 остановлен на13/45 baseline attempts; candidate не запускался.
`slow-supplier-deliveries#1` analytic PASS100 сохранён, но process cleanup FAIL
не позволяет принять попытку или полную пару. Исходные результаты не менялись.

Первопричина native отказа UNKNOWN: generic catch потерял errno и операцию
чтения PID4050199. Нет стабильного воспроизведения, доказанного breaking commit
или подтверждённой flaky-классификации. Поэтому bisect и расширение retries
не выполнялись. Read-only signal и три offline guard runs описаны в
[отчёте harness](2026-10-08-package-docs-harness.md).

В собственном mutable worktree `skills-harness` изменён только диагностический
текст отказа `process-supervisor.ts`: фиксированная операция `/proc`, проверенный
errno, номер попытки, relevance и UTC-время. Аргументы процессов, cwd, env и raw
errors не выводятся. Число retries, обработка исчезнувшего процесса и проверки
birth/executable/UID/ownership не менялись; unreadable процесс не получает сигнал.
Существующее поле cleanup.error сохраняет контекст; schema/score/oracle/judge,
near-miss и задачи не меняются. Frozen d1b364a98 не редактировался.

TDD: реальный собственный non-dumpable child через публичный `signalProcess`
дал RED (старое сообщение без контекста), затем GREEN (sanitized context и отказ).
Добавлена проверка сохранения контекста в публичном `superviseProcess` cleanup.
Модуль19 PASS/0 FAIL/88 assertions; typecheck PASS. Полный suite после
окончательных assertions завершён exit1:478 PASS/2 SKIP/3 FAIL/2037 assertions,
583.42s. Два отказа — CLI SIGINT/infra retry; третий — native writer integration.
Read-only collector начал последовательные узкие повторы на mutable/frozen SHA
после завершения suite, без одновременных process-supervision запусков.
Это улучшение диагностики,
а не исправление недоказанной native причины и не подтверждение прежнего cleanup.

Третий отказ уже сохранил новый контекст: PID4163665, `exe.readlink`, `EACCES`,
attempt3/relevant=true, `2026-10-08T20:13:59.634Z`. Это отказ чтения identity
после bounded retries; владельца PID и связь с прежним native FAIL это не доказывает.
Первый запуск модуля19/19 PASS против полного suite FAIL требует проверки
влияния соседних fixtures; утверждать regression/flaky до этой проверки нельзя.

Evidence: `formal-v5-process-identity-signal-20261008/diagnostic-context-{red,green,
module,typecheck,suite}.log` в приватном acceptance-каталоге. Текущая read-only
проверка: own refs0, writer absent, pending absent, recovery files0; старый FAIL
остаётся. Attempt13/profile не очищались. Новый live pair требует нового чистого
frozen SHA, одинаковых условий обеих сборок и проверки локального стенда.

Дополнительно после exact ID/name/owner-label/no-mount/marker guards read-only
сохранён snapshot своего сервера `own-storage-at-stop.tar`:20480 bytes, SHA256
`bf28cd68954ad64343581b70febb415b40fe9d5281be8dd56912e671691dd3a2`.
Он не восстанавливался и не использовался для удаления исходных файлов;
это сохранение bytes, а не подтверждение cleanup или полного roundtrip.
