# Безопасная очистка eval-попытки

Goal: сохранить неуспешный исход AMBIGUOUS и допускать следующий кейс только
после подтверждённой локальной очистки. База: evals 97354ffff.
Канонический контракт: ../specs/2026-09-18-evals-design.md, раздел
«Изоляция неудачной попытки — 2026-10-02».

## Требования и checkpoint

- [ ] Отдельный environment_cleanup; исходные метрики неизменны; legacy/rejudge.
- [ ] Общий supervisor agent/management: Linux PID/starttime ledger, browser
  binding, exclusive harness lease, identity-проверки сигналов и writer.
- [ ] Сохранение исхода при failed cleanup; stop до следующего case на всех путях.
- [ ] Redacted journal archive с hash до acknowledge/prune; partial capture.
- [ ] Отрицательные TDD process/profile/pipeline сценарии.
- [ ] Полный bun test, bun typecheck, git diff --check.
- [ ] Native controlled no_artifact → следующий успешный case.
- [ ] Native budget и low-liquidity, обычные бюджеты, current model/variant.
- [ ] Обновлены spec, README, пункт 9 и отчёт приёмки.

Начало: 2026-10-02. Goal active. Продуктовый runtime/установленный CLI не
изменять; пользовательские dirty reports не включать в коммиты.
Исходная проверка: 176 eval tests pass, typecheck и diff-check pass.
Новые native проверки ещё не выполнены. Systemd/cgroup отклонены пользователем
как новая зависимость; использовать только существующие Linux /proc/PGID.

## Checkpoint 2026-10-02, реализация продолжается

Ветка evals, commits 2a4688485–002aa3c96. Реализованы отдельные cleanup
счётчики и вывод отчёта, fail-stop конвейер с сохранением измеренного исхода,
эксклюзивный sibling harness lease, общий agent/management supervisor,
непрерывная запись CLI capture, проверка PID/starttime перед сигналом,
writer receipt и очищенный журнал с SHA-256/read-back до acknowledge/prune.
Проверены реальными дочерними процессами detached descendant, timeout с
отказом ownership (31 с с сохранением telemetry), подмена writer, неизвестный
native helper, недоступный посторонний /proc и отказ архива до recovery.

Остаются: усиление native binding/helper ancestry; строго адресный pruning
архивированных каталогов; все отрицательные lifecycle сценарии, rejudge,
полная suite и native acceptance. Новый baseline не проводился. Goal active.
Установленный CLI выбран из текущей конфигурации: 0.1.17-prod,
openai/gpt-6-sol, variant default, обычный бюджет 900000 мс. Он не менялся.
Пользовательские system-bugs.md/repository-week.md не включались в коммиты.

Native checkpoint: 198 tests/typecheck/diff-check pass. Readiness probes
20261002-104121-d16624d12-dirty и 20261002-105029-f46160d7e-dirty остановлены
до dispatch кейсов. Два последующих адресных status дали положительные browser
bindings, но не смогли доказать происхождение chrome_crashpad_handler: double-fork,
собственный SID, усыновление системным reaper PID 1327 до первого 100-мс scan.
Неизвестные helpers не завершались; все наблюдённые процессы затем исчезли сами.
Guard reconciliation сохраняет evidence и выполняется после двух пустых проверок
PID/starttime и профиля; runtime исходных probes остаётся сохранённым.

Для выполнения исходного proof-of-origin контракта требуется выделенный Linux
subreaper launcher на каждый запуск: он запускает только выбранный CLI и держит
родительскую границу до финальной проверки. Использовать встроенный Bun FFI и
Linux prctl, без зависимостей/установки/systemd и без изменений продукта. Это
устраняет потерю ancestry на double-fork; argv match не становится kill authority.
Реализация и отрицательная проверка чужого helper ещё не завершены. Goal active.


## Checkpoint native control, 2026-10-02 11:59 UTC

На установленном CLI readiness probe-v5 подтвердил browser/helpers cleanup.
Полная suite: 201 pass, typecheck/diff-check pass (60545b22a).
Native run 20261002-114527-60545b22a-dirty: control no_artifact (exit 0,
Session ses_f03909bcdffeJF4g8TDRlKbveI, 49 с), cleanup confirmed; следующий
Session ses_f038fb46effepQ87RGxQqK6Fgq создал пакет group-sum-qty (232 с,
completed). После completed короткая profile-idle проверка отказала; честный
completed сохранён, run stopped/exit 1, lease/runtime/evidence сохранены.
Приёмка ещё НЕ закрыта. Измеренный control содержал реальный browser prepare,
workspace read и отказ одного tool; AMBIGUOUS из события автоматически не влияет
на бюджет/повтор и не считается восстановленным продуктовым дефектом.

Дополнительный TDD: transient owner в коротком waitProfileIdle, два пустых
финальных scan с origin ledger/subreaper receipts, relevant /proc EACCES,
management timeout, readiness failure для no_artifact/failed/timeout/completed,
rejudge preservation, отказ записи run/result с сохранением measured outcome
в summary и остановкой до второго case. Отказ result пишет дополнительный
result.persistence-failure.json, если основной путь недоступен.
Следующее: полная suite, безопасное reconciliation только собственного lease
первого control, повтор native control и адресные budget/low-liquidity.


## Checkpoint перехода на упрощение, 2026-10-02

Продолжение предыдущего goal — прогресс: готовая реализация сохранена коммитами
580d94ae3, 60545b22a, 1960aa511, 55904e191, 66d706eea. На HEAD 66d706eea
полный неизменный gate: 212 pass / 0 fail, 728 assertions, 141.38 с
(`/tmp/eval-cleanup-native-20261002/full-tests-final-v3.log`); typecheck и
`git diff --check` прошли. Предыдущий v2 full-run пересёк red-срез redaction и
не используется как доказательство итогового HEAD. Живой native run
20261002-114527-60545b22a-dirty завершён; его failed cleanup не переоценивается.
Положительная Linux-приёмка и адресные budget/low-liquidity ещё открыты.
Failed harness lease этого собственного run остаётся; до повторной native
приёмки необходимо документированное exact-identity reconciliation. Повтор
native пока не запускался. Установленный CLI и продуктовый runtime не менялись.

Новый согласованный план: [subreaper simplification](2026-10-02-eval-cleanup-subreaper-simplification.md).
Сопоставление: lease, writer NOFOLLOW/identity, bounded idle, archive-before-ack,
SHA/read-back/redaction, сохранение measured outcome при persistence failure,
report counters и rejudge уже реализованы. Их не переписывать. В supervisor
ещё есть два альтернативных admission по group/SID и раздельные ledger/parents/
boundBrowsers/denied/unknown; они заменяются одним origin/admission ledger.
Launcher уже выделен, но CLI не обозначен отдельным origin, receipt проверяется
только nonce/PID; нужно закрепить CLI/fresh launcher identity. Один observer
работает без накопления poll scans, но всегда 10 мс при выбранном browser;
после proof запуска требуется возврат к обычному интервалу и новое ускоренное
окно для следующего runtime. Exact root browser binding остаётся обязательным.

Незавершённые README/item9 правки сохранены. Пользовательские system-bugs.md,
repository-week.md и новый план сохранены без отката/переустановки дерева.
Следующее: existing process/CLI/profile gate; origin Red→Green; один admission
ledger и observer; lifecycle/failure matrix; полный gate; readiness probe,
control→проверенный выполнением пакет, затем два адресных case без budget override.


## Срез 2 simplification: один origin ledger

Исходный process/CLI/profile gate: 71 pass, 226 assertions (107.12 с).
Red: double-fork не имел origin `cli`. Green после удаления обеих admission
веток PGID/SID: process 6 pass / 21 assertions; CLI/profile 65 pass / 207
assertions; typecheck pass. Provenance хранится вместе с process identity,
parent Map удалён; origins — launcher/cli/parent/subreaper. Selected CLI executable
зафиксирован до dispatch; изменение receipt требует свежей проверки identity
живого launcher. Double-fork helper проверяется после cleanup по PID/starttime,
не одному числовому PID. Browser binding и отказ неизвестному helper сохранены.
Следующий срез — перенести разрешения/bindings/pending unknown из отдельных
Set/Map в тот же ledger, сохранить быстрый binding window и обычный интервал.
Native ещё не перезапускался; goal active.


## Срез 3 simplification: одна запись admission и browser binding

Ledger объединяет происхождение, process identity, pending/allowed/refused,
точный browser binding и foreign classification. Отдельные permission/binding/
unknown Map/Set удалены. Adoption без binding не разрешает сигнал; противоречащее
новое profile после binding вызывает отказ и оставляет fixture живым. Чужой
Chromium с другим profile не завершается. Короткое окно argv (process.title
через 40 мс) сохраняет binding; observer ускорен до первого proof и возвращается
к 100 мс, без queued polls, с числом и максимальной длительностью scan в evidence.
Процессный набор: 8 pass / 30 assertions / 35.58 с; CLI/profile: 65 pass /
207 assertions / 80.08 с. Relevant EACCES и unknown helper остаются fail-stop.
Typecheck и diff-check pass. Native ещё не запускался. Следующий срез — один
shutdown, свежий group/identity pass перед каждым сигналом и сохранение capture
при всех post-dispatch отказах. Goal active.


## Срезы 4–6 simplification: один shutdown и полный gate

Убран второй процессный обход в remaining: shutdown использует свежий snapshot
того же observer. Перед каждым индивидуальным сигналом выполняются полный pass
и birth/executable/group проверка адресата. Mismatch меняет admission на refused.
Read failure не выдаётся за пустой proof; shutdown не ожидает stale snapshot.
Launcher закрывается последним; реальный helper игнорирует INT/TERM, наблюдатель
подтвердил жизнь launcher до его SIGKILL. Законченный CLI остаётся exit 0 без
timeout, два финальных passes пусты. Capture/registration/transport ошибки после
dispatch сохраняют измеренный исход и делают cleanup failed.

Вместо тестов с присвоенным status создана сквозная матрица process/archive/ready
× no_artifact/failed/timeout/completed: настоящий fake CLI, настоящий budget,
main exit 1, исход/telemetry/run/result/summary/report сохранены, b-next не начат.
Archive failure сохраняет invalid journal и pending recovery. Отдельные exit 2/3
выполняют confirmed cleanup до stop. Legacy/rejudge/counters/infra classification,
secrets redaction и manifest/SHA/read-back остаются зелёными.

Полный текущий gate: 225 pass / 0 fail; точное число assertions и длительность
см. /tmp/eval-cleanup-native-20261002/full-simplified-v1.log. Typecheck и
diff-check pass. Предыдущий one-shutdown run застал stale-wait regression и
завершился двумя failures; он не используется как итоговое доказательство.
Матрица v1 застала fixture failed без telemetry; добавлен отдельный static
failed fixture с step_finish, затем полный gate проверил всю текущую матрицу.
Установленный CLI по свежему agentInfo неизменен: 0.1.17, source
5588651a291c59f53d1c14941d5ba768071a0018, binary SHA256
272d135abc9ee9bb7219c7ee8a498cb048581ee2209d450f869b7caee1fbd873,
model openai/gpt-6-sol/default, обычный бюджет 900000 мс.
Далее exact reconciliation своего failed lease, readiness через тот же supervisor,
control → group-sum-qty с независимым исполнением, budget/low-liquidity с обычными
budgets. Native критерии остаются открытыми; goal active.


## Native checkpoint и последний negative-срез

HEAD cf1fc6a0d: control 20261002-134647-cf1fc6a0d-dirty завершился exit 0,
no_artifact → completed; оба environment_cleanup confirmed. Пакет group-sum-qty
и настоящий CSV независимо проверены: три узла, две связи, Item/gdSum Qty,
две строки A=15/B=25. Исходные node_wait receipts подтверждают completed
исполнения импорта, группировки и экспорта. Audit проверил новые Session/launcher/
runtime identities, archive→ready→следующий dispatch, hashes всех архивов,
отсутствие оставшихся own identities и секретов в 16 proof/archive файлах.
Адресный run 20261002-135921-cf1fc6a0d-dirty: budget no_artifact, 155350 мс;
low-liquidity no_artifact, 133159 мс; оба exit 0, timeout=false, cleanup confirmed;
обычные task budgets 1800000 мс, модель неизменна. Score/oracle=0 сохраняются
в метриках; живой судья настроен, но для отсутствующего пакета не вызывается.

Дополнительный cold-open временно восстановленного файла показал readonly-документ;
попытка исполнения отказала до мутации. Причина readonly не установлена: это не
доказательство оставшейся серверной Session. Cold readback не прошёл и не
подменяет подтверждение исходного исполнения/CSV положительного control.
Reader процессы подтверждённо закрыты; его leases reconciliation выполнялось
по exact identity и двум пустым passes, журналы сохранены. Временно восстановлен
только собственный eval-пакет для QA; после проверки он удалён, local artifact
сохранён. Продукт и auth/settings/DB не менялись.

Последний аудит выявил unknown browser descendant вне browser directory,
который обходил helper admission как generic CLI descendant. Red тест подтвердил
ложный confirmed cleanup и завершение неизвестного helper. Минимальная правка
использует тот же recorded parent chain для отнесения потомка к browser admission
независимо от расположения executable; неизвестный executable теперь refused,
fixture жив, исход exit 0 сохранён. Green 1 pass / 3 assertions. Полный gate
повторяется; после него повторить native control/addressed на итоговом code SHA.
Goal active, приёмка cf1fc6a0d остаётся честным историческим доказательством.


Последний negative-срез: полный gate 226 pass / 0 fail, 981 assertions,
284.27 с (/tmp/eval-subreaper-acceptance/full-final-v2.log); typecheck и diff-check
pass. Новых источников ownership нет: browserAncestor используется для admission
уже доказанного потомка; PID/parent provenance остаётся прежним единым ledger.
Далее свежие native readiness/control/addressed на этом code SHA, без cold reader
вне обязательного контракта и без изменений установленного продукта.


## Checkpoint validation lifecycle — 2026-10-02

На HEAD 8e676dbce control 20261002-142112-8e676dbce-dirty сохранил no_artifact
и completed, но bounded profile idle после второй попытки отказал. Process proof
самой попытки confirmed; причина временного owner не установлена. Environment
cleanup failed, run exit 1, результаты и report сохранены. Этот run не заменяет
требуемую положительную приёмку.

Guard default eval-профиля содержит другого owner (PID 295436, nonce
66789ed1-a3c7-4899-99ba-2580b51a6835); provenance с control не совпала.
Guard не удалён. Повторный запуск безопасно отказал на lease до dispatch.
Для окончательной приёмки выбран отдельный private profile; исходный профиль,
его настройки/БД и неизвестный guard остаются без изменений.

Первый private bootstrap отказал на browser binding в management status.
Read-only исследование продуктовых host.ts/managed-entry.mjs подтвердило:
check(connection) запускает browser в loginom/validation/generations/.../attempts,
не создаёт execution journal и после close удаляет validation chat. Supervisor
учитывал только runtime. Failed private guard, receipts и runtime оставлены;
неудачное доказательство не переписано.

Один новый реальный child-тест воспроизвёл failed cleanup (red, 2 assertions).
Минимальная правка наблюдает runtime и validation одним scanner/ledger и сохраняет
историю новых каталогов после продуктового удаления. Exact executable, origin
и точный новый browser-profile обязательны для обоих namespaces. Manifest явно
фиксирует removed_validation_directories; обычный исчезнувший runtime по-прежнему
запрещает продолжение. Targeted pruning допускает лишь те же exact own attempts.
Green: 12 pass / 0 fail, 57 assertions, 49.12 с (process + diagnostics).
Typecheck/diff-check pass. Полный gate запущен, native приёмка на новой версии
остаётся открытой. Установленный CLI не пересобирался; goal active.

Итоговый gate validation-среза: 228 pass / 0 fail, 990 assertions, 297.87 с
(/tmp/eval-subreaper-acceptance/full-validation-v3.log); bun typecheck и
git diff --check pass. Далее свежий private bootstrap и оба обязательных native
прогона; прежние failed guards/evidence остаются без удаления.
