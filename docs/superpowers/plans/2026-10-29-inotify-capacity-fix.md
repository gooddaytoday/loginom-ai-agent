# Локальная ёмкость inotify — план исправления

**Цель:** выполнить предусмотренные offline проверки на существующей машине без завершения пользовательских приложений и без изменения eval-контрактов.
**Основание:** pinned full suite:1224PASS/39SKIP/2FAIL; exact archive test под strace подтверждает fs.watch ENOSPC до вызова архива. Свежий own-UID fdinfo показывает65536 watch lines при max65536; основной владелец — Warp. Evidence — SDD/judge-exec-pinned-archive-triage.md, judge-exec-pinned-archive-isolation.log и judge-exec-pinned-archive-child-stderr.strace и private inotify-current-pinned-blocker.json.
**Границы:** существующий kernel parameter, не новый сервис/инфраструктура/setup. Обычный noninteractive sudo-read доступен. Все PID/процессы/profile/leases/source/model pins и исходные failed logs сохраняются.

1. Independent review этого узкого плана до изменения. Критерий — необходимость/минимальность и отсутствие расширения прав кампании.
2. При текущем значении65536 один раз установить `sudo -n sysctl -w fs.inotify.max_user_watches=131072`; прочитать обратно. Не менять max_user_instances/прочие параметры, не писать persistent sysctl config, не перезапускать/закрывать приложения. При изменившемся исходном значении остановиться и разобраться, не перезаписывать неизвестную настройку.
3. Создать и закрыть один собственный fs.watch в существующем evals cwd. Затем на pinned Bun1.3.14/PATH запустить только два точных ранее упавших теста с прежними timeout/fixture. Результат — watcher создаётся/закрывается и оба теста PASS без source changes.
4. При успехе один раз повторить полный pinned suite: причина повтора — подтверждённая и исправленная общая нехватка watches; старый failed run неизменен. Typecheck уже подтверждён на неизменном source; не повторять его без новой причины. Зафиксировать результат и independent actual review.
5. При повторном ENOSPC не удваивать лимит снова и не удалять guard; сохранить конкретный blocker. Actual judge/deploy остаются pending до требуемых проверок, независимый Authoring может продолжаться последовательно.

**Риск/возврат:** новый максимум позволяет будущим процессам выделять больше kernel memory под watches; это capacity, не резервирование заранее. Изменение runtime-only действует до перезагрузки/последующей явной настройки. Не понижать максимум автоматически во время чужой работы; исходное65536 записано здесь для осознанного возврата владельцем.
**Размер:** этот план≤25строк плюс краткий existing SDD review/result; production/test/config files0. Нового кода, зависимости, очереди, watcher-service, retry-loop нет.
**Исключено:** persistent sysctl настройка, изменение физических ресурсов/Benchmark pins/требований, процессы Warp/ChatGPT/чужие CLI, commit/push/merge/release.
**Stopping:** review → один sysctl → два targeted tests → один full suite → evidence/review. Не объявлять старые failures исправленными задним числом.

Результат на29.10.2026 16:59UTC: plan review APPROVE; runtime-only65536→131072/read-back выполнен, ownwatchercreate/closePASS; оба exacttests2PASS/0FAIL/19assertions. Полный pinned repeat в SDD/judge-exec-full-suite-inotify-fixed.log: exit0,1226PASS/39SKIP/0FAIL,6188assertions,1265tests/93files,1405.17s; independent actual review SDD/inotify-capacity-actual-review.md APPROVE. Исходные failedlogs сохранены; процессы/source/pins/persistentconfig не менялись.
