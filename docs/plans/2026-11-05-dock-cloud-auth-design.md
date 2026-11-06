# Проектирование и проверка подключения к Loginom AI

Ветка `dock-cloud-auth`, база `loginom` (`dd2f949d11`). Ход реализации — в checkpoints ниже.
Канонические решения: [спецификация](../superpowers/specs/2026-11-05-dock-cloud-auth-design.md).
Этот файл содержит план работы и свидетельства проверки, не вторую спецификацию.

## План обсуждения

- [x] Изучить Agent, канонический Dock и сайт; независимо проверить план исследования.
- [x] Согласовать пользовательские решения и визуальный макет.
- [x] Записать спецификацию.
- [x] Получить первоначальное Spec Review; оно пропустило перечисленные ниже проблемы
      и не является доказательством готовности прежней редакции.
- [x] Завершить повторное независимое ревью технически исправленной спецификации.
      Host/runtime, Dock и auth: Approved. Дополнительно устранена гонка GET
      выдачи новой пары после отзыва установки; повторная auth-проверка одобрила правку.
- [x] Зафиксировать проверенную документацию коммитом в `dock-cloud-auth`.
- [x] Подготовить [план Agent/Dock с TDD](../superpowers/plans/2026-11-06-dock-cloud-auth.md);
      отдельный план реализации сайта в этом репозитории не создавать.

## План исправления замечаний 2026-11-05

- [x] Разделить проверку на Host/runtime/consumers, Dock/backup/ACL, Better Auth.
- [x] Проверить фактические пути вызова, а не только текст прежнего дизайна.
- [x] Уточнить неизвестную topology у пользователя; подтверждено, что reserve
      ещё не существует и будет отдельным инстансом.
- [x] Независимо проверить подход правки: real issues исправить минимальными
      механизмами, не расширять logout на все браузерные сессии и не добавлять
      глобальную модель ACL/репликацию.
- [x] Исправить спецификацию; явно отделить будущие гарантии от проверенных фактов.
- [x] Перепроверить изменённые разделы тремя исследователями и проверить документ.
      Проверены структура разделов, покрытие всех замечаний и пробельные ошибки.

## Результаты проверки замечаний

| Замечание | Вывод и решение в спецификации |
| --- | --- |
| P1-1 | Подтверждено: ready/catalog одноразовые, acquire/tools блокируют повтор. §§3/7/11: connection-required, save до входа, mutable readiness прежнего поколения, retry до gates, тест обновления0.3.9 и восстановления. |
| P1-2 | Подтверждено: product Help обслуживает один child; browser user-v1 remote нужен только startup. §7: удалить его в managed-пути, оставить Host→Help request/reply; reverse IPC и browser transport replacement убраны. |
| P1-3 | Подтверждено: web session позволяет новый вход. §6 ограничивает отзыв уже выданными credentials; all-web logout не вводится. Открытая регистрация не обеспечивает блокировку человека. |
| P1-4 | Подтверждено по code paths: общие agent/resources доступны USER, default search может включать skills. §9 ограничивает все managed Help URI официальной KB, запрещает context mode; серверные ACL KB сохраняются. Общие OpenViking права не перепроектируются. |
| P1-5 | Backup действительно включает auth registry. Неизвестность topology разрешена ответом пользователя: будущий отдельный reserve. §9: независимые volume/registries, отдельная публикация KB, запрет primary full restore поверх reserve. |
| P2-6 | Подтверждено: config/installation binding, quota, errors, provisioning concurrency. §5 задаёт binding/exact disabledPaths/server revoke/явный лимит; §8 — singleflight/cooldown. Вечный запрет refresh до новой local revision отклонён как deadlock. |
| P2-7 | Подтверждено: runtime endpoint override и новые Host HTTP запросы не защищены существующим networking автоматически. §5: fixed release URLs, один build-only staging tuple, proxy/system-CA контракт и native проверка. |
| P2-8 | Подтверждено: build callers, evals, node acceptance и fixtures пропущены. §§10/12 перечисляют их, задают explicit custom setup через stdin и безопасную legacy migration. UI-01 находится в docs/testing/loginom-ai-agent/README.md, не корневом README.md. |
| P2-9 | Подтверждено: management timeout180с и model diagnostics=whole status. §§3/5: короткие start/status/cancel, expiry и guard; отдельные management/model проекции. |
| P3 | §§3–9: отмена незавершённого входа при закрытии формы, смена аккаунта на сайте, удаление revoked credentials с диска, отдельная cloud запись, Linux plaintext факт, общий deadline, реальный масштаб ADMIN. |

## Необязательные предложения

- Приняты Host-owned Help recovery без reverse IPC, redirect:error, закрепление
  reserve только после успешного ответа, сокращение ненужных client response ID.
- Постоянный seed не принят: повторный regenerate с ним не меняет ключ. Recovery
  выдачи/ротации должен учитывать потерянный ответ; детальный выбор хранения и
  повторяемого provisioning относится к отдельному плану сайта.
- Перенос полного primary volume в reserve не используется для обновления KB.
- Глобальные права всех USER OpenViking не меняются: предотвращение попадания
  чужих общих записей в Agent обеспечивается scoped Help и read ACL официальной KB.

## Основания и пределы проверки

Host: connection-service.ts, host.ts, host-port.ts; managed-entry.mjs/bridge.mjs;
knowledge-client.mjs; transport.ts; Desktop/CLI startup; перечисленные consumers.
Dock: api_keys/legacy.py и new.py, storage/acl.py и viking_fs/_access.py,
mcp_endpoint.py, backup-server.sh/restore-server.py, Assets catalog/import.
Better Auth: официальные docs и исходники v1.7.17, включая router.disabledPaths,
verifyApiKey, updateApiKey, signOut/revokeSession и deviceAuthorization.

Не выполнялись runtime-тесты, build, Better Auth/Electron интеграция, изменения
или запросы с credentials к production, исследование бинарника0.3.9.
Сайт и reserve ещё не реализованы. Неизвестны текущие production ACL,
allow_private_networks и внешняя доступность admin API; это условия развёртывания,
не уже доказанные свойства. Макет остаётся иллюстрацией во временной папке.

## План уточнений 2026-11-06

- [x] Сверить proxy с канонической system proxy v2, диагностику с текущим View,
      условие revokeSession с официальным исходником Better Auth v1.7.17.
- [x] Независимо проверить минимальный план правок до изменения спецификации.
      Approved; условие revokeSession сверено также независимым reviewer.
- [x] Уточнить §3–6 и проверки §11: proxy-вариант А, совместимая диагностика,
      raw token той же device-сессии, ротация пары при отзыве пользователя;
      отдельно определить browser check при сохранении до облачного входа.
- [x] Сохранить точки интеграции connection-required для будущего плана.
- [x] Проверить изменённые формулировки независимо, выполнить документальные
      проверки и зафиксировать только документацию.
      Diff получил Approved; `git diff --check` пройден. Проверка без runtime.

Для будущего плана: `connection-required` требует изменить обработку успешного
сохранения и завершения polling в
`packages/app/src/components/settings-loginom-state.ts`, убрать безусловное
`help: ready` из `packages/opencode/src/cli/loginom-management.ts` и распознавать
новый профиль в `evals/src/profile.ts`. Это точки интеграции нового состояния,
а не дефекты существующего кода до начала реализации функции.
В `packages/app/src/components/settings-loginom.tsx` отдельно проверить подписи
после browser check и toast сохранения: browser verified не означает Help ready.
Onboarding сохраняет критерий наличия настроек; CLI automation preflight вправе
требовать фактический Help ready перед работой.

Уточнения подтверждены чтением исходников. Proxy-вариант А не переносит системный
resolver в Host/Help и не меняет system proxy v2. Передача explicit env в Help
не признана доказательством её применения транспортом; эта проверка остаётся
в реализации. Diagnostics сохраняет прежний View в обоих форматах ответа.
Для revokeSession явно требуется raw token той же authenticated device-сессии.
Отзыв пользователя явно ротирует обе Dock credentials. Сохранение до входа
не запускает browser check автоматически; явный Check проверяет его отдельно.

## Подготовка плана реализации 2026-11-06

- [x] Сверить точные интерфейсы, тестовые helpers и команды Agent/Dock.
- [x] Записать план `docs/superpowers/plans/2026-11-06-dock-cloud-auth.md`:
      последовательные TDD-срезы, файлы, интерфейсы, проверки и зависимости выпуска.
- [x] Самостоятельно проверить покрытие спецификации, имена и отсутствие заглушек.
- [x] Получить независимое ревью готового плана и исправить замечания.
      Итог: общее ревью, Host, Dock/runtime — Approved. Документальные проверки пройдены; план зафиксирован вместе с журналом.

План подготовки до исполнения получил независимое Approved. Работа ограничена
документацией; реализация сайта остаётся отдельной задачей в его репозитории.

План содержит 15 задач; все implementation checkboxes пока не выполнены.
Исправлены замечания ревью: реальный порядок save/settled, observable Help snapshot,
write/clear races, installation-bound access_revoked, HTTP/deadline ограничения,
CLI save без browser до входа, зависимость Node integration от build tuple и
реальный двухпроцессный Dock fixture с MCP lifecycle. Публичный HttpApi не нужен.
Проверены пути, структура Markdown, отсутствие незаполненных шагов и покрытие
§§1–12 спецификации; `git diff --check` пройден. Runtime/тесты/сборки не запускались.
Следующий шаг — выбор способа выполнения плана; site/reserve/native gates остаются
отдельными условиями выпуска. Производственный rollout не выполнялся.

## Проверка замечаний к плану 2026-11-06

- [x] Подтвердить замечания по общим типам, зависимостям тестов, TUI,
      release/proxy и Dock по исходникам.
- [x] Исправить план: согласованные изменения всех consumers, ранние custom
      fixtures без legacy fallback, выполнимый порядок сетевых проверок,
      обычный чат TUI; упростить локальную Dock-проверку до одного инстанса.
- [x] Согласовать со спецификацией запрет повторного входа при уже подключённой установке.
- [x] Проверить документацию самостоятельно и независимо; результат сохраняется docs-коммитом.

План правки до исполнения получил независимое Approved. Одноразовая проба
Better Auth остаётся предложением вне текущего объёма; продуктовый код не меняется.

Повторное общее ревью, Host/CLI и Dock — Approved. API и Desktop channels собраны
в Task6 атомарно; custom setup/fixtures перенесены в3; live cloud проверки —13.
TUI cancellation явно охватывает startup/cleanup и передаёт управление обычному
чату после успеха. Проверены структура, ссылки, типы commits и git diff --check.
Runtime/сборки/production не запускались. Следующий шаг — выполнение Task1.

## Checkpoint исполнения — 2026-11-06

- SHA: `fd489f49a1`, ветка `dock-cloud-auth`; исходный worktree чистый.
- Прочитан файл цели; выполнение Task1 ещё не начато, implementation checkboxes не изменены.
- Обе разрешённые копии Node совпадают с закреплённым SHA-256 Node 24.19.0.
- Блокер: в текущей сессии Codex не зарегистрированы OpenViking search/read tools.
- `ov-memory-doctor` без proxy env: timeout; с `NODE_USE_ENV_PROXY=1`: exit 0,
  credentials приняты, status 200, MCP tools/list 24, все подсистемы ready исправны.
- Это подтверждает доступность сервера, но не доступ к памяти из Agent runtime.
- Согласно пользовательским AGENTS-инструкциям работа остановлена при недоступности памяти.
- Следующий шаг: восстановить MCP-инструменты в сессии либо получить разрешение
  владельца продолжить без памяти; затем дочитать spec/plan и выполнить Task1.

## Checkpoint Task 1 — 2026-11-06

- SHA базы: `fd489f49a1`; результат фиксируется коммитом `refactor(loginom): start managed browser without Dock`.
- OpenViking восстановлен: настоящие actor search и exact read успешны; блокер снят.
- Независимое ревью полного плана/spec и источников Task1–2: Approved.
- Pre-flight: 1→2 browser/Help разделены; 3→6 mode/check/view согласованы со всеми consumers;
  4→5→7 cloud-store/auth/recovery; 6→8→10/11 API; 9→13 proxy/tuple; 12→13 harness; 2→14 scope.
- Исполнение inline (executing-plans), ledger — этот журнал; временные материалы только в storage/tmp.
- RED→GREEN: remote startup запрещён; browser IPC/env/argv без Dock key; local prepare и диагностика без remote probe.
- Runtime: pinned Node, bundled/bridge/classic/user-profile — 20 PASS; Host prepare/knowledge/process — 16 PASS.
- `bun typecheck` Host и `git diff --check`: PASS. Зависимости установлены по frozen lock, pins не менялись.
- Ограничения: проверки source/fixtures, установленный GUI и native Windows/macOS этим не подтверждены.
- Следующий шаг: Task2, ограничить семь Help-чтений официальной KB.

## Checkpoint Task 2 — 2026-11-06

- SHA Task1: `2bf6c1e354`; результат Task2 — коммит `fix(loginom): scope Help reads to official knowledge base`.
- Все семь Help-чтений проверяются до отправки: root/descendants, search list-only,
  полный read-array, относительный glob; чужие/неоднозначные URI не нормализуются в разрешённые.
- Опубликованные схемы сужены до combineCatalogs; portable read array сохранён.
- Реальные MCP fixtures: mixed read даёт 0 remote calls; find получает KB root.
- RED→GREEN: каждый scope-сценарий, сетевой mixed read, published schemas и передача safe error через Host.
- Runtime client: 27 PASS; entry: 11 PASS; Host knowledge: 3 PASS;
  дополнительно Host knowledge+prepare: 13 PASS и `bun typecheck` PASS; `git diff --check` PASS.
- Независимая проверка scope и regex/runtime: замечаний нет; ошибочные fixture read.offset/limit удалены.
- Поправка плана: allowlist scope-error перенесён из5 в2, поскольку ошибка пересекает IPC уже сейчас.
- Ограничения: настоящий Python Dock/ACL проверяется Task14; production не затронут.
- Следующий шаг: Task3, explicit custom configuration и безопасная legacy migration.

## Checkpoint Task 3 — 2026-11-06

- SHA базы: `0a6f69ae4c`; результат — `feat(loginom): add explicit custom Dock configuration`.
- Executor с Task3: subagent-driven-development; scratch/report workspace `$HOME/storage/tmp/dock-cloud-auth-70d9-16751mfl`.
- Legacy без mode → cloud без старого key; исторические файлы неизменны, Loginom credentials/URL сохранены.
- Explicit custom endpoint/key, сохранение при переключениях, Check и обязательные View/Validation fields готовы; runtime fallback удалён.
- TDD edge-ветки исправлены до commit: возврат к проверенному срезу, затем по одному RED→GREEN; mapping в scratch report.
- Host mandatory:60 PASS; final validation:20 PASS; Desktop:31 PASS; Schema:2 PASS; App:19 PASS.
- CLI cumulative:25 PASS/1 native skip; stale KB-read fixture исправлен, preflight+parser rerun:14 PASS.
- Adjacent: Desktop7 PASS, migration18 PASS; все5 `bun typecheck` и `git diff --check` PASS.
- PTY custom setup/password:code0, cancel:130; secrets скрыты, guards сняты, своих живых children нет.
- Native shutdown/oracle/oauth NOT_RUN: нужен fresh isolated Desktop artifact и private inputs; source syntax PASS.
- PTY --prompt старый provider зовёт недоступный loginom_probe; свой loop завершён, исправление fixture — Task11.
- Cloud без credentials намеренно не запускает Help; save-before-login и cloud API — Task6. Production/site/native ОС не проверены.
- Независимое ревью `f2cfcfe12b`: Spec compliant, Quality Approved; обязательных замечаний нет.
- Minor (deferred): неверный custom endpoint/key на Node IPC даёт общий безопасный код; корректный отказ сохранён.
- Следующий шаг: Task4, отдельное хранение cloud credentials.

## Checkpoint Task 4 — 2026-11-06

- SHA базы: `f2cfcfe12b`; результат — `feat(loginom): persist cloud credentials outside generations`.
- Отдельный stateless cloud.json: полный kind/schema, private permissions/owner/NOFOLLOW, temp0600, fsync/rename/directory fsync и durable clear.
- До rename выполняется decoded read-back; invalid kind/неполная пара/corrupt payload не заменяют прежнюю запись.
- После directory fsync failure новая запись остаётся фактической; rollback не обещан.
- Codec обобщён на JSON object; v1 envelope, Keychain AAD/crypto/limits сохранены; connection-store пишет только apiKey/password.
- Legacy Linux/safeStorage/CLI metadata envelopes читаются; secret pair проверяется store; четыре native script callers сузили unknown.
- TDD: roundtrip, CLI/Keychain/cloud payload, schema, permissions, read-back, fsync write/clear, fixed corrupt errors — RED→GREEN.
- Дополнительно повторены RED→GREEN safeStorage generic decode и оба connection encode payload, затем Desktop 13 PASS.
- Host mandatory 20 PASS/2 native SKIP; с adjacent migration/keychain-platform 39 PASS/2 SKIP; Desktop13 PASS.
- Host/Desktop `bun typecheck` и `git diff --check` PASS; schema/Protocol/HttpApi не менялись.
- Поправка порядка: memory/status regression требует controller; перенесён в Task5 явно, store durable semantics проверены здесь.
- Ограничения: native safeStorage/DPAPI/Keychain, installed GUI, сайт и production не проверены; используются fixtures на Linux.
- Независимое ревью `411fe5f68e`: Spec compliant, Quality Approved; замечаний нет.
- Следующий шаг: Task5 с обязательным memory/status reconciliation regression.

## Checkpoint Task 5 — 2026-11-06

- SHA базы: `411fe5f68e`; результат — `feat(loginom): implement cloud device authorization client`.
- Native fetch + schema: device/code → token → full durable pair; публичный status без device/bootstrap/Dock/installation secrets.
- Fixed Product.cloud tuple; семь точных безопасных cloud-кодов в private IPC allowlist.
- TDD: interval/slow_down/429/expiry, bounded native requests, cancel/close, URL/redirect/protocol trust и already-connected guard.
- GET pair/DELETE current используют только installation key; bootstrap revoke привязан к raw token той же device-сессии.
- Epoch и последовательные writes защищают от старых ответов; отменённый начатый login-write очищается после завершения.
- Post-rename fsync failure: memory/revision сверяются с actual disk; invalid read-back не активируется; rollback не обещан.
- Ошибки durable clear не скрываются; remote revoke ограничен5с и возвращает unconfirmed; completed credentials close сохраняет.
- Host: cloud-auth/cloud-store/transport — 60 PASS / 252 assertions (`--timeout 30000` для filesystem runner); `bun typecheck` и diff-check PASS.
- Product: genuine RED→GREEN, полный `bun test` — 34 PASS / 96 assertions; `bun typecheck` PASS (root handoff).
- Evidence и requirement→TDD mapping: `$HOME/storage/tmp/dock-cloud-auth-70d9-16751mfl/task-5-report.md`.
- Ограничения: localhost synthetic fixtures; Better Auth/site, installed GUI, production/reserve и native ОС не проверялись.
- Общий shutdown deadline применяется композицией6/7: auth close начинается в beginClose до operation drain; API close() сохранён.
- Ревью `06a66330bb`: три P1 закрыты тестами45–48 — epoch отзыва, общий cancel/close cleanup, disabled-old read-back.
- Следующий шаг: scoped re-review исправлений от `06a66330bb`, затем Task6; recovery/cooldown/failover остаются Task7.

## Ревью Task5 и уточнение порядка Task6 — 2026-11-06

- Task5 SHA `b22cbc6557`: scoped re-review Spec compliant / Quality Approved; все три P1 закрыты.
- Host60 PASS/252 assertions, typecheck и diff-check PASS; реальные fsync/revoke/cancel regressions сохранены.
- Независимая read-only проверка Task6 выявила sequencing: текущая diagnostics передаёт весь management View.
- Прежний шаг Task8 projection и тот же тест перенесены в Task6 до появления email/pending; Node routes остаются Task8.
- Это выполнение прежнего spec§5: явный безопасный набор полей, одно значение для text и structuredContent.
- Контракты/критерии не менялись; подтверждение и карта кода — task-6-context.md в task scratch.
- Следующий шаг: Task6 — save-before-login, mutable Help readiness и атомарная Host/Desktop API интеграция.

## Checkpoint Task 6 — 2026-11-06

- База SHA: `b22cbc6557`; результат — `feat(loginom): recover Help readiness within a generation`.
- Save-before-login выдаёт validation token без Help; browser check остаётся отдельным, verifyBrowser:false пропускает только его.
- CloudAuth/CloudStore подключены к Host; login/logout заменяют Help прежнего поколения, не меняют settings record/revision/browser/leases.
- KnowledgeSession владеет попыткой/child/catalog: singleflight, revision/attempt fence, cleanup retirement и повтор до readiness gates.
- RuntimeHandle публикует текущий Help snapshot; pending, browser warning и store/cleanup failures независимы, старые/closing handles игнорируются.
- Private stateDir сохраняет evidence в profile; admitted barrier сохраняет local start ACK, не ждёт remote catalog; shutdown начинает auth close до drain.
- Три cloud API атомарно проведены через schema/Host/Desktop IPC/preload/App stubs; Node cloud routes остаются Task8.
- Diagnostics явно проецирует прежние несекретные поля +mode/server/help, без cloud/email/userCode/verificationUrl.
- TDD подтверждает legacy/no-creds/connected/custom, retry tools/call/connection.ready, concurrent/stale/cancel/close и logout tools во время retirement.
- Host mandatory: 68 PASS/474 assertions; неизменённые migration18/recovery2 PASS переиспользованы; CLI9 PASS/206, Desktop30 PASS/80, App19 PASS/81, Schema2 PASS/13.
- Все5 package typechecks и diff-check PASS; публичные Protocol/HttpApi не менялись, генерация SDK не требуется.
- Измерены fixture I/O: outer30с для restart/двух cleanup tests; heavyCLI240с после177.8с/105fsync; product deadlines/assertions сохранены.
- Сохранён local ACK контракт; CLI fixture упорядочивает start ACK до close ACK/disconnect, не ослабляя writer/cleanup проверки.
- Evidence/точные команды/первичные failures: `$HOME/storage/tmp/dock-cloud-auth-70d9-16751mfl/task-6-report.md`;61 clean close receipts отдельно.
- Ограничения: synthetic localhost/Linux; сайт/production/reserve/native/installed GUI не проверялись. Исходный journal timeout не классифицирован; final PASS.
- Следующий шаг: независимое ревью Task6; затем Task7 recovery/cooldown/failover. Слияния/выпуска не выполнялись.

## Checkpoint Task 6, fix round1 — 2026-11-06

- Fix base SHA: `d2abf2a4ae`; независимое ревью выявило два Important terminal-admission дефекта; исправлены в том же Task6 commit через amend.
- Notify-only callback/Host resolver заменены одной session-owned admission Promise: success/no-creds resolve, terminal pre-ACK outcome reject после cleanup.
- Failed prepare удаляет свою generation из Host и ждёт session disposal; проверенный кандидат с неверным ACK не активируется и не закрывает рабочее поколение/browser.
- Current failed retirement завершает initial admission ошибкой; старые invalidations не завершают новую попытку, cleanup uncertainty остаётся sticky.
- Initial prepare rejection переводит существующее Help readiness в recoverable-error; applying/settled завершаются, последующий check не блокируется.
- Validation продолжает ждать ensure/catalog; admission rejection обработан без замены исходной Promise и без unhandled rejection.
- Два постоянных real-Node regression: success-check→failed-saveACK RED→GREEN; logout-beforeACK/closed:false/exit0→terminal settled RED→GREEN.
- Cloud-readiness:16 PASS/73 assertions; mandatory Host6:70 PASS/487; Host typecheck PASS; CLI startup/writer focused:1 PASS/14 assertions.
- Schema/App/Desktop/остальные CLI checks переиспользованы: public contracts/call sites/happy-path fixtures не менялись; heavy CLI не повторялся.
- Два старых pre-ACK Host tests требуют unavailable generation после disposal, сохраняя прежние status/cleanup assertions; own fixture teardown идёт через finally.
- Публичные schema/IPC/API, remote catalog recovery и product deadlines не менялись; дополнительных status flags/caches/dependencies нет.
- Exact RED/GREEN/covering outputs и self-review: `$HOME/storage/tmp/dock-cloud-auth-70d9-16751mfl/task-6-report.md`.
- Ограничения прежние: synthetic localhost/Linux, без installed GUI/native/site; независимое одобрение ещё не заявлено.
- Следующий шаг: scoped re-review `d2abf2a4ae..amended HEAD` у исходного reviewer; затем Task7 по утверждённому goal.

## Ревью Task6 — 2026-11-06

- SHA `3cbcc83f17`: scoped re-review Spec compliant / Quality Approved; оба Important исправлены, новых обязательных замечаний нет.
- Local admission сохраняет terminal outcome; failed apply оставляет рабочее поколение, failed retirement завершает ожидание с сохранением cleanup failure.
- Host70/487, cloud16/73, CLI startup/writer1/14 и Host typecheck PASS; прочие неизменённые проверки подтверждены отчётом.
- Native/site/reserve/installed GUI и полный bundled management dispatch — gates13/15; Node cloud router — Task8, в Task6 не заявлялись.
- Следующий шаг: автономно Task7 по принятому плану; push/merge/release не выполнялись.

## Checkpoint Task7 — 2026-11-06

- База SHA `3cbcc83f170`; результат — `feat(loginom): recover cloud Help with bounded failover`.
- Help использует исходный120с deadline до lease и сквозь startup/refresh/retirement/retry; remote read≤60с, managed initialize≤15с.
- Настоящий fetch отменяется по сигналу своего SDK-запроса; private IPC передаёт только проверенную классификацию HTTP/сети/timeout.
- На вызов один refresh и один primary→reserve; успешный reserve сохраняется в Host между поколениями, новый Host начинает с primary.
- Cloud refresh singleflight удерживается до durable write/changed; cooldown30с/Retry-After demand-only, новая пара и actual-diskB снимают паузу.
- Поздние401 старого child используют его завершённый refresh outcome; новый child/demand не наследует результат, у каждого waiter свой budget.
- Logout сразу отключает память, отменяет refresh, очищает файл после начатых writes; ошибка удаления не скрывается, remote DELETE bounded.
- Local admission/cleanup outcome, epoch/attempt/revision guards, browser leases и отдельная browser timeout policy сохранены.
- Принятое уточнение старого revoke/write теста: GET1 и оба waiter ждут fsync, затем допустимый следующий revoke удаляет запись/reopenfalse; logout/write с новой парой сохранён.
- В read-only review подтверждена недостижимость параллельного revoke GET при strict singleflight; новый hook/раннее освобождение flight не вводились.
- Host117 PASS/703 assertions; Runtime65 PASS; scoped CLI startup/writer1 PASS/14; Host typecheck и diff-check PASS.
- Сохранены реальные RED позднего401, actual-diskB cooldown и задержанного cleanup; исправлены первые неверные границы, не ожидания тестов.
- Публичные Schema/Protocol/HttpApi и зависимости не менялись; SDK patch/generation и Task8+ отсутствуют.
- Evidence/точные команды/ограничения: `$HOME/storage/tmp/dock-cloud-auth-70d9-16751mfl/task-7-report.md`.
- Ограничения: synthetic localhost/Linux; site/production reserve/native stores/installed GUI и полный120с worst-case остаются gates13/15.
- Следующий шаг: независимое ревью Task7; после принятия Task8. Push/merge/release не выполнялись.

## Checkpoint Task7, fix round1 — 2026-11-06

- Fix base SHA `399b9e3fd9`; независимое ревью нашло два Important/P2, исправления входят через amend в тот же Task7 commit.
- Concurrent catalog после общего reserve startup больше не использует stale primary: route caller обновляется после await, действующий reserve сохраняется.
- Recovery видит target общей попытки; failed reserve не получает дополнительный failover, explicit reserve intent не понижается до primary.
- SDK GET/SSE, как и POST, получает redirect:error в текущей fetch boundary; same-origin302 не вызывает target и не передаёт ему Bearer.
- Оба замечания закреплены постоянными настоящими HTTP/MCP RED→GREEN; concurrent failed reserve отдельно проверен без нового retry.
- Общий deadline, local admission/retirement/cleanup, refresh singleflight/cooldown и browser leases не изменены.
- Host119 PASS/715 assertions; Runtime66 PASS; scoped CLI startup/writer1 PASS/14; Host typecheck и diff-check PASS.
- Новых dependencies/framework/SDK patches/public contracts нет; heavy CLI и Task8+ не запускались.
- Exact commands, RED/GREEN и covering logs: `$HOME/storage/tmp/dock-cloud-auth-70d9-16751mfl/task-7-report.md`.
- Ограничения прежние: synthetic localhost/Linux; native/site/production/installed GUI/full120с acceptance не заявлены.
- Следующий шаг: scoped re-review `399b9e3fd9..amended HEAD`; независимое одобрение не заявляется. Push/merge/release не выполнялись.

## Ревью Task7 — 2026-11-06

- SHA `3f1e1f80a7`: scoped re-review Spec compliant / Quality Approved; оба Important/P2 закрыты, новых замечаний нет.
- Concurrent catalog сохраняет успешный reserve; actual route и лимиты попыток согласованы. Fetch-граница запрещает redirect также для credential-bearing GET/SSE.
- Host119/715, Runtime66, CLI startup/writer1/14, Host typecheck/diff-check/secret hook PASS.
- Native/site/production/installed GUI и полный native120с worst-case остаются gates13/15; в Task7 не заявлены проверенными.
- Следующий шаг: Task8 private Node management routes; push/merge/release не выполнялись.

## Checkpoint Task8 — 2026-11-06

- SHA базы: `3f1e1f80a7`; Task8 — коммит с этим checkpoint, итоговый SHA в отчёте.
- Private Node API принимает exact `connection.cloud-start/cloud-cancel/cloud-disconnect` только с `{}` и возвращает существующий redacted View.
- Существующий handler/decoders перенесён в internal `node-management.ts`; production и real Host localhost fixture используют один код без bootstrap injection.
- `connection.ready` наблюдает живой shutdown; Host.beginClose/stop-before-drain, local admission, поколения и Task7 recovery/deadline не менялись.
- Реальные bundled cancel/disconnect и real Host pending/status/cancel подтверждены; status/cancel/disconnected-disconnect не делают HTTP.
- Model diagnostics сохраняют прежние безопасные поля и равенство text/structuredContent; cloud/code/link/email и новые tools не добавлены.
- RED→GREEN: неизвестные routes, start и exact empty input. Ошибка добавленного raw View decoder устранена в тесте, продукт не менялся ради проверки.
- Schema2 PASS/13 assertions; Host48 PASS/381 assertions; все5 package typechecks и git diff --check PASS.
- Новых общих полей/Protocol/HttpApi/dependencies/generated правок нет; parent Task7 review note сохранён.
- Evidence/точные команды/самопроверка: `$HOME/storage/tmp/dock-cloud-auth-70d9-16751mfl/task-8-report.md`.
- Ограничения: localhost/Linux; full bundled cloud device flow с baked tuple — Task13, site/native/installed/production не проверялись.
- Следующий шаг: независимое ревью Task8; Task9 — после принятия. Push/PR/merge/release не выполнялись.

## Ревью Task8 — 2026-11-06

- SHA `f3249af43f`: независимое ревью Spec compliant / Quality Approved; обязательных замечаний нет.
- Реальный Node routing использует общий handler, exact empty input и живое состояние shutdown; модель получает только безопасную проекцию.
- Host48/381, Schema2/13 и все5 package typechecks PASS; full compiled cloud flow остаётся Task13, native/site — Task15.
- Следующий шаг: Task9 explicit proxy/CA; push/PR/merge/release не выполнялись.

## Checkpoint Task9 — 2026-11-06

- База SHA `f3249af43f24`; Task9 — коммит с этим checkpoint, итоговый SHA в отчёте.
- Реальные native Node CloudAuth device/code и Help initialize/list используют explicit HTTP(S)/ALL proxy без opt-in flag; direct target0.
- Native env snapshot сохраняет per-scheme lowercase/uppercase precedence/NO_PROXY, добавляет ALL fallback без изменения process.env/OS resolver.
- По реальному malformed RED и независимому technical review init находится в default CloudAuth request и remote Help promise, не в strict Node bootstrap.
- Local Host admission и Help start ACK сохранены; init failure даёт безопасный unavailable, refresh/DELETE не идут direct, close ACK+exit подтверждены.
- Desktop повторяет тот же native init сразу после preferAppEnv; warning больше не содержит raw native error/proxy URL; sidecar контракт сохранён.
- Реальные regression: NO_PROXY direct, dead/unsupported proxy target0, отсутствие explicit env при OS/PAC fixture, redirect second-origin0, child credentials filter.
- Local test CA доказала TLS CONNECT для обоих клиентов; существующие system-CA настройки и Chromium --no-proxy-server сохранены.
- Host100 PASS/476 assertions; Runtime18 PASS; local Host1/3 и CLI startup writer1/8 PASS; Host/Desktop typecheck и diff-check PASS.
- Desktop environment-proxy и pinned Node no-proxy-contract PASS; source guard проверяет shell-init порядок и Chromium flags.
- Общие Schema/Protocol/HttpApi, dependencies/pins/handshake/generated код не менялись; parent Task8 review note сохранён.
- Evidence/команды/RED→GREEN/self-review: `$HOME/storage/tmp/dock-cloud-auth-70d9-16751mfl/task-9-report.md`.
- Ограничения: собранный Desktop first-shell-request и полный baked NodeHost cloud — gate13; installed system CA/native/site/reserve — gate15.
- Следующий шаг: независимое ревью Task9; Task10 только после принятия. Push/PR/merge/release не выполнялись.
