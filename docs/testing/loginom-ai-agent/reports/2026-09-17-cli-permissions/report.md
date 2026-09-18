# Native CLI: отказ в permission без скрытого одобрения

Linux x64, candidate 0.1.4-cli.202609180020, headless run, отдельный profile.
Driver `packages/loginom-host/script/cli-permission-acceptance.ts` использует
настоящий binary, configured Loginom и scripted provider, permission loginom_*=ask,
закрытый stdin и отсутствие --dangerously-skip-permissions.

PASS: `/tmp/loginom-cli-permission-VuNX3q`, log `/tmp/loginom-cli-permission-retry.log`.
Фактический tool_use loginom_dock_prepare имеет state=error; итоговый JSON error
CLI_PERMISSION_REJECTED; exit=1, guarded=false. Успешных tool_use нет.
Выводы проверены на отсутствие предоставленного API key. Host typecheck/diff check PASS.

Первая попытка `/tmp/loginom-cli-permission-6dTvgj` не засчитана: driver ошибочно
требовал следующий provider request после отказа и получил CLI_ORACLE_EXITED.
Driver исправлен: ранний выход допускается для сбора evidence, но PASS требует
всех перечисленных tool/error/exit/guard проверок. Повтор выполнен на новом profile.

Это частичный IND-11/12 для non-interactive run. TUI permission UI, явное одобрение,
private attachment admission и runtime mutation recovery остаются отдельными gates.

## TUI: видимый запрос и отказ через терминал

2026-09-18, тот же native candidate. Driver с `--tui` запускает настоящий PTY,
без skip-permissions, ждёт видимые Permission required/Reject и отправляет Escape.
После отказа выполняется обычный выход через Ctrl+D; следующий provider request
не требуется. Проверяется сохранённый tool part в SQLite после завершения.

PASS: `/tmp/loginom-cli-permission-OQjj6A`, log
`/tmp/loginom-cli-tui-permission-final.log`. permission_rejected=true,
forced=false, exit=0, guarded=false; ровно один Loginom tool, dock_prepare,
state=error. Выводы проверены на отсутствие предоставленного API key.
TUI exit=0 означает штатный выход интерфейса, не успех операции; run в аналогичном
случае ранее подтвердил CLI_PERMISSION_REJECTED/exit=1.

Первая TUI попытка `/tmp/loginom-cli-permission-a7rqjF` записала реальный отказ,
но driver ожидал новый provider request; оператор теста отправил SIGINT напрямую
своему CLI. Он завершился exit=0/guard=false/forced=false. Итоговый PASS выше
полностью повторён автоматическим исправленным driver на новом profile.
Host typecheck, Python AST и diff check PASS. Одобрение и более широкая
permissions/attachment matrix этим отказом не проверены.

## TUI: Allow once

2026-09-18, тот же candidate, отдельный profile; driver `--tui-allow <saved-package>`.
После видимого Permission required/Reject нажимается Enter на исходном Allow once;
skip-permissions отсутствует. Использован существующий пакет A без изменения/save.

PASS: `/tmp/loginom-cli-permission-baLPoW`, log `/tmp/loginom-cli-tui-allow.log`.
permission_approved=true, permission_rejected=false, forced=false, exit=0,
guarded=false. Один completed tool loginom_dock_prepare; receipt prepared=true
и workspace.package_ref.path равен ожидаемому saved path. Секрет не найден в
проверенных выводах. Host typecheck, Python AST и diff check PASS.

Этот запуск подтверждает выполнение после явного Allow once; срок действия
разрешения на следующем tool call и Allow always отдельно не проверялись.

## Allow once не одобряет следующий вызов

2026-09-18, driver `--tui-once-scope <saved-package>`, native 0.1.4-cli.202609180020.
После первого успешного prepare драйвер очищает только накопленный экранный буфер
наблюдения и ждёт acknowledgement своей PTY-команды reject-next. Второй prepare
отправляется с новым operation_id. Новый видимый permission prompt отклоняется Escape.

PASS: `/tmp/loginom-cli-permission-80hod8`, log `/tmp/loginom-cli-tui-once-scope.log`.
Первый dock_prepare completed (receipt проверен), второй dock_prepare error.
permission_approved=true, permission_rejected=true, forced=false,
exit=0/guard=false. Чтение SQLite упорядочено по time_created/id.
Host typecheck, Python AST и diff check PASS. Это подтверждает одноразовость
Allow once для следующего вызова того же инструмента в одной сессии.
Allow always и перенос разрешений между сессиями/перезапусками отдельно не проверены.

## TUI: Allow always в одной сессии

2026-09-18, тот же native candidate; `--tui-always <saved-package>`.
Драйвер выбирает Allow always стрелкой, отдельно подтверждает Confirm после
перерисовки. После первого prepare переключается в reject-next: любой новый
permission prompt был бы отклонён. Второй prepare с новым operation_id прошёл.

PASS: `/tmp/loginom-cli-permission-JljE8Q`, log `/tmp/loginom-cli-tui-always-retry.log`.
alwaysConfirmed=true/approved=true/rejected=false, два completed dock_prepare;
оба сохранённых receipts проверены: prepared=true и ожидаемый package_ref.path.
Exit=0/guard=false; Python AST/host typecheck/diff check PASS.

Первая попытка `/tmp/loginom-cli-permission-ZrSFrD` не подтвердила второй экран;
остановлена SIGINT непосредственно своему CLI, exit=0/forced=false. Она не PASS.
В повторном driver выбор и подтверждение разделены перерисовкой; приватный
terminal-progress.txt сохраняет экран для диагностики, его данные не входят в git.

Этот PASS ограничен повторным вызовом в одной сессии. Границы Always при новом
чате/перезапуске и другие permissions остаются открытыми.

## Always после перезапуска процесса и продолжения того же чата

2026-09-18, `--restart /tmp/loginom-cli-permission-JljE8Q` использует profile/workspace
успешного Always-прогона. Setup не повторяется; новый native run использует --continue
без skip-permissions. Вызван тот же инструмент с прежними аргументами и новым
operation_id. Provider URL обновлён, permission policy остаётся loginom_*=ask.

PASS: `/tmp/loginom-cli-permission-Kpsr3d`, log `/tmp/loginom-cli-permission-restart.log`.
Фактический tool event sessionID совпал с прежним
`ses_f4eccf3e9ffeeqd5GPCU4tVNU5`; state=error, итоговый CLI_PERMISSION_REJECTED,
exit=1/guard=false. Это подтверждает отсутствие переноса временного Always через
перезапуск даже при продолжении той же сессии. Host typecheck/diff check PASS.
Изоляция разрешения между двумя чатами одного живого процесса здесь не проверялась.
