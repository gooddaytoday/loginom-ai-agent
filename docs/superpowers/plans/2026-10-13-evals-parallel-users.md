# Параллельные evals по пользователям Loginom — Implementation Plan

> **Для исполнителя:** применять доступный skill `tdd`, выполнять задачи по checkbox-шагам с проверкой между задачами. Этот документ не начинает реализацию; она требует отдельной команды владельца.

**Goal:** Один доверенный harness автоматически готовит и переиспользует отдельного пользователя Loginom на слот, выполняя параллельные попытки на одном выделенном Loginom Server и общей Studio.

**Architecture:** Общий контроллер владеет административным Playwright-соединением, серверным run fence, журналом подготовки и учётными данными. Слот владеет пользователем, CLI-профилем, workspace, историей, lease и доказанными серверными сессиями; удаление разрешено только после подтверждённого прекращения своих серверных операций. Существующий цикл оценки включается в общую очередь без барьера кругов и с retry на том же слоте.

**Tech Stack:** Bun/TypeScript, установленный Linux CLI, Linux bubblewrap и `/proc`, Docker CLI, Playwright из проверенных ресурсов установленного CLI, Loginom 7.4.2, существующие `fake-cli.ts` и `fake-codex.ts`.

**Spec:** [Дизайн](../../plans/2026-10-11-evals-parallel-design.md), [актуализированное ревью](../../plans/2026-10-11-evals-parallel-design-review.md), [контракт harness](../specs/2026-09-18-evals-design.md).

## Global Constraints

- Статус на 2026-10-13: **реализация начата с задачи 0 на b54455e187fb0a728787263e17a1adc828d77221; live v2 ещё не квалифицирован**.
- Исследованная рабочая база: `ef06b6e9b2dba8b0da58c6063d350918ee66dd59`. Перед реализацией зафиксировать фактическую базу; не сбрасывать и не включать в свои коммиты чужие изменения.
- Принятая топология: один выделенный Loginom Server, одна Studio, уникальный пользователь Loginom на слот. Её повторное согласование не требуется.
- Runtime-код scheduler и provisioning остаётся в `evals/`. Продуктовая поставка shared OAuth — отдельная работа основного чата; harness потребляет проверенный установленный кандидат.
- Временные shared-oauth dependency commits отделены от собственных evals/docs-коммитов. Всё, что можно адаптировать поверх продуктового контракта, реализуется в `evals/`; такие изменения не включаются в cherry-pick и не squash-ятся с ним. После слияния OAuth в `loginom` временные копии исключаются из истории будущего PR по процедуре задачи 7.
- Все команды тестов и typecheck ниже выполняются из `evals/`; typecheck — только `bun typecheck`. Каждый шаг реализации проходит RED → минимальный GREEN → проверку → отдельный коммит.
- В тестах нет `globalThis.*` и моков внутренних функций. Разрешённые замены внешних процессов: `EVAL_CLI_MODE=fake`, `EVAL_ARTIFACT_SOURCE=dir:`, `EVAL_JUDGE_COMMAND`. Loginom-adapter проверяется на настоящем отдельном экспериментальном сервере; production-конфигурация не получает fake-admin обхода.
- Сохраняются installed-binary admission, bubblewrap, запрет внешних CDP/inspector, ограничения небезопасных серверных компонентов, закрытая история и процессная identity. Пользователи Loginom не заменяют эти границы.
- Запрещены общий cleanup `UserStorage`/`SessionBackup`, перезапуск общего сервера для восстановления слота, удаление lease по одному лишь исчезнувшему PID, изменение исторических results и pins текущих серий.
- Дорогая подготовка выполняется до dispatch; пользователи, профили и пригодное административное соединение переиспользуются. Никаких фиксированных sleep вместо проверки состояния с deadline.
- Все новые eval-прогоны оцениваемого `loginom-ai-agent-cli` используют `openai/gpt-6-luna` с variant `high` (`EVAL_AGENT_MODEL=openai/gpt-6-luna`, `EVAL_AGENT_VARIANT=high`). Судья — `gpt-6-sol` с reasoning `xhigh` (`JUDGE_MODEL=gpt-6-sol`, `JUDGE_REASONING=xhigh`). Эти обязательные pins записываются в manifest и сохраняются при N=2 → N=1; исторические результаты и начатые серии сохраняют исходные pins.
- Административные credentials, cookies и приватные журналы не входят в mounts/env агента и судьи, результаты или диагностику. Общий OAuth store модели — отдельное явное исключение, не административный секрет Loginom.

---

## 1. Доказательная база и границы утверждений

Прочитаны семь JSON и `parallel-probe.mjs`, `export-probe.mjs`, `safe-cleanup-probe.mjs` в `/home/kiselev/.codex/experiments/loginom-users-20261013-50e5f473/`. Исходные файлы остаются на месте; секреты и сырые browser dumps в git не переносить.

| Файл и точный ключ | Что подтверждено | Чего это не подтверждает |
| --- | --- | --- |
| `cli-evidence.json` → `[0/1].setup_exit`, `.setup.state`, `.setup.username`, `.check_exit`, `.check.code` | Два профиля установленного CLI для `eval-a`/`eval-b`, `ready`, `LOGINOM_CONNECTION_VALID` | Полный LLM-eval или автоматическая повторная подготовка harness |
| `parallel-evidence.json` → `checks[name=overlap-execution].overlap_ms=1282`, `.A.count=12`, `.B.count=12` | Реальное перекрытие исполнения двух пользователей | Измеренное ускорение LLM-evals |
| Тот же файл → `checks[name=cross-user-import].ok=false`, `checks[name=B-after-A-crash].all_finished=true`, `checks[name=B-file-after-crash].exists=true` | Импорт чужого файла отвергнут, B исполнил 30 операций после аварии A и сохранил файл | Полная повторяемая матрица всех ACL/Everyone/обходов путей в harness |
| `export-evidence.json` → `control.ok`, `absolute_own_read.ok`, `absolute_own_write.ok`, `cross_write.ok=false`, `cross_write.error` | Свои операции успешны; чужой экспорт завершился общей ошибкой активации | Точный ACL-код причины отказа или полная матрица файловых операций; ключ `cross_write.ok` в сохранённом JSON присутствует |
| `regeneration-evidence.json` → `recreated_after_cleanup=true`, `autosave_mtime > cleanup_at` | Живая серверная сессия пересоздала `calc.lgp.autosave` после удаления **при включённом пробой `set_PackageAutoSavePeriod(1000)`** | Автосохранение по умолчанию (оно выключено) или завершение server session по факту смерти браузера |
| `safe-cleanup-evidence.json` → `closed_A.closed=true`, `closed_A.after`, `A_immediately`, `A_after_12s`, `B_unchanged=true`, `B.all_finished=true`, `overlap_verified=true` | Закрытие A, затем пустое личное пространство в наблюдаемом окне; файлы и работа B сохранены | Универсальный достаточный timeout 12 секунд или надёжная production identity по одному display name |
| `provenance.json` → `loginom_version`, `server_image`, `studio_image`, `cli_metadata.sourceCommit`, `model_calls=0`, `judge_calls=0`, `legacy_session_backup_positive_test="NOT_REPRODUCED"` | Loginom 7.4.2, закреплённые образы, CLI 0.1.17 с `5588651a291c59f53d1c14941d5ba768071a0018`; немодельный эксперимент | Параллельный LLM-eval, адресная очистка непустого SessionBackup |
| `cleanup-receipt.json` → `containers_removed`, `network_removed`, `private_cli_profiles_removed`, `evidence_sha256` | Экспериментальная среда удалена, зафиксированы хэши пяти файлов | Наличие сейчас доступного подготовленного стенда |

В `safe-cleanup-probe.mjs` административные `GetSessionsManager`, `UpdateSessionInfos`, `SessionInfo`, `CloseSession` вызваны **внутри `page.evaluate`**. Это Playwright-путь через браузерную Studio, не независимый HTTP/RPC API. Эксперимент выбирал `eval-a:1` по имени; production cleanup должен дополнительно доказать владельца и идентичность сессии в текущем server epoch. Подтверждённую пользователем более широкую матрицу изоляции повторить машинно в задаче 10, не выдумывая отсутствующие JSON-поля.

## 2. Владение файлами и границы интерфейсов

Названия ниже — **предлагаемые новые интерфейсы**, которых пока нет. Они едины для дизайна, задач и будущего runbook.

| Файл | Ответственность / владелец реализации |
| --- | --- |
| `evals/src/slots.ts`, `evals/test/slots.test.ts` | Версия 2 конфигурации, canonical paths, типы слота, server fence и user/profile leases; автор задачи 1 |
| `evals/src/loginom-admin.ts`, `evals/script/loginom-admin-driver.mjs`, `evals/test/loginom-admin.test.ts`, `evals/test/loginom-admin-integration.test.ts` | Bun-клиент и JSONL-драйвер на bundled Node, один trusted context/run, административные действия; задача 2 |
| `evals/src/parallel-pair.ts`, `evals/script/parallel-pair.ts`, `evals/test/parallel-pair.test.ts`, `evals/test/parallel-pair-integration.test.ts` | Создание/удаление только принадлежащей harness пары, marker v2 и извлечение RPC sources; задача 1а |
| `evals/package.json` и отдельные `*-integration.test.ts` | Разделение обычного CI и проверок с Docker/Loginom/bwrap; начиная с задачи 1а |
| `evals/src/user-environment.ts`, `evals/test/user-environment.test.ts`, `evals/script/parallel-env.ts` | Журнал подготовки, prepare/verify/status/recover, session-close fence и карантин; последовательные задачи 3–5 с одним владельцем файла |
| `evals/src/artifact.ts`, `evals/test/artifact.test.ts`, `evals/test/isolated-storage.test.ts`, `evals/test/no-artifact-cleanup.test.ts` | Scoped storage и безопасное удаление всех имён после fence; задача 5 |
| `evals/src/process-supervisor.ts`, `evals/src/process-launcher.ts`, `evals/test/process-supervisor.test.ts` | Доказанная принадлежность процессов нескольких слотов и trusted admin; задача 6 |
| `evals/src/profile.ts`, `evals/src/cli.ts`, `evals/src/sandbox.ts`, их одноимённые тесты | Проверка фактического подключения, shared OAuth и явный фильтр окружения; задачи 3/7 последовательны |
| `evals/src/scheduler.ts`, `evals/test/scheduler.test.ts` | Общая очередь и состояния слотов, без административных секретов; задача 8 |
| `evals/src/judge.ts`, `evals/test/judge.test.ts` | Один run-local mutex для вызовов существующего `codex exec`, abort ожидания и освобождение в finally; задача 8 |
| `evals/src/config.ts`, `evals/src/preflight.ts`, `evals/src/run.ts`, их тесты | Подключение config v2, all-slot admission и нового cleanup к существующему циклу; задачи 1/3/5/8 последовательны |
| `evals/src/report.ts`, `evals/src/compare.ts`, `evals/src/rejudge.ts`, `evals/src/node-runner.ts`, `evals/src/node-evals.ts`, `evals/script/run-node-evals.ts`, профильные тесты | Совместимость summary, CLI help и выбор истории по slot_id; задача 9 |
| `evals/fixtures/fake-cli.ts`, `evals/fixtures/fake-codex.ts` | Детерминированные сценарии перекрытия/отмены/retry; задачи 6/8/9 согласуют одного владельца fixtures |
| `evals/script/check-parallel-users.ts` | Воспроизводимая немодельная приёмка настоящих двух пользователей, включая crash/ACL/cleanup; задача 10 |
| `evals/AGENTS.md`, `evals/README.md`, `evals/.env.example`, `evals/docs/2026-10-07-analytic-evals-isolation-plan.md`, `evals/docs/2026-10-07-eval-tests-runtime.md`, `evals/docs/node-evals.md`, `evals/docs/evaler-orchestration.md` | Нормативные правила и переход — задача 0; фактические команды и результаты — задача 11 |
| `docs/superpowers/specs/2026-09-18-evals-design.md`, `docs/testing/loginom-ai-agent/parallel-evals.md` | Сначала синхронизировать контракт, затем завершить runbook; задачи 0/11 |

Никакой параллельной записи одного файла разными задачами. Возможные независимые направления после задачи 0: конфигурация/locks, исследование админ-интерфейсов и backup, supervisor, продуктовая поставка OAuth. Сведение `run.ts` выполняет один интегратор.

### Хост и bootstrap до первой подготовки

Целевой host этого плана — **`lg-pc-75`, 10.200.2.58**, Ubuntu 22.04.5, 12 CPU,
38.47 GiB RAM. Read-only snapshot 2026-10-13: MemAvailable около 9 GiB, swap почти
заполнен; это наблюдение, не гарантированный бюджет. Перед запуском задача 10
измеряет доступные ресурсы заново. Удалённый `EVALS_RUNNER=10.200.13.152` здесь
не используется. Remote eval-tests/Multica runtime на этом хосте не установлен;
исторические файлы `~/.multica` не означают наличия работающего исполнителя.

Пара эксперимента удалена. `loginom-evals-isolated` остаётся legacy-стендом.
Dev-пара `loginom-*-7.4.2-test` занимает `loginom-net` и порты 80/4580/8080.
Новая пара создаётся задачей 1а в своей сети; dev/legacy пары не меняются.
Перенос eval-tests через `R/operations/stand.lease` — legacy-процедура вне этого
плана, не обязательный шаг подготовки свежего контейнера.

После отдельной команды на реализацию владелец **один раз** выполняет:

```bash
sudo install -d -m 0700 -o kiselev -g kiselev /var/lib/loginom-evals /var/lib/loginom-evals/locks
install -d -m 0700 /home/kiselev/.local/state/loginom-evals/parallel/{controller,secrets,model-oauth,a,b,evidence,results,judge-codex,studio-source}
```

Сейчас `/var/lib/loginom-evals` отсутствует, `/var/lib` принадлежит root.
Harness проверяет owner/mode; не вызывает sudo и не меняет lock root через env/config.
Функции принимают `lockRoot` параметром: production entrypoints всегда передают
константу `/var/lib/loginom-evals/locks`, unit-тесты — собственный temporary directory.
Это зависимость файлового хранилища, не разрешённый пользователю обход global fence.

### Конфигурация версии 2

```json
{
  "version": 2,
  "server": {
    "container": "loginom-evals-users",
    "studioContainer": "loginom-evals-studio",
    "url": "http://127.0.0.1:32771/app/",
    "network": "loginom-evals-users",
    "alias": "loginom-server-7.4.2-test",
    "storageRoot": "/workdir/UserStorage",
    "backupRoot": "/workdir/SessionBackup"
  },
  "controller": {
    "stateDir": "/home/kiselev/.local/state/loginom-evals/parallel/controller",
    "adminCredentialsFile": "/home/kiselev/.local/state/loginom-evals/parallel/secrets/loginom-admin.json"
  },
  "auth": { "sharedDir": "/home/kiselev/.local/state/loginom-evals/parallel/model-oauth" },
  "judge": { "codexHome": "/home/kiselev/.local/state/loginom-evals/parallel/judge-codex" },
  "slots": [
    { "id": "a", "username": "eval-a", "profileDir": "/home/kiselev/.local/state/loginom-evals/parallel/a/profile", "workspaceRoot": "/home/kiselev/.local/state/loginom-evals/parallel/a/work", "historyDir": "/home/kiselev/.local/state/loginom-evals/parallel/a/history" },
    { "id": "b", "username": "eval-b", "profileDir": "/home/kiselev/.local/state/loginom-evals/parallel/b/profile", "workspaceRoot": "/home/kiselev/.local/state/loginom-evals/parallel/b/work", "historyDir": "/home/kiselev/.local/state/loginom-evals/parallel/b/history" }
  ]
}
```

Endpoint/имена в примере описывают будущую отдельно выделенную среду, не распоряжение изменять работающий стенд. Credentials-file содержит только bootstrap-учётную запись контроллера и проверяется как private regular file 0600; секреты каждого eval-пользователя генерируются один раз и сохраняются контроллером до отправки create/update. Повторный prepare не меняет пароли, профили и существующие данные без доказанной принадлежности.

`--parallel N` выбирает первые N слотов; default 1. Одинаковый сервер ожидается, одинаковый `username` — ошибка. V1 design-only multi-container файл не принимается как v2. Без файла остаётся legacy singleton, но его широкая очистка обязана отвергать v2 marker. `--parallel >1` без файла, judge-only/calibrate с N>1, legacy `EVAL_NODE_OPS_CONFIG`/`EVAL_NODE_STAND_LEASE` с N>1, а также `--keep-storage` в пользовательском режиме — явные ошибки до dispatch. `--reset-profile` в v2 явно отклоняется: оператор использует адресное `recover`, который не сбрасывает shared auth store.

### Типы и публичные функции

Это спецификация интерфейсов, не разрешение добавлять неиспользуемые абстракции. Типы экспортируются из владеющего модуля; функции, которые не нужны за его границей, остаются локальными.

```ts
// slots.ts
export type ServerIdentity = {
  containerId: string; startedAt: string; serverEpoch: string
  studioContainerId: string; studioStartedAt: string; configurationHash: string
}
export type SlotDefinition = {
  id: string; username: string; profileDir: string; workspaceRoot: string; historyDir: string
}
export type SlotFile = {
  version: 2
  server: { container: string; studioContainer: string; url: string; network: string; alias: string; storageRoot: string; backupRoot: string }
  controller: { stateDir: string; adminCredentialsFile: string }
  auth?: { sharedDir: string }
  judge: { codexHome: string }
  slots: SlotDefinition[]
}
export type SlotLease = {
  slot: SlotDefinition; identity: ServerIdentity; receipt: string
  token: string; release(cleanupReceipt: string): Promise<void>
}
export function parseSlots(value: unknown, parallel: number): SlotFile
export function loadSlots(file: string, parallel: number, installRoot?: string): Promise<SlotFile>
export function acquireSlotLease(file: SlotFile, slot: SlotDefinition, identity: ServerIdentity, lockRoot: string): Promise<SlotLease>

// loginom-admin.ts: userKey — controller hash от manifest generation,
// exact Name и UserKind; Loginom immutable user ID здесь не предполагается.
// remoteKey — controller key от serverEpoch + exact Name + CreateTime.
// Он разрешает CloseSession только после сверки свежего manager proxy.
export type ServerSession = {
  remoteKey: string; userKey: string; username: string; serverEpoch: string
  pendingDisconnect: boolean; activeOperations: number | null
}
export type AdminConnection = {
  identity: ServerIdentity
  inspect(): Promise<{ identity: ServerIdentity; sessions: ServerSession[]; configurationHash: string }>
  reconcileUser(slot: SlotDefinition, secretFile: string): Promise<{ userKey: string; aclHash: string }>
  closeSession(session: ServerSession): Promise<void>
  dispose(): Promise<void>
}
export function openLoginomAdmin(file: SlotFile, identity: ServerIdentity): Promise<AdminConnection>
export function selectOwnedSessions(observed: ServerSession[], owned: ServerSession[]): ServerSession[]

// user-environment.ts
export type ReadyEnvironment = {
  identity: ServerIdentity; generation: string; receipt: string
  slots: (SlotDefinition & { status: "ready"; profileGeneration: number })[]
  changedUsers: string[]; changedPasswords: string[]
}
export type CleanupReceipt = {
  status: "confirmed" | "quarantined"; slotId: string; evidence: string
  processes: "confirmed" | "unknown"; serverSessions: "confirmed" | "unknown"
  archive: "committed" | "unsettled" | "failed"
  storageDeletionAllowed: boolean; nextAdmissionAllowed: boolean
}
export function prepareEnvironment(file: SlotFile, parallel: number, outDir: string): Promise<ReadyEnvironment>
export function verifyEnvironment(file: SlotFile, parallel: number, outDir: string): Promise<ReadyEnvironment>
export function cleanupSlot(input: {
  file: SlotFile; lease: SlotLease; admin: AdminConnection
  ownedSessions: ServerSession[]; processEvidence: string; outDir: string
}): Promise<CleanupReceipt>
export function recoverSlot(file: SlotFile, slotId: string, incident: string, outDir: string): Promise<CleanupReceipt>

// scheduler.ts
export type Job = { index: number; taskId: string; attempt: number }
export function buildJobs(taskIds: string[], repeat: number): Job[]
export function runSlotQueue<T>(input: {
  jobs: Job[]; slots: string[]; signal: AbortSignal
  execute(slotId: string, job: Job): Promise<{ result: T; quarantine: boolean }>
}): Promise<{ results: { job: Job; slotId: string; result: T }[]; quarantined: string[]; unassigned: Job[] }>
```

`serverEpoch` вычисляет controller, это **не поле Loginom RPC**: версионированный
SHA-256 от полного container ID, Docker `StartedAt`, host boot ID, daemon PID и
starttime из `/proc/1/stat` внутри контейнера. Для закреплённого образа PID 1 должен
быть `/app/loginomd` (`/proc/1/exe`, entrypoint/args проверяются). Несовпадение,
неоднозначность или невозможность чтения запрещают admission/close/delete.
Epoch стабилен при неизменном daemon и сверяется перед операциями; restart меняет
его. Переподключение admin создаёт отдельную локальную generation proxy handles,
не выдаётся за restart сервера и не подменяет `serverEpoch`.

`prepareEnvironment`/`verifyEnvironment` публично открывают и закрывают один admin context для standalone-команды. Внутренний run-контроллер вызывает те же локальные шаги с уже открытым `AdminConnection`, а не вызывает публичную обёртку для каждого слота/попытки. Его serialized administrative queue не сериализует исполнение агентов и судей. `SlotContext` содержит `config`, `AgentCommand`, scoped `ArtifactSource` и lease/reference к журналу; `AdminConnection` и credentials остаются в контроллере.

### Владение самостоятельных команд

**Guard и reservation — разные сущности.** В фиксированном
`/var/lib/loginom-evals/locks` для server/profile/judge keys используются OS
exclusive `flock` на постоянных lock-файлах (Linux, Bun FFI/libc) и отдельные durable reservations.
Lock-файлы не unlink/replace; FD имеет CLOEXEC и не наследуется дочерними процессами.
Guard автоматически отпускается при crash, но незавершённая reservation продолжает
запрещать обычный запуск. В ней command/run ID, ownership token/epoch, host boot ID,
PID/starttime, server generation, inventory ресурсов и canonical locator журнала.
Server generation не входит в ключ lock и не подменяется ownership epoch.

Нужные guards берутся в едином порядке ключей с ограниченным ожиданием; при
конфликте уже взятые освобождаются. Server guard одного контейнера не защищает
profile или judge home на другом сервере: для них нужны собственные глобальные
keys. Reservation записывается durable **до** первой побочной операции. В finally
закрываются FD guards, но unresolved reservations не удаляются.

| Команда | Захват и успешное завершение | Ошибка / оставшееся владение |
| --- | --- | --- |
| `status` | Только чтение snapshots без takeover, Loginom login и изменения reservations; сообщить, если снимок менялся | Не объявлять такой снимок новым admission |
| standalone `prepare` / `verify` | Взять server и выбранные user/profile guards/reservations; при проверке judge auth — также judge-home guard. Закрыть все свои probe/management/admin sessions и процессы, подтвердить архив/очистку созданных проб, записать readiness и durable `released`, затем отпустить guards | Неиспользованные или доказанно завершённые собственные reservations можно release; uncertain остаётся retained, команда завершается с ошибкой. При найденной прежней unresolved reservation — `RECOVERY_REQUIRED` без изменений |
| `run` | Заново acquire + admission; внутренний prepare использует текущее владение без release между подготовкой и dispatch. При окончании слота release его чистых user/profile reservations; server reservation — после всех слотов и admin finalization, judge-home — после всех своих судей | Незавершённые reservations удерживают durable fence, даже если процесс завершился и guards уже свободны |
| внешний `recover --slot` | Взять соответствующие guards; только recovery может принять прежнюю reservation по протоколу ниже. После полного archive/session-close/cleanup подтвердить release слота | При живом run — `BUSY`, без изменения token. Неопределённый исход сохраняет reservation; чистый слот не снимает другие unresolved reservations |

Readiness receipt фиксирует результат проверки и **не резервирует** окружение.
`prepare → prepare → verify → run` каждый раз получает новое владение и проверяет
fingerprint. Успех standalone возвращается только после durable release;
неудавшийся release не маскируется успешной подготовкой. Проверка состояния
`verify` не исправляет конфигурацию, но отвечает за завершение собственных проб.

**Приём владения после аварии:**

1. `--incident` указывает на исходное владение и canonical run journal, а не
   навсегда фиксирует последний recovery token. Под всеми соответствующими guards
   `recover` перечитывает актуальные reservations и проверяет непрерывную lineage
   от исходного incident: token/epoch, inventory, server identity и текущего
   controller по boot ID + PID/starttime. Живой либо неопределённый owner — отказ.
   Исчезновение controller не доказывает остановку его детей или server sessions.
2. По **актуальной** проверенной revision атомарно journal-ит CAS в новый ownership
   epoch/token `recovery-only`, сохраняя lineage. CAS со старым token отклоняется;
   повтор после crash самой recovery с тем же исходным incident допускается через
   подтверждённую цепочку новых epochs. Чужая/повреждённая lineage — отказ. Это
   разрешение восстановить среду, **не** dispatch или delete без последующих proofs.
3. Адресно завершает доказанных surviving children, согласует частичный архив,
   подтверждает все собственные server sessions и выполняет scoped cleanup.
   Смена server generation или неизвестная identity сохраняет карантин.
4. Записывает proof и durable `released` tombstone, затем отпускает guards.
   При crash на любом шаге следующая recovery согласует journal; receipt не
   удаляется по PID/возрасту, неизвестные данные сохраняются.

Внутренний recovery A при работающем B выполняет текущий controller без передачи
владения. После падения всего harness внешний recovery обрабатывает перечисленные
в incident слоты адресно. Если восстановлен только A, а B ещё unresolved, результат
помечается partial: A выпущен, общий server fence остаётся. Новый run возможен
лишь после восстановления всех retained ресурсов и admin/judge finalization;
для нескольких слотов `recover --slot` выполняется последовательно по актуальному
run journal. Если указанный слот уже released, команда не трогает его данные,
но завершает retained общие admin/judge/server ресурсы этого incident. Полный
no-op возможен только после terminal state **всего** incident. Новое владение
другого run не принадлежит прежней lineage и никогда не принимается этой командой.

## 3. Конкретные способы выполнения операций

| Операция | Выбранный интерфейс и права | Проверка результата и неопределённый исход |
| --- | --- | --- |
| Container/Studio identity, сеть, route, roots, marker, ограничения компонентов | Программно: Docker CLI с массивом argv, `inspect` и `exec` по полному container ID; доступ к Docker только контроллеру | Проверить ID + StartedAt + server epoch, mount topology, digest/config hash и настоящий маршрут Studio. Изменение identity требует нового admission; не продолжать по имени контейнера |
| Локальные каталоги, private secrets, journals и leases | Программно: Bun/Node fs, `lstat`/`realpath`, атомарные файлы и эксклюзивное создание | UID/mode, отсутствие symlink/hardlink и пересечения mounts; потеря write/read-back сохраняет незавершённую операцию и запрещает dispatch |
| Пользователи, роль проектировщика, запрет admin/full storage и ACL включая Everyone | Playwright: административная Studio и её browser RPC; независимый документированный CLI/API для этих операций пока не установлен | Read-back фактических прав и доступа под обоими пользователями. При ответе с неопределённым исходом сначала read-back по сохранённой user identity; не повторять create, не удалять чужого пользователя |
| Личный физический каталог пользователя | Программно: Docker CLI `exec` по подтверждённому ID, canonical root из `Settings.UserStorageDirectory` + безопасный login; если штатный Add/login уже создал каталог, только проверка | Для отсутствующего каталога создать ровно этот каталог с проверенными UID/GID серверного процесса; не угадывать owner и не делать recursive chown. Существующий несопоставленный каталог не присваивать. Проверить каталог и доступ своим/чужим пользователем через Studio |
| Создание пары, начальная route/wsproxy/component policy | Программно: Docker create/cp/start задачи 1а; JSON/XML до первого start, marker v2 и journal принадлежности | Prepare только проверяет конфигурацию/route/IDs; drift даёт отказ, не автоматический restart. Read-back served Studio config и Python-disabled обязателен. Backup policy квалифицируется отдельно в задаче 4 на research pair |
| CLI-профиль и Loginom-подключение | Программно: установленный `loginom-ai-agent-cli loginom setup --stdin-json --format json`, `loginom status/check --format json` | Сопоставить endpoint и username, `check.ok=true`, `LOGINOM_CONNECTION_VALID`; все созданные этими вызовами серверные сессии учесть и закрыть до admission. Неподходящий готовый профиль не принимать |
| Модельная OAuth-авторизация | Программная подготовка shared store, capability и stdin/CLI; первый вход — штатный `providers login` с внешним подтверждением владельца аккаунта | Нет обещания unattended headless выдачи новых токенов. До первой попытки проверить существующую авторизацию и отсутствие refresh-pending. При отсутствии вывести безопасное `AUTH_REQUIRED`, не маскировать как Loginom-ошибку |
| Judge `codex exec` | Его существующий CLI и отдельный auth; фильтр env судьи | Версия, доступность и отдельная немодельная/живая проверка согласно текущему контракту. Shared store Loginom CLI судье не передавать |
| Наблюдение и адресное закрытие серверной сессии | Playwright `page.evaluate`: `GetSessionsManager` → `UpdateSessionInfos` → нормализованные строки → `CloseSession` конкретной подтверждённой сессии | Текущая user identity, session identity, epoch и lease должны совпасть. Перечитать список до исчезновения именно этих сессий и прекращения операций/locks. Timeout/неоднозначность → карантин, файлы сохранены |
| Артефакты, `.autosave`, обычные/нестандартные имена и вложенные файлы пользователя | Программно: Docker `exec`/`cp` по immutable ID, адресный каталог `/workdir/UserStorage/<username>` | Copy/archive до delete; delete только после receipt закрытия, `find`/NUL-список без split по newline и без следования symlink. Повторный read-back корня; при неопределённом удалении не dispatch |
| SessionBackup | Сначала исследование; затем только доказанное сопоставление user/session/epoch либо проверенное поддержанное отключение | Никакого удаления всего каталога. Неизвестный backup сохраняется; если его влияние невозможно локализовать — прекращение новых admissions всего run |
| Восстановление слота | Программный оркестратор существующих `recover`, supervisor, admin close и scoped cleanup | Recovery может породить новое соединение: завершить его **до** финального close fence. После удаления не запускать новый `loginom check` до следующего управляемого admission |

Проверенные по исходникам Studio browser RPC для задачи 2:

- `Session.GetUsers()`; у коллекции `GetEnumerator(AUserKinds)`, `Add(AName,AUserKind=0)`, `Delete(AUser,ADeleteUserData=false)`. Локальный пользователь: `dukUser=0` для Add; для набора `GetEnumerator` — `dukUser=1`, `dukAll=7`; local authentication: `uamLocal=1`.
- User setters: `set_IsAdmin`, `set_IsViewer`, `set_IsDesigner`, `set_Blocked`, `set_UseGlobalFileStorage`, `set_SchedulerFullAccess`, `set_AllowPublish`, `set_AuthMode`, `SetPassword(Value)` и соответствующие getters. Нового пользователя явно держать `Blocked=true` на время AuthMode/password/rights; designer/viewer задать по контракту, admin/global storage/scheduler full access/publish — false. После полного read-back разблокировать последним действием и снова проверить. Назначение роли снимает неявную блокировку; перевод LDAP/OpenID в Local сбрасывает пароль. Поэтому повторный prepare уже local-пользователя не вызывает setter AuthMode и не меняет пароль.
- `Session.GetSharedDirectories()`, затем `GetEnumerator`, `Add(AName)`, `Delete(AItem,ADeletePhysicalDirectory)` и `dir.get_Permissions()`. `IBGAccessPermissions.GetEnumerator/Add(AUsers)/Delete(AUsers)` работает с массивом user/group proxies; результаты Add/Delete — массив чисел `int32[]`, не boolean. Семантика чисел ещё не квалифицирована: fixture должен установить её, а успех определяется полным read-back ACL. `Everyone` — точное имя универсальной группы.
- ACL здесь — список допущенных users/groups, не вымышленные поля `View/Add/Modify` на каждой записи. Поддержанный `UserStorageDirectory` задаёт общий physical root, личная папка выводится из login. Поэтому delete/recreate пользователя с тем же именем может унаследовать прежние данные и не является способом «сбросить» слот.
- У managed session прочитаны `Name`, `CreateTime`, `SessionIP`, `SessionHost`, `SessionType`, `Role`, `Capacity`, `PendingDisconnect`; `Guid`/`UserID` в этой строке не обнаружены. У собственной session есть Guid, но его связь с manager row ещё не доказана. Выбранный безопасный кандидат сопоставления: epoch + leased username + точные Name/CreateTime + свежий proxy; при невозможности подтвердить его гонкоустойчивость live gate остаётся закрытым. `activeOperations:null` означает отсутствие измерения, а не нулевую активность.

Источник проверки интерфейсов: сохранённый `bg_js_bg.model.rpc.js` в `/tmp/loginom-users-50e5f473/studio-source/`, примеры `/home/kiselev/git/e2e-tests/tests/toreview/helpers/admin.ts` и справка `/home/kiselev/git/support/loginom-help/data/admin/parameters/folders.md`, `/home/kiselev/git/support/loginom-help/data/admin/users/README.md`. `/tmp` очищается при загрузке (`D /tmp` в tmpfiles): до задачи 2 задача 1а сохраняет sources и SHA inventory в постоянный `controller`-соседний `studio-source`, либо извлекает их из закреплённого Studio image. Это исследовательские материалы, не runtime dependency. Старый helper `AddUser` нельзя копировать: проверка flags через `!= null` включает флаг даже при `false`; пригодны только проверенные RPC/selector references.

## 4. Порядок реализации

### Задача 0. Синхронизировать нормативные контракты и runbook

**Files:** Modify `docs/superpowers/specs/2026-09-18-evals-design.md`, `evals/AGENTS.md`, `evals/README.md`, `evals/.env.example`, `evals/docs/2026-10-07-analytic-evals-isolation-plan.md`, `evals/docs/2026-10-07-eval-tests-runtime.md`, `evals/docs/node-evals.md`, `evals/docs/evaler-orchestration.md`; Create `evals/docs/parallel-users-contract.md`, `docs/testing/loginom-ai-agent/parallel-evals.md`.

**Interfaces:** Produces нормативные версии slots v2, marker v2, lifecycle команд/блокировок, session identity, archive/cleanup receipts и summary, а также правила эксплуатации нового режима во всех перечисленных документах. Это обязательное предусловие задач 1–10; runtime-код ещё не меняется. Будущий v2 помечен как не реализованный: документ не разрешает менять действующий legacy стенд.

- [x] Прочитать фактический `git status --short`, базовый SHA, owning AGENTS и этот дизайн. Задать владельцев файлов из таблицы; сохранить только подтверждённые SHA и хэши evidence.
- [x] Записать новый контракт до изменения кода: admission failure до первой попытки → exit 2 и отдельный безопасный preparation receipt без measured summary; карантин после dispatch → summary и exit 1; неизвестная очистка удерживает соответствующие leases.
- [x] Описать v2 marker по существующему `/workdir/.loginom-evals-isolated.json`, который старая версия `checkIsolatedStorage` отвергает по version. Не оставлять рядом старый совместимый маркер, позволяющий broad cleanup.
- [x] Закрепить lifecycle из раздела «Владение самостоятельных команд»: OS guards действуют только при живом controller; durable reservations сохраняют запрет запуска после его выхода. Server reservation остаётся unresolved при незавершённом incident, даже если чистые user/profile reservations уже выпущены. Archive предшествует server close; удаление server files требует отдельного closure proof.
- [x] Зафиксировать разовый bootstrap владельца из раздела «Хост и bootstrap»: он создаёт `/var/lib/loginom-evals/locks`; prepare только проверяет этот root. CLI использует константу, функции получают root аргументом, unit-тесты используют temp. Env/config override запрещён. `controller.stateDir` хранит journal, но не переносит global fence; два stateDir конфликтуют по одинаковым server/user/profile/judge keys.
- [x] Во всех нормативных документах до изменения кода разделить legacy exclusive и v2 user-scoped admission/cleanup, описать marker migration, release/recover, архивирование до server close и отказ при uncertain outcome. Зафиксировать запрет старых broad-cleanup executors и перезапуска сервера для слота, сохранение текущих серий и условия 2 → 1 приёмки.
- [x] В node-evals/orchestration/runtime runbooks закрепить новую пару на `lg-pc-75` из задачи 1а; никаких изменений remote eval-tests/`R/operations/stand.lease` и legacy/dev контейнеров. Старые миграционные инструкции пометить legacy-only, без выполнения здесь. Новый marker делает свежую пару непригодной для broad cleaner; ordinary node-evals выбирает архив по slot_id. Нормативно закрепить `interrupted_cleanup` только по прерванным попыткам, включая исправление более широкой формулировки SIGINT в старой спеки. Задача 11 сверяет команды и evidence.
- [x] Проверить документный diff и закоммитить только свои контрактные файлы: `git diff --check`, затем `git commit -m "docs(evals): define user-isolated parallel contract"` с явным `git add` перечисленных файлов.

### Задача 1. Конфигурация, canonical paths и leases

**Files:** Create `evals/src/slots.ts`, `evals/test/slots.test.ts`; Modify `evals/src/config.ts`, `evals/src/lease.ts`, `evals/test/config.test.ts`, `evals/test/lease.test.ts`.

**Interfaces:** Produces `SlotFile`, `SlotDefinition`, `ServerIdentity`, `SlotLease`, `parseSlots`, `loadSlots`, `acquireSlotLease`. `config.parallel` и `config.slotsFile` добавляются без удаления singleton-настроек.

- [x] RED: добавить минимальный JSON fixture прямо в тест и проверить одинакового пользователя/вложенные пути, при этом один общий сервер принимается:

```ts
const value = {
  version: 2,
  server: { container: "server", studioContainer: "studio", url: "http://localhost/app/", network: "eval", alias: "loginom-server-7.4.2-test", storageRoot: "/workdir/UserStorage", backupRoot: "/workdir/SessionBackup" },
  controller: { stateDir: `${root}/controller`, adminCredentialsFile: `${root}/secrets/admin.json` },
  judge: { codexHome: `${root}/judge` },
  slots: [
    { id: "a", username: "eval-a", profileDir: `${root}/a/profile`, workspaceRoot: `${root}/a/work`, historyDir: `${root}/a/history` },
    { id: "b", username: "eval-b", profileDir: `${root}/b/profile`, workspaceRoot: `${root}/b/work`, historyDir: `${root}/b/history` },
  ],
}
expect(parseSlots(value, 2).slots.map(slot => slot.username)).toEqual(["eval-a", "eval-b"])
expect(() => parseSlots({ ...value, slots: value.slots.map(slot => ({ ...slot, username: "eval-a" })) }, 2)).toThrow("SLOT_USER_DUPLICATE")
expect(() => parseSlots(value, 3)).toThrow("SLOT_COUNT")
expect(() => parseSlots({ ...value, version: 1 }, 2)).toThrow("SLOTS_VERSION")
```

- [x] `root` в fixture — реальный `mkdtemp` под `tmpdir()`; создавать private child directories, удалять только свой fixture. Запустить RED: `bun test test/slots.test.ts test/config.test.ts`. Новый тест падает из-за контракта, не из-за отсутствия `/var/lib`/Docker/Loginom.
- [x] В `loadConfig` реализовать `--parallel` и отказы до ранних веток judge-only/calibrate, чтения node-ops private config и side effects: v2 с `--keep-storage` или `--reset-profile`; N>1 без slots; N>1 с judge-only/calibrate, `EVAL_NODE_OPS_CONFIG`, `EVAL_NODE_STAND_LEASE` или `EVAL_HARNESS_LEASE_RECEIPT`. Parameterized RED/GREEN покрывает каждую переменную отдельно, парные комбинации и разрешённый legacy N=1. Проверить exit 2 и отсутствие созданной run directory/CLI dispatch.
- [x] GREEN: добавить parse/validate и реальные filesystem-проверки отдельно в `loadSlots`; нормализовать канонические пути через `realpath` ближайшего существующего предка, затем проверить все попарные пересечения profile/workspace/history/controller/admin/auth/install. `username` ограничить безопасным идентификатором, а **имена файлов пользователя не ограничивать этим regex**.
- [ ] RED/GREEN отдельными тестами реальной fs и двух Bun-процессов: duplicate `(containerId, username)` при разных profile; разные users на одном container; замена inode owner; мёртвый PID с неразобранным receipt; server restart с тем же container ID; symlink и вложенные canonical roots. Зафиксировать ключ user lease как hash полного container ID и canonical username/UserKind; сохранить manifest generation/epoch в receipt, не делать их частью обходного ключа блокировки.
- [ ] RED/GREEN реальными Bun-процессами: освобождение OS guard при SIGKILL не снимает durable fence; FD не наследуется child; только recovery-only CAS принимает ожидаемую актуальную revision/token; устаревший CAS отклоняется, два recover не принимают одну revision одновременно. Проверить PID reuse/boot ID, потерянный журнал, crash до/после durable release и разные server IDs с общим profile/judge key. Эти тесты проверяют примитивы lease, не требуют будущей CLI recover.
- [ ] Проверить `bun test test/slots.test.ts test/config.test.ts test/lease.test.ts` и `bun typecheck`; коммит `feat(evals): add user slot configuration and leases`.


### Задача 1а. Новая пара контейнеров, постоянные sources и граница CI

**Files:** Create `evals/src/parallel-pair.ts`, `evals/script/parallel-pair.ts`, `evals/test/parallel-pair.test.ts`, `evals/test/parallel-pair-integration.test.ts`; Modify `evals/package.json`. Зависит от задачи 1 и bootstrap владельца; обязательна до задач 2–5/10. OAuth-кандидата не ждёт.

**Interfaces:** `parallel-pair.ts create|destroy --config <slots.json> --purpose acceptance|research --out <private-dir>`. Docker вызывается массивом argv. Create идемпотентен по private ownership journal, nonce/labels и полным IDs; одноимённые чужие ресурсы не принимаются. Destroy требует явной команды и того же подтверждённого ownership, отсутствия активного run/retained incident; не используется для recovery одного слота.

Модуль экспортирует `readServerIdentity(file: SlotFile): Promise<ServerIdentity>`;
его используют create, admission и повторные проверки перед mutation.

До появления container ID используются provision guards/reservations в том же
global root: отдельные стабильные keys Docker-daemon identity + canonical network
name и каждого container name, в общем порядке захвата. Они защищают совпадения
между разными stateDir/config; имя Docker network само по себе не уникально.
После create сохраняются полные IDs, далее применяется и server guard. Неопределённое
создание сохраняет reservation для reconciliation; destroy берёт оба вида guards.

- [ ] RED/GREEN unit: выбор config paths/ports, schema marker, plan действий и reconciliation неизвестного Docker-ответа. Использовать pure входные JSON и временный lock root; Docker не подменять внутренним mock. Docker-поведение проверить отдельно в integration.
- [ ] После bootstrap сохранить конфигурацию из раздела 2 как `/home/kiselev/.local/state/loginom-evals/parallel/slots.json` (0600) с проверенными локальными путями и отдельным bootstrap admin file. Подготовить второй research config с собственными именами/портом/roots. Пароль в slots JSON не записывать; private bootstrap file предоставляет владелец, последующие slot secrets создаёт harness. Existing config без подтверждённой принадлежности не перезаписывать.
- [ ] В `evals/package.json` дополнить текущий `test:unit` явными исключениями `parallel-pair-integration`, `loginom-admin-integration`, `user-environment-integration`, `parallel-lifecycle-integration`, `shared-oauth-integration`, `process-supervisor-integration`, `parallel-acceptance-integration` к прежним `isolated-storage,node-eval-ops,node-skill,sandbox`. Создавать новые файлы в их задачах; проверки с Loginom/Docker/bwrap/Chromium не добавлять в обычные `*.test.ts`. Существующий `evals-unit` продолжает `bun run test:unit`; unit locks всегда на temp. Local integration запускается явным списком файлов по готовности; отсутствие prereqs даёт receipt непроверенной проверки, skip ≠ PASS. Для полного local regression сохраняются `bun test` и `bun typecheck`.
- [ ] `create` проверяет локальные image IDs `loginom-server-7.4.2-test:with-libxml2` (`d138ce018adb`) и `loginom-client-7.4.2-test:latest` (`69ce44ac1002`), закрепляет **полные** IDs/digests в journal до создания. Pull/подмена тега не выполняются. Создать отдельную Docker network и alias `loginom-server-7.4.2-test` только внутри неё; не подключать к `loginom-net`. Server не публикует порты; Studio binding `127.0.0.1:<port>:80` выводится из validated loopback `server.url`; 32771 — acceptance пример. Research config задаёт другой свободный порт. Повторная проверка занятости и отказ Docker bind обрабатываются без остановки dev.
- [ ] Создать контейнеры (`docker create`, ещё не start), `restart=no`, без mounts и privileged. Подтверждённый default workdir/bootstrap этой версии квалифицировать на research pair; bootstrap admin брать только из private regular file 0600. До первого старта `docker cp` записывает Studio `/usr/local/apache2/initial-content/server.json` с boolean `"wsproxy": true`, Server `/workdir/Components.cfg` с Python `Disabled="true"` (Guid `70a6c99d-a725-4309-b05c-898c8072c3cd`). Entry point Studio копирует initial-content в htdocs при старте; запись только в htdocs до старта недопустима. Исходный `auto` допускает `ws://127.0.0.1:8080`, где находится dev-сервер.
- [ ] До старта записать `/workdir/.loginom-evals-isolated.json`: kind `loginom-evals-users`, version 2, полный container ID и owned inventory/nonce. Затем start по IDs, bounded infrastructure health, read-back marker/config и served `/usr/local/apache2/htdocs/client/server.json`, DNS alias/backend address и proxy config. Неизвестный исход create/cp/start требует inspect+read-back по journal; не повторять вслепую и не принимать чужой ID. Receipt пока только `infrastructure-ready`, не eval admission. Actual browser/CLI WebSocket route доказывается в задачах 2–3 под journal с учётом и закрытием созданных sessions. Последующий prepare проверяет глобальную конфигурацию, не переписывает и не перезапускает пару.
- [ ] Реализовать `readServerIdentity` в `parallel-pair.ts`: Docker full `.Id`/`.State.StartedAt`, host boot ID и `/proc/1/exe`, cmdline/stat starttime внутри container → versioned hash `serverEpoch` по формуле выше; Studio identity читается отдельно. Pure parser/hash RED/GREEN — stable reread, changed field, malformed/unreadable/unknown executable → отказ. На research pair integration — restart с тем же ID меняет epoch; повторное чтение без restart стабильно. Production не меняет epoch при одном лишь новом admin context.
- [ ] До задачи 2 сохранить RPC sources в `/home/kiselev/.local/state/loginom-evals/parallel/studio-source` (0700) с image digest/path/SHA inventory: `/usr/local/apache2/initial-content/bg/js/bg.model.rpc.js`, `bg.server.rpc.js`, `bg.model.js`. Если копия из `/tmp` доступна — сверить с image; иначе `docker create` extraction-container без start → `docker cp` → удалить только свой extraction ID. Секреты/browser state не копировать.
- [ ] Integration RED/GREEN: повтор create сохраняет IDs/файлы; занятой порт/чужое имя дают отказ без изменений; `cleanupIsolatedStorage` legacy реально вызывается на v2 marker и отказывает, hashes контрольных A/B остаются прежними. Legacy cleaner уже проверяет version 1; менять его контракт ради этого отказа не требуется. Destroy тестируется только на собственном disposable fixture с сохранностью посторонней dev-пары.
- [ ] Research pair для SessionBackup, restart/epoch и crash-тестов имеет собственные имена/network/порт/paths/receipt, не совпадающие с acceptance config. Свободный research-порт выбирается и фиксируется отдельно; acceptance pair не используется для этих опытов. Проверить `bun run test:unit`, `bun typecheck`, затем `bun test test/parallel-pair-integration.test.ts` на этом хосте с receipt; коммит `feat(evals): provision dedicated user-eval pairs`.

### Задача 2. Trusted административный Playwright adapter

**Files:** Create `evals/src/loginom-admin.ts`, `evals/script/loginom-admin-driver.mjs`, `evals/test/loginom-admin.test.ts`, `evals/test/loginom-admin-integration.test.ts`; Modify `evals/src/preflight.ts` для проверки установленного browser runtime.

**Interfaces:** Produces `ServerSession`, `AdminConnection`, `openLoginomAdmin`, `selectOwnedSessions`. Consumes `SlotFile`, `ServerIdentity`; credentials не выходят из модуля.

- [ ] RED: чистая функция выбора сессии должна отказать при несовпадении user/epoch даже с одинаковым remoteKey:

```ts
const owned = { remoteKey: "session-41", userKey: "user-a", username: "eval-a", serverEpoch: "epoch-1", pendingDisconnect: true, activeOperations: 0 }
expect(selectOwnedSessions([owned], [owned])).toEqual([owned])
expect(() => selectOwnedSessions([{ ...owned, userKey: "user-b" }], [owned])).toThrow("SESSION_IDENTITY_CHANGED")
expect(() => selectOwnedSessions([{ ...owned, serverEpoch: "epoch-2" }], [owned])).toThrow("SERVER_EPOCH_CHANGED")
expect(() => selectOwnedSessions([owned, owned], [owned])).toThrow("SESSION_IDENTITY_AMBIGUOUS")
```

- [ ] Запустить `bun test test/loginom-admin.test.ts` (RED), затем реализовать нормализатор и проверки (GREEN). Display name `eval-a:1` не используется как достаточное доказательство.
- [ ] Проверить доступные реальные поля session identity/user identity и сигнатуры административных browser RPC на закреплённой 7.4.2 по перечню выше. Зафиксировать adapter capability contract и обезличенный ответ в `evals/docs/parallel-users-contract.md`. У managed row нет обнаруженного immutable ID: доказать составную identity epoch/leased username/exact Name/CreateTime и fresh proxy отрицательными race tests; если нельзя — возвращать `SESSION_IDENTITY_UNSUPPORTED`, не ослаблять выбор до имени.
- [ ] Запустить браузер средствами проверенной установленной копии: bundled Node и Chromium из `resources/loginom/resource-manifest.json`, `playwright-core` через `createRequire` от `resources/loginom/runtime/client/package.json`. Проверить relative paths, CLI manifest hashes и executable; исходный monorepo `node_modules` не использовать. Не добавлять runtime-зависимость harness и не скачивать другой Chromium.
- [ ] Bun-модуль `loginom-admin.ts` запускает `script/loginom-admin-driver.mjs` отдельным child через закреплённый bundled `bin/node`. Это выбор штатного product runtime; утверждение, что любой импорт Playwright под Bun невозможен, не требуется. Driver владеет browser/context и RPC proxies; Bun владеет journal/leases и supervisor. Между ними private stdin/stdout JSONL v1, без TCP listener.
- [ ] Протокол: request `{v:1,id,op,expectedIdentity,deadline,payload}`, response `{v:1,id,outcome:"confirmed"|"not_applied"|"unknown",data}`. Allowlist op: init/inspect/reconcile-user/close-session/dispose; generic evaluate и произвольный JS запрещены. Init передаёт проверенный resource root, origin и **путь** credential-file по pipe, не секрет в argv/env. Stdout только protocol, stderr только безопасные diagnostic codes. Journal intent durable до отправки; mutation одна in flight. Timeout/EOF/crash/невалидный ответ после dispatch → unknown с read-back, без слепого replay. Dispose требует ack и подтверждённого выхода; PID ownership сохраняется до supervisor proof.
- [ ] Unit RED/GREEN публичного codec через реальные pipe streams в Bun: framing/correlation/size limits, неизвестный op/id, EOF/timeout и отсутствие секрета в diagnostic envelope; импорт codec не запускает браузер. Bundled Node/Chromium/Loginom нужны только `test/loginom-admin-integration.test.ts`; там проверить запуск настоящего driver, crash после mutation и последующий read-back, а не mock RPC.
- [ ] Реализовать один private context на controller run, transport по pipe без TCP CDP. Перед переиспользованием сверять admin identity/epoch; reconnect только после фиксации неопределённых действий и read-back. Административные mutations сериализовать. Deadline ограничивает login, readiness и ожидание закрытия; отсутствие ожидаемого UI/RPC — явная ошибка adapter capability.
- [ ] Для управления пользователями/ACL использовать перечисленные browser RPC: enumerate exact Name/UserKind → сверить ownership manifest → reuse либо Add → явно Blocked=true при подготовке нового/своего idle-пользователя → необходимое изменение AuthMode/password/rights → getter/enumerator read-back → unblock последним. На unchanged local user setters AuthMode/password не вызываются. Если отдельная необходимая операция не имеет проверенной сигнатуры, использовать детерминированный Playwright UI с точным числом найденных элементов и read-back. Все такие UI selectors фиксируются как versioned adapter contract в этом же коммите. Непроверенные REST endpoint не изобретать.
- [ ] Немодельный интеграционный RED/GREEN на отдельном disposable Loginom: A и B видны под своими identity, два одинаковых create/read-back дают одного пользователя, закрытие A не закрывает B; ответы при разрыве административного соединения не объявляются успехом. Секретный ввод/сетевые ответы login не включать в traces.
- [ ] Проверить `bun test test/loginom-admin.test.ts`, `bun typecheck`; приложить редактированный non-model receipt, коммит `feat(evals): add trusted Loginom administration adapter`.

### Задача 3. Идемпотентная подготовка и all-slot admission

**Files:** Create `evals/src/user-environment.ts`, `evals/test/user-environment.test.ts`, `evals/test/user-environment-integration.test.ts`, `evals/script/parallel-env.ts`; Modify `evals/src/profile.ts`, `evals/src/preflight.ts`, `evals/test/profile.test.ts`, `evals/test/preflight.test.ts`.

**Interfaces:** Produces `ReadyEnvironment`, `prepareEnvironment`, `verifyEnvironment`; script `prepare|verify|status`. Consumes admin adapter и slot leases. Публичная standalone-команда закрывает свой admin context; `run.ts` позднее использует те же шаги со своим context.

- [ ] RED через fake CLI: готовый профиль с чужими username/endpoint отвергается до `run`, собственный повторно не вызывает setup. Расширить fake status строго проверяемыми `url`/`username`, сохранив старые fixtures. Пример утверждений после двух запусков preparation:

```ts
expect(receipt.slots.map(slot => slot.status)).toEqual(["ready", "ready"])
expect(second.slots.map(slot => slot.profileGeneration)).toEqual(receipt.slots.map(slot => slot.profileGeneration))
expect(second.changedUsers).toEqual([])
expect(second.changedPasswords).toEqual([])
expect(await Bun.file(foreignSentinel).text()).toBe("preserve")
```

Полная пара `receipt`/`second` требует реального Loginom и выполняется в немодельной интеграционной приёмке; unit RED с fake CLI проверяет только профильную часть через её публичный интерфейс, без fake-admin и без попытки выдать её за полный prepare.

`receipt`/`second` — JSON публичной будущей `parallel-env prepare`; `foreignSentinel` создаёт тест во временном постороннем каталоге. Счётчики изменения — только безопасный отчёт подготовки, без credential values.

- [ ] Запустить RED: `bun test test/profile.test.ts test/user-environment.test.ts`. Затем реализовать журнал prepare: запланировать операцию с nonce и desired hash → сохранить private secret → выполнить → прочитать фактическое состояние → записать committed receipt. После crash продолжать по read-back, а не создавать пользователя или менять пароль второй раз.
- [ ] Проверить receipt созданной задачей 1а пары, полные IDs, marker v2, restart policy/no mounts, фактический route/`wsproxy=true`/Python-disabled config. Prepare не создаёт и не перенастраивает контейнеры и не перезапускает сервер. Неизвестная или изменившаяся глобальная конфигурация даёт отказ до users/dispatch; исправление квалифицируется отдельно на research pair.
- [ ] Разделить `checkIsolatedLoginom` в preflight на legacy и v2 admission: v2 использует `server.network`/`server.alias` из конфигурации, marker v2, immutable identity и **свой** user root. Глобальные пустота/`loginom-net` остаются только legacy. Интеграционный regression: сеть отличается от `loginom-net`, B содержит рабочие данные, A готов; остатки в A блокируют A. Подключение к dev alias или чужая network identity запрещено.
- [ ] Под существующим server fence создать только принадлежащие окружению users/dirs. `IsDesigner=true`, права просмотра по необходимости, `IsAdmin=false`, `UseGlobalFileStorage=false`; права на свой root и отсутствие эффективных прав на соседей и общие места записи, включая Everyone, проверять под оцениваемым пользователем. Чужое существующее имя/каталог без совпадающего ownership marker → `USER_OWNERSHIP_CONFLICT`, без перезаписи.
- [ ] Подготовить CLI `setup` через stdin, проверить фактическое соединение `check`, закрыть/учесть setup/check sessions. Правильные профили и accounts переиспользовать; исправление дрейфа — только принадлежащий idle-slot или отдельное восстановление. `--reset-profile` не использовать как штатную подготовку.
- [ ] Сделать выбранный `historyDir` действительным: расширить существующий `archiveProfileHistory(profileDir, archiveId)` опциональным третьим `historyDir = \`${profileDir}.history\`` и передавать slot history root в новом пути. Legacy default сохраняется; реальные fs-тесты проверяют отсутствие истории в writable профиле и невозможность монтировать соседний/закрытый архив.
- [ ] Реализовать standalone finalization по таблице lifecycle: даже при отказе проверки закрыть доказанно свои probe/management/admin owners; readiness не является lease. Внутренний prepare получает controller context и сохраняет его reservations для run. На текущем этапе тестировать публичные prepare/verify и отсутствие утечки reservations; полная цепочка с run/recover проверяется в задачах 5/8/10. До готовности session/backup/cleanup gates возвращать отказ допуска, не фиктивный ready.
- [ ] Закрепить fingerprint: server/Studio generation, образы, marker, ACL/Everyone/shared directories, component policy, backup policy, CLI/resource digests, выбранные users, canonical roots и shared-auth capability. Перед dispatch каждого run — свежий read-back этих полей и сравнение с durable успешным receipt. Дорогие отрицательные ACL-пробы повторяются при отсутствии receipt, изменении fingerprint, recovery или потере достоверности управления; неизменный fingerprint позволяет reuse. На попытку — lease/generation/session journal/empty-user-root checks, без повторного входа/создания пользователя. RED/GREEN: второй prepare/run без дрейфа не повторяет ACL-пробы; изменение Everyone, image или component policy снимает readiness до первого dispatch.
- [ ] RED/GREEN: неисправный B, занятый lease B, недостаточные права B, несовпадающий route, shared writable Everyone и неподтверждённая backup policy дают exit 2 до первого model dispatch, не уменьшают `parallel`; освобождаются лишь заведомо чистые reservations. После неясного provisioning сохраняются журнал и удержание соответствующего владения.
- [ ] Проверить `bun test test/profile.test.ts test/preflight.test.ts test/user-environment.test.ts` и `bun typecheck`; коммит `feat(evals): prepare reusable user environments before dispatch`.

### Задача 4. Session ownership и положительное исследование SessionBackup

**Files:** Modify `evals/src/user-environment.ts`, `evals/src/loginom-admin.ts`, `evals/test/user-environment.test.ts`, `evals/test/loginom-admin.test.ts`, `evals/test/user-environment-integration.test.ts`, `evals/test/loginom-admin-integration.test.ts`, `evals/docs/parallel-users-contract.md`; Create fixtures доказанных обезличенных ownership observations в `evals/fixtures/parallel-users/`.

**Interfaces:** Produces durable session ledger и подтверждённая backup policy, потребляемые `cleanupSlot`. На ещё не подтверждённой policy live допуска нет.

- [ ] RED через уже введённые в задаче 2 `AdminConnection.inspect` и `selectOwnedSessions`: несколько своих сессий учитываются, неизвестная сессия того же username или запись прежнего epoch не получает подтверждённого ownership. Unit-тесты проверяют публичный selector, реальные browser-ответы — немодельный adapter fixture. Тест полной команды recovery и её запрета delete перенесён в задачу 5; задача 4 не вызывает ещё не созданную команду.

- [ ] Запустить RED `bun test test/user-environment.test.ts test/loginom-admin.test.ts`; реализовать persist-before-use ledger: container ID, StartedAt/server epoch, user identity, slot/run/attempt, session identity, наблюдаемая связь с запуском CLI, состояние close. Setup/check/recover connections учитываются тоже. Username используется как условие владения, но не разрешение закрывать любые неизвестные сессии аккаунта.
- [ ] На disposable 7.4.2 создать **непустой** SessionBackup поддержанными crash/recovery сценариями: пакет с несохранённым изменением, отключение browser; повторить A/B с одинаковыми именами. Зафиксировать путь, содержимое metadata, user/session/epoch, момент создания и повторного появления. Полный restart допустим только в этом отдельном эксперименте, не как recovery production-слота.
- [ ] Выбрать доказанный контракт: (a) однозначное сопоставление backup entries с user/session/epoch и адресный delete после session close; либо (b) поддержанное отключение создания backup, фактический read-back настройки и положительный crash/recovery контроль отсутствия backup. Если ни один не доказан, оставить live dispatch заблокированным с `SESSION_BACKUP_POLICY_UNPROVEN` и конкретным исследовательским receipt.
- [ ] Неизвестную/чужую backup entry сохранять. Карантин только A допустим при доказанном локальном влиянии; если невозможно установить затронутого пользователя/границу, остановить новые admissions всех слотов, дать подтверждённо здоровым активным pipelines завершиться и сохранить результаты.
- [ ] Проверить RED/GREEN тесты и `bun typecheck`; приложить положительный backup evidence к задаче, коммит `feat(evals): bind server sessions and backups to user slots`. Не называть пустой каталог положительной приёмкой.

### Задача 5. Close fence перед всеми удалениями и адресное recovery

**Files:** Modify `evals/src/run.ts`, `evals/src/user-environment.ts`, `evals/src/artifact.ts`, `evals/src/profile.ts`, `evals/test/no-artifact-cleanup.test.ts`, `evals/test/isolated-storage.test.ts`, `evals/test/transition.test.ts`, `evals/test/user-environment.test.ts`, `evals/test/profile.test.ts`, `evals/test/lease.test.ts`, `evals/script/parallel-env.ts`; Create `evals/test/parallel-lifecycle-integration.test.ts`.

**Interfaces:** Produces `CleanupReceipt`, `cleanupSlot`, `recoverSlot` и `parallel-env recover`. `ArtifactSource` для v2 фиксирует проверенный container ID и root конкретного пользователя.

- [ ] RED для публичной `parallel-env recover` этой задачи: один `browser-exited` не разрешает file cleanup; прежний server epoch, неизвестная session и активная операция оставляют `storageDeletionAllowed=false`, `nextAdmissionAllowed=false`. Проверить JSON receipt: `processes="confirmed"`, `serverSessions="unknown"`; затем реализовать команду и довести тест до GREEN в этой же задаче. Внешний adapter используется в реальном Docker/browser fixture; внутренних моков нет.
- [ ] Все реальные Loginom/driver/recover/runAttempt проверки этой задачи поместить в `parallel-lifecycle-integration.test.ts` (и уже исключённый `isolated-storage.test.ts` для старого контракта). Обычные `no-artifact-cleanup`/`transition`/`user-environment` tests остаются fake+dir/receipt/fs, без Docker. Local команда: `bun test test/parallel-lifecycle-integration.test.ts` с research config и receipt; skip не заменяет GREEN.
- [ ] В `runAttempt` заменить повторный binary-вызов `checkIsolatedLoginom` **только для v2** на короткую проверку slot identity/lease/marker/configured network+alias и своего root из задачи 3. В `test/parallel-lifecycle-integration.test.ts` проверить начало A при активном B и отказ A при собственных остатках; legacy binary продолжает прежний admission. Без изменения этого call site каждый v2 attempt будет блокироваться старой проверкой.
- [ ] RED на настоящем disposable Loginom: тест на фактическом `runAttempt` должен обнаружить, что `cleanupArtifact`/`cleanupOrphanResult` пока вызываются до `afterAttempt`; создать no-artifact result и незавершённую серверную сессию, требовать сохранения файла. Переносится **всё** удаление, включая аварийное/orphan, а не только `cleanupIsolatedStorage`.
- [ ] Запустить `bun test test/no-artifact-cleanup.test.ts test/transition.test.ts test/user-environment.test.ts` (RED); live-часть запускается в отдельном Docker/browser integration окружении. Без него skipped означает непроверенный fence, не PASS. Сохранить измеренный результат и все copy/evidence операции; delete отложить за единый fence в `afterAttempt`/`cleanupSlot`.
- [ ] Реализовать единый порядок: остановить собственные процессы → сохранить diagnostics/артефакты → выполнить нужный CLI recovery с учётом новых соединений → **повторно подтвердить остановку всех локальных writers после последней management-команды** → архивировать историю, БД/WAL/SHM и inputs с durable archive receipt → через admin закрыть подтверждённые собственные server sessions → подтвердить их отсутствие и прекращение operations/package locks → сохранить closure receipt → удалить собственные server files и доказанные backups → проверить root/epoch/marker → сохранить cleanup receipt → release/retry/следующее задание.
- [ ] Сделать архивирование crash-recoverable: до перемещений записать manifest исходных/целевых путей и identity/hash, после переноса и проверки — fsync данных/каталогов и committed receipt. При SIGKILL между DB/WAL/inputs moves recovery согласует обе стороны по журналу; частичный архив не считается committed, обе части сохраняются до однозначного завершения. Подтверждённый прежний архив переиспользуется, не заменяется новым пустым архивом.
- [ ] При неопределённом CloseSession committed архив остаётся доступным для диагностики, server files не удаляются, слот/leases карантинятся, retry запрещён. При неподтверждённых local writers или незавершённом CLI recovery история не перемещается: сохраняются оригиналы и диагностика с явной пометкой неполноты. Ошибка архива сохраняет оригиналы/частичный архив и запрещает server deletion/release; допустимый best-effort close доказанно собственных sessions прекращает операции, но не снимает этот запрет.
- [ ] RED/GREEN: archive committed → потерянный close response; SIGKILL между archive receipt и close; SIGKILL посередине DB/WAL/inputs moves; I/O failure архива и живой writer. Проверить хэши сохранённой истории, отсутствие server delete/retry/release, сохранение B и возможность повторной recovery по журналу. В новый `recover` не добавлять безусловный запуск CLI после уже committed archive.
- [ ] После финального close fence до окончания file cleanup не вызывать `loginom check`, `setup`, `status` с побочным подключением или другой producer server sessions. Повторный scan и admin read-back не должны открывать соединение оцениваемого пользователя.
- [ ] Реализовать user-only traversal по argv, без glob и `split("\n")`: dotfiles, `.autosave`, имя с пробелом/tab/newline, `-leading`, Unicode, вложенная директория, symlink и hardlink. Root и его предки должны быть canonical directories; удаление symlink-объекта не переходит по target; hardlinks/непонятная ownership topology дают безопасный отказ до delete. Удаляются все материалы **своего** пространства, а не только `eval-*`.
- [ ] После timeout `CloseSession` сначала read-back, а не повторный слепой close/delete. Closed=true без исчезновения сессии не успех. При неизвестном исходе сохранять user/profile leases и evidence, A → quarantine, B продолжает. Server restart/смена shared ACL → общий stop admissions.
- [ ] Немодельный тест: держать B активным, явно включить autosave A с измеренным period (по умолчанию выключено), создать A `.autosave`, аварийно завершить browser A, доказать сохранение B, закрыть server A, очистить A и наблюдать отсутствие повторного появления. Окно наблюдения связывать с фактическим autosave period и deadline; 12 секунд исторического probe не превращать в универсальную константу.
- [ ] RED/GREEN lifecycle команд на реальной fs/процессах и disposable Loginom: standalone prepare → повторный prepare → verify освобождают reservations; авария controller с живым child → обычный prepare получает RECOVERY_REQUIRED → recover принимает подтверждённую lineage → cleanup/released. Проверить CAS → crash recovery → повтор с тем же incident; последовательное восстановление A/B; last slot released → crash до admin/judge/server release → повтор завершает только общие ресурсы. Полностью terminal incident идемпотентен; второй recover не применяет stale CAS. Partial recovery A сохраняет общий fence для B/admin/judge. Полную цепочку с новым run завершить в задаче 8.
- [ ] Проверить `bun test test/artifact.test.ts test/profile.test.ts test/lease.test.ts test/isolated-storage.test.ts test/no-artifact-cleanup.test.ts test/transition.test.ts test/user-environment.test.ts`, `bun typecheck`; коммит `fix(evals): close owned server sessions before user storage cleanup`.

### Задача 6. Два supervisor и доверенный административный browser

**Files:** Modify `evals/src/process-supervisor.ts`, `evals/src/process-launcher.ts`, `evals/test/process-supervisor.test.ts`, `evals/fixtures/fake-cli.ts`; Create `evals/test/process-supervisor-integration.test.ts`.

**Interfaces:** Existing `superviseProcess` получает доказанную информацию о других живых launcher контроллера; registry хранит `(pid,starttime,uid,executable identity)` и владение slot/admin, а не строки argv.

- [ ] RED: одновременно запустить два настоящих supervisor с одним browser bundle; fixture B создаёт новые grandchildren без `--user-data-dir`, меняет process title и reparent. Cleanup A подтверждён, B жив и продолжает писать свой heartbeat; чужие процессы не сигналятся и не объявляются своими.

```ts
expect(a.processCleanup.status).toBe("confirmed")
expect(a.processCleanup.unknownProcesses).toEqual([])
expect(await Bun.file(bHeartbeat).text()).not.toBe(beforeCleanup)
expect(a.processCleanup.processes.some(item => item.pid === bRootPid)).toBe(false)
```

`a` — результат существующего `superviseProcess`; heartbeat/root PID принадлежат fixture и проверяются настоящим `/proc`, без monkeypatch. Третьим участником повторить этот сценарий с trusted admin browser.

- [ ] Запустить `bun test test/process-supervisor.test.ts -t "parallel"` (RED). Добавить минимальный registry известных launcher и их доказанных цепочек потомков; убрать только воспроизведённую ложную принадлежность. Непроверяемый PID остаётся unknown, argv/PGID/path не разрешают исключить процесс.
- [ ] RED/GREEN: PID reuse, исчезновение parent между чтениями, unreadable `/proc`, новый descendant после scan, abort A во время работы B, административный reconnect. Сохранять порядок signals и возможность завершить cleanup внутри CLI до уничтожения namespace launcher.
- [ ] Отдельно измерить задержку **между запланированным и фактическим запуском** proc observations и разрыв между scans под нагрузкой двух слотов; `observations.max_duration_ms` измеряет время самого scan и не заменяет это измерение.
- [ ] Проверить `bun test test/process-supervisor.test.ts`, `bun typecheck`, затем real Chromium немодельный smoke. Если узкие исправления не доказывают границу, фиксировать процессный blocker live; ACL Loginom не использовать как объяснение безопасности процессов.
- [ ] Настоящие Bun/PID fixtures остаются в unit `process-supervisor.test.ts`; bundled Chromium, bwrap и trusted admin scenario — в `process-supervisor-integration.test.ts`. Запустить его отдельно на этом хосте с receipt и доступным установленным prod runtime; shared OAuth не требуется.
- [ ] Коммит `fix(evals): preserve process ownership across parallel supervisors`.

### Задача 7. Потребить временный shared OAuth, сохранив независимую авторизацию судьи

**Files:** Modify только harness `evals/src/cli.ts`, `evals/src/sandbox.ts`, `evals/src/profile.ts`, `evals/src/preflight.ts`, `evals/test/cli.test.ts`, `evals/test/sandbox.test.ts`, `evals/test/profile.test.ts`, `evals/test/judge.test.ts`, `evals/test/preflight.test.ts`; Create `evals/test/shared-oauth-integration.test.ts`. Product integration и её файлы принадлежат основному чату.

**Interfaces:** Consumes установленный CLI capability `shared-oauth-v1` и canonical `auth.sharedDir`; передаёт `LOGINOM_AI_AGENT_SHARED_AUTH_DIR` и обязательный `LOGINOM_AI_AGENT_EXPERIMENTAL_WEBSOCKETS=false` агентским и management процессам; judge использует отдельный `judge.codexHome`.

Продуктовый prerequisite выполняется основным чатом на этой машине до GREEN shared
sandbox и live задачи 10. Задачи 1–6 и fixture-реализация 8–9 его не ждут: для
немодельной подготовки есть установленный `0.1.17-prod` (source `5588651a…`) без
`shared-oauth-v1`, он не допускается для live v2 model run.

- [ ] Зафиксировать границу коммитов до интеграции: временный блок переносимых OAuth-зависимостей, затем отдельные собственные изменения `evals/` и документации. Продуктовая работа использует `cherry-pick -x` и сохраняет таблицу source SHA → local SHA, исходную базу, порядок и разрешения конфликтов в `evals/docs/parallel-users-contract.md`. Не добавлять evals-логику в импортируемые коммиты, не amend/fixup/squash-ить с ними последующие адаптации.
- [ ] Env filters, mounts, auth admission, lifecycle и тесты реализовать поверх установленного CLI внутри `evals/`. Не копировать shared store/refresh/lock и не импортировать приватные исходные модули продукта как runtime-зависимость harness. Если существующего контракта действительно недостаточно, записать конкретный пробел и выделить минимальную продуктовую правку в отдельный коммит основного чата с тестом и планом поставки upstream; не скрывать её внутри временного cherry-pick.
- [ ] Учесть поздний round4 shared-oauth: exact installed `597592f5d53f86beb69ffe318af2d4db52c5f416` принят для 8 локальных CLI с overlap 3464 мс и ограничениями наблюдаемости (`956c81fea7390451d51d7a9df069829c3adc403a:docs/testing/loginom-ai-agent/multica-mas.md:130–148`). Это устраняет прежнее blanket NOT_READY, но не доказывает forced refresh или новый evals/bubblewrap: кандидат после переноса квалифицируется отдельно.
- [ ] Основной чат создаёт отдельную ветку/worktree от подтверждённой `loginom`, переносит `cherry-pick -x` в порядке зависимости `dfd2b0df2de6b60f529973f35fcccc59feceef5f`, `ba919629f966e23670ff0a02720057067adbb040`, `bd4951803532db3f51c1b5a66a864038d88865c3`, **`66f0956bc9f16ee580b20f3cf98e368857048f27`**, **`3bcf645a7363b41aed709b985a63758431abeee6`** либо подтверждает их уже слитые эквиваленты. Последний commit исправляет фокус password при входе в Loginom и входит в принятый round4 artifact; включён обязательной отдельной product-зависимостью, не evals-адаптацией. Сверить refs перед переносом; если продуктовая работа уже поставила кандидат, не выполнять второй cherry-pick.
- [ ] Из `packages/loginom-host` нового worktree собрать Linux standalone: `LOGINOM_AI_AGENT_NODE_SOURCE=/home/kiselev/.local/share/loginom-ai-agent-acceptance/package-docs-20261006/node-v24.19.0-linux-x64/bin/node LOGINOM_AI_AGENT_BROWSER_SOURCE=/home/kiselev/.loginom-dock/runtime/browsers /home/kiselev/.bun/bin/bun script/build-cli.ts /home/kiselev/.local/state/loginom-evals/parallel/candidate-artifact`. Проверить наличие npm рядом с build Node; runtime `resources/loginom/bin/node` не заменяет build distribution. Artifact path должен быть новым и вне checkout; существующий результат не перезаписывать.
- [ ] Выполнить перенесённый verifier: `bun script/verify-cli-candidate.ts /home/kiselev/.local/state/loginom-evals/parallel/candidate-artifact <absolute-worktree> --shared-oauth`. `<absolute-worktree>` — фактический путь созданного product worktree из receipt, единственный динамический аргумент; verifier старого prod флаг не поддерживает. Проверить manifest/source/binary hashes, HTTP-only env и password-focus regression.
- [ ] Установить через публичный `installCli(artifact, destinationHome)` из `src/cli-install.ts`, передав `/home/kiselev/.local/state/loginom-evals/parallel/candidate-home`; каталог заранее 0700. Запуск из `<worktree>/packages/loginom-host`: `bun -e 'const { installCli } = await import("./src/cli-install.ts"); console.log(JSON.stringify(await installCli(process.argv[1], process.argv[2])))' /home/kiselev/.local/state/loginom-evals/parallel/candidate-artifact /home/kiselev/.local/state/loginom-evals/parallel/candidate-home`. Не менять HOME и существующий prod launcher. Штатный installer отдельно запрашивает необходимые root-права sandbox helper. Canonical realpath нового `candidate-home/.local/bin/loginom-ai-agent-cli`, installed root, capability и hashes закрепить в receipt и повторить verifier на installed root с тем же worktree. Только этот кандидат идёт в обе live-приёмки.
- [ ] Учесть известные контекстные расхождения `packages/product/package.json` и `packages/loginom-host/test/cli-manifest.test.ts` на исследованной базе. Это работа product integration; её результат — manifests, source SHA, binary SHA, capability, результаты сборки/профильных тестов, не лишь список коммитов.
- [ ] RED: `agentCommand` сохраняет разрешённый shared directory, судья его не наследует; bubblewrap видит один общий inode каталога/lock и не видит соседние профили, controller state и admin credential file. `assertAuth` shared-mode не принимает local `auth.json` вместо отсутствующего shared store.

```ts
expect(command.env.LOGINOM_AI_AGENT_SHARED_AUTH_DIR).toBe(sharedDir)
expect(judgeEnv.LOGINOM_AI_AGENT_SHARED_AUTH_DIR).toBeUndefined()
expect(agentVisiblePaths).toContain(sharedDir)
expect(agentVisiblePaths).not.toContain(adminCredentialsFile)
expect(agentVisiblePaths).not.toContain(otherProfile)
```

`command`/`judgeEnv` берутся из существующих публичных builders; `agentVisiblePaths` — результат реального sandbox fixture, не списка, повторяющего код mount builder.

- [ ] Запустить RED `bun test test/cli.test.ts test/sandbox.test.ts test/profile.test.ts test/judge.test.ts test/preflight.test.ts`; GREEN: оба env-фильтра, writable bind **всего** shared dir, guarded shared auth admission и сохранность store при archive/recovery/reset. Shared dir 0700, ordinary files 0600, canonical owner, без symlink/hardlink; отдельно от profiles/history/work/results/install/controller secrets.
- [ ] Первый вход выполнить один раз после создания private `onboarding/profile`: `LOGINOM_AI_AGENT_SHARED_AUTH_DIR=/home/kiselev/.local/state/loginom-evals/parallel/model-oauth LOGINOM_AI_AGENT_CLI_PROFILE=/home/kiselev/.local/state/loginom-evals/parallel/onboarding/profile LOGINOM_AI_AGENT_EXPERIMENTAL_WEBSOCKETS=false /home/kiselev/.local/state/loginom-evals/parallel/candidate-home/.local/bin/loginom-ai-agent-cli providers login --provider openai --method "ChatGPT Pro/Plus (headless)"`. Без shared env это был бы локальный login и prerequisite не выполнен. Штатное внешнее подтверждение аккаунта владельцем обязательно, если действующей авторизации нет. Harness автоматизирует подготовку и проверку; не обещает самостоятельно пройти согласие пользователя. Копирование auth.json без metadata/login generation не заменяет вход.
- [ ] Два реальных sandbox-потребителя на одном host/filesystem: согласованный refresh, atomic rename, общий inode lock, cancellation и uncertain refresh. Не удалять `refresh-pending.json`; uncertain refresh запрещает модельный dispatch до штатного восстановления после остановки потребителей. Model requests не сериализовать глобальным OAuth lock.
- [ ] Shared installed-candidate/bwrap/refresh сценарии выполнять в `test/shared-oauth-integration.test.ts`: `bun test test/shared-oauth-integration.test.ts` с закреплённым candidate receipt. Обычные cli/profile/judge/preflight тесты проверяют env/receipts/fs через разрешённые fixtures и не требуют установленного shared кандидата.
- [ ] HTTP-only switch `66f0956bc9f16ee580b20f3cf98e368857048f27` обязателен. Провести `LOGINOM_AI_AGENT_EXPERIMENTAL_WEBSOCKETS=false` через оба фильтра (harness и sandbox), включая management; без явного false/поддержанного switch admission запрещён. RED/GREEN проверяет фактический env дочернего процесса и transport receipt. Это product dependency выбранного режима, отдельная от Loginom user auth.
- [ ] Подготовить `judge.codexHome=/home/kiselev/.local/state/loginom-evals/parallel/judge-codex` (0700, canonical private directory), запретить совпадение/пересечение с Desktop `~/.codex`, agent profiles/model store. Владелец однократно выполняет `CODEX_HOME=/home/kiselev/.local/state/loginom-evals/parallel/judge-codex codex login --device-auth`, затем `codex login status` с тем же prefix. Существующий Desktop auth не копировать. Отсутствующий judge auth → отдельное AUTH_REQUIRED; harness не автоматизирует согласие аккаунта.
- [ ] Harness задаёт `CODEX_HOME` только judge children через `judge.env`; сам Desktop и окружение родительского shell не меняются. Исправить `codexInfo` в `preflight.ts`: проверять тот же effective `judgeEnvironment(judge.env)`, что используется в `codex exec`, а не `process.env.CODEX_HOME`. RED/GREEN: Desktop auth есть, judge-home пуст → отказ; правильный отдельный home передаётся version/exec, но не agent/admin child. Host-global lease защищает только cooperating harness runs и не заменяет отделение от Desktop.
- [ ] Сохранить условность judge admission: `--skip-judge` и code-only node-evals не требуют judge auth и не берут его lease. Это проверить отдельно от отсутствующего model OAuth; для live agent shared/model admission остаётся обязательным. Standalone немодельная подготовка не вызывает модель или судью.
- [ ] Проверить тесты выше и `bun typecheck`; коммит `feat(evals): admit shared OAuth candidates in isolated slots`. Настройки и credentials `codex exec` сохраняются отдельно; его rate/refresh limits всё ещё требуют своей приёмки.

#### После слияния shared-oauth в loginom

Эти шаги снимают временную зависимость перед итоговой интеграцией evals. Они не
разрешают переписывать текущую историю или изменять стенды в рамках подготовки
документов.

- [ ] Зафиксировать новую базу `loginom`, старый tip evals и таблицу переносов. Убедиться, что upstream содержит эквивалентные store/lock/refresh, hardening, cache isolation, capability и, обязательный HTTP-only transport switch и password-focus fix. Учитывать squash/rework: одного совпадения patch-id или названия ветки недостаточно. Отдельно проверить судьбу каждого дополнительного продуктового исправления.
- [ ] Сохранить старый tip отдельным ref и защитить незавершённые изменения. Предпочтительный путь — новая чистая интеграционная ветка от подтверждённой `loginom` с переносом только собственных evals/docs-коммитов по явному списку. Альтернатива для изолированной ветки — rebase с исключением известных dependency commits. Не применять широкий диапазон вслепую и не рассчитывать только на автоматическое удаление дублей Git. Уже слитую продуктовую функциональность не удалять через revert; опубликованную общую историю не переписывать.
- [ ] Исключить только временные копии, уже поглощённые upstream. Не поглощённое необходимое продуктовое исправление оставить отдельным видимым коммитом/зависимостью с проверкой; не удалять его ради формально чистой истории. Постоянные адаптации `evals/` и их тесты сохраняются.
- [ ] Сравнить старую и новую серии через `git range-diff`, проверить итоговый diff относительно новой `loginom`. Ожидаются собственные `evals/` и согласованные документы; изменения продуктовых файлов допустимы только как явно перечисленные необходимые остаточные исправления. Для конфликтов сохранить разбор того, как удержано поведение; отсутствие текстового конфликта не заменяет проверки.
- [ ] Собрать/получить установленный binary новой продуктовой базы и проверить manifest/capability. Повторить `bun test test/cli.test.ts test/sandbox.test.ts test/profile.test.ts test/judge.test.ts test/preflight.test.ts` и `bun typecheck` из `evals/`, интеграционные проверки shared store/refresh/изоляции и приёмку 2 → 1 из задачи 10 для нового кандидата. Обновить source/binary/manifest pins и checkpoint; исторические результаты, auth store и profiles не сбрасывать. Итоговый PR содержит собственные evals-доработки без повторно переносимого OAuth.

### Задача 8. Общая очередь и независимый lifecycle слотов

**Files:** Create `evals/src/scheduler.ts`, `evals/test/scheduler.test.ts`; Modify `evals/src/run.ts`, `evals/src/judge.ts`, `evals/test/run.test.ts`, `evals/test/judge.test.ts`, `evals/src/lease.ts`, `evals/test/lease.test.ts`, `evals/fixtures/fake-cli.ts`, `evals/fixtures/fake-codex.ts`.

**Interfaces:** Produces `Job`, `buildJobs`, `runSlotQueue`; consumes ready environments, proven cleanup receipts и существующий `runAttempt`/`afterAttempt`. Retry остаётся внутри одного `execute(slotId, job)`.

В `judge.ts` добавить `createJudgeGate(): (input: Parameters<typeof judgeTask>[0]) => Promise<Judged>`. Один gate создаётся на run и охватывает весь `judgeTask`, включая его внутренний retry. Он не сериализует агентов, не создаёт отдельный pool/очередь судей и не освобождает ожидающий слот.

- [ ] RED: точный порядок очереди и отсутствие барьера:

```ts
expect(buildJobs(["slow", "fast"], 2)).toEqual([
  { index: 0, taskId: "slow", attempt: 1 },
  { index: 1, taskId: "fast", attempt: 1 },
  { index: 2, taskId: "slow", attempt: 2 },
  { index: 3, taskId: "fast", attempt: 2 },
])
```

- [ ] Запустить `bun test test/scheduler.test.ts` (RED); GREEN: очередь резервирует индекс синхронно до await; результат кладётся по `job.index`, не в `attempts[attempts.length - 1]`. Ожидать завершение всех pipeline при любом rejection; один итоговый writer summary.
- [ ] Дополнить fake-cli сценариями `parallel-slow`, `parallel-fast`, `parallel-infra-retry`, `parallel-cleanup-failure`. Задержки и контрольные выходы задаются по существующему `EVAL_TASK_ID`, переустановленному после фильтра; не полагаться на отфильтрованные env. Fake judge использует существующий `EVAL_JUDGE_COMMAND`.
- [ ] Через публичный `main` доказать временными метками: fast attempt 2 начинает работу до завершения slow attempt 1; retry исходной logical attempt остаётся на том же slot_id и архивирует `infra_retry.initial`; history/workspaces не пересекаются. Пользователь, профиль и context не создаются заново между попытками.
- [ ] Реализовать отдельный fixture admission для `main(argv, env, { fixture: { slots, lockRoot } })`: третий аргумент — только программный test seam, production entrypoints его не принимают из argv/env/config. Допустим лишь `EVAL_CLI_MODE=fake` + `EVAL_ARTIFACT_SOURCE=dir:<temp-root>`; slots имеют отдельные реальные temp profile/work/history/storage roots, синтетическую server identity и те же lease/scheduler/report/archive функции. Под slot artifact source выбирается `<temp-root>/<slot_id>`, scopes не пересекаются. Ни Docker, ни admin, ни bwrap не вызываются; fixture receipt явно `liveQualified=false`. Binary/source mode с этим аргументом, fixture-marker из обычного CLI и общий writable root двух слотов отвергаются. Dry-run валидирует/строит jobs без claims о readiness. Так очередь тестируется без fake-admin и без shared OAuth кандидата.
- [ ] Тесты `main` используют настоящий `fake-cli.ts`/`fake-codex.ts`, разрешённый локальный fixture endpoint и temp lock root; production `main(argv, env)` всегда использует константу lock root и реальный v2 admission. Проверить в unit CI без Docker и `/var/lib`; полноценные prepare/recover/run chains остаются в `parallel-lifecycle-integration.test.ts` и не выдаются за fixture PASS.
- [ ] RED/GREEN host-global lease canonical judge CODEX_HOME в `/var/lib/loginom-evals/locks`: два controller/run с разными server IDs и одной judge-home конфликтуют до dispatch. Брать вместе с общим admission; отпускать только после подтверждённого завершения собственных judge-процессов. Пропавший PID не разрешает stale takeover. Проверить двумя настоящими Bun-процессами в `test/lease.test.ts`; model OAuth flock остаётся независимым.
- [ ] RED/GREEN judge mutex на двух фактических `fake-codex.ts` child processes: интервал вызова судьи B начинается после завершения A, а интервалы агентов могут перекрываться. Abort B в ожидании не запускает `codex exec` и даёт **новый исход gate** в существующем типе `Judged`: `{ok:false,error:"interrupted before judge",attempts:0}`; измеренный исход агента сохраняется. Ошибка/timeout/abort A освобождают mutex в finally, B может продолжить; shared OAuth/Loginom/admin env в judge не появляются. Проверка: `bun test test/judge.test.ts -t "gate"`.
- [ ] Интеграционные GREEN-цепочки через публичные команды: `prepare → prepare → verify → run`; `crash harness → RECOVERY_REQUIRED обычного run → recover каждого retained слота → новый run`. Новый run получает новый token и повторяет admission, не продолжает старые измерения; crash между durable release и unlock не оставляет вечный BUSY. При живом run внешний recover даёт BUSY без изменения ownership. В unit-сценариях агента/судью заменяют только разрешённые fixtures; server lifecycle проверяется в реальном non-model adapter окружении.
- [ ] RED/GREEN матрица: карантин A оставляет B очередь; карантин всех → exit 1 + summary, невыданные пары не measured; stop=true без cleanup failure останавливает A и позволяет clean lease release; общий writer failure блокирует новые assignments и дожидается активных; Ctrl+C во время agent/judge/cleanup не стирает уже измеренный результат и запрещает retry.
- [ ] Проверить `bun test test/scheduler.test.ts test/run.test.ts test/transition.test.ts test/judge.test.ts test/lease.test.ts`, `bun typecheck`; коммит `feat(evals): dispatch a shared queue across reusable user slots`.

### Задача 9. Summary, отчёт и node-evals без потери старых runs

**Files:** Modify `evals/src/report.ts`, `evals/src/compare.ts`, `evals/src/rejudge.ts`, `evals/src/node-runner.ts`, `evals/src/node-evals.ts`, `evals/script/run-node-evals.ts`, `evals/test/report.test.ts`, `evals/test/compare.test.ts`, `evals/test/rejudge.test.ts`, `evals/test/node-runner.test.ts`, `evals/test/node-evals.test.ts`, `evals/test/node-evidence.test.ts`.

**Interfaces:** `AttemptResult.slot_id?`, `RunSummary.config.parallel?`, `RunSummary.slots?` допускают чтение исторических summary; отсутствие config.parallel → 1. Все новые writers обязаны записывать config.parallel, slots и slot_id, включая N=1; legacy singleton получает slot_id `default`. У каждой новой записи slots безопасные identity, profile/history references, status и cleanup receipt. Никаких административных секретов или browser state.

- [ ] RED: old summary без новых полей читается без миграции, compare/rejudge сохраняют прежний quality denominator; новым слотам соответствуют результаты и времена, но logical retry не считается второй попыткой.
- [ ] RED: node evidence для одинаковых session/file names в разных архивных roots выбирает профиль по `attempt.slot_id`, а старый run использует прежний `config.profileDir`:

```ts
expect(aEvidence.profile).toBe(aHistoryProfile)
expect(bEvidence.profile).toBe(bHistoryProfile)
expect(aEvidence.nativeValue).toBe("A")
expect(bEvidence.nativeValue).toBe("B")
expect(legacyEvidence.profile).toBe(legacyProfile)
```

Тест создаёт два настоящих минимальных архивных каталога с различимой evidence и вызывает существующие публичные collectors через `runNodeEvals`; не заменяет collectors моками. Generic summary остаётся неизменённым после code-only validation.

- [ ] Запустить RED `bun test test/report.test.ts test/compare.test.ts test/rejudge.test.ts test/node-evals.test.ts test/node-evidence.test.ts`; GREEN: дополнить readers и выбирать профиль/архив через таблицу slot_id, отказать при неизвестном id, не подставлять первый профиль.
- [ ] Обновить help `script/run-node-evals.ts` для `--parallel` и slots. Строгий parser общий: `src/node-runner.ts` вызывает `loadConfig`, расширенный задачей 1; отдельный parser wrapper не создавать. В `node-runner.test.ts` проверить subprocess `--help`, допустимый parse `--parallel 2` и отказ неизвестного флага. `--dry-run` node runner по-прежнему отвергает; не использовать его для положительного wrapper smoke. Добавить программный `runNodeEvals(argv, env, options?)`, передающий fixture options задачи 8 в `main`; из CLI options не поступают. Fake v2 GREEN — через этот публичный интерфейс, полный subprocess с `--parallel 2` — через живую команду раздела 5 в приёмке. Проверить `bun test test/node-runner.test.ts test/node-evals.test.ts`.
- [ ] Сохранить прежние top-level `loginom.container/image_digest`; для N>1 `storage_dir=null`, per-slot root хранится в slots; при N=1 сохраняется единственный user root. Новые singleton runs записывают `slot_id="default"`, старые результаты без slot_id читаются по прежнему пути. Агрегированный `storage_leftovers` остаётся `null`, если листинг любого нужного пространства не удался; детализация per-slot показывает причину.
- [ ] Сохранить тип и смысл `interrupted_cleanup: { recovered: boolean } | null`: `null`, если нет попыток `status === "interrupted"`; иначе `{ recovered: interruptedAttempts.some(item => item.profile_recovered) }`. RED/GREEN: обычный recovery без interruption оставляет null; прерванная без recovery даёт false; несколько прерванных дают OR независимо от порядка завершения; recovery непрерванной попытки не влияет. Это не индикатор успешности cleanup; ошибки остаются в `slots`, `environment_cleanup`, `stopped_reason` и exit code.
- [ ] Удалить опасную сгенерированную команду `rm eval-*` из нового shared-server отчёта; вместо неё предложить адресный `parallel-env recover` с incident/lease receipt. Отчёт включает parallel, длительность run и сумму agent time, slots/quarantine; `failure_kinds.provider` уже существует, не добавлять второй несовместимый счётчик.
- [ ] Маскировать все разрешённые credentials активных слотов и admin secrets до записи errors/stdout/config snapshot; секреты неактивных слотов не читать. `redact` не сериализует полный controller/private config. Кодовый тест с различными canary secrets проверяет results и diagnostics после успешного/ошибочного setup и cleanup.
- [ ] Проверить тесты выше, `bun test test/node-native.test.ts test/text-import-evidence.test.ts` для затронутых collectors и `bun typecheck`. Коммит `feat(evals): preserve reporting and node evidence across slots`.

### Задача 10. Немодельная и затем живая приёмка

**Files:** Create `evals/script/check-parallel-users.ts`, `evals/script/sample-parallel-resources.ts`, `evals/test/parallel-users-acceptance.test.ts`, `evals/test/parallel-acceptance-integration.test.ts`; Modify `evals/docs/parallel-users-contract.md`; Create `docs/testing/loginom-ai-agent/reports/2026-10-13-parallel-users-acceptance.md` при фактическом выполнении, с реальной датой вместо переписывания исторических отчётов.

**Interfaces:** `check-parallel-users --config <file> --out <private-dir> --mode non-model` выполняет реальные сценарии доверенным контроллером и возвращает безопасный receipt; он не вызывает модель/судью. Ресурсный collector `sample-parallel-resources.ts --config <file> --out <jsonl> --interval-ms 1000` работает на фактическом runner host, не вызывает модели и принадлежит trusted supervisor приёмки; стартует до run и завершается после его cleanup. Paths в командах ниже — будущие paths подготовленной среды.

- [ ] RED: схема receipt требует поимённые проверки и положительные controls; «все отрицательные операции завершились ошибкой подключения» не принимается как isolation PASS. Требуются реальные server/user identities, успешная своя операция, failed чужая и неизменность B hash/heartbeat.
- [ ] Немодельная приёмка на новой паре приёмки задачи 1а на `lg-pc-75`: prepare дважды; A/B одновременно пишут одинаковые basename; A не может read/write/copy/import/export в B и общие места записи через обычный, абсолютный и `../` пути; проверить обратное B→A. Добавить пробелы, tab/newline, Unicode, ведущий дефис, dotfiles, вложенные файлы, `.autosave` и открытый пакет.
- [ ] Во время активности B выполнить обычный cleanup A; затем crash browser A и повторный safe cleanup. Проверить session close/read-back, прекращение операций и package locks, отсутствие регенерации после подтверждения, сохранность hash B и его успешное продолжение. Обязательна квалифицированная backup policy из задачи 4: адресность непустого SessionBackup либо доказанное безопасное отключение.
- [ ] Проверить агентской sandbox-командой попытки прочитать admin credential/state/browser-profile, соседние profile/history, controller env и Docker socket; результат — denied/absent. Собственная Loginom connection и единый model OAuth store доступны ровно по выбранному контракту. Проверить admin browser без доступного CDP listener.
- [ ] До live проверить реальную выдачу лицензии Loginom и допустимые одновременные пользовательские/административные сессии: readback через квалифицированный экран лицензирования/административный Playwright adapter плюс немодельное одновременное подключение выбранных users. Сохранить безопасный receipt типа лицензии/лимита и фактического session count, без лицензионных ключей. Доступность сетевого сервера лицензий и прежний успешный вход по отдельности не доказывают допуск двух слотов. Неизвестный лимит/отказ выдачи оставляет соответствующую приёмку неполной/неуспешной.
- [ ] Закрепить перед run ресурсный бюджет и лимиты в acceptance manifest: CPU/cgroup quotas, RAM/swap limits, минимальный MemAvailable и свободное место для server storage, profiles/archives/results, доступные ограничения model/Dock/judge и число одновременных сессий. Пороговые значения выбрать по фактическому runner и зафиксировать **до** попыток; их нельзя подгонять под результат. Readiness проверяет эти условия до первого dispatch.
- [ ] Реализовать read-only сбор до, во время обоих runs и после cleanup с интервалом 1 с: host CPU из `/proc/stat`, MemAvailable/swap из `/proc/meminfo`, свободный диск/иноды через statfs, Server/Studio CPU/RAM/PIDs/I/O через Docker stats/inspect, process RSS/CPU доверенных CLI/browser/judge owners и cgroup OOM/throttling counters. Сохранять timestamps/run/phase, исходные samples и сводку peak/min/delta в закрытом evidence; пробелы измерений отмечать, отсутствие данных не трактовать как нулевую нагрузку. Collector не должен наследовать admin/model credentials или читать содержимое профилей.
- [ ] RED/GREEN receipt validation: отсутствующие samples/лицензионное доказательство, превышение зафиксированного бюджета, OOM/ENOSPC либо классифицированный rate/quota limit дают отдельный failed/incomplete acceptance gate. Использовать обезличенные input receipts и настоящий sampler smoke без модели; результат quality attempts не переписывать.
- [ ] Schema/receipt validation остаётся в `parallel-users-acceptance.test.ts`. Реальный sampler/Docker/двухпользовательские сценарии — `parallel-acceptance-integration.test.ts`, отдельный запуск `bun test test/parallel-acceptance-integration.test.ts` с private receipt. Обычный CI не требует этой пары или административных credentials.
- [ ] Подготовить immutable manifest живой приёмки: harness/source SHA, installed CLI/manifest/binary hashes, Server/Studio digests и IDs/epoch, tasks snapshot, агент `openai/gpt-6-luna/high`, судья `gpt-6-sol/xhigh`, transport, judge prompt/schema hashes, Dock skill/manifest hashes, ACL/backup policy, список slot identities и timeout. Проверить соответствие фактических model/reasoning обязательным pins в обоих runs. Секретов в manifest нет.
- [ ] Запустить сначала два слота на фиксированном небольшом наборе минимум из двух задач с повторами, достаточными для подтверждения перекрытия. Затем на тех же pins и новой чистой run directory запустить один слот. Зафиксировать фактические retries, ошибки провайдера/судьи, cleanup, архивы, общее wall time и не приписывать качеству изменение denominator.
- [ ] Успех приёмки **выбранной параллельности** требует полноты resource/licence evidence, соблюдения заранее заданного бюджета, отсутствия OOM/ENOSPC, отказов лицензии/session limit, HTTP 429 и иных выявленных provider/Dock/judge rate/quota limits. Проверять также события промежуточных попыток и доступные transport diagnostics: успешный ответ после retry не стирает лимит. Недоступная наблюдаемость фиксируется как ограничение, а не доказанное отсутствие 429. Run с ограничением провайдера сохраняется со своими исходными результатами, но не получает PASS parallelism; изменение N/бюджета оформляет новую квалификацию, а не повтор ради PASS.
- [ ] Отдельно подтвердить согласованный shared OAuth refresh двух CLI; smoke на неистёкшем token это не заменяет. Auth failure судьи исследовать отдельно. Не менять metadata начатых LAB-серий, не подключать к новым пользователям их старые broad-cleanup executors.
- [ ] Полный regression после интеграции: `bun test` и `bun typecheck` из `evals/`, затем перечисленные немодельные/live commands. При неготовой текущей среде сохранить конкретный blocker и невыполненные шаги, не объявлять приёмку успешной по историческим JSON.
- [ ] Коммит сценариев `test(evals): accept shared-server user isolation and parallel lifecycle`; evidence commit содержит только обезличенный отчёт и pins, не private profiles/results/secrets.

### Задача 11. Сверить фактические команды и результаты приёмки

**Files:** Modify `evals/AGENTS.md`, `evals/README.md`, `evals/.env.example`, `evals/docs/2026-10-07-analytic-evals-isolation-plan.md`, `evals/docs/2026-10-07-eval-tests-runtime.md`, `evals/docs/node-evals.md`, `evals/docs/evaler-orchestration.md`, `docs/superpowers/specs/2026-09-18-evals-design.md`, `docs/testing/loginom-ai-agent/parallel-evals.md`.

**Interfaces:** Нормативные правила и каркас runbook уже обновлены задачей 0. Здесь сверяются реально реализованные commands/receipts, ссылки на design/plan и acceptance report; новые правила допуска/cleanup на финальный этап не откладываются. Старые release/series reports сохраняют исходные пути, версии и результаты.

- [ ] Сверить утверждённые в задаче 0 интерфейсы с реализацией: команды/флаги, выходные коды, ownership/release receipts, archive/cleanup state, node-evals и legacy rejection. Исправить примеры и пути; неожиданное изменение нормативного контракта возвращает работу в задачу 0 до нового изменения поведения.
- [ ] Добавить фактические SHA/manifest pins, отчёт приёмки 2 → 1, resource/licence/limit receipts и оставшиеся ограничения. Только реализованные и проверенные операции снять с пометки «планируется». Исторические runbooks/reports сохраняют версии и факты своего окружения.
- [ ] Проверить документальные свидетельства перехода: прежние исполнители исключены, v2 marker отвергается legacy cleaner, цепочки prepare/recover/run проходят без утечки reservations. Это проверка уже принятого контракта, не первая формулировка правил миграции; действующие серии автоматически не перенастраивать.
- [ ] Подготовить checkpoint ≤20 строк: SHA/pins, выполненные проверки, невыполненные gates, следующий шаг. Не переносить туда сырые логи или предположения.
- [ ] Проверить покрытие каждого требования дизайна задачей/тестом, отсутствие придуманных RPC signatures и якобы выполненных проверок, `git diff --check`; коммит `docs(evals): document parallel user setup and recovery`.

## 5. Будущие команды оператора

**Все commands этого раздела предлагаются к реализации; сейчас их запускать нельзя.** Впоследствии `run.ts` сам вызывает prepare/admission перед первой попыткой и повторно использует run context. Отдельные команды предназначены для проверяемой подготовки, диагностики и восстановления, а не для ручного редактирования пользователей.

```bash
cd /home/kiselev/git/loginom-ai-agent/evals

# После bootstrap владельца и реализации задачи 1а: создать новую acceptance pair.
bun run script/parallel-pair.ts create --config /home/kiselev/.local/state/loginom-evals/parallel/slots.json --purpose acceptance --out /home/kiselev/.local/state/loginom-evals/parallel/evidence/pair-create

# Один проверенный установленный кандидат используется подготовкой и всеми прогонами.
export EVAL_CLI_MODE=binary
export EVAL_CLI_BIN="$(readlink -f /home/kiselev/.local/state/loginom-evals/parallel/candidate-home/.local/bin/loginom-ai-agent-cli)"
export EVAL_AGENT_MODEL=openai/gpt-6-luna
export EVAL_AGENT_VARIANT=high
export LOGINOM_AI_AGENT_EXPERIMENTAL_WEBSOCKETS=false
export JUDGE_MODEL=gpt-6-sol
export JUDGE_REASONING=xhigh
export EVAL_TASK_TIMEOUT_MS=900000
export EVAL_JUDGE_TIMEOUT_MS=300000

# Одной командой подготовить пользователей, ACL, личные roots, профили и receipts.
bun run script/parallel-env.ts prepare --config /home/kiselev/.local/state/loginom-evals/parallel/slots.json --parallel 2 --out /home/kiselev/.local/state/loginom-evals/parallel/evidence/prepare

# Повторная подготовка: те же identities, пароли/история/чужие файлы сохранены.
bun run script/parallel-env.ts prepare --config /home/kiselev/.local/state/loginom-evals/parallel/slots.json --parallel 2 --out /home/kiselev/.local/state/loginom-evals/parallel/evidence/prepare-again

# Status: read-only состояние. Verify: немодельная проверка без исправлений конфигурации.
# Verify может открыть/закрыть свои probe sessions и сохраняет это в receipt.
bun run script/parallel-env.ts status --config /home/kiselev/.local/state/loginom-evals/parallel/slots.json --out /home/kiselev/.local/state/loginom-evals/parallel/evidence/status
bun run script/parallel-env.ts verify --config /home/kiselev/.local/state/loginom-evals/parallel/slots.json --parallel 2 --out /home/kiselev/.local/state/loginom-evals/parallel/evidence/verify

# Приёмка действует только на явно выделенных тестовых пользователях этого config.
bun run script/check-parallel-users.ts --config /home/kiselev/.local/state/loginom-evals/parallel/slots.json --out /home/kiselev/.local/state/loginom-evals/parallel/evidence/non-model --mode non-model

# Обычный harness: автоматически prepare -> all-slot admission -> dispatch.
EVAL_SLOTS_FILE=/home/kiselev/.local/state/loginom-evals/parallel/slots.json EVAL_CLI_MODE=binary EVAL_RESULTS_DIR=/home/kiselev/.local/state/loginom-evals/parallel/results/two bun run src/run.ts --parallel 2 --tasks tasks/analytic --only sales-by-category,inventory-by-category --repeat 3

# Те же pins, новый results root, один слот.
EVAL_SLOTS_FILE=/home/kiselev/.local/state/loginom-evals/parallel/slots.json EVAL_CLI_MODE=binary EVAL_RESULTS_DIR=/home/kiselev/.local/state/loginom-evals/parallel/results/one bun run src/run.ts --parallel 1 --tasks tasks/analytic --only sales-by-category,inventory-by-category --repeat 3

# Адресное recovery использует сохранённый incident; неизвестная identity запрещает delete.
bun run script/parallel-env.ts recover --config /home/kiselev/.local/state/loginom-evals/parallel/slots.json --slot a --incident /home/kiselev/.local/state/loginom-evals/parallel/controller/incidents/a.json --out /home/kiselev/.local/state/loginom-evals/parallel/evidence/recover-a

# Кодовые node-evals используют тот же admission и slot_id для закрытых архивов.
EVAL_SLOTS_FILE=/home/kiselev/.local/state/loginom-evals/parallel/slots.json EVAL_CLI_MODE=binary EVAL_RESULTS_DIR=/home/kiselev/.local/state/loginom-evals/parallel/results/nodes bun run script/run-node-evals.ts --parallel 2 --only crosstable-fixed-sum,crosstable-sliding-average
```

Команды закрепляют две существующие аналитические задачи и по три повтора: 6 logical attempts на двух слотах, затем 6 на одном. По решению владельца все новые eval-прогоны используют агента `openai/gpt-6-luna/high` и судью `gpt-6-sol/xhigh`. Эти обязательные pins действуют также для приёмки N=2 → N=1; исторические runs сохраняются. Набор/model/judge/timeouts фиксируются до обоих runs в immutable manifest; изменение требует новой приёмки. Launcher кандидата проверяется по canonical realpath и SHA receipt задачи 7; пути выше появятся только после его установки. До задачи 7 немодельные задачи 1–6 используют существующий prod CLI, но не получают shared/model admission. Dock endpoint/credential подаются через private env contract (`LOGINOM_DOCK_BASE_URL`, `LOGINOM_DOCK_API_KEY`); секреты не пишутся в manifest/argv. `verify` не исправляет конфигурацию; созданные проверки user sessions учитываются и закрываются.

## 6. Оставшиеся недоказанные вопросы

1. Production-идентичность server session и её привязка к конкретному CLI/management запуску, включая reconnect и несколько соединений одного пользователя. Экспериментальный display name недостаточен.
2. Адресное обращение с **непустым** SessionBackup либо доказанное поддержанное отключение; текущее evidence содержит `NOT_REPRODUCED`.
3. Полностью автоматическая повторная подготовка ACL/Everyone/users/profiles на реальном адаптере, сохранность чужих данных при partial/unknown outcome.
4. Многопроцессное владение Chromium у двух supervisor и trusted admin; process observation gaps под фактической нагрузкой.
5. Два агента в реальном bubblewrap с временным shared OAuth кандидатом, согласованный refresh и отдельная пригодность судьи `codex exec`.
6. Полный параллельный LLM-eval на двух слотах, затем single-slot и node-evals через те же контракты. Немодельные JSON этого не доказывают.

## Checkpoint

1. 2026-10-13: реализация в evals-parallel, рабочая база b54455e187fb0a728787263e17a1adc828d77221.
2. Задача 0: контракт v2/runbook и все нормативные ссылки синхронизированы; live не квалифицирован.
3. Работа перенесена в worktree 96cd после переключения общего checkout другим агентом; семь чужих untracked сохранены.
4. Соседняя node-selection сессия: отдельный worktree 4118, общий dev/legacy стенд не менять.
5. Семь SHA-256 evidence проверены; исторический немодельный опыт не заменяет приёмку harness.
6. Cleanup: writers/management → durable archive → server close/readback → свои files/backups → release.
7. Standalone выпускает reservations; crash сохраняет durable fence до recovery-only CAS/proofs.
8. Непустой backup/session identity/supervisor/OAuth/LLM N=2→N=1 остаются gates.
9. Задача 1 частично: slots/config + временный v2 dispatch fence; 88 тестов config/slots/run и typecheck PASS повторно в 96cd; далее durable leases.
