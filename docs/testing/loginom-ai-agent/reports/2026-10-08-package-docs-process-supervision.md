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

Основная сессия выполнила шесть последовательных узких SIGINT runs:3 mutable и
3 frozen d1b364a98, каждый2 PASS/0 FAIL/13 assertions/exit0. Проверены все шесть
logs/metadata в `infra-sigint-main-host-signal-20261008`; эти два исходных отказа
отдельно не воспроизвелись. Коллектор получил для соседней writer/helper пары
3+3 runs exit0 в своей среде. Его HTTP/SIGINT runs отказали раньше тестируемого
поведения на listen/EADDRINUSE; они отделены от результатов основной сессии.
Full-suite order/environment impact и владельцы problematic PIDs остаются UNKNOWN.
Ничьи assertions, ownership checks или retries ради PASS не ослаблялись.

Диагностическая подзадача закреплена own harness SHA
`b4661a7b68fbad21726bd4d922a8c659165f8b11`. Полный
suite остаётся исторически FAILED; source frozen для новой live-пары пока не
создан. Следующий допуск требует чистого полного прогона и одинаковых условий
baseline/candidate. Новых live/model/judge запусков в этой подзадаче не было.

После окончания всех узких repeats запущен один чистый полный suite на b466;
exec session99064, log `diagnostic-context-clean-suite-b4661a7b6.log`.
Результат пока ожидается, PASS ему не присвоен. Все37 файлов collector signal
скопированы с exact bytes verification в `infra-sigint-collector-signal-20261008`;
report SHA256 `6f64c0dce5884430140cb07265ea1cfed4345f5787e0dec1b15605affba00811`.
В исходном collector report main-host snapshot ограничен первыми четырьмя runs;
полные шесть подтверждены основной сессией отдельно, исходный report не переписан.

Чистый suite session99064 завершён exit0:481 PASS/2 SKIP/0 FAIL/2056 assertions,
579.40s. Его три ранее упавших теста прошли, но причина прежнего отказа остаётся
UNKNOWN; прежний log478/2/3 сохранён. Frozen worktree
`/home/kiselev/.codex/worktrees/skills-evals-inspection/loginom-ai-agent`
создан на b466; frozen typecheck PASS, git status clean, protected diff0 против
свежепрочитанного `evals` b31ebe7d0bf5cd2cb1116ccdb90df65cd8578c2c.

`ab-conditions-inspection-20261008/common.json` SHA256
`c07c876e618383b6428beb24f16819aba80c5c68f92d4c22a2f0dfb7564c4dd0`:
658 tracked harness files,281 task files,21 adapters; оба полных build inventories
5389/5651 и исходные15 задач повторно проверены. Модели и судья прежние.
Новая пара v6 не смешивается с неполной v5. Baseline smoke v6 выполняется,
session14241; formal attempts0. Native structure/cold и candidate ещё не приняты.

После exact current closure и сохранения storage bytes свой сервер перезапущен;
штатный `cleanupIsolatedStorage` b466 очистил только его фиксированные roots.
В прежнем snapshot был нулевой `.lck`, который исчез до byte-check; этот первый
check FAIL сохранён по описанию, после него server reset уже был выполнен.
Свежий snapshot и повторная current closure проверены отдельно перед очисткой.
Исходные server/client и старый formal cleanup FAIL не изменялись.

Диск перед smoke: меньше1GiB. Три точных duplicate obsolete CLI build contexts
объединены hard links с сохранёнными originals после SHA/UID/mode/inode checks;
после операции paths/bytes/modes подтверждены. Receipt `build-context-dedupe-20261008`,
905448921 bytes потенциально освобождены, свободно около1.8GiB. Baseline/current
candidate payloads, старые builds и результаты сохранены; `/tmp` не очищался.

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
