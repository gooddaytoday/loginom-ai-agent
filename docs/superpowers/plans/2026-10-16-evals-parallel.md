# Parallel evals: короткий план реализации

> Исполнение последовательно в этой сессии. Новый код — по skill `tdd`,
> один unit RED → минимальная реализация → GREEN → отдельный коммит.

**Goal:** один реальный N=2 на трёх небольших задачах с судьёй, безопасной
очисткой своих файлов и общей сводкой.
**Architecture:** существующие harness и общая очередь, один выделенный Server,
два пользователя/профиля/workspace/архива, одно admin-соединение и judge gate.
**Tech Stack:** Bun/TypeScript, установленный CLI, Loginom Server/Studio, VPN Codex.
**Spec:** [дизайн](../../plans/2026-10-11-evals-parallel-design.md),
[контракт](../../../evals/docs/parallel-users-contract.md).

## Общие ограничения и решения

- Агент `openai/gpt-6-luna/high`, судья `gpt-6-sol/xhigh`.
- Задачи: `filter-active-rows`, `calc-data-double`, `group-sum-qty`, repeat=1.
- Одна server lock с долговечной бронью, profile locks, judge-home lock; без user lock.
- Внутри run карантин без recovery; здоровый слот продолжает очередь.
- Prepare создаёт недостающее/проверяет права; run только проверяет, Pool=0 до работы.
- Сессии закрываются по точным native именам пользователя; readback и проверка
  открытых файлов в своём root обязательны до удаления; SessionBackup только читать.
- Никаких новых эпох, процессных описей/телеметрии, FD/kernel receipts,
  server-storage archives и исследовательских операций в рабочем admin-драйвере.
- Subreaper, pid+starttime перед сигналом, marker v2, изоляция секретов сохраняются.
- Блокер сквозного пути/изменение требования — запрос владельцу и ожидание.
  Harness автоматически удаляет только своё на новом стенде после обязательных
  проверок; старые стенды/инциденты и созданное не этим harness требуют разрешения.
  Ограничение временными файлами текущего хода относится к работе исполнителя.
- Предлагается новая acceptance pair `loginom-evals-acceptance-20261016-server`
  / `loginom-evals-acceptance-20261016-studio`, private root
  `/home/kiselev/.local/state/loginom-evals/acceptance-20261016/`, config `slots.json`.
  Username eval-a/eval-b, раздельные a/b profile/work/history. Home судьи прежний:
  `/home/kiselev/.local/state/loginom-evals/parallel/judge-codex`.
  Эти имена/root отсутствовали при чтении 2026-10-16; перед созданием перепроверить.
  Разрешено снять только retained judge reservation команды
  `585940be-5c1b-4bff-a7c6-00459a4f7fa3` под guard после сверки identity.
  A00yuH и все прежние стенды/инциденты сохраняются до успешного N=2.
- Новая пара создаётся после утверждения плана, с новым loopback-портом/сетью,
  marker v2 и private state. Старые profiles/auth/archives не перезаписываются.
- Чужие правки не включать в коммиты. Разрешён откат двух незакоммиченных
  archive-правок: `evals/src/attempt-finalization.ts`,
  `evals/test/native-agent-run-integration.test.ts`; перед откатом сохранить
  единый diff private0600 в state. `user-storage-archive.ts` не подключать,
  его удаление и остальные неиспользуемые механизмы — шаг 7 после N=2.

## 1. Документы и решение до реализации

- [x] Переписать дизайн/контракт на месте, сократить runbook, перенести прежние
  тексты с точной проверкой сохранности в один архив; старый план оставить ссылкой.
- [x] Проверить текущие Docker resources, roots и reservations на чтение; составить
  [перечень удержанного](../../testing/loginom-ai-agent/2026-10-16-evals-parallel-retained.md).
- [x] Независимое ревью плана/документов: Approved; замечание порядка startup
  исправлено (единственный admin открывается до процедуры остатков).
- [x] Владелец утвердил план/перечень с поправками; повторное согласование не нужно.
- [x] Поправки владельца сохранены отдельным docs-коммитом47eb78f31a; единый
  private diff сохранён, две разрешённые archive-правки откатаны до HEAD.
- [x] Сохранить предложенную редакцию документов отдельным коммитом
  `docs(evals): simplify parallel run requirements and plan`.

## 2. Минимальное владение и подготовка

**Files:** `evals/src/slots.ts`, `lease.ts`, `environment-preparation.ts`,
`environment-finalization.ts`, `user-environment.ts`, `script/parallel-env.ts`.
**Unit tests:** `slots.test.ts`, `lease.test.ts`, `parallel-env.test.ts`.

- [x] RED→GREEN: один server guard/reservation и два profile locks, без user lock;
  потеря server guard отзывает slot authority. Slots31 PASS/127 assertions33.22s,
  typecheck/diff PASS; обновлены три проверки нового режима вместо epoch recovery.
- [ ] Подключить judge-home lock к общему run (primitive/статусная проверка уже работают);
  проверить весь prepare/verify/run путь без создания пользователей во время run.
- [x] RED: prepare создаёт только недостающее/проверяет права; verify/run отказывают
  на missing user, ACL drift, Pool!=0 и непустой SessionBackup без исправлений/delete.
  Свежая read-only проверка пользователя/ролей/ACL подключена к prepare/verify/run,
  как и Pool/SessionBackup. Native verify не меняет пользователей и пароли.
- [x] GREEN: переиспользовать рабочие lease/preparation primitives; исключить user
  lock из нового пути. Одна повторяемая startup-процедура сверяет остатки прошлого
  run; неизвестность сохраняет карантин. Повторно берутся точные прежние tokens,
  без новых эпох. Supervisor cleanup обязателен; unknown оставляет файлы и бронь.
  Unit62/225 PASS, native startup после неуспешного prepare завершён с освобождением брони.
- [x] Реализовать prepare/verify без process inventories/старого финализатора:
  недостающий пользователь настраивается и активируется, готовый только проверяется;
  Pool=0 до работы пользователя, backup read-only, профиль проверяется без setup.
  История сохраняется, собственные сессии закрываются с readback, чистые guards
  освобождаются после admin.dispose. Native prepare/verify92c5ac16…/08bb7493…
  ready=true, verify changedUsers=[], оба профиля чисты,0 model calls; evidence
  `/home/kiselev/.local/state/loginom-evals/acceptance-20261016/evidence/`.
- [x] Проверить `bun run test test/slots.test.ts test/lease.test.ts test/parallel-env.test.ts`
  и `bun typecheck` из `evals/`; коммит `refactor(evals): simplify run ownership and preparation`.
  68/264 PASS41.65s; verifyProfile RED→GREEN1/5 PASS2.19s, diff PASS.

## 3. Рабочий admin и безопасное завершение слота

**Files:** `evals/src/loginom-admin.ts`, `script/loginom-admin-driver.mjs`,
`src/attempt-finalization.ts`, `src/artifact.ts`, `src/profile-archive.ts`.
**Unit tests:** `loginom-admin.test.ts`, `artifact.test.ts`, `profile-archive.test.ts`.

- [x] RED→GREEN unit: точные native имена всех сессий eval-a закрываются через один заранее
  открытый admin; eval-b/admin сохраняются; readback still-present запрещает delete.
  Рабочая ветка существующего close-session без actor ledger; SESSION_NOT_IDLE
  сохраняется отказом. Проверка native A/B и подключение к run ещё впереди.
- [x] RED: неизвестное владение/root, активный открытый файл или непустой/нечитаемый
  SessionBackup оставляют файлы неизменными; история/inputs сохраняются вне mounts.
  RED→GREEN guards4/29 unit PASS: отказ при unknown/unconfirmed процессах,
  неполном FD scan/open file/mapping, nonempty/unreadable/symlink backup,
  неверном inode и чужом namespace. Cleanup координатор подключён к проверенным
  guards; native A/B4/4 подтвердили сохранность файлов при unknown и guarded cleanup.
- [x] GREEN: в новом пути заменить actor-ledger admission точным пользователем,
  архивировать профиль/результаты, закрыть свои сессии, перечитать и непосредственно
  проверить открытые файлы перед очисткой своего root. Не развивать замороженный
  server-storage archive diff; после разрешённого отката модуль не подключать.
- [x] Исключить research phases из рабочих операций admin-драйвера; не вводить
  заменяющий probe protocol. Их окончательное удаление — только после N=2.
  Драйвер требует явный LOGINOM_EVALS_ADMIN_RESEARCH=1 для старых probes;
  штатный openLoginomAdmin его не передаёт. Read-only/native boundary32/131
  unit PASS10.82s, typecheck/diff PASS.
- [x] Проверить `bun run test test/loginom-admin.test.ts test/artifact.test.ts test/profile-archive.test.ts`
  и `bun typecheck`; коммит `feat(evals): close slot user sessions before cleanup`.
  Unit53/221 PASS29.31s, логический коммит2eeacf5030; native A/B отдельно ниже.

## 4. Процессы и выделенный судья

**Files:** `evals/src/process-supervisor.ts`, `cli.ts`, `profile.ts`,
`judge-environment.ts`, `judge.ts`, `run.ts`;
`/home/kiselev/git/codex-vpn-lockdown/bin/codex` в другом репозитории.
**Unit tests:** `process-supervisor.test.ts`, `judge-environment.test.ts`;
новый `verify/test_codex_home.py` рядом с существующими verify tests wrapper repo.

- [x] RED/GREEN: полностью прочитанная чужая ancestry не сигналится и не карантинится;
  ошибка чтения отказывает; own descendant проходит subreaper/pid+starttime guards.
- [x] RED/GREEN: при подтверждённом дереве и пустом unknown ошибка
  `Writer owner unavailable` не проваливает попытку; `.writer` снимается через
  существующий `releaseStaleWriter`, непроверенное дерево/unknown по-прежнему отказ.
  Profile75 PASS/218 assertions47.34s,2 proc-denial cases не запускались для
  предотвращения помех другим агентам; typecheck/diff PASS.
- [x] Выбранная ownership/management regression25 PASS/125 assertions109.40s
  (82 filtered, включая proc-denial tests); strict own-unknown/birth guards PASS.
  `bun typecheck`/diff PASS; отдельный коммит `fix(evals): ignore proven foreign process ancestry`.
- [x] RED/GREEN wrapper unit: разрешённый canonical caller CODEX_HOME с тем же
  lockdown-конфигом сохраняется; outside/symlink/mismatch не допускаются;
  отсутствие caller home сохраняет прежнее поведение и сетевые ограничения.
- [x] Wrapper-коммит d551ddf (`codex-vpn-lockdown`) определяет unit boundary: валидируемые
  `LOGINOM_EVALS_JUDGE_UNIT=loginom-evals-judge-<UUID>` и
  `LOGINOM_EVALS_JUDGE_TIMEOUT_SEC` (целые секунды 1..86400); `systemd-run --unit`
  с RuntimeMaxSec и ограниченным TimeoutStopSec. Сеть/VPN остаются прежними.
- [x] Unit RED/GREEN harness: ждать wrapper с таймаутом без сигналов root/sudo/
  systemd-run; после выхода проверить завершение точного юнита через systemctl.
  Root-процессы этой цепочки не ошибка владения; активный/непроверенный юнит — отказ.
  Judge/VPN regression44 PASS/147 assertions53.61s, bun typecheck/diff PASS.
  Для обычного локального агента остаётся supervisor/subreaper, без исключений root.
- [x] Python unit7 PASS (включая staged-only snapshot), `bash -n`/diff PASS;
  проверить `python3 -m unittest discover -s verify -p test_codex_home.py`
  и `bash -n bin/codex` в wrapper repo. Отдельным маленьким коммитом
  `fix(codex): preserve validated eval judge home` включить только свои hunks,
  сохранив имеющиеся чужие правки bin/codex и других файлов.
- [x] Снята ровно разрешённая judge reservation; A00yuH journal неизменён.
  Проверить lockdown-конфиг прежнего home и `codex login status` через исправленную
  обёртку (0 model calls). Нет/недействителен вход — остановиться и попросить вход
  владельца; глобальный CODEX_HOME не подменяет эту проверку.
  Проверка через repo wrapper: exit0/loggedIn=true, unit завершён,0 model calls;
  конфиг скопирован точно/private600, статусный lease освобождён.

## 5. Очередь, ресурсы и сводка: открыть настоящий slots path

**Files:** `evals/src/run.ts`, `scheduler.ts`, `report.ts`, `parallel-acceptance.ts`,
`parallel-resources.ts`, `parallel-resource-budget.ts`.
**Unit tests:** `parallel-run.test.ts`, `scheduler.test.ts`, `parallel-users-acceptance.test.ts`.

- [ ] RED: два слота проходят агент→судья→cleanup→summary; crash A карантинит
  только A, B продолжает очередь; SIGINT прекращает выдачу; license denial
  останавливает весь run. Артефакты/results не пропадают при ошибке cleanup; unit-проверка env и outputs
  агента/судьи подтверждает отсутствие всех секретов, включая пароли слотов.
  RED→GREEN env: реальные binary slots и VPN judge наследуют только служебный
  allowlist; judge home явный. Canary/env/VPN10/33 PASS +typecheck/diff;
  вывод уже покрывается существующими redaction tests. Один старый CLI proc-denial
  тест обновлён под foreign ancestry; повторно не запускался ради других агентов.
- [ ] RED: запись бюджета до dispatch, host/container CPU/RAM, диск/OOM,
  licence/provider errors определяют приёмку; процессная телеметрия не gate;
  missing mandatory sample не PASS, скрытый 429/успешный retry не скрывает отказ.
- [x] GREEN: подключить подготовленные слоты к существующим runSlotQueue и judge
  gate, убрать `SLOTS_ADMISSION_UNAVAILABLE` для этого пути. Run не вызывает
  создание/исправление пользователей; использовать прежний home/VPN wrapper.
  Неполные обязательные observations дают incomplete/exit1. Для актуальной цели
  обязательны provider+judge; Dock transport остаётся unavailable в диагностике,
  обнаруженный Dock429 по-прежнему отказ. Независимое ревью этой границы Approved;
  legacy policy сохраняется. Report/acceptance64/293 PASS, typecheck/diff PASS.
- [x] Run запускает `script/sample-parallel-resources.ts` с чистым env перед
  dispatch N=1/N=2 и останавливает/дожидается его в finally; out — private JSONL
  плюс существующая summary, interval=1000ms. Unit проверяет start/stop при успехе,
  отказе и SIGINT. Процессные пробы не влияют на исход, обязательные пробы влияют.
  Helper RED→GREEN3/11 unit PASS1.63s +typecheck/diff: fresh output/первая проба,
  idempotent stop с supervisor и summary, env allowlist, проверка MemAvailable
  против заданного budget. Helper подключён к run/finally; OOM6/18 PASS,
  resource/run/report/scheduler/incidents105/555 PASS30.52s +typecheck.
- [x] Проверить `bun run test test/parallel-run.test.ts test/scheduler.test.ts test/parallel-users-acceptance.test.ts`
  и `bun typecheck`; логические изменения сохранять отдельными коммитами
  `feat(evals): execute prepared user slots` / `refactor(evals): bound run resource acceptance`.
  Runtime/resources/report/incidents105/555 PASS30.52s, parallel-run29/196
  PASS332.99s, typecheck/diff PASS. Повторное независимое ревью четырёх исправлений
  Approved; fixture-проверки не доказывают native N=1/N=2.

Владелец2026-10-19 разрешил точечную правку packages/agent вне evals/:
- [x] RED→GREEN process-тест: локальный HTTP429→200 сохраняет успешный exit,
  но JSON содержит существующий session.status/retry; зеркалировать status через
  прежний emit, сохранить idle-break, адаптировать прежнее JSON-ожидание.
- [x] Проверить затронутый process suite и typecheck, сохранить отдельным коммитом.
  Process suite19 PASS, package typecheck/diff PASS; новый retry/busy/idle виден,
  прежний порядок остальных событий сохраняется. Независимое мини-ревью Approved.
- [x] Собрать отдельный private installed CLI, закрепить SHA и квалифицировать
  retry output до A/B и N=1. Пользовательскую установку/старый candidate не менять.
  Candidate8b2ba2bf9b, version0.0.0-dev-202610190530, binary SHA
  d2de003bf5c13a3ad7d9ee2256e8b7f1f05d64776d03dd3beb528f6d5133be41.
  Установленный бинарник: локальный HTTP429→200,2 запроса, busy/retry/idle,
  exit0/cleanup confirmed; private evidence `acceptance-20261016/evidence/cli-retry-20261019/`.
- [x] Подключить JSON status к проверке provider errors: busy→idle основной
  сессии, любой retry сохраняет отказ; старый/оборванный JSON и task tool не дают
  полного покрытия. Непустой существующий --title исключает запрос автозаголовка.
  RED→GREEN: targeted CLI10/44, acceptance/incidents39/196 PASS; typecheck/diff PASS.
- [x] Отключить внутренние повторы выбранного provider судьи существующими
  request_max_retries/stream_max_retries=0; проверить локальным HTTP429 без модели.
  Codex0.157 запрещает override встроенного openai: выбран evals-openai с name=OpenAI,
  requires_openai_auth=true и прежним auth-dependent URL. Независимое ревью Approved.
  VPN/local429: ровно1 POST, exit1, unit cleanup confirmed,0 model calls;
  judge/incidents46/140 PASS43.24s, typecheck/diff PASS. Evidence `evidence/judge-retry-20261019/`.
Новый Protocol/HTTP, сырой transport trace и новая система телеметрии не нужны.

## 6. Четыре live A/B сценария, затем N=1 → утверждение → N=2

**Files:** новый `evals/test/parallel-slots-live.test.ts`, существующие task inputs,
private config/budget/results вне Git; операторские команды в runbook.

- [x] Новый acceptance pair829f82ae…/428fd481… создан на32791, prepare/verify
  двух пользователей готовы, startup после первого отказа проверен без новых epochs.
- [x] Создать только новый acceptance стенд и private config; закрепить binary SHA,
  task/rubric hashes, модели, timeouts и бюджет/условия до N=1 dispatch.
- [x] Ровно четыре обязательных A/B сценария: взаимная невидимость файлов,
  close A сохраняет B, delete A после close/readback, unknown ownership без delete.
  Остальные live tests только явным флагом; native и proc-negative unit не совмещать.
- [x] Сохранить live результат без skip и коммит `test(evals): qualify required slot isolation cases`.
  Native4/4 PASS29.13s,0 model calls: admin до A/B, retained A/PendingDisconnect,
  точный close/readback, bytes canary B после cleanup A, unknown без изменений,
  оба guarded cleanup и release. Evidence `evidence/live-ab-5fac81a1-d90a-4039-a557-b4575a30e7f9/`.
  Независимое ревью: два замечания к проверке ReadBuffer/catch исправлены.
- [x] Непосредственно перед N=1 проверить MemAvailable хоста против записанного
  бюджета (владелец наблюдал около5GiB из38GiB). Не хватает — остановиться и
  сообщить владельцу; не освобождать память остановкой чужих/удержанных стендов.
  Перед dispatch2026-10-19 доступно17GiB при исходном minimum8GiB; private N=1
  budget/conditions записаны, judge login status0/loggedIn/closed unit под home lock.
  Эти исходные границы не являются утверждением бюджета N=2.
- [ ] Реальный N=1 с агентом/судьёй на трёх задачах; по замеру предложить числовые
  пороги CPU/RAM/диска и **дождаться утверждения владельца до N=2**.
- [ ] Записать утверждённый бюджет до реального N=2, выполнить run на тех же tasks/
  models/pins. Проверить перекрытие двух слотов, judge settings, полную summary,
  только свою очистку, отсутствие обязательных ресурсных/лицензионных/provider отказов.

## 7. Один проход удаления неиспользуемого после успешного N=2

- [ ] Одним списком согласовать судьбу старых стендов/инцидентов после N=2.
  Неиспользуемые механизмы/тесты убрать по уже утверждённому шагу; чужие изменения
  и incident/evidence не удалять без отдельного разрешения.
- [ ] Убрать неиспользуемые recovery epochs/user-lock/process inventories/telemetry/
  receipt chains/server-storage archive code и их тесты, сохранив обязательные guards.
- [ ] `bun run test:unit`, `bun typecheck` из `evals/`, `git diff --check`;
  коммит `refactor(evals): remove unused parallel research mechanisms`.
- [ ] Свести повторённые правила к контракту; в дизайне/AGENTS/blockers/runbook/
  плане оставить короткие ссылки. Проверить итог по контракту, обновить checkpoint.

## Рабочие вызовы нового пути

- Используются `runSlotQueue`, `runAgent` (без agentEvidence), `management`
  (без managementEvidence) и их прямой `superviseProcess`; подтверждённый cleanup
  supervisor-а решает исход. `superviseAgentProcess(input, undefined)` — только
  существующий transparent fallback, без inventory. `releaseStaleWriter`,
  `archiveProfileHistory`/`archiveProfileEvidence` сохраняют историю;
  `serverFileObservation` непосредственно проверяет открытые файлы.
- `judgeInfo`/`judgeVersion`/`judgeTask` для VPN проходят границу точного systemd-юнита,
  не строгую CLI executable/ancestry-проверку sudo-цепочки. `createJudgeGate`
  и `acquireJudgeLease` сохраняются. Обычный fake/local judge сохраняет локальный путь.
- Не вызываются как admission/finalization gates: `superviseManagementProcess`,
  inventory-ветки `superviseAgentProcess`/`superviseJudgeProcess`,
  `sealAgentProcessInventory`, `pauseAgentProcessInventory`,
  `sealManagementProcessInventory/Inventories`, `readAgentProcess*`,
  `readManagementProcess*`, `sealJudgeProcessInventory`, `readJudgeProcessInventory`,
  `qualifyClosedProcessEvidence`, `readResourceNativeCensus`, `checkResourceEvidence`
  с process census. Старые `collectSlotSessions`/`finalizeSlotAttempt` с actor/receipt
  chains не используются новым путём. Диагностика не меняет cleanup/status/exit code.
- `archiveUserStorage`/`readUserStorageArchive` не подключаются; отдельный user lock,
  epoch recovery и `captureServerFiles`/`readServerFiles` receipt chain не вызываются.

## Checkpoint

1. 2026-10-16: новая цель и поправки владельца нормативны; план утверждён.
2. Документы/единый архив/перечень12 пар в39127c48e1, независимое ревью Approved.
3. Старые стенды/инциденты не трогать до успешного N=2; A00yuH не удалять.
4. Home судьи прежний parallel/judge-codex; снятие точной брони585940be… разрешено.
5. Две archive-правки откатаны; private diff: `/home/kiselev/.local/state/loginom-evals/parallel/approved-archive-rollback-rrrs5s25/server-storage-archive.diff`.
6. Исход нового пути: supervisor cleanup и systemd-unit судьи; описи диагностические.
7. Harness сам очищает доказанно своё на новом стенде после обязательных проверок.
8. N=1/N=2 collector запускает/останавливает run; перед N=1 проверить MemAvailable.
9. N=2 ждёт утверждения числовых порогов по N=1; исправления runtime повторно Reviewed/Approved.
10. Wrapper d551ddf:7 unit PASS; harness VPN boundary44/147 PASS, typecheck/diff PASS.
11. Harness unit boundary0e6994f736; scoped login status exit0/clean unit/0 model calls, A00yuH journal unchanged.
12. Evidence: parallel/judge-wrapper-check-160f11c1-aeac-4824-b79a-f52a47d25d58; status lease released.
13. Server/profile guard: slots31/127 PASS33.22s/typecheck; user lock исключён из environment.
14. Writer diagnostic: profile75/218 PASS47.34s +typecheck;2 proc-denial cases исключены.
15. Foreign ancestry: ownership/management25 PASS/125 assertions109.40s +typecheck,82 filtered.
16. Exact-name close:53/221 unit PASS29.31s +typecheck/diff; native A/B ещё не выполнен.
17. Read-only user policy/research gate:32/131 unit PASS10.82s +typecheck/diff.
18. Child env allowlist:10/33 targeted PASS +typecheck; старый proc-denial assertion обновлён без повторного запуска.
19. Guards4/29; prepare/leases68/264; verifyProfile1/5; sampler/memory3/11 unit PASS +typecheck/diff; native ещё не проверен.
20. Acceptance: prepare/verify ready; installed CLI8b2ba2bf9b и judge429 qualified; native A/B4/4 PASS/clean releases. Далее N=1,утверждение порогов,N=2.
