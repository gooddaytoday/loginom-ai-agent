# Зависание formal v9: диагностический сигнал

Причина зависания `cohort-spend-activity#3` остаётся UNKNOWN. Шесть узких
проверок публичного `superviseProcess` завершились успешно; исходное
зависание в них не воспроизведено. Исправления продукта или harness нет,
приёмка A/B остаётся незавершённой.

## Исходное наблюдение

Formal baseline exec60189 завершён143 после сохранения evidence и
identity-guarded остановки собственных процессов. Closed34/45:
25 PASS100/9 no_artifact FAIL0, ещё одна попытка INCOMPLETE. В ней
launcher уже сообщал CLI exit0/sandbox exit0, но phase оставалась
`running` после индивидуального1800000ms; result/cleanup/process-cleanup
отсутствовали. Системные ожидания и объём памяти не устанавливают причину.
Подробности и хэши — в [журнале приёмки](2026-10-09-package-docs-writer-release.md).

## Проверенный путь

Own mutable harness `d08be6baf8f5aea53f83c228cd0984c9d2bf0494` остался clean.
Private reproducer вызывает реальную публичную реализацию, запускает
собственный CLI/helper и сохраняет receipts. Helper удерживает inherited
stdout/stderr после выхода CLI. В `status-closed` дополнительный Python
wrapper выдаёт sandbox status через fd3; это синтетическая граница,
а не приёмка настоящего bubblewrap или Loginom runtime.

Для supervisor задан1500ms, для внешнего наблюдателя hard bound25s,
для helper self-expiry8s. На всех принятых проверках CLI exit0 пришёл
раньше task timeout; cleanup ожидал и завершил собственный helper.
Исходные guards UID/birth/executable/dev/inode/group/session сохранены.
Loginom/model/judge calls0. Полный suite не повторялся без изменения кода.

| Проверка | Scope / число `/proc` entries | Public ms | Outer ms | Результат |
| --- | --- | ---: | ---: | --- |
| ordinary-1 | collector namespace / не записано | 5600 | 6643 | PASS |
| status-closed-1 | collector namespace / не записано | 5635 | 6682 | PASS |
| status-closed-2 | collector namespace / 2 | 5646 | 6696 | PASS |
| status-closed-3 | collector namespace / 2 | 5647 | 6687 | PASS |
| ordinary-host-2 | host namespace / 599 | 5750 | 6786 | PASS |
| status-closed-host-1 | host namespace / 600 | 5926 | 6971 | PASS |

Всем шести: exit0/timedOut=false/interrupted=false/sandboxError=null,
cleanup confirmed/error null/capture_complete=true/verification `[0,0]`,
outer terminal0/no timeout/running_remaining0/actions0. Номера PID из
collector namespace не использовались для сигналов host-процессам.
Это короткие контрольные проверки; они не заменяют длинный native прогон.

## Отдельный отказ наблюдателя

Первый host probe `ordinary-host-1` получил `ProcessLookupError` errno3
в Python `view()` при чтении `/proc/stat` исчезающего процесса. Public phase
уже дошла до cleanup, но public-result/outer-summary не сохранились:
этот probe INCOMPLETE, не воспроизведение исходного зависания.
Controller/launcher/CLI/helper1193898/1193922/1193934/1193946 затем проверены
как отсутствующие. Исходные outputs и отказ сохранены.

Изменена только private host copy observer: `ProcessLookupError`, как и
`FileNotFoundError`, означает исчезнувший процесс. Signal guards не менялись.
Исходный `run.v0.py` сохранён; замороженная collector copy не редактировалась.
После этого два отдельных host controls прошли; прежний отказ не переписан.

## Сохранение и очистка

Private evidence root: `package-docs-20261006` в долговременном acceptance
каталоге. Collector сохранён в `harness-hang-signal-20261009`:74 payload
файла/98373bytes, copy-manifest SHA
`05f8c7cba963f4c93df7ea3d0f4a3da4547ff373f0c0d5dd704c22322dc074cd`;
preservation readback SHA
`5fd6bc22c3983acbf72763f786c41f62defa346641a8f1b48d84418f5daa6258`.
После повторной сверки hashes и bounded accessible process/FD references0
(4 PermissionDenied явно учтены) own `/tmp/skills-harness-hang-signal-20261009`
удалён. Cleanup receipt SHA
`16e9cfa4e519000ac21c41e3f3dcd4a637288ef25cc77d79e50a751cb23e2a9b`.
Чужие временные файлы не очищались; нужные task snapshot/cold helper сохранены.

Host controls — `harness-hang-host-signal-20261009`; combined readback SHA
`d9006dff2de4334d73224f21271d20a1498c31a23ac3995439b0375614fd2149`.
Все закрытые копии private: files600/dirs700. Raw incomplete v9 profile,
leases и marker не удалены и не выданы за успешную cleanup.

## Ограничения и следующий шаг

Native cause/stability и breaking commit UNKNOWN. Git bisect без стабильного
verification command не выполнялся. Удержание stdout не вызвало зависание
в проверенных путях, но этим остальные причины не исключены. Bun pin,
ownership, budgets, judge и рубрики не менялись; speculative fix нет.

Нужен узкий RED для фактического класса отказа и безопасный stack при его
возникновении; затем минимальное исправление и GREEN. Одни только новые
phase logs или успешные короткие controls не считать исправлением v9.
После изменения harness зафиксировать новые общие conditions, принять обе
smoke стороны и выполнить полную пару90; незавершённую v9 не дополнять
выборочным повтором.
