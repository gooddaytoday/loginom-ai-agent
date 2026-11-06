# Облачное подключение: source/local приёмка

Дата: 2026-11-06. Ветка `dock-cloud-auth`; принятая база Task15 —
`0b9e5d5948ea8968b3fa165146340e82c53497a0` (Task14).
[Спецификация](../../superpowers/specs/2026-11-05-dock-cloud-auth-design.md) задаёт
поведение; [план, Task15](../../superpowers/plans/2026-11-06-dock-cloud-auth.md#task-15-сквозная-приёмка-и-готовность-к-выпуску)
и [журнал](../../plans/2026-11-05-dock-cloud-auth-design.md) фиксируют исполнение.

Клиентский контракт проверен исходными тестами, собранными нерелизными Linux
Desktop/CLI и настоящим локальным Dock. Задачи1–14 независимо приняты.
Source gate пока **PENDING**: пакетные проверки PASS, но независимое ревью Task15
и всего diff от `dd2f949d11` ещё не завершено. Local integration gate — **PASS**.
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
Ревью каждой задачи: Spec compliant / Quality Approved; финальное общее ревью
остаётся отдельным обязательным шагом.

Все Bun tests и `bun typecheck` запускались из указанного package directory,
не из корня. `TMPDIR=TMP=TEMP=$HOME/storage/tmp/`; Python Task14 использовал
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
Повторная сборка только ради номера Task14 не требовалась.

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

## Local integration gate: собранные клиенты и настоящий Dock

Task13 использовал existing acceptance scripts, собственные loopback HTTPS site
и два настоящих MCP HTTP fixtures с разными ключами; это клиентский контракт.
Desktop dev profile и CLI root различны. Production forwarding отсутствовал;
release endpoint guard проверялся отказывающим proxy без контакта с production.

- Штатные `bun script/build-cli.ts <own-output> --no-archive` из Host и
  `bun run build` из Desktop —exit0. Electron package:
  `electron-builder --dir --x64 --publish never --config.electronDist=<pinned-electron>`
  —exit0. Release override guard:24 комбинации PASS; compiled release boundary:
 7 PASS/156 assertions, runtime env не меняет release endpoints.
- Реальный `settings-live.mjs` через pinned Node/Xvfb —exit0: renderer→preload→IPC→Host,
  save до входа без site request, start/cancel/start, device exchange,
  ready в той же generation/revision1, disconnect; browser unknown.
  Site/Help direct0; первый site запрос прошёл через свой login-shell proxy.
  Перехвачен только OS opener; настоящий browser Loginom здесь не проверялся.
- Host `bun test test/node-host.test.ts --test-name-pattern 'current compiled CLI Host'`
  с `LOGINOM_AI_AGENT_TEST_CLI_BIN=<own-cli>` и
  `LOGINOM_AI_AGENT_TEST_CLOUD_FIXTURE=<own-fixture.json>` —1 PASS/17 assertions.
  Save/start/status/cancel, repeated-start refusal, authenticated ready, все семь
  Help calls, safe replies, disconnect/clean exit, proxy/NO_PROXY/dead proxy.
- Opencode `bun test test/cli/loginom-management.test.ts --test-name-pattern 'compiled CLI connects'`
  —1 PASS/28; `bun test test/cli/standalone-startup.test.ts --test-name-pattern 'compiled CLI recovers'`
  —1 PASS/13. Использован тот же current artifact/fixture, отдельный CLI root.
- Existing `python3 test/cli/tui/standalone-pty.py --compiled-cloud --cloud-without-login`
  с `LOGINOM_AI_AGENT_TEST_CLI_EXE=<own-cli>` и тем же fixture:
  `--cloud-cancel`, `--cloud-connect --prompt`, `--prompt` —3/3 PASS.
  Keyboard Ctrl+C130, connect0/decline0; forced=false, один Host,
  guard отсутствует только после cleanup, alive0. Ответы chat проверены в SQLite.
  Process-group SIGINT и owner-SIGKILL regressions подтвердили cleanup POSIX Host.
- CLI dev artifact: `$HOME/storage/tmp/dock-cloud-auth-70d9-16751mfl/task13-cli`,
  version `0.0.0-dev-202611061850`, sourceTreeSha256
  `949b6e6cd53e3d5578950d98e3625fa021817adcd664a234de82fab7f6eb86dc`.
  Desktop: тот же scratch, `task13-desktop`, version0.3.9/dev, snapshot
  `b6ca8ce58e7ebf7ebedcc727c9f0ace3187a0fad045da706116ba399e2242801`.
  Исторические BASE/dirty metadata сохранены. Это собственные dev candidates,
  не установленные приложения и не проверка настоящего legacy0.3.9.
- ASAR main/preload/renderer byte equality PASS; ASAR SHA256
  `49030acd69ceb153f6911841949dfac6ea0a8e62b3906de3aa30d86393f9f68b`.
  Resource inventory5117 и CLI inventory6141 entries PASS; canary scan6136 CLI /
  5222 Desktop regular files: общего Dock key, fixture secrets и профилей нет.

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
native/network tests повторно2 PASS. Tracker/processor15 PASS из affected run;
`uv run --frozen --no-sync pytest tests/server/test_request_wait_tracking.py`
—exit0,4 PASS после исправления устаревшего unit stub. Это применимые21 поведения,
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

Task15 меняет только документацию. До commit выполнены self-review,
`git diff --check`, проверка локальных ссылок и smoke исправленного примера
запуска/readiness/cleanup собственной fixture. Независимое ревью Task15 и свежий
whole-branch review от `dd2f949d11` пока PENDING; результаты и итоговый SHA будут
добавлены в журнал после их получения. Обязательные findings закрываются до
завершения source gate. Чистый status фиксируется после commit, не предполагается.
Push, PR, merge, release, production rollout и отключение legacy key не выполнялись.
