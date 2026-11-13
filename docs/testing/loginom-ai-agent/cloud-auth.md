# Облачное подключение: source/local приёмка

Дата: 2026-11-06. Ветка `dock-cloud-auth`; принятая база Task15 —
`0b9e5d5948ea8968b3fa165146340e82c53497a0` (Task14).
Итоговый проверенный runtime source SHA — `a688c02c83453d1fbc8e03dc95dcb217aa496bc4`.
[Спецификация](../../superpowers/specs/2026-11-05-dock-cloud-auth-design.md) задаёт
поведение; [план, Task15](../../superpowers/plans/2026-11-06-dock-cloud-auth.md#task-15-сквозная-приёмка-и-готовность-к-выпуску)
и [журнал](../../plans/2026-11-05-dock-cloud-auth-design.md) фиксируют исполнение.

Клиентский контракт проверен исходными тестами, собранными нерелизными Linux
Desktop/CLI и настоящим локальным Dock. Задачи1–14 независимо приняты.
Source gate и local integration gate — **PASS**: пакетные/сквозные проверки,
независимое ревью Task15, всего diff и обязательных исправлений завершены.
Общее ревью нашло два Important/P2; они исправлены и независимо приняты,
а не скрыты за прежними Approvals.
Native Windows/macOS, внешняя staging-интеграция и настоящий0.3.9 — **NOT_RUN**.
Облачный выпуск не готов; локальные fixtures не подтверждают Better Auth.

## Происхождение и повторное использование результатов

Проверки ниже выполнены при реализации соответствующих задач; Task15 сводит их
результаты и повторяет только документальные проверки. Числа разных запусков
не складываются: suites пересекаются. Каждый указанный PASS завершился exit0.
Ошибочные промежуточные запуски сохранены в исходных отчётах и не названы PASS.

Коммиты задач1–14 в порядке исполнения:
`2bf6c1e354`, `0a6f69ae4c`, `f2cfcfe12b`, `411fe5f68e`, `b22cbc6557`,
`3cbcc83f17`, `3f1e1f80a7`, `f3249af43f`, `2f0f279fa4`, `c238d0ad7d`,
`8b3756a4e2`, `d65979d3a7`, `39d1fce83f`, `0b9e5d5948`.
Ревью каждой задачи: Spec compliant / Quality Approved. Initial Task15
`7ae457baf4` также scoped Approved; итог общего ревью и закрытие F1/F2 записаны ниже.

Зачтённые Bun tests и `bun typecheck` запускались из указанного package directory,
не из корня. Ошибочный root Turbo typecheck финального fix вышел139 и не засчитан;
авторитетны успешные повторные package-local typechecks. `TMPDIR=TMP=TEMP=$HOME/storage/tmp/`; Python Task14 использовал
собственный подкаталог там же. Node tests использовали явный
`LOGINOM_AI_AGENT_TEST_NODE=<project-root>/packages/desktop/resources/loginom/bin/node`:
24.19.0, SHA256 `bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12`.
Bun1.3.14; pins и зависимости продукта не менялись. При явных proxy fixtures
дочерние Node получали их собственное окружение; ambient proxy у Bun runner
удаляли, не меняя политику продукта.

Task13 собрал оба клиента из одного согласованного dirty source snapshot на
BASE `d65979d3a7`. После обнаруженного POSIX launcher fix пересобран CLI;
Desktop не включает `node-client.ts` в emitted dependency closure. Freeze-сверка
подтвердила равенство всех фактических build inputs принятому Task13
`39d1fce83f14894cda2faee3b2d7bb5bc5f9738e`.
Это не сборки с внедрённым чистым final SHA: metadata правдиво содержит BASE/dirty.
Task14 изменил Python Dock, тестовый probe и документацию. В Task15 команда
`git diff --exit-code 39d1fce83f..0b9e5d5948 -- packages/product packages/schema packages/loginom-host packages/loginom-runtime/src packages/loginom-runtime/client packages/app packages/ui packages/desktop packages/opencode bun.lock .github/workflows/release.yml`
дала exit0; Python Dock не входит в сборщики клиентских артефактов.
Повторная сборка только ради номера Task14 не требовалась. После F1/F2 оба
клиента собраны заново: эти артефакты заменяют затронутое assembled evidence13,
сохраняя его исторические paths/version/provenance.

## Source gate: проверенные срезы

Ниже команды без общего environment prefix, описанного выше. Это индекс
применимых проверок на последовательных source SHA, а не утверждение об одном
новом полном запуске Task15.

- Tasks1–2 (`2bf6c1e354`, `0a6f69ae4c`): managed browser без Dock startup/key,
  все семь Help tools ограничены официальной KB; mixed read даёт0 dispatch.
  Runtime20 и Host16; затем Runtime client27/entry11 и Host13 PASS.
  Позднейший runtime gate Task7 ниже включает эти пути; настоящий Dock — Task14.
- Task3 (`f2cfcfe12b`), Host: `bun test test/connection-validation.test.ts test/knowledge.test.ts test/node-host.test.ts test/host.test.ts test/prepare-startup.test.ts`
  —60 PASS; `bun test test/connection-migration.test.ts --timeout 15000` —18 PASS.
  Legacy record без mode становится cloud без старого ключа/endpoint; URL,
  логин, пароль, generation/revision и исторические файлы сохранены.
- Task4 (`411fe5f68e`), Host: `bun test test/cloud-store.test.ts test/cli-credentials.test.ts test/keychain-envelope.test.ts test/connection-migration.test.ts test/keychain-platform.test.ts`
  —39 PASS/2 native DPAPI SKIP; Desktop:
  `bun test src/main/loginom/credentials.test.ts src/main/loginom/connection-store.test.ts`
  —13 PASS. Настоящие private filesystem read/write/fsync/clear и права0700/0600;
  portable envelope tests не заменяют native safeStorage/DPAPI/Keychain.
- Task5 (`b22cbc6557`), Host:
  `bun test --timeout 30000 test/cloud-auth.test.ts test/cloud-store.test.ts test/transport.test.ts`
  —60 PASS/252 assertions; Product `bun test` —34 PASS/96 assertions.
  Device exchange, точная bootstrap-session/raw-token привязка, cancel/late write,
  logout/offline logout/revocation и redaction проверены HTTP-контрактом.
- Task6 (`3cbcc83f17`), Host:
  `bun test --timeout 30000 test/cloud-readiness.test.ts test/connection-readiness.test.ts test/connection-validation.test.ts test/knowledge.test.ts test/host.test.ts test/host-port.test.ts`
  —70 PASS/487 assertions; отдельный cloud-readiness —16 PASS/73.
  Save-before-login и восстановление Help сохраняют generation; browser status,
  admission/cleanup и безопасная model projection проверены отдельно.
- Task7 (`3f1e1f80a7`), Host:
  `bun test test/cloud-recovery.test.ts test/cloud-auth.test.ts test/cloud-readiness.test.ts test/knowledge.test.ts test/host-port.test.ts`
  —119 PASS/715 assertions. Runtime:
  `"$LOGINOM_AI_AGENT_TEST_NODE" --test test/knowledge-entry.test.mjs client/test/knowledge-client.test.mjs client/test/catalog.test.mjs`
  —66 PASS. Реальный HTTP site и два MCP fixtures/Help child: правильные keys,
  sticky reserve, оба offline/следующий demand, HTTP/RPC distinction,
  singleflight/cooldown/Retry-After, cancellation и redirect SSE GET.
- Task8 (`f3249af43f`), Host:
  `bun test test/node-host.test.ts test/host-port.test.ts test/transport.test.ts`
  —48 PASS/381 assertions; Schema `bun test test/loginom.test.ts` —2 PASS/13.
  Exact-empty private routes, реальный Node cancel/disconnect, программный real
  Host start/status и одинаковая безопасная text/structured projection.
  Полный compiled cloud-start дополнен Task13.
- Task9 (`2f0f279fa4`), Host:
  `bun test test/cloud-proxy.test.ts test/environment.test.ts test/system-proxy.test.ts test/cloud-auth.test.ts test/cloud-readiness.test.ts`
  —100 PASS/476 assertions. Desktop `bun test/loginom/environment-proxy.ts`
  и `"$LOGINOM_AI_AGENT_TEST_NODE" test/loginom/no-proxy-contract.mjs` —PASS.
  Runtime `"$LOGINOM_AI_AGENT_TEST_NODE" --test test/knowledge-entry.test.mjs test/managed-entry-close.test.mjs`
  —18 PASS. Настоящие CloudAuth/Help fetch: HTTP(S)/ALL/lowercase/NO_PROXY,
  test CA, dead/malformed proxy без direct fallback; OS/PAC не подхватывается.
- Task10 (`c238d0ad7d`), App:
  `bun test --conditions=browser --preload ../ui/test/solid-jsx.ts --preload ./happydom.ts ./test-browser/settings-loginom.test.ts`
  —32 PASS/147 assertions; Desktop `bun test src/main/loginom` —47 PASS/138.
  Изолированный settings-ux проверил форму с IPC-stub: сохранение черновика и
  секретов, dispose/cancel, stale status/error guards, отдельный browser feedback.
  Настоящий GUI→backend путь подтверждён отдельно ниже.
- Task11 (`8b3756a4e2`), Opencode:
  `bun test test/cli/loginom-management.test.ts test/cli/standalone-status.test.ts test/cli/standalone-preflight.test.ts test/cli/standalone-startup.test.ts test/cli/profile.test.ts test/cli/standalone.test.ts`
  —69 PASS/1 compiled opt-in SKIP/656 assertions; три source PTY PASS.
  После исправления fallback Host:
  `bun test test/host-port.test.ts test/cloud-readiness.test.ts` —48 PASS/341;
  Opencode `bun test test/cli/standalone-preflight.test.ts -t 'lazy scenario preparation.*help-unavailable'`
  —1 PASS/8. Опциональный compiled case выполнен Task13.
- Task12 (`d65979d3a7`), evals `bun test test/profile.test.ts` —108 PASS/2 existing
  opt-in SKIP/387 assertions; scripts/node-acceptance:
  `python3 -m unittest discover -s tests -p 'test_run_check_build.py'` —10 PASS.
  Custom setup через stdin, отсутствие ключа в build/env/argv, pre-model отказ
  без ключа и slot guards. Полная live eval campaign не выполнялась.
- Task13 (`39d1fce83f`), Host:
  `bun test test/stage-resources.test.ts test/cloud-build.test.ts test/cloud-readiness.test.ts test/node-host.test.ts test/cloud-proxy.test.ts`
  —86 PASS/1 compiled opt-in SKIP/557 assertions; после launcher fix
  `bun test test/node-host.test.ts` —27 PASS/1 opt-in SKIP/162.
  Opencode `bun test test/cli/loginom-management.test.ts test/cli/standalone-status.test.ts test/cli/standalone-preflight.test.ts test/cli/standalone-startup.test.ts test/cli/profile.test.ts`
  —54 PASS/2 opt-in SKIP/574. Desktop
  `bun test src/main/loginom src/main/environment.test.ts src/main/shell-env.test.ts electron-builder.config.test.ts scripts/release/artifact.test.ts`
  —65 PASS/2 native SKIP/256. Все compiled opt-ins выполнены отдельно ниже;
  native skips не объявлены PASS.
- `bun typecheck` PASS в schema/loginom-host/app/desktop/opencode после общей
  schema/consumer границы Task8. Последующие затронутые App/Desktop —Task10;
  Host/Opencode —Task11; Host/Desktop/Opencode —Task13, Host/Opencode повторно
  после launcher fix. Product —Task5, evals —Task12. Генерация SDK не нужна:
  публичные Protocol/Server HttpApi не менялись.

Реальные короткие сквозные deadlines/abort и расчёт cap60s/initial15s проверены
Task7. CLI polling свыше180s — виртуальное время181s Task11. Это не PASS
полного native120s worst-case: такой прогон не выполнялся. IPC120s/outer180s,
один refresh и один failover, cooldown30s не ослаблялись ради тестов.

## Итог общего ревью и source fix

Независимый аудит всего `dd2f949d11..7ae457baf4dcbf7614898b5fd83d13af51bee7fc`
(134 файла/19 commits) дал **Needs fixes**, два Important/P2, Critical0:

- F1: Desktop Connect возвращал pending URL, но не открывал его; старый GUI
  harness сам нажимал ручную ссылку и не доказывал автоматическое открытие.
- F2: один исходный HostPort read мог refresh дважды: при catalog/lease recovery
  и при actual read. Независимый real HTTP probe подтвердил2 GET/2 read attempts.

Оба исправлены отдельным source commit
`a688c02c83453d1fbc8e03dc95dcb217aa496bc4` —
`fix(loginom): open cloud login and bound Help recovery`:
Desktop использует существующий OS opener ровно один раз для актуального pending
URL, без блокирования polling, с manual fallback и cancel/dispose guards.
HostPort создаёт один внутренний recovery allowance исходного запроса, общий для
catalog и read. Независимые/direct Host calls сохраняют отдельные allowance;
Schema/API/IPC/dependencies/pins/global registry не менялись.

Scoped review всего `7ae457baf4..a688c02c83` — **Spec compliant / Quality Approved**:
F1/F2 ADDRESSED2, OPEN0, новых Critical/Important0. Это фактическое закрытие
обязательных findings общего аудита. Source gate закрыт на указанном runtime SHA.

Применимые финальные source проверки, с общим environment выше:

- App `bun test --conditions=browser --preload ../ui/test/solid-jsx.ts --preload ./happydom.ts ./test-browser/settings-loginom.test.ts`
  —exit0,35 PASS/161 assertions. Точный URL/один opener, sync/async failure,
  late cancel/dispose; новое поведение RED→GREEN.
- Host `bun test test/cloud-readiness.test.ts test/host-port.test.ts test/cloud-recovery.test.ts test/cloud-auth.test.ts`
  первоначально —exit1,127 PASS/2 FAIL/721 assertions. Два failures:
  concurrent401 и late401; lazy mutation budget ошибочно связала независимые
  direct calls. Исправление отделило ownership HostPort от direct Host.
  `bun test test/cloud-recovery.test.ts` после исправления —exit0,25 PASS/109.
  Остальные127 green cases применимы; это не один новый запуск129 PASS.
  Постоянный real transport→HostPort→Host→Help regression требует error,
  refresh1/read1/no logout и успех следующего независимого вызова.
- Desktop `bun test src/main/loginom` на `a688c02c83` —exit0,47 PASS/138,
  41.27s/0 unhandled. Ранее46 PASS/1 runner timeout5000ms в неизменённом
  two-active-drains case, затем focused1 PASS/8; причина исходного timeout
  не доказана. Полный неизменённый slice повторно прошёл; budgets/assertions
  не ослаблялись.
- Финальные `bun typecheck` из loginom-host/desktop/opencode —exit0;
  App typecheck PASS на неизменённом после его проверки исходнике.
  Другие source checks выше переиспользованы по неизменным срезам.

## Local integration gate: актуальные собранные клиенты

В source fix штатные сборщики снова выполнили из Host
`bun script/build-cli.ts <scratch>/final-fix-cli --no-archive`, из Desktop
`bun run build` и `bun run package:linux --dir --x64 --publish never --config.directories.output=<scratch>/final-fix-desktop --config.electronDist=<pinned-electron-zip>`
—все exit0. `<scratch>` здесь —
`$HOME/storage/tmp/dock-cloud-auth-70d9-16751mfl`.
Одна dev HTTPS tuple из собственного site и двух реальных MCP fixtures встроена
в оба клиента. Desktop profile и CLI root различны. Это клиентский контракт,
не Better Auth. Production forwarding отсутствовал; release fixed-endpoint
и24 CI guard combinations из13 не затронуты fix и не повторялись.

17532 source inputs заморожены до сборки и не менялись во время неё. Итоговые
product bytes соответствуют `a688c02c83`; после build изменён только Node test
(new outage expected error и гарантированный close после auxiliary fixture reset).
Build metadata правдиво содержит BASE `7ae457baf4`/dirty=true, не clean final SHA.

- CLI: `<scratch>/final-fix-cli`, version `0.0.0-dev-202611062033`,
  sourceTreeSha256 `5402e89389b1f87616992e708801bb472594299b7959bce1b0951d407ce4b1c7`.
  Desktop: `<scratch>/final-fix-desktop/linux-unpacked`, version0.3.9/dev,
  Electron42.3.3. Это own dev artifacts, не installed release/authentic legacy0.3.9.
- Host `bun test test/node-host.test.ts --test-name-pattern 'current compiled CLI Host'`
  с `LOGINOM_AI_AGENT_TEST_CLI_BIN=<scratch>/final-fix-cli/bin/loginom-ai-agent-cli`
  и `LOGINOM_AI_AGENT_TEST_CLOUD_FIXTURE=<scratch>/final-fix-fixture.json`
  —exit0,1 PASS/22 assertions. Реальный bundled Node→HostPort→Help HTTP:
  save/login/same generation, семь reads, обе Dock outage, catalog401→refresh→
  actual read401 с refresh1/read1/error/no logout и дальнейшим независимым recovery.
  Site/Help direct0, NO_PROXY/dead proxy и acknowledged clean exit сохранены.
- Из Desktop `xvfb-run -a "$LOGINOM_AI_AGENT_TEST_NODE" test/loginom/settings-live.mjs`
  с JSON stdin `{executable,connection,cloud}` из своего descriptor —exit0.
  Только Connect, без ручного клика: automaticOpenRequests2 для двух попыток,
  каждый exact URL ровно раз, manualLinkClicks0/osBrowserOpens0.
  Реальные renderer→controller→preload→IPC→Host; save-before-login/start/cancel,
  ready в той же generation/revision1, disconnect, login-shell proxy/direct0.
  Только OS opener перехвачен; настоящий Loginom browser не запускался.
  Evidence: `$HOME/storage/tmp/loginom-settings-live-peGOQa`;
  собственный successful profile удалён после acknowledged close, screenshot/summary сохранены.
- ASAR main/preload/renderer current-byte equality PASS; ASAR SHA256
  `6f345dc7277a8af5e617e6596cbbda7589fe542efa09b95e7549e788418d1c7f`.
  Resource inventory5117 и CLI6141 entries PASS. Full byte scan6136 CLI /
  5222 Desktop regular files: общий Dock key, fixture secrets и profile files отсутствуют.
  Свои artifact processes завершены; fixture SIGTERM/wait exit0, PID отсутствует.

Исторические compiled gates13 остаются доказательствами на своей ревизии:
management1/28, constructor1/13 и PTY3/3 через существующие Opencode tests/driver.
Команды management/constructor:
`bun test test/cli/loginom-management.test.ts --test-name-pattern 'compiled CLI connects'`,
`bun test test/cli/standalone-startup.test.ts --test-name-pattern 'compiled CLI recovers'`.
PTY: `python3 test/cli/tui/standalone-pty.py --compiled-cloud --cloud-without-login`
с `--cloud-cancel`, `--cloud-connect --prompt`, `--prompt`, собственными
`LOGINOM_AI_AGENT_TEST_CLI_EXE`/`LOGINOM_AI_AGENT_TEST_CLOUD_FIXTURE`:
Ctrl+C130, connect0/decline0, forced=false/one Host/guard=false/alive0,
provider reply в SQLite. CLI lifecycle/launcher и эти contracts не менялись;
F1 проверен новым GUI, затронутый F2 HostPort — новым compiled Node gate выше.
Это не повтор этих management/PTY checks на a688.

Исторические paths13 не переименовывались: `<scratch>/task13-cli`
(version `0.0.0-dev-202611061850`, snapshot
`949b6e6cd53e3d5578950d98e3625fa021817adcd664a234de82fab7f6eb86dc`),
`<scratch>/task13-desktop` (0.3.9/dev, snapshot
`b6ca8ce58e7ebf7ebedcc727c9f0ace3187a0fad045da706116ba399e2242801`,
ASAR `49030acd69ceb153f6911841949dfac6ea0a8e62b3906de3aa30d86393f9f68b`).
Оба BASE12/dirty; historical GUI evidence `loginom-settings-live-shAv1M`.
Временные candidate paths не обещают бессрочного хранения артефактов.

Task14 (`0b9e5d5948`) дополнительно проверил настоящий Python Dock на loopback:
RagFS/vector x86_avx2 реально загружены, отдельные workspace/auth registry,
только внешние embedding/VLM fake. Это один Dock, не два независимых deployment.
ADMIN публикует KB; USER читает точный trusted content и получает отказ
write/delete/ACL/admin. A пишет hostile данные вне KB; реальный managed client B
выполняет все семь Help tools без их получения; mixed read отказан до dispatch.
Ротация B: старый key401, новый работает; повторная публикация сохраняет identities,
legacy USER и read-only effective grants.

Из `services/loginom-ai` с частным frozen env:

```sh
uv run --frozen --no-sync pytest tests/server/test_agent_cloud_access.py tests/server/test_admin_api.py::test_register_user tests/server/test_admin_api.py::test_regenerate_key tests/server/test_admin_api.py::test_user_role_cannot_access_admin_api tests/server/test_content_write_service.py::test_shared_resource_creation_inherits_acl_and_preserves_plain_append
```

Exit0,6 PASS/0 SKIP. После усиления exact-content/cleanup assertions новые
native/network tests повторно2 PASS. Исходная affected-команда из того же package:

```sh
uv run --frozen --no-sync pytest tests/server/test_agent_cloud_access.py tests/server/test_request_wait_tracking.py tests/telemetry/test_request_wait_tracker.py tests/storage/test_semantic_processor_target_preexisting.py tests/storage/test_semantic_processor_identity.py
```

Exit1,19 PASS/2 FAIL:15 tracker/processor cases прошли, два request-wait cases
показали устаревший unit stub. После его исправления
`uv run --frozen --no-sync pytest tests/server/test_request_wait_tracking.py`
—exit0,4 PASS. Вместе с final native/network2 PASS это применимые21 поведения,
не один вымышленный запуск21 PASS. Native mandatory ACL test выявил дефект
`write(wait:true)`: disabled telemetry теряла request identity. Минимальный bind
в SemanticProcessor восстановил ожидание embedding/creator MANAGE; неизменённый
обязательный тест RED→GREEN, без global wait и изменения ACL policy.

Python3.13.1, private official uv0.10.9, Rust1.91.1; замороженные pyproject/uv.lock/
Cargo.lock/setup.py не менялись. Для повторения задать собственные
`UV_PROJECT_ENVIRONMENT`, `UV_CACHE_DIR`, `OPENVIKING_CONFIG_FILE`, `COVERAGE_FILE`
и pytest cache под storage/tmp; config — только свои local storage/model settings.
Native RagFS/vector обязательны; отсутствие prerequisites не заменяется SKIP PASS.
[Dock runbook](../../../services/loginom-ai/deploy/loginom-dock/README.md)
содержит per-instance bootstrap/публикацию KB/ACL audit/backup и rollback границы.

При ранней диагностике Task14 два private лога содержали собственные synthetic
fixture keys из traceback repr. Они заменены явными sanitized failure summaries;
retired secret dirs удалены, финальные свои child processes завершены.
Production/user keys, conversation, git и экспортированное evidence не затронуты.
Нельзя утверждать, что диагностической экспозиции никогда не было.

## NOT_RUN: что требуется для продолжения

**Native gate Windows/macOS:** runners и собранные целевые Desktop/CLI не
предоставлены. На каждой ОС проверить system CA; explicit HTTP(S)_PROXY/NO_PROXY
для site и Help; dead proxy без direct fallback; отсутствие OS/PAC auto-discovery;
native cloud save/read/delete в safeStorage/DPAPI/Keychain и отказ чужому CLI
профилю расшифровать Keychain запись. Browser Loginom остаётся прямым.
Linux plaintext0700/0600 и local CA/proxy fixtures PASS; это не installed OS trust
и не полный native worst-case budget. Установленные приложения не запускались.
На момент Task15 Windows driver передавал старый input без `cloud`, а общий
checker создавал POSIX shell. Совместимость исправлена 2026-11-09 и проверена
переносимыми тестами, результаты приведены ниже. Сам native Windows gate
по-прежнему требует выполнения на целевой ОС.

**Внешний gate:** не выполнен — разрешённые staging site, два независимых Dock
registry/accounts и подготовленные тестовые установки не предоставлены.
План исходил из отсутствия реализованных сайта/reserve; текущая доступность
публичных сервисов не проверялась. Production для выяснения этого не опрашивался.
Владелец предоставляет изолированный стенд, нерелизные клиенты одного проверенного
source и accounts отдельно от git/evidence. Затем выполнить полную матрицу
Task15, сохраняя отдельный результат каждого сценария:

- Первый Desktop/CLI device login: регистрация/анкета один раз без email
  confirmation, явное подтверждение кода и смена текущего аккаунта.
- Две одновременные установки: разные installation keys, одна действующая Dock
  pair без ротации; save/migration→ready, cancel/Ctrl+C/late response/guard cleanup.
- Exact raw-token cleanup device session при сохранении browser session;
  ordinary logout одной установки оставляет общую pair и другую установку.
- Installation/user revoke на обоих Dock; другая действующая установка refresh
  без login; partial rotation/lost reply возвращает actual keys либо временную
  ошибку; GET vs revoke повторяет active binding check под сериализацией.
- Чужая config/unbound API key не получает пару; exact disabledPaths, server API
  и явно заданный rate60/min. Это гарантии реализации сайта, fixtures их не доказали.
- Primary/both offline, sticky reserve/new demand; site offline/HTML401/429/
  Retry-After и confirmed access_revoked с удалением на диске.
- Два независимых registry: одинаковая KB, разные keys, primary key не проходит
  на reserve, ротация одного не меняет другой; публикация KB сохраняет identities.
  Не использовать полный primary restore для синхронизации KB.
- На каждом реальном deployment — семь managed reads и negative scope/ACL;
  после отзыва browser session может подтвердить новый вход. Это граница
  гарантии, не обещание блокировки компьютера.

Сайт, его auth framework/маршруты/БД и reserve этой задачей не реализуются.
Production admin exposure, private-network/URL-import и rollout не проверены.

**Настоящий legacy0.3.9:** NOT_RUN. Наличие бинарника
`/opt/loginom-ai-agent-cli/0.3.9` известно из назначения; безопасные разрешённые
isolated inputs для его запуска не предоставлены. Ключ из бинарника не извлекался,
production/owner profile не использованы. Source migration fixture и legacy USER
Task14 не доказывают совместимость этого бинарника с настоящим deployment;
совпадение с `dd2f949d11` не предполагается. Продолжение — отдельный безопасный
стенд и разрешённый способ выдать legacy credentials без извлечения рабочего ключа.
Legacy key не отключался; его отключение после уведомления — отдельная команда владельца.

## Evidence и следующий шаг

Прежние неблокирующие замечания не расширяют приёмку: общий безопасный код ошибки
custom validation IPC (Task3), stderr noise public fixture (Task11), четыре
Pydantic warnings (Task14). Пробел запуска fixture в runbook (Task13) исправлен
и проверен этой задачей; остальные замечания не менялись.

Исторические отчёты/логи этой машины:
`$HOME/storage/tmp/dock-cloud-auth-70d9-16751mfl/task-{3..15}-report.md`,
Task13 freeze/inventory/candidate verification JSON, settings-live evidence
`$HOME/storage/tmp/loginom-settings-live-shAv1M`, Task14 native logs.
Это временные материалы, не обязательная долговечная копия git-документации;
команды, source provenance, результаты и условия продолжения сохранены выше.

Initial Task15 docs commit `7ae457baf4` прошёл scoped review и документальные
проверки, включая actual fixture start/readiness/own-PID cleanup smoke.
Независимое whole-branch ревью нашло F1/F2; source fix `a688c02c83` проверен
отдельным scoped review, оба findings закрыты, новых Critical/Important нет.
Точный affected pytest command из Minor15 перенесён выше без повторного запуска.

Заключительная правка Task15 — только документация поверх стабильного runtime SHA
`a688c02c83453d1fbc8e03dc95dcb217aa496bc4`: source/local gates закрыты,
native/external остаются NOT_RUN. Проверяются изменённые ссылки, checkboxes,
checkpoint<=20 строк, diff и неизменность кода. Новые suites/builds не запускались;
результаты/пределы исходных проверок сохранены. Следующие действия владельца —
изолированные site/reserve/accounts, native CA/proxy/storage приёмка с совместимым
Windows driver, безопасный authentic0.3.9 стенд; legacy-disable отдельной командой.
Push, PR, merge, release, production rollout и отключение legacy key не выполнялись.

## Исправления ревью от 2026-11-09

Семь замечаний к `c5e75acb34` исправлены в ветке `dock-cloud-auth`.
План и принятые решения находятся в
`docs/superpowers/plans/2026-11-09-cloud-review-fixes.md`.

- Повторный вход после ожидания cleanup учитывает каждую последующую отмену
  и закрытие Host. Присоединение к общей отмене также прекращает ожидающий start.
- Повреждённый cloud store возвращает безопасный `cloud.failure=LOGINOM_STORE_READ_FAILED`.
  Исправный custom-профиль сохраняет Help, а management disconnect удаляет повреждённую
  запись. Cancel сохраняет ошибку чтения, ошибка удаления остаётся явной.
- Во время повторного восстановления Help новые read/tools ожидают общий каталог
  в собственном исходном budget. Interrupt/release любого участника прекращает
  только его ожидание. Общая загрузка ограничена lifetime поколения и deadline
  первой попытки. Первоначальный startup сохраняет доступ к локальной диагностике.
- Eval setup/ensure/verify сохраняют префикс Dock base URL с завершающим slash и без него.
- TUI учитывает `cloud.connected` и открывает обычный чат без повторного входа,
  когда подключение аккаунта уже сохранено, а настройки Loginom ещё отсутствуют.
- Ошибка записи обновлённых ключей включает demand-only cooldown 30 секунд.
  Повторный запрос после этого срока может сохранить новую пару.
- Windows settings driver передаёт актуальный cloud fixture, использует явные
  proxy и CA. POSIX сохраняет проверку login-shell. Драйверу нужен
  `LOGINOM_AI_AGENT_TEST_CLOUD_FIXTURE` от стенда с compiled dev endpoints сборки.

Для каждого замечания воспроизведён RED и получен GREEN через существующие
публичные точки входа. F3 дополнительно воспроизвёл отмену общей загрузки
при interrupt инициатора, после исправления проверены оба участника.
Независимое ревью плана и итогового diff завершено, новых замечаний нет.

Пакетные проверки выполнены на исходниках с закреплённым Node24.19.0,
Bun1.3.14 и временными каталогами в `$HOME/storage/tmp/`.
Ambient proxy убраны только из окружения тестовых runners.

- Host `cloud-auth`, `cloud-readiness`, `cloud-store` — 87 PASS.
- Host `connection-validation`, `connection-readiness`, `transport`, `settings-live` — 33 PASS.
- Host `cloud-recovery`, `host-port`, `knowledge` — 70 PASS.
- Evals `profile` — 110 PASS, 2 opt-in proc-denial SKIP.
- Opencode `standalone-startup`, `standalone-preflight`, `loginom-management` — 42 PASS,
  2 compiled CLI opt-in SKIP.

Всего в этих непересекающихся наборах 342 PASS, 4 SKIP, 0 FAIL.
Финальный `bun typecheck` в Host, opencode, Desktop и evals прошёл exit0.
`git diff --check` также прошёл.
Переносимые F7 проверки включены в 33 Host PASS и отдельно не прибавляются.
Они проверяют передачу fixture, Windows launch options, реальный POSIX shell
и отклонение внешних fixture endpoints.

Новые сборки, installed CLI/реальный PTY, GUI, native Windows/macOS и внешний
staging в этом исправлении не запускались. Исторические source/local artifact
результаты выше относятся к указанным там SHA и сборкам.

## Проверка шести дополнительных замечаний от 2026-11-09

Проверена вершина `bf9c580e94`. План проверки независимо одобрен и сохранён в
`docs/superpowers/plans/2026-11-09-cloud-review-validation.md`.
Подтверждённых отклонений от действующего контракта не обнаружено.

1. Disconnect в custom-карточке скрыт по дизайну двух карточек (§3).
   Проверен путь custom → выбор cloud без Save → Disconnect → custom → discard.
   Активный режим, baseline, generation/revision и custom credentials сохраняются,
   облачный аккаунт отключается без check/save. Проверка controller прошла.
2. Обновление пары при connected → connected не требует фонового restart.
   KnowledgeSession проверяет cloud revision перед каждым catalog/read,
   а после401 сам закрывает отказавший child и повторяет запрос в исходном budget.
   Три recovery-теста и дополнительная HTTP-проверка уже готового Host прошли.
   Получены один refresh, два initialize, успешный повтор read в прежнем поколении.
3. При отказе удаления cloud.json disconnect возвращает LOGINOM_STORE_WRITE_FAILED
   и запрещает cloud-вызовы в текущем Host. Файл остаётся на диске, после нового
   Host connected снова true — это воспроизведённое последствие неудавшегося выхода.
   Контракт Task7 явно требует сообщать ошибку удаления и не считать такой выход
   долговечным. Проверены существующий тест и повторное открытие реального store.
4. setGlobalProxyFromEnv имеется в закреплённом Node24.19.0 и Node24.15.0 внутри
   локального Electron42.3.3. Проверены API и hash bundled Node. В runtime без API
   при явно заданном proxy используется безопасный отказ, сохраняющий запрет
   прямого обхода proxy. Пять native proxy-тестов прошли, включая NO_PROXY,
   ALL_PROXY и недоступный proxy без direct fallback.
5. dock_diagnostics соблюдает отдельный allowlist §5 — прежние безопасные поля
   View плюс mode/server/help. cloud.connected в контракт этой проекции не входит.
   Тест model-safe diagnostics прошёл, UI/controller suite дала35 PASS.
6. unconfigured допускает обычный чат без Loginom. headless управляет браузерным
   режимом и сохраняет этот путь. Дополнительная проверка через настоящий CLI/Host
   и локальный model fixture дала ответ модели, exit0 и освобождение profile guard.
   Automation при отсутствии generation по-прежнему завершается CONFIG_REQUIRED;
   сохранённый cloud без входа обрабатывается отдельным connection-required gate.

Изменения ограничены планом и этим отчётом, продуктовый код сохранён.
Все временные проверки выполнялись в `$HOME/storage/tmp/`.
Сбой первоначального временного headless probe был вызван абсолютным импортом
пакета Effect, после исправления пути probe прошёл без изменения продукта.
Полные установленные сборки, GUI и native Windows/macOS не запускались.

## Исправления дополнительного ревью входа и ключей от 2026-11-09

База исправлений — `618a85f953`, план
`docs/superpowers/plans/2026-11-09-cloud-auth-followup.md` независимо одобрен.
Оба P2 воспроизведены и исправлены. Для каждого изменённого поведения получен
RED, затем GREEN через существующие интерфейсы.

- Bootstrap cleanup больше не заменяет исходную ошибку обмена или записи.
  Новый fixture погашает сессию при обмене, revoke-session получает401.
  HTML/терминальный403 сохраняют PROTOCOL_INVALID/UNAVAILABLE, ошибка записи
  сохраняет STORE_WRITE_FAILED. Отменённый вход с неподтверждённой очисткой
  получает LOGINOM_CLOUD_LOGIN_CLEANUP_UNCONFIRMED, который не использует
  сообщение успешного локального logout.
- Полученный, но не сохранённый installation key отзывается authenticated DELETE.
  Эта очистка и bootstrap revoke используют общий предел5 секунд.
  Подтверждённая чтением новая запись после fsync failure сохраняет свой ключ.
  Сетевая ошибка вспомогательной очистки сохраняет первичную ошибку входа;
  возможный остаточный bootstrap доступ ограничен серверным TTL (§4).
- При ошибке удаления cloud.json выполняется bounded DELETE, даже если локальный
  выход остался недолговечным. Успех/ошибка DELETE не заменяют storage error.
- Сохранённый custom key допускает preserve только для того же нормализованного
  origin. Смена протокола/хоста/порта требует явного непустого replace до
  runtime.check и любого сетевого обращения к новому endpoint. UI очищает draft
  key и маску, CLI убирает предложение Enter-preserve. Возврат к сохранённому
  origin снова допускает preserve, его path/query могут меняться.
- После ACCESS_DENIED/EXPIRED/UNAVAILABLE при добровольном входе TUI показывает
  безопасную причину и открывает обычный чат. Ctrl+C, ошибки протокола/хранилища
  и cleanup сохраняют завершение и правила profile guard.
- При смене cloud revision во время startup нового поколения устаревший child
  подтверждённо закрывается и запускается повторно в исходном deadline.
  Промежуточная устарелость не отвергает admission. Проверены гонки до start ACK
  и во время получения каталога, clean exit и отсутствие browser/reserve перехода.
- Неожиданный терминальный4xx device/token завершает polling сразу с безопасной
  ошибкой. Pending/slow_down/429 и временные5xx/сетевые отказы сохраняют retry.
- Срок кода форматируется по выбранной локали и местному времени с часовым поясом.
  Настоящий source renderer в pinned Chromium подтвердил RU/EN, очистку ключа
  при смене origin, исчезновение маски и её возврат для сохранённого origin.

Help extra arguments проверены read-only по canonical `services/loginom-ai`.
search.session_id является поддерживаемым параметром, target directories
перезаписываются из проверенного target_uri; path variables имеют календарный
provider. Подтверждённого обхода области нет, whitelist аргументов не добавлен.

Завершившиеся проверки на исправленных исходниках с pinned Node24.19.0/Bun1.3.14
и временными данными в `$HOME/storage/tmp/`.

- Host auth/store/proxy — 96 PASS.
- Host migration/validation/node-host — 18/21/28 PASS, 1 compiled opt-in SKIP.
- Host cloud recovery/readiness/connection-readiness — 59 PASS.
- Desktop loginom suite — 48 PASS, app controller — 36 PASS.
- CLI management — 16 PASS, 1 compiled opt-in SKIP.
- TUI expected failures и Ctrl+C/cleanup — 15 PASS.
- Package-local typechecks Host, Desktop, app и opencode прошли.
- Source browser, GUI script syntax и git diff --check прошли.

В расширенном Host прогоне88 PASS/3 FAIL все три отказа относятся к прежним
prepare-startup retry/twice/deadline cases. Они отдельно воспроизведены на
неизменённом `618a85f953` в изолированной копии, к текущим исправлениям не относятся.
Первоначальные5s timeout fsync-heavy тестов при параллельной нагрузке
не повторились в полном Desktop/migration прогоне с test budget20s.
Результаты перекрывающихся запусков не суммируются.

Независимые ревью auth, readiness, origin/UI/CLI и TUI завершены без новых
замечаний. Установленный GUI, compiled CLI и native Windows/macOS не запускались.
Существующий settings-ux.mjs дополнен регрессиями для будущего installed прогона.

## Повторная проверка девяти замечаний, 2026-11-12

База `7ae5bbb3f7`, ветка `dock-cloud-auth`.
[План исправлений](../../superpowers/plans/2026-11-12-cloud-review-fixes.md)
прошёл независимое ревью до изменений. Проверки используют временные профили,
локальные HTTP/MCP fixtures, Bun1.3.14 и pinned Node24.19.0. Ambient proxy
переменные Bun очищены, как и в предыдущей source-приёмке.

| Замечание | Проверка и исправление |
| --- | --- |
| F1 | Ошибка read-back после сбоя записи больше не сбрасывает подтверждённые credentials в памяти. Успешное чтение по-прежнему сверяет результат post-rename/fsync. |
| F2 | Сохранение нового поколения не наследует ошибку Help старого поколения. Durable/local ошибки остаются явными. |
| F3 | Чистая форма принимает поля отложенного поколения с `connection-required`. Dirty draft и проверка ревизии сохраняются. |
| F4 | При временной ошибке или подтверждённом отзыве во время refresh остаются локальные `dock_prepare` и `dock_diagnostics`. Отмена, дедлайн и cleanup продолжают завершаться ошибкой. |
| F5 | Сетевой сбой чтения тела ответа `/device/token` сохраняет повтор опроса в исходном interval/expiry. Полный malformed JSON и терминальные HTTP4xx завершают вход. |
| F6 | Ожидаемый bootstrap401 после обмена не создаёт ложное предупреждение отмены. Неуспешный DELETE и сетевой сбой очистки сохраняют предупреждение и общий budget5с. |
| F7 | Desktop oracle/OAuth получают endpoint из явной конфигурации или custom-профиля через все вызывающие драйверы. |
| F8 | CLI oracle/crash setup передаёт `mode: custom`, endpoint и ключ через stdin. |
| F9 | Desktop settings-ux проверяет автоматическое открытие ссылки и последующее ручное открытие раздельно. |

Все девять замечаний подтверждены. Для каждого исправления получен RED до
изменения и GREEN после него. Независимое ревью всех исправлений — Approved.

| Проверка | Результат |
| --- | --- |
| Host cloud-auth/cloud-store | 76 PASS, 0 FAIL, 374 assertions |
| Host connection-readiness/connection-validation/cloud-recovery/cloud-readiness | 84 PASS, 0 FAIL, 491 assertions |
| App settings-loginom | 37 PASS, 0 FAIL, 176 assertions |
| Acceptance Dock setup, owner-crash, crash-contract, oracle-provider, resume-oracle | 7 PASS, 0 FAIL, 40 assertions |
| `bun typecheck` в loginom-host, app, desktop, opencode | PASS, exit0 в каждом пакете |
| Pinned Node `--check` для settings-ux.mjs | PASS |
| Desktop connection-service/connection-store/host-port, timeout30с | 37 PASS, 0 FAIL, 117 assertions |
| CLI loginom-management/standalone-preflight/standalone-status | 37 PASS, 1 SKIP, 0 FAIL, 369 assertions |
| Host host-port/knowledge/host/connection-migration/transport/node-host | 90 PASS, 1 SKIP, 0 FAIL, 642 assertions |
| Git secret scan staged и `git diff --check` | PASS |

Все выбранные прогоны завершились exit0. Всего 368 PASS и 2 SKIP.
Пропущенные тесты требуют отдельных compiled CLI/cloud fixtures и не объявлены
пройденными. Повторять старые source/installed итоги как проверку новой сборки нельзя.

Первый расширенный Desktop-прогон с default timeout5с получил 8 failures и
3 последующие cleanup errors. Повтор с timeout30с завершился 37 PASS, 0 FAIL и без cleanup errors.
Изменения кода между этими двумя прогонами отсутствовали.
Полный изолированный settings-ux на frozen source build `b536a2e8cb` не дошёл
до UI-проверок из-за тайм-аута Electron launch и login-shell probe. Контроллер
формы подтвердил оба открытия ссылки, исправленный GUI-скрипт прошёл проверку
синтаксиса. Installed GUI, Windows/macOS и production здесь не проверены.

Локальные журналы и отчёты находятся в
`$HOME/storage/tmp/cloud-auth-nine-checks-U8B0eY/` и файлах
`cloud-auth-nine-{auth,state,acceptance}-report.md` в том же временном корне.
Чужое незакоммиченное изменение prompt сайта сохранено.

## Публикация PR и CI, 2026-11-13

PR [#1061](https://github.com/gooddaytoday/loginom-ai-agent/pull/1061) направлен
в `loginom`. Перед первым push все 28 неопубликованных коммитов проверены новым
правилом приватности. В девяти документах обезличены личные пути и адрес шлюза,
сообщения коммитов и содержимое вне `docs` сохранены. Сканирование всей входящей
истории — clean, pre-push typecheck — 33/33 PASS. Локальный черновик prompt
сохранён отдельно от публикуемых изменений.

Первый CI выявил три воспроизводимые ошибки fixtures. Прямая Node-команда
`test/loginom/environment-proxy.ts` не загружала TypeScript-зависимость Host;
теперь main собирает настоящий supervisor в временный Node bundle и использует
его в прежних сетевых проверках. Изолированная Vite-проверка воспроизводит
расположение пакетов и копирует настоящий `cloud-build.ts`. Unix-тест регистра
proxy-переменных явно выбирает Linux, Windows-проверка uppercase сохранена.

RED подтверждён точными CI-командами и логами. После исправления Node proxy
проверка прошла с directTargetRequests0, связанный Host набор — 26 PASS,
Vite fixture — 1 PASS. Независимое ревью исправлений — Approved.
Общие PR-проверки и `release.yml mode=candidate channel=prod` должны завершиться
на последнем SHA PR. Candidate не подтверждает live production cloud auth.
