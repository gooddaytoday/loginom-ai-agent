# Подключение к Loginom AI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать Desktop и CLI облачный вход и свой сервер, удалить встроенный ключ и обеспечить восстановление Help с персональными credentials без перезапуска браузера.

**Architecture:** Общий Host владеет облачным входом, отдельной записью cloud credentials и восстановлением единственного Help child. Настройки Loginom остаются поколениями; Help меняет готовность внутри поколения. Managed browser использует локальный каталог, а сайт и два независимых Dock остаются внешними сервисами.

**Tech Stack:** TypeScript, Effect Schema, Bun tests/build, pinned Node 24.19.0, Electron, SolidJS, существующий MCP SDK; Python/pytest для проверок Dock. Новые production-зависимости не нужны; Better Auth устанавливается в будущем репозитории сайта, не здесь.

**Spec:** [Каноническая спецификация](../specs/2026-11-05-dock-cloud-auth-design.md), актуальная редакция этой ветки.

## Global Constraints

- «Профили Desktop/CLI независимы.»
- «Новые сборки не содержат общего ключа Dock.» Старый ключ временно остаётся серверным доступом для 0.3.9; дату отключения этот план не назначает.
- «Вход сохраняет cloud credentials сразу, но не применяет черновой выбор режима.»
- «Переключение режимов не стирает credentials другого режима.»
- Повторный cloud-start при сохранённом подключении отклоняется до обращения к сайту; для смены аккаунта сначала выполнить обычный выход.
- «Настройки Loginom можно сохранить до облачного входа.» Browser verification остаётся отдельным состоянием `unknown/verified/failed`.
- «Все семь удалённых чтений продукта проходят через Help child.» Browser-действия не повторяются.
- «После успешного перехода оставаться на резерве до следующего запуска приложения.»
- Release: `https://loginom.ai`, `https://mcp.loginom.ai/mcp`, `https://mcp-reserve.loginom.ai/mcp`.
- «Только явно заданные proxy переменные окружения и системные CA». OS/PAC resolver не добавляется в Host/Help; Chromium сохраняет `--no-proxy-server`.
- «Все credential-bearing запросы используют `redirect: 'error'`.»
- «На запрос — максимум один refresh и один переход на резерв»; одна remote read-попытка ≤60 с, initial primary connect ≤15 с, совокупный IPC budget120с, внешний budget180с. Refresh cooldown — 30 с, demand-only, с учётом `Retry-After`.
- KB root — `viking://resources/loginom-dock` в cloud и custom. Общие ACL OpenViking не перепроектируются.
- Linux plaintext: каталог0700, файл0600. Windows/macOS сохраняют существующие safeStorage/DPAPI/Keychain; секреты не возвращаются renderer/модели и не попадают в argv/логи.
- Сайт и production reserve сейчас отсутствуют. Их реализация/развёртывание не входят в выполнение задач кода ниже. Настоящий облачный выпуск требует отдельной интеграционной приёмки.
- `services/loginom-ai` — канонический Dock. Репозиторий `$HOME/storage/git/loginom-ai-site` не изменять.
- Тесты из package directories, typecheck — `bun typecheck`. Если фактически изменится публичный Protocol/HttpApi, выполнить `bun run generate` из `packages/client`; запланированный private Loginom API этого не требует.
- Временные данные только в `$HOME/storage/tmp/`. Существующие пользовательские профили/процессы не трогать. Исторические generations не переписывать.
- Применять TDD по одному поведению: RED → GREEN → REFACTOR. Следующая строка сценариев начинается только после зелёной предыдущей. Каждый Task заканчивается проверяемым результатом и отдельным conventional commit.
- Обязательные поля общей schema, все её реализации/fixtures и decoders обновляются в одной задаче. После изменения общего контракта запускать `bun typecheck` из schema, loginom-host, app, desktop и opencode; связанные поведенческие тесты — в той же задаче, без ожидания UI/CLI этапа.

---

## Порядок, границы и подготовка

Рабочая ветка `dock-cloud-auth`; исходная проверка по `3683948bf4`, замечания к плану проверены по `64983e8b76`. Перед исполнением прочитать актуальный diff и применимые `AGENTS.md`; уже внесённые другим исполнителем изменения сохранять. Не создавать новую ветку поверх этой без причины.

Это один план клиентской функции. Задачи 1–13 дают проверяемый Agent с локальными fixtures. Задача14 проверяет существующие возможности Dock и готовит его эксплуатационные требования; отдельного нового сервиса или replication framework нет. Задача15 — внешняя приёмка после реализации сайта и reserve. Она не является планом разработки сайта и не позволяет объявить облачный вход готовым по локальным fixtures.

Зависимости: `1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9`; затем `10` (Desktop/UI), `11` (CLI), `12` (harness) и `13` (упаковка). 10 и11 можно поручить разным исполнителям после фиксации интерфейсов8 и сетевой границы9; они не редактируют schema/Host. 14 независимо готовится после2. 15 требует всех остальных и внешних сервисов. Последовательность при одном исполнителе — по номерам. Task3 сразу переводит существующие Help fixtures и минимальный CLI custom setup на явные credentials; переходного legacy fallback нет. Task6 атомарно добавляет cloud API, Host composition, Desktop preload/IPC и typed stubs; Task8 добавляет Node routes и model projection. Живые облачные проверки через собранные Node Host/Desktop/CLI из8–11 выполняются в13, когда есть baked tuple; раньше используются программная Host injection или узкий management stub.

Одноразовая проба Better Auth до5–8 могла бы проверить device Bearer, raw-token revokeSession и disabledPaths/configId. Это отдельное необязательное предложение вне согласованного объёма: текущий план её не запускает и не добавляет как условие начала клиентских задач. Настоящие серверные гарантии проверяются в15.

Перед первой проверкой задать `TMPDIR=$HOME/storage/tmp/`, `TMP` и `TEMP` тем же значением. Для Node-процессных тестов `LOGINOM_AI_AGENT_TEST_NODE` указывает на реально существующий pinned Node, а не `node` из PATH. Найти имеющийся input через существующий resource manifest/настройку сборки; отсутствие binary — ограничение среды, не причина пропустить тест и назвать его зелёным. Во всех приведённых ниже командах runtime `node --test` использовать именно `$LOGINOM_AI_AGENT_TEST_NODE --test`. Версии/pins в этом плане не обновляются.

Исходники для чтения перед своей задачей:

- Agent: `packages/loginom-host/AGENTS.md`, `packages/loginom-runtime/AGENTS.md`.
- UI/Desktop: `packages/app/AGENTS.md`, `packages/desktop/AGENTS.md`, `packages/desktop/src/main/loginom/AGENTS.md`.
- CLI/evals: `packages/opencode/AGENTS.md`, `packages/opencode/test/AGENTS.md`, `evals/AGENTS.md`.
- Proxy: `docs/superpowers/specs/2026-09-23-system-proxy-v2.md`.
- Выпуск: `docs/migration/linux-implementation-checkpoint.md`, `docs/testing/loginom-ai-agent/README.md`.

## Карта файлов и ответственности

| Файлы | Ответственность / задачи |
| --- | --- |
| `packages/loginom-runtime/client/lib/bridge.mjs`, `packages/loginom-runtime/src/managed-entry.mjs` | Только managed user-v1 без удалённого Dock; 1 |
| **Новый** `packages/loginom-runtime/client/lib/knowledge-scope.mjs`; `knowledge-client.mjs`, `src/knowledge-entry.mjs` | Проверка всех аргументов Help и ограниченные tool schemas; 2 |
| `packages/schema/src/loginom.ts`; `packages/loginom-host/src/connection/connection-store.ts`, `connection-service.ts` | Режим, custom endpoint/key, safe migration, Check/Validation/View; 3,6,8 |
| `packages/loginom-host/src/connection/credentials.ts`, `cli-credentials.ts`, `keychain-envelope.ts`; **новый** `cloud-store.ts` | Существующая защита JSON payload и отдельная mutable cloud запись; 4 |
| **Новый** `packages/loginom-host/src/cloud-auth.ts` | HTTP сайта, Device Authorization, refresh/logout, epoch отмены; 5,7 |
| **Новый** `packages/loginom-host/src/knowledge-session.ts`; `host.ts` | Один Help на поколение, каталог/readiness, deadline, замена child и retry; 6,7 |
| `packages/loginom-host/src/{supervisor,errors,host-port,node-entry,node-client,transport}.ts` | Классифицированные ошибки, private management, admission и отмена; 6–8,11 |
| `packages/product/src/index.ts`; `packages/loginom-host/script/{build-node-host,build-cli,stage-resources}.ts`; `packages/desktop/{electron.vite.config.ts,scripts/bundle-loginom.ts}` | Fixed cloud tuple и единая нерелизная build injection, отсутствие shared key; 5,13 |
| `packages/desktop/src/main/loginom/{desktop-service,ipc}.ts`, `packages/desktop/src/preload/index.ts` | Check decoder3, атомарное подключение cloud API6, сеть9; UI использует готовую границу в10 |
| `packages/app/src/components/{settings-loginom-state.ts,settings-loginom.tsx,settings-loginom.css}`, `packages/app/src/i18n/{en,ru}.ts` | Карточки, вход, отдельные Help/browser статусы; 10 |
| `packages/opencode/src/cli/{loginom-management,standalone-command,standalone,standalone-cancellation,standalone-run}.ts` | Минимальный custom setup3; cloud calls, Ctrl+C, preflight и TUI11 |
| `evals/src/profile.ts`, `scripts/node-acceptance/run-check.py` + их тесты | Custom credentials по stdin, независимость сборки от секрета; 12 |
| `.github/workflows/release.yml`, fixtures, module AGENTS и runbooks | Все потребители embedded key и release validation; 13 |
| `services/loginom-ai/tests/server/conftest.py`, новый `tests/server/test_agent_cloud_access.py`; `deploy/loginom-dock` | Один реальный Dock для ACL/Help scope; runbook двух независимых развёртываний14, внешняя проверка15 |

Новые runtime-модули всего четыре: scope, cloud-store, cloud-auth, knowledge-session. Scope нужен для одной проверяемой границы всех семи инструментов; остальные отделяют долговечное хранение, жизненный цикл авторизации и заменяемый Help. Общий build-only helper cloud-build.ts используется обоими сборщиками и не входит в runtime policy. Не вводить event bus, общий auth framework, новое направление IPC, платформенный vault или новый формат репликации.

## Общие интерфейсы, которые создают задачи

Имена ниже — контракт между задачами, не описание уже существующего кода. Effect Schema в `packages/schema/src/loginom.ts` остаётся источником публичных типов; не дублировать эти типы в Desktop/CLI. Mode/HelpState/CloudStatus экспортируются namespace Loginom вместе с соответствующими Schema. В примерах `declare` фиксирует сигнатуру, реализацию создаёт названный Task.

```ts
// Расширения Loginom; перечислены новые поля, старые View сохраняются.
type Mode = "cloud" | "custom"
type HelpState = "connection-required" | "starting" | "ready" | "recoverable-error"
type CloudStatus = {
  connected: boolean
  email?: string
  pending?: { userCode: string; verificationUrl: string; expiresAt: number }
  failure?: string
}
// Candidate получает mode?: Mode, endpoint?: string; существующий apiKey?: SecretEdit.
// Check = Candidate + verifyBrowser?: boolean; default true.
// View получает mode, endpoint?, hasApiKey, server, help, cloud.
// server: "primary" | "reserve" | "custom"; help: { state: HelpState }.
// hasApiKey относится только к сохранённому custom key, не к cloud pair.
// Validation получает help: { state: HelpState }; browser остаётся отдельным.
// API.check(input: Check): Promise<Validation>
// API.cloudStart(): Promise<View>
// API.cloudCancel(): Promise<View>
// API.cloudDisconnect(): Promise<View>
```

Сохранённый `endpoint` и custom key сохраняются и в cloud режиме. При чтении **старой записи без mode** её `apiKey` игнорируется; новая запись всегда имеет mode, поэтому последующее переключение cloud/custom может сохранить custom key. `apiKey` stdin без явно заданного `mode:"custom"` также игнорируется; `{}` CLI check означает текущий режим. Это разные границы: миграция записи и редактирование текущих настроек.

```ts
// packages/loginom-host/src/connection/cloud-store.ts
export type CloudCredentials = {
  kind: "loginom-cloud-v1"
  installationKey: string
  email: string
  dock: { primary: { apiKey: string }; reserve: { apiKey: string } }
}
// cloudStore(directory: string, codec: CredentialCodec) возвращает:
// read(): Promise<CloudCredentials | undefined>
// write(value: CloudCredentials): Promise<void>
// clear(): Promise<void>
// directory = <Host root>/connection, файл cloud.json вне generations.

// packages/loginom-host/src/cloud-auth.ts
export type CloudEndpoints = { site: string; primary: string; reserve: string }
export type CallBudget = { deadline: number; signal: AbortSignal }
export type CloudAuth = {
  status(): Loginom.CloudStatus
  credentials(): CloudCredentials | undefined
  revision(): number
  start(): Promise<void>
  cancel(): Promise<void>
  refresh(input: CallBudget): Promise<void>
  disconnect(): Promise<void>
  close(): Promise<void>
}
export type CloudAuthOptions = {
  store: ReturnType<typeof cloudStore>
  endpoints: CloudEndpoints
  changed(): void
  fetch?: (input: string, init: RequestInit) => Promise<Response>
  now?: () => number
  wait?: (ms: number, signal: AbortSignal) => Promise<void>
}
export declare function createCloudAuth(options: CloudAuthOptions): Promise<CloudAuth>
// start ждёт только device/code; status не делает HTTP; close не удаляет сохранённую запись.
// credentials/revision доступны только Host, никогда renderer/CLI/model.

```

`fetch/now/wait` — узкие внешние зависимости для HTTP/времени, не глобальные monkeypatches. В рабочих сборках default. У Host опциональный `cloudEndpoints` — программная инъекция unit fixture, не handshake/env renderer. Стейджинг приходит только из build tuple (задача13).

## Task 1: Managed browser работает без Dock

**Files:** Modify `packages/loginom-runtime/client/lib/bridge.mjs`, `packages/loginom-runtime/src/managed-entry.mjs`, `packages/loginom-host/src/host.ts`, `packages/loginom-host/src/supervisor.ts`. Test существующие `packages/loginom-runtime/client/test/bundled-catalog-bridge.test.mjs`, `packages/loginom-runtime/client/test/support/bundled-catalog-bridge.mjs`, `packages/loginom-host/test/prepare-startup.test.ts`.

**Interfaces:** Удалить endpoint/apiKey из payload **managed browser**, сохранить их в `superviseKnowledge`. `createBridge` распознаёт `config.mode === "executor-replay" && config.resultProfile === "user-v1" && config.bundledCatalog === true && managedBrowserTransport`; другие режимы используют прежний remote startup.

- [x] **1. RED:** В `support/bundled-catalog-bridge.mjs` существующий `ExternalClient` разрешает только browser client. Убрать endpoint/apiKey из его `config`; остальные bundled fixture и metadata assertions оставить:

```js
constructor(identity) {
  this.browser = identity.name === 'loginom-dock-browser';
  if (!this.browser) throw Error('Remote Dock must not start');
}
```

Это проверяет startup реального bridge, включая pin локального каталога и close. Существующий `reads` остаётся пустым.
- [x] **2. Запустить RED:** из `packages/loginom-runtime/client`: `node --test test/bundled-catalog-bridge.test.mjs`; ожидается `Remote Dock must not start`.
- [x] **3. GREEN:** Ограничить существующие connect/list ветки условием:

```js
const localOnly = config.mode === 'executor-replay'
  && config.resultProfile === 'user-v1'
  && config.bundledCatalog === true
  && !!managedBrowserTransport;
const connections = [browser.connect(browserTransport)];
if (!localOnly) connections.push(connectRemote(() => ({
  client: new Client({ name: 'loginom-dock', version: session.metadata.client }),
  transport: remoteTransport(),
}), { startup }).then(client => { remote = client; }));
```

Сохранить существующий Promise.allSettled и обработку неуспеха. `remoteTools` при localOnly — `[]`, `readCatalog(remote)` не вызывается; `createRecoveryContext` этому пути не нужен. `pinActionCatalog` использует существующие bundled releases. `closeClients` уже допускает отсутствующий remote. Host и supervisor явно выбирают browser поля без Dock key. Не переделывать classic bridge и не оставлять managed direct remote dispatch доступным через имя инструмента.
- [x] **4. Следующий RED→GREEN:** classic/non-bundled fixture по-прежнему выполняет remote handshake; managed prepare выполняет локальное browser действие, никакой Dock ключ не появился в его IPC/env/argv.
- [x] **5. Проверка/коммит:** runtime scoped tests и из `packages/loginom-host` `bun test test/prepare-startup.test.ts test/knowledge.test.ts`, `bun typecheck`; `git diff --check`; commit `refactor(loginom): start managed browser without Dock`.

## Task 2: Все Help-чтения ограничены официальной KB

**Files:** Create `packages/loginom-runtime/client/lib/knowledge-scope.mjs`, `packages/loginom-runtime/client/test/knowledge-scope.test.mjs`. Modify `packages/loginom-runtime/client/lib/knowledge-client.mjs`, `packages/loginom-runtime/client/test/knowledge-client.test.mjs`, `packages/loginom-runtime/client/test/support/knowledge-server.mjs`, `packages/loginom-runtime/src/knowledge-entry.mjs`, `packages/loginom-runtime/test/knowledge-entry.test.mjs`, `packages/loginom-host/test/knowledge.test.ts`.

**Interfaces:** `scopeKnowledgeArguments(name: string, args: Record<string, unknown>): Record<string, unknown>`; возвращает проверенные/defaulted args, иначе `Error("LOGINOM_KNOWLEDGE_SCOPE_DENIED")`. Вызывается непосредственно перед remote call. Tool schemas/описания ограничиваются **до combineCatalogs**, чтобы catalogSha256 соответствовал опубликованной схеме; неподдерживаемое имя отклоняется.

- [ ] **1. RED:** Создать тест первого нужного поведения:

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import { scopeKnowledgeArguments } from "../lib/knowledge-scope.mjs"

test("find defaults to the official knowledge base", () => {
  assert.deepEqual(scopeKnowledgeArguments("find", { query: "Join" }), {
    query: "Join", target_uri: "viking://resources/loginom-dock",
  })
})
```

- [ ] **2. Запустить:** из `packages/loginom-runtime/client` `node --test test/knowledge-scope.test.mjs`; RED — отсутствует функция/ожидаемое ограничение.
- [ ] **3. GREEN:** Нормализовать аргументы только этого поведения, сохранив query и остальные разрешённые параметры. Затем расширять по одному сценарию таблицы; после каждого запускать тот же тест.

| Следующий отдельный тест | Минимальное поведение |
| --- | --- |
| find/search без target_uri | root по умолчанию; search только list mode |
| search context | отклонить даже при валидном target_uri, поскольку серверный context может включить skills |
| read с uris: string или string[] | проверить строку или весь массив до первой отправки; пустые/чужие/смешанные URI отклонить |
| list/tree/grep/glob | uri внутри root; tree/glob без uri получают root |
| glob pattern | только относительный pattern без `..`, absolute URI, backslash/неоднозначного escape |
| `loginom-dock-evil`, `../`, `%2e`, `%2f`, `//`, `viking://agent` | отклонить; граница сегмента, не startsWith(root) |
| custom server | те же ограничения, нет arbitrary KB root |

Ключевая проверка canonical URI:

```js
const root = "viking://resources/loginom-dock"
const inside = value === root || value.startsWith(`${root}/`)
const ambiguous = /[%\\?#]/.test(value) || value.slice("viking://".length).includes("//")
const traversal = value.split("/").some(part => part === "." || part === "..")
if (!inside || ambiguous || traversal) throw Error("LOGINOM_KNOWLEDGE_SCOPE_DENIED")
```

Дополнить проверку string/empty и согласовать допустимый trailing slash с canonical root. Не применять decode/rewrite, который превращает запрещённый URI в разрешённый. Не сокращать неизвестный URI до root.
- [ ] **4. Интеграционный RED→GREEN:** Исправить `knowledgeServer` fixture: сейчас он неверно требует `uri` у всех инструментов. Схемы взять из `services/loginom-ai/openviking/server/mcp_endpoint.py`: `read.uris`, `find/search.target_uri`, остальные `uri`; старые test calls заменить с `uri:"Help/node.md"` на `uris:["viking://resources/loginom-dock/Help/node.md"]`. В `test/knowledge-entry.test.mjs` также заменить read calls и `gates.get(params.arguments.uri)` на ключ по проверенному `uris`, иначе entered.promise зависнет; assertions исходной remote schema заменить ограниченной схемой. В existing `knowledgeServer` fixture вызвать настоящий knowledge client с mixed read; collector remote вызовов остаётся пустым. Валидный find действительно получает root на сервере. Test schemas ограничивают опубликованные аргументы, а не заменяют runtime validation. Не фильтровать только результаты после отправки.
- [ ] **5. Проверка/коммит:** из runtime client `node --test test/knowledge-scope.test.mjs test/knowledge-client.test.mjs`; из Runtime `node --test test/knowledge-entry.test.mjs`; из Host `bun test test/knowledge.test.ts`; commit `fix(loginom): scope Help reads to official knowledge base`.

## Task 3: Custom-конфигурация и безопасное чтение старых настроек

**Files:** Modify `packages/schema/src/loginom.ts`, `packages/loginom-host/src/connection/{connection-store,connection-service}.ts`, `packages/loginom-host/src/{host,node-entry}.ts`, `packages/desktop/src/main/loginom/ipc.ts`, `packages/opencode/src/cli/loginom-management.ts`. Test/fixtures: `packages/schema/test/loginom.test.ts`, `packages/app/test-browser/settings-loginom.test.ts`, `packages/desktop/src/main/loginom/{connection-store,connection-service}.test.ts`, `packages/desktop/test/loginom/shutdown-validation.mjs`, `packages/loginom-host/test/{node-host,host,connection-validation,knowledge,prepare-startup}.test.ts`, `packages/opencode/test/fixture/standalone.ts`, `packages/opencode/test/cli/{loginom-management,standalone-status,standalone-preflight,standalone-startup}.test.ts`, `packages/opencode/test/cli/tui/standalone-pty.py`. Остальные stage/candidate fixtures, найденные поиском ниже, обновить здесь же. Runtime fallback удаляется здесь; упаковка файла ключа — в13.

**Interfaces:** `Candidate.mode?: "cloud"|"custom"`, `Candidate.endpoint?: string`; `ConnectionRecord` читает optional mode/endpoint, новые записи всегда пишут mode. `ActiveConnection` содержит mode и сохранённые custom endpoint/apiKey. `Check` расширяет Candidate полем `verifyBrowser?: boolean`, `API.check(Check)`; `Validation.help` отдельно от browser. `View` получает поля общей карты; `State` допускает connection-required. Cloud методы API вводятся вместе с Host composition в6; до него не объявлять неработающие методы.

`connection.check` в node-entry и `loginom-check` в Desktop декодируют новый `Loginom.Check` уже здесь. Все View/Validation fixtures, включая overrides в settings-loginom.test.ts, получают честные mode/server/help/cloud/hasApiKey; не делать обязательные поля optional ради старых тестов. CLI setupSchema/setupCandidate и interactiveSetup получают custom-поля здесь, поскольку существующие subprocess/PTY проверки используют настоящий setup. Облачные команды и обработка connection-required в CLI остаются11.

- [ ] **1. RED:** Добавить store тест миграции на реальном файле, используя существующий temp fixture и codec. Старый plaintext record сохраняется без нового поля:

```ts
await writeFile(join(directory, "connection.json"), JSON.stringify({
  generation: 1, revision: 1, url: "http://stand.test/app/", username: "user",
  secrets: { apiKey: "LEGACY-CANARY", password: "password-canary" },
}), { mode: 0o600 })
expect(await store.read()).toMatchObject({
  mode: "cloud", apiKey: "", password: "password-canary",
  url: "http://stand.test/app/", generation: 1,
})
```

- [ ] **2. Запустить RED:** из Desktop `bun test src/main/loginom/connection-store.test.ts`; ожидание mode/cloud и пустого legacy key пока не выполняется.
- [ ] **3. GREEN:** В decode на границе store сделать явное преобразование; исторический файл не перезаписывать:

```ts
const legacy = record.mode === undefined
return {
  generation: record.generation, revision: record.revision,
  url: record.url, urlSource: record.urlSource, username: record.username,
  endpoint: legacy ? undefined : record.endpoint,
  mode: record.mode ?? "cloud",
  apiKey: legacy ? "" : secrets.apiKey,
  password: secrets.password,
}
```

`secrets` получается существующим codec decode и проверкой schema, а не чтением необработанного JSON. При stage/save выбирать поля явно, включая mode/endpoint. Сохранить revision conflict, pending, generation immutability, urlSource и testable-normalization.
- [ ] **4. Следующие RED→GREEN:** cloud→custom с явно введёнными credentials вызывает локальный MCP fixture; custom→cloud→custom сохраняет custom key/endpoint. `new URL(endpoint)` принимает только http/https, без username/password; пустой endpoint/key в выбранном custom отклоняется. Host не применяет cloud fallback при ошибке custom. В тесте использовать `knowledgeServer` из Task2 и явный `mode:"custom"` в stage/candidate.
- [ ] **5. Следующий RED→GREEN:** `apiKey` без `mode` в входящем legacy candidate не превращает запись в custom. Для текущего custom кандидат с отсутствующим mode сохраняет режим и key; replacement key разрешён только при явном custom. Поле `endpoint` без custom не создаёт новую custom конфигурацию. `hasApiKey` true только когда сохранён непустой custom key.
- [ ] **6. RED→GREEN — минимальный CLI custom setup:** перенести сюда custom-часть CLI, иначе ранние fixture setup будут отклонять новые поля. Добавить в setupSchema mode/endpoint и проверить настоящий setupCandidate:

```ts
expect(setupCandidate(JSON.stringify({
  mode: "custom", endpoint: "https://stand.test/mcp", apiKey: "custom-canary",
}), current)).toMatchObject({
  mode: "custom", endpoint: "https://stand.test/mcp",
  apiKey: { operation: "replace", value: "custom-canary" },
})
expect(setupCandidate('{"apiKey":"legacy-canary"}', current)).not.toHaveProperty("apiKey")
```

Отсутствующий key сохраняет текущий custom key; пустой при явном custom становится empty и не проходит обязательную проверку. Interactive setup добавляет выбор cloud/custom, endpoint и hidden key prompt; отмена сохраняет существующий CLI_CANCELLED. PTY сценарий `--setup` выбирает custom и передаёт fixture key скрытым вводом; остальные setup JSON получают mode/endpoint/apiKey. Secret argv options не вводить.
- [ ] **7. Миграция fixtures и удаление runtime fallback:** `rg -n 'knowledge-key|knowledgeKey|endpoint:|store.stage|connection.check' packages/loginom-host/test packages/desktop/test/loginom packages/opencode/test/cli packages/opencode/test/fixture` — все fixtures, ожидающие работающий Help, используют явные custom credentials. Пример записи:

```ts
await store.stage({
  generation: 1, revision: 1, mode: "custom", endpoint: help.endpoint,
  url: "http://stand.test/app/", username: "user", apiKey: "UNIT-NONSECRET", password: "",
})
await store.activate(1)
```

Удалить `withKnowledgeKey` и выбор `environment.LOGINOM_AI_AGENT_KNOWLEDGE_ENDPOINT ?? manifest.endpoint` из Host. Endpoint/key берутся только из выбранной конфигурации; до cloud controller отсутствие cloud credentials даёт явную ошибку подключения без запуска Help, исключение save-before-login добавляет6. Не использовать наличие knowledge-key или отсутствие cloud.json как разрешение на legacy fallback. Старые записи без mode оставить только в migration tests с ожидаемым cloud без ключа. В startup tests сохранить проверки cleanup/guard, а не заменить их быстрым отсутствием credentials. Shutdown-validation передаёт custom endpoint/key в check; файл embedded key и manifest.endpoint не направляют Host. Stage-resources тест пока проверяет прежнюю упаковку, её удаляет13; остальные fixture key files удалить здесь.
- [ ] **8. Проверка/коммит:** Host `bun test test/connection-validation.test.ts test/knowledge.test.ts test/node-host.test.ts test/host.test.ts test/prepare-startup.test.ts`; Desktop `bun test src/main/loginom/connection-store.test.ts src/main/loginom/connection-service.test.ts`; Schema `bun test test/loginom.test.ts`; App `bun test --conditions=browser --preload ../ui/test/solid-jsx.ts --preload ./happydom.ts ./test-browser/settings-loginom.test.ts`; Opencode `bun test test/cli/loginom-management.test.ts test/cli/standalone-status.test.ts test/cli/standalone-preflight.test.ts test/cli/standalone-startup.test.ts`. Из каждого schema/loginom-host/app/desktop/opencode выполнить `bun typecheck`. Обновлённые native shutdown/PTY сценарии выполнить штатными командами при наличии inputs, иначе явно записать ограничение. Commit `feat(loginom): add explicit custom Dock configuration`.

## Task 4: Отдельное хранение облачных credentials

**Files:** Create `packages/loginom-host/src/connection/cloud-store.ts`, `packages/loginom-host/test/cloud-store.test.ts`. Modify `packages/loginom-host/src/connection/{credentials,cli-credentials,keychain-envelope,connection-store}.ts`; Test `packages/desktop/src/main/loginom/credentials.test.ts`, `packages/loginom-host/test/cli-credentials.test.ts`, `packages/loginom-host/test/keychain-envelope.test.ts`.

**Interfaces:** `cloudStore` и `CloudCredentials` — общая карта. `CredentialCodec.encode(value: Record<string, unknown>): unknown | Promise<unknown>`; `decode(value: unknown): unknown | Promise<unknown>`. Платформенный codec защищает JSON object, соответствующий store проверяет собственную schema. Формат envelope и Keychain AAD остаются v1; не менять алгоритм/identity/ограничения payload.

- [ ] **1. RED:** Сначала roundtrip cloud record через Linux codec и существующий store-подобный API:

```ts
import { expect, test } from "bun:test"
import { mkdtemp, rm, readdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { cloudStore } from "../src/connection/cloud-store"
import { credentials } from "../src/connection/credentials"

test("cloud credentials survive reopening and are removed by logout", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloud-store-"))
  const value = {
    kind: "loginom-cloud-v1" as const, installationKey: "site-canary", email: "user@example.test",
    dock: { primary: { apiKey: "primary-canary" }, reserve: { apiKey: "reserve-canary" } },
  }
  try {
    const store = cloudStore(root, credentials("linux"))
    await store.write(value)
    expect(await cloudStore(root, credentials("linux")).read()).toEqual(value)
    expect(await readdir(root)).not.toContain("generations")
    await store.clear()
    expect(await cloudStore(root, credentials("linux")).read()).toBeUndefined()
  } finally { await rm(root, { recursive: true, force: true }) }
})
```

- [ ] **2. Запустить RED:** из Host `bun test test/cloud-store.test.ts`; отсутствует новый store.
- [ ] **3. GREEN:** `cloud.json` с явным kind/schema; методы read/write/clear повторяют необходимые гарантии connection-store: проверка владельца/прав/NOFOLLOW, temp0600, fsync, atomic rename и fsync каталога, unlink+fsync при clear. Не заводить журнал поколений для cloud. Общую файловую утилиту выделять только если она действительно убирает одинаковый уже написанный код двух store.

При обобщении codec исправить обе записи connection-store, где сейчас передаётся весь ActiveConnection:

```ts
const protectedValue = await codec.encode({ apiKey: value.apiKey, password: value.password })
```

Linux и CLI codecs сейчас выбирают только пару секретов; Desktop safeStorage уже шифрует весь переданный ActiveConnection. Явный payload делает новое поведение одинаковым и не записывает metadata в secrets. Старые envelopes с metadata продолжают читаться: после decode connection-store проверяет свою пару; cloud-store — CloudCredentials, включая непустые строки полной пары. В тестах использовать tmpdir(); локально он направлен через TMPDIR в разрешённую временную папку, CI задаёт свой каталог.
- [ ] **4. Следующие RED→GREEN:** неправильный kind, неполная пара и повреждённый payload не заменяют старую запись; Ошибка до rename оставляет прежний файл; ошибка directory fsync после rename не обещает rollback: сообщить ошибку и перечитать фактическую запись, согласовав память с диском. Повреждённое read-back не делает новую пару действующей. Тест read-back не раскрывает ключи через status. Legacy connection records читаются прежними Linux/safeStorage/CLI envelopes. Existing Keychain tests проверяют неверный profile/AAD и tamper после переноса JSON-validation из envelope в store.
- [ ] **5. Проверка/коммит:** Host `bun test test/cloud-store.test.ts test/cli-credentials.test.ts test/keychain-envelope.test.ts`, `bun typecheck`; Desktop `bun test src/main/loginom/credentials.test.ts src/main/loginom/connection-store.test.ts`, `bun typecheck`. На Linux эти тесты не доказывают native safeStorage/DPAPI/Keychain; native gate в15. Commit `feat(loginom): persist cloud credentials outside generations`.

## Task 5: Device Authorization и HTTP-контракт сайта

**Files:** Create `packages/loginom-host/src/cloud-auth.ts`, `packages/loginom-host/test/cloud-auth.test.ts`. Modify `packages/product/src/index.ts`, `packages/loginom-host/src/errors.ts`; Test `packages/product/test/identity.test.ts`. Site backend не создавать.

**Interfaces:** `createCloudAuth`, CloudAuth/CloudEndpoints/CallBudget из общей карты. `Product.cloud` — fixed tuple. В production default native fetch; explicit dependency для теста. Host интеграция —6/8. Controller хранит polling task, AbortController, attempt epoch и write sequence; это внутренние поля одной функции, не общий scheduler.

- [ ] **1. RED:** В `cloud-auth.test.ts` использовать `Bun.serve({hostname:"127.0.0.1",port:0,fetch})` с ровно тремя ответами. Следующий код — тело route fixture, не реализация Better Auth:

```ts
const path = new URL(request.url).pathname
if (path === "/api/auth/device/code") return Response.json({
  device_code: "device-secret", user_code: "ABCD-EFGH",
  verification_uri: `${origin}/device`,
  verification_uri_complete: `${origin}/device?user_code=ABCD-EFGH`,
  expires_in: 600, interval: 1,
})
if (path === "/api/auth/device/token") return Response.json({
  access_token: "bootstrap-secret", token_type: "Bearer", expires_in: 600,
})
if (path === "/api/agent/connections") return Response.json({
  installationKey: "site-secret", user: { email: "a@example.test" },
  dock: { primary: { apiKey: "p-secret" }, reserve: { apiKey: "r-secret" } },
})
return new Response(null, { status: 404 })
```

`origin` устанавливается из `server.url.origin` до `auth.start()`. Для wait передать управляемый Promise gate; `changed` разрешает Promise, когда `store.read()` уже содержит запись. Assertions: start возвращается с pending; после одного разрешения wait credentials persisted, pending исчез, email виден, device/bootstrap отсутствуют в status и файле. Все servers закрывать в finally, store root под разрешённым TMPDIR.
- [ ] **2. Запустить RED:** Host `bun test test/cloud-auth.test.ts -t 'device'`; новая функция отсутствует.
- [ ] **3. GREEN:** Создать controller и разбирать ответы schema, не приводить `response.json()` к trusted type. HTTP body первого запроса `{client_id:"loginom-ai-agent"}`, token запроса:

```ts
{
  grant_type: "urn:ietf:params:oauth:grant-type:device_code",
  device_code: pending.deviceCode,
  client_id: "loginom-ai-agent",
}
```

Device/code ограничен15с собственным AbortSignal; каждый token/exchange fetch ограничен min(15с, оставшийся device expiry), отмена обрывает зависший fetch. Отдельный тест: listener принял запрос и не отвечает — start/poll завершаются ограниченно. Bootstrap cleanup и remote logout ограничены5с каждый и общим остатком Host shutdown, без продления родительского deadline.

Ссылка только HTTP(S) fixture / HTTPS release того же site origin, без credentials; брать полную verification_uri_complete. Polling interval в секундах преобразовать в ms один раз; expiry — абсолютный timestamp. Device success — `access_token`, не выдуманный `{session,user}`. Эти wire поля сверены по [Better Auth v1.7.17 routes](https://github.com/better-auth/better-auth/blob/v1.7.17/packages/better-auth/src/plugins/device-authorization/routes.ts); финальная версия сайта требует повторной интеграционной сверки.

`POST /api/agent/connections` получает Bearer bootstrap, GET pair/DELETE current — только `X-API-Key` установки. Никаких Dock ключей в site headers. Все fetch с `redirect:"error"`; ошибки наружу — безопасные коды `LOGINOM_CLOUD_CONNECTION_REQUIRED`, `LOGINOM_CLOUD_ALREADY_CONNECTED`, `LOGINOM_CLOUD_UNAVAILABLE`, `LOGINOM_CLOUD_PROTOCOL_INVALID`, `LOGINOM_CLOUD_ACCESS_DENIED`, `LOGINOM_CLOUD_EXPIRED`, `LOGINOM_CLOUD_REVOKE_UNCONFIRMED` в `errors.ts`, без тела сервера. `LOGINOM_KNOWLEDGE_SCOPE_DENIED` из2 и `LOGINOM_PROXY_UNAVAILABLE` из9 также включить в private allowlist, если пересекают IPC. Полная пара валидируется до записи. После durable write и проверки актуальности попытки вызвать changed. Повтор start отменяет прежнюю незавершённую попытку только при отсутствии подключения. При сохранённых cloud credentials start отклоняется с `LOGINOM_CLOUD_ALREADY_CONNECTED` до HTTP, также в custom режиме: сначала обычный disconnect, затем новый вход. Нового ключа установки поверх действующего не выдаётся.
- [ ] **4. По одному RED→GREEN для polling:** authorization_pending соблюдает interval; slow_down увеличивает интервал на5с; access_denied/expired_token завершает попытку; HTTP429 ждёт max(interval, Retry-After); временная ошибка не крутит busy-loop и не продлевает device expiry. Неуспех первичного exchange завершает попытку, без бесконечного повторного создания установки.
- [ ] **5. По одному RED→GREEN для отмены:** cancel/close прекращают polling; ответ старой попытки после cancel/start не пишет файл. Если bootstrap уже получен, bounded запрос `POST /api/auth/revoke-session` с `{token: rawBootstrap}` и `Authorization: Bearer rawBootstrap`; status:true признаётся только с этой привязкой. После успешного/терминального exchange сайт обязан погасить сессию; при неясном результате клиент также делает best-effort revoke. Сессия никогда не хранится на диске. В finally client прекращает ожидание в пределах cleanup budget, недоступность сайта не блокирует shutdown навсегда.
- [ ] **6. По одному RED→GREEN для доверия:** 302 не достигает второго listener; неполная пара/HTML/невалидный JSON при первичном exchange не создают подключение; verification URL чужого origin не открывается. Generic 401/403/429/5xx не удаляют credentials; подтверждённый access_revoked удаляет текущую запись только если запрос был аутентифицирован её installationKey и его epoch/identity ещё актуальны. POST connections с bootstrap и OAuth device access_denied завершают только текущую попытку. Regression: после успешного входа повторный start отвергается, счётчики device/code и connections не растут, cloud.json/Help остаются прежними; после disconnect новый start допустим. Защиту от запоздалых ответов отменённой попытки сохранить.
- [ ] **7. Проверка/коммит:** Host `bun test test/cloud-auth.test.ts test/cloud-store.test.ts`, `bun typecheck`; Product `bun test`, `bun typecheck`. Commit `feat(loginom): implement cloud device authorization client`.

## Task 6: Сохранение до входа и изменяемая готовность прежнего поколения

**Files:** Create `packages/loginom-host/src/knowledge-session.ts`, `packages/loginom-host/test/cloud-readiness.test.ts`. Modify `packages/schema/src/loginom.ts`, `packages/loginom-host/src/{host,host-port}.ts`, `packages/loginom-host/src/connection/connection-service.ts`, `packages/desktop/src/main/loginom/ipc.ts`, `packages/desktop/src/preload/index.ts`; Test `packages/loginom-host/test/{connection-readiness,connection-validation,knowledge,host,host-port}.test.ts`, `packages/schema/test/loginom.test.ts`, `packages/app/test-browser/settings-loginom.test.ts`, `packages/desktop/src/main/loginom/connection-service.test.ts`; обновить остальные typed API/View/Validation stubs потребителей в этой же задаче.

**Interfaces:**

```ts
// ConnectionRuntime.check теперь возвращает предметный результат:
// check(candidate: ActiveConnection, signal?: AbortSignal, verifyBrowser?: boolean):
//   Promise<{help: {state: HelpState}; browser: Loginom.BrowserStatus}>
// RuntimeHandle вместо одноразового ready получает:
// observeHelp(listener: (status: {state: HelpState; failure?: string}) => void): void
// Один текущий снимок + один callback; при подписке сразу выдать снимок.

// knowledge-session.ts импортирует ActiveConnection, CloudAuth, CloudEndpoints, CallBudget.
export type KnowledgeSession = {
  ensure(input: CallBudget): Promise<void>
  catalog(input: CallBudget): Promise<unknown>
  call(input: {run:string; id:string; name:string; arguments?:unknown}, budget: CallBudget): Promise<unknown>
  interrupt(input: {run:string; id?:string}): Promise<void>
  invalidate(): Promise<void>
  close(): Promise<void>
}
export type KnowledgeSessionOptions = {
  generation: number
  connection: ActiveConnection
  cloud: CloudAuth
  endpoints: CloudEndpoints
  resources: string
  environment: NodeJS.ProcessEnv
  signal: AbortSignal
  changed(status: {state: Loginom.HelpState; failure?:string}): void
  selected(): "primary" | "reserve"
  selectReserve(): void
}
export declare function createKnowledgeSession(options: KnowledgeSessionOptions): KnowledgeSession
// Host:
// catalog(generation: number, budget?: CallBudget): Promise<unknown>
// callKnowledge(generation: number, input: Parameters<KnowledgeSession["call"]>[0], budget: CallBudget): Promise<unknown>
// interruptKnowledge(generation: number, input: {run:string; id?:string}): Promise<void>
// Callers больше не получают raw Help child.

```

При опущенном budget в локальном startup/старых test helpers Host создаёт один120с budget; вызовы из HostPort всегда передают исходный. Выбранный server хранится **один раз в createLoginomHost**, не в generation: session получает `selected(): "primary"|"reserve"` и `selectReserve(): void`. На этом этапе selection всегда primary; failover добавляется7.

- [ ] **1. RED:** В новом cloud-readiness тесте создать настоящий Host, отдельный root, `connectionStore`, symlink pinned Node и resource manifest по образцу `knowledge.test.ts`. Для первого теста knowledge-entry fixture только пишет forbiddenHelpMarker при запуске и завершается с ошибкой; отсутствие marker доказывает, что пустой cloud Help не запускался. directory layout не является критерием поведения. Сохранить до входа:

```ts
const checked = await host.api.check({
  revision: 0, mode: "cloud", url: "http://stand.test/app/", username: "user",
  password: { operation: "empty" }, verifyBrowser: false,
})
expect(checked.help).toEqual({ state: "connection-required" })
expect(checked.browser).toEqual({ state: "unknown" })
await host.api.save({ revision: 0, validationId: checked.validationId })
await host.settled()
const saved = await host.api.status()
expect(saved).toMatchObject({ state: "connection-required", generation: 1 })
await expect(access(forbiddenHelpMarker)).rejects.toMatchObject({ code: "ENOENT" })
```

- [ ] **2. Запустить RED:** Host `bun test test/cloud-readiness.test.ts`; сейчас Help стартует без ключа и check/save не проходит.
- [ ] **3. GREEN:** Host определяет отсутствие cloud credentials; check проверяет Loginom поля и выдаёт обычный validation token без Help. `verifyBrowser:false` пропускает только браузер; при явном check с default true browser проверяется через Task1, без Dock. Для custom/connected cloud Help обязателен независимо от флага. Не убирать validationId/revision/expiry, cleanup guard и безопасное применение pending.

Обновить `ConnectionRuntime.check`, `validations` и `Validation` вместе. Runtime prepare создаёт локальную generation с KnowledgeSession, но при отсутствующих credentials не запускает Help. Начальный RuntimeHandle больше не имеет независимого rejected promise, навсегда определяющего phase. Host/session сохраняет текущий HelpStatus. После установки state.active/state.handle service вызывает handle.observeHelp(callback), который синхронно выдаёт последний снимок и далее сообщает изменения. Callback проверяет state.handle === handle и closing. Так публикация до завершения prepare не теряется, а старый handle игнорируется; отдельный service.helpStatus не вводить.
- [ ] **4. Следующий RED→GREEN:** Скопировать существующую реалистичную network fixture из `knowledge.test.ts` в новый тест; site responses Task5 и один `knowledgeServer` с `apiKey:"p-secret"`. На этом шаге атомарно добавить три cloud метода в schema API, Host composition, Desktop preload/IPC и typed API stubs App. Generation service владеет только прежними методами: его тип сузить до `Pick<Loginom.API, "read" | "status" | "check" | "save" | "cancelPending" | "acknowledgeRecovery">`; cloud методы добавляет Host, а не service-заглушки. Desktop уже использует Host напрямую, поэтому три канала должны работать в этой же задаче; откладывать их до8 или10 нельзя. Task8 добавляет Node router. Assert через `host.api.cloudStart()`:

```ts
const before = await host.api.status()
await host.api.cloudStart()
// Освободить token-response gate локального HTTP fixture; дождаться его exchange/write.
await host.catalog(before.generation)
expect(await host.api.status()).toMatchObject({
  generation: before.generation, revision: before.revision, state: "ready",
  help: { state: "ready" },
})
expect(await store.read()).toEqual(savedRecord)
```

Не добавлять IPC «записать credentials». Полную management transport проверку выполнить в8/13. Saved legacy record без mode должен дать тот же переход без пересохранения.

В preload добавить `cloudStart: () => ipcRenderer.invoke("loginom-cloud-start")`, `cloudCancel`/`cloudDisconnect` с одноимёнными kebab-case каналами. Каждый main handler сначала вызывает существующий `sender(event)`, затем соответствующий `api.cloudStart/cloudCancel/cloudDisconnect()`. Не добавлять optional API methods/throwing stubs ради компиляции. App test API stub возвращает полную View; schema/consumer fixtures включают help во всех Validation overrides. UI кнопки добавляет10. Полный Desktop dispatch проверяет settings-live в13; здесь Host behavioral tests и обязательные typechecks потребителей.
- [ ] **5. Следующие RED→GREEN:** initial каталог недоступен → HTTP fixture становится доступным → новый tools/call/connection.ready восстанавливает то же поколение. Запускать retry **до** ready gate в connectionLease и tools; для первичного локального acquire/diagnostics не требовать сети. `tools` без creds возвращает разрешённые local descriptors/diagnostics, не выдуманный Help catalog. Если temporary startup failed, tools инициирует одну bounded загрузку; подтверждённая ошибка не скрывается как успешный полный каталог.
- [ ] **6. Следующие RED→GREEN:** два одновременных retry ждут один child/catalog; поздний ответ первой попытки не меняет новую readiness; отмена/close не начинает новую. Очистка Help failure не стирает store/cleanup failure или browser warning. Pending остаётся pending, а его Help readiness отдельно. Existing run leases и browser PID не меняются при invalidate Help.
- [ ] **7. GREEN-схема состояния:** Каждая новая Help попытка получает локальный порядковый номер. В finally очищать текущий promise только если он всё ещё тот же. Публикация результата проверяет generation/attempt/credentials revision. Ошибку Help хранить отдельно от fatal store/cleanup error; callback observeHelp не присваивает общий failure=undefined без проверки владельца ошибки.

```ts
const attempt = ++state.attempt
const revision = cloud.revision()
const current = () => !state.closed && attempt === state.attempt && revision === cloud.revision()
// После каждого await результат меняет current/catalog/readiness только при current().
```

- [ ] **8. Проверка/коммит:** Host `bun test test/cloud-readiness.test.ts test/connection-readiness.test.ts test/connection-validation.test.ts test/knowledge.test.ts test/host.test.ts test/host-port.test.ts`; Desktop `bun test src/main/loginom/connection-service.test.ts`; Schema `bun test test/loginom.test.ts`; App browser settings test командой Task3; Opencode `bun test test/cli/loginom-management.test.ts test/cli/standalone-status.test.ts`. Из schema/loginom-host/app/desktop/opencode выполнить `bun typecheck`. Commit `feat(loginom): recover Help readiness within a generation`.

## Task 7: Общий deadline, failover, refresh и выход

**Files:** Modify `packages/loginom-host/src/{cloud-auth,knowledge-session,host,host-port,supervisor,errors}.ts`, `packages/loginom-runtime/src/knowledge-entry.mjs`, `packages/loginom-runtime/client/lib/{knowledge-client,catalog}.mjs`. Create `packages/loginom-host/test/cloud-recovery.test.ts`; extend `test/cloud-auth.test.ts`, `test/knowledge.test.ts`, runtime `test/knowledge-entry.test.mjs` и client tests.

**Interfaces:** Private error reply дополнить `knowledgeFailure?: {kind:"unauthorized"|"unavailable"|"forbidden"|"rate-limited"|"other"; retryAfterMs?:number}`. Supervisor проверяет exact enum/nonnegative finite number и сохраняет безопасную метку на Error; raw headers/body/stack не пересылаются. `start`/`call` Help payload получает `deadline:number`; это private IPC, не model argument. Runtime request timeout — оставшееся время. Host имеет один controller budget на call ещё до lease.

- [ ] **1. RED:** Два настоящих `knowledgeServer` с разными ключами. Primary request hook отвечает503 на initialize, reserve работает. В существующей setup сети установить cloud fixture tuple программно. Assertions после `host.catalog(1)`:

```ts
expect(await host.api.status()).toMatchObject({ server: "reserve", help: { state: "ready" } })
expect(primary.requests.every(item => item.authorization === "Bearer p-secret")).toBe(true)
expect(reserve.requests.every(item => item.authorization === "Bearer r-secret")).toBe(true)
```

Затем новое поколение custom→cloud использует reserve; новый Host с тем же cloud.json начинает с primary. Сначала реализовать только первый503 сценарий, следующие добавлять отдельно.
- [ ] **2. Запустить RED:** Host `bun test test/cloud-recovery.test.ts -t 'reserve'`; сейчас fallback отсутствует.
- [ ] **3. GREEN:** В KnowledgeSession recovery обрабатывать только Help reads. primary network/timeout/502503504 разрешает один reserve try; commit выбора только после успешного каталога/запроса reserve. Неуспех обоих оставляет primary; уже успешно выбранный reserve не возвращается на primary. TLS trust failure — безопасная ошибка без отключения проверки сертификата. 401 идёт в refresh,403/429/tool error не идут в reserve. Custom не вызывает cloud controller ни при одном отказе.
- [ ] **4. Следующий RED→GREEN — классификация:** по одному сценарию для initialize/tools-list/tools-call: HTTP401/403 с настоящим Dock JSON-RPC body `code:-32001`, HTTP429/503, HTTP200 с корректным JSON-RPC error `code:-32001`, MCP `isError:true`, локальное истечение deadline и parent abort. Dock использует `-32001` и для auth, а SDK — для RequestTimeout/отмены: число само по себе не доказывает timeout. Pinned SDK сохраняет non-2xx как transport HTTP status; совпадение чисел не доказывает уже существующую ошибку обработки401.

Сначала проверять родительскую отмену, затем HTTP status из подтверждённой transport/fetch-причины (пройти cause до HTTP, не остановиться на внешнем числовом RPC code). Только при отсутствии HTTP причины классифицировать сетевой отказ/локальный timeout. HTTP401 → unauthorized/refresh без failover;403 → forbidden; серверный JSON-RPC `-32001` или `-32603` сам по себе → other; локальный timeout → unavailable; parent abort → отмена без recovery. Не извлекать HTTP status из message/JSON-RPC body, не хранить общий mutable lastStatus для конкурентных запросов. Передавать безопасную классификацию через knowledge-entry/supervisor. `catalog.mjs` внутренний transient retry отключить только для managed Help, иначе он умножит Host попытки; classic bridge оставляет прежний retry.
- [ ] **5. Следующий RED→GREEN — бюджет:** через короткий **реальный** CallBudget (например600мс) и управляемые HTTP gates проверить startup/refresh/retry в исходном сроке и abort дочернего запроса. Не переводить только now CloudAuth: у Node child/supervisor другие реальные часы. Отдельная проверка вычисления min(60_000,remaining) подтверждает cap60с; native acceptance подтверждает полный worst-case120с. Сначала определить бюджет в HostPort до connectionLease:

```ts
const budget = { deadline: Date.now() + 120_000, signal: controller.signal }
const remaining = Math.max(0, budget.deadline - Date.now())
if (!remaining) throw Error("LOGINOM_RUNTIME_TIMEOUT")
// supervisor.request(operation, payloadWithDeadline, remaining)
// child MCP call timeout: Math.min(60_000, deadline - Date.now())
```

Initial primary connect ≤15с; reserve/start/list/refresh получают остаток. Не начинать retry, если остаток исчерпан. Timeout должен послать interrupt/abort, а не лишь удалить запись ожидающего ответа. Не сериализовать AbortSignal по IPC. Хранить controller по run/request до lease; `interrupt` должен находить и этот этап.
- [ ] **6. Следующий RED→GREEN — refresh:** primary401, site GET возвращает новую пару, повтор на primary успешен. Два конкурентных401 создают один GET; на один исходный вызов не больше одного refresh и одного failover. Использовать существующий real HTTP fixture с счётчиком GET, не global fetch mock. Сохранить пару до changed()/retry.
- [ ] **7. Следующие RED→GREEN — cooldown:** site вернул ту же пару/неполную/429/недоступен → credentials остаются; до30с следующего GET нет, после30с новый пользовательский вызов может восстановиться. Новый отличный key снимает cooldown. Retry-After продлевает паузу; нет фонового таймера. Отмена одного waiter не отменяет полезный shared refresh для остальных; каждому waiter ограничить ожидание своим budget. Общая операция не продлевается бесконечно новыми waiters: собственный deadline зафиксирован первым запуском; logout/Host close отменяет её для всех.
- [ ] **8. Следующий RED→GREEN — offline logout:** `cloud.disconnect()` сначала инвалидирует попытки и удаляет cloud.json, затем bounded DELETE по ещё имеющейся локальной копии installationKey. Вызов завершается даже при отключённом site, `cloud.failure="LOGINOM_CLOUD_REVOKE_UNCONFIRMED"`; никакой очереди секретов. Host закрывает только cloud Help. Custom mode продолжает работать; браузер/leases не перезапускаются.

```ts
const epoch = ++state.epoch
state.login?.abort()
state.refresh?.abort()
// Очередь durable writes выполняется последовательно; clear стоит после старых write.
await enqueueWrite(() => store.clear())
// Старые callbacks проверяют epoch и не могут запланировать новый write.
// Память/публичный статус переключаются сразу, ошибка удаления диска не скрывается.
```

Внутренний enqueueWrite(operation: () => Promise<void>): Promise<void> — одна promise chain в cloud-auth: операция проверяет epoch перед очередью и повторно перед записью; tail перехватывает отказ для продолжения очереди, caller получает исходный rejection. Проверить отдельно refresh response после logout и **уже начатый** write перед logout: clear выполняется после него и файл исчезает. Late DELETE result обновляет status только если epoch не сменился новым входом.

Если запись удалить не удалось, нельзя заявить durable logout: состояние не разрешает новые cloud calls, возвращается безопасная ошибка хранения. Close отменяет операции, но **не** вызывает disconnect и сохраняет credentials для следующего запуска.
- [ ] **9. Следующий RED→GREEN — revoke:** GET возвращает корректный access_revoked → credentials исчезают также после нового Host. HTML401/прокси403 не делают logout. Поздний refresh после logout не возвращает файл. Ротацию обоих Dock и блокировку аккаунта делает будущий сайт; здесь только проверенный ответ и потребление новой пары.
- [ ] **10. Проверка/коммит:** Host `bun test test/cloud-recovery.test.ts test/cloud-auth.test.ts test/cloud-readiness.test.ts test/knowledge.test.ts test/host-port.test.ts`, `bun typecheck`; Runtime `node --test test/knowledge-entry.test.mjs client/test/knowledge-client.test.mjs client/test/catalog.test.mjs`. Commit `feat(loginom): recover cloud Help with bounded failover`.

## Task 8: Private management API и безопасная диагностика

**Files:** Modify `packages/schema/src/loginom.ts`, `packages/loginom-host/src/{node-entry,host-port,host,errors}.ts`. Test `packages/schema/test/loginom.test.ts`, `packages/loginom-host/test/{node-host,host-port}.test.ts`.

**Interfaces:** Уже реализованные в6 `Loginom.API.cloudStart/cloudCancel/cloudDisconnect(): Promise<View>` провести через Node router. Node entry принимает exact `connection.cloud-start`, `connection.cloud-cancel`, `connection.cloud-disconnect` с пустым input; `connection.status` — всё ещё короткий read. `connection.check` уже декодирует `Loginom.Check` с3. Никаких cloud management tools для модели.

- [ ] **1. RED:** В существующем node-host fixture вызвать `connection.cloud-cancel` и `connection.cloud-disconnect` на неподключённом профиле; они возвращают redacted View без обращения к site. Для cloud-start здесь проверить router/decoder через Host композицию Task6 и его программную injection. Полный сетевой device flow через launchNodeHost выполнить в13 **только** с собранным dev Node Host с baked tuple: startup handshake не получает endpoint overrides. Assertions start/status/cancel: status.pending имеет userCode/verificationUrl/expiresAt, whole replies не содержат device/session/installation/Dock canaries; локальный тест не обращается к loginom.ai.
- [ ] **2. Запустить:** Host `bun test test/node-host.test.ts test/host-port.test.ts`; новая management operation пока неизвестна.
- [ ] **3. GREEN:** Добавить три router ветки к существующему node-entry management switch; каждая вызывает общий Host API. Start ждёт только device/code, не пользователя; поллинг остаётся Host-owned до отмены/expiry/close. Host.beginClose отменяет auth/refresh до drain. Decoder поля verifyBrowser остаётся private management.
- [ ] **4. RED→GREEN — model projection:** В тесте host-port с pending login сохранить прежние assertions generation/url/username/browser/recoveries, дополнить:

```ts
const status = result.structuredContent
expect(status).toMatchObject({ generation: 1, mode: "cloud", server: "primary" })
expect(status).not.toHaveProperty("cloud")
expect(JSON.stringify(result)).not.toContain("ABCD-EFGH")
expect(JSON.stringify(result)).not.toContain("a@example.test")
expect(JSON.parse(result.content[0].text)).toEqual(status)
```

Проекцию собрать явно в host-port: `revision,generation,url,username,folder,hasPassword,state,browser,failure,recoveries,mode,server,help`. Одно значение использовать для content и structuredContent. Не распространять весь View и затем удалять несколько секретных полей.
- [ ] **5. Проверка/коммит:** Schema `bun test test/loginom.test.ts`; Host `bun test test/node-host.test.ts test/host-port.test.ts test/transport.test.ts`; из schema/loginom-host/app/desktop/opencode `bun typecheck`. Если правка потребовала нового общего поля, все его fixtures и поведенческие проверки обновить здесь, не ждать10–11. Commit `feat(loginom): expose cloud management through private Host API`.

## Task 9: Site и Help используют явный proxy и системные CA

**Files:** Modify `packages/loginom-host/src/node-entry.ts`, `packages/loginom-runtime/src/knowledge-entry.mjs`, `packages/desktop/src/main/index.ts`; при необходимости точечно `packages/desktop/src/main/loginom/desktop-service.ts`. Extend `packages/desktop/test/loginom/environment-proxy.ts`, `packages/loginom-host/test/environment.test.ts`; Create `packages/loginom-host/test/cloud-proxy.test.ts`.

**Interfaces:** Используется существующая native Node `http.setGlobalProxyFromEnv()` в pinned runtime, без OS/PAC resolver. System CA CLI Host/Help уже передаются через `--use-system-ca`; Desktop main имеет `setDefaultCACertificates`. Запросы cloud-auth и MCP идут через native fetch; тесты должны подтвердить именно оба реальных клиента.

- [ ] **1. RED:** Расширить существующий loopback HTTP/CONNECT fixture `environment-proxy.ts` до запуска настоящего Help. Site/cloud-auth отдельно проверить в тестовом Node caller с программной зависимостью endpoints; **полный** device/code через bundled Node Host выполняется в13 после появления dev tuple, вместе с отложенным тестом8. Не вводить endpoint поля в product handshake ради этого теста. Один HTTP listener — proxy, второй — target; все target requests считаются. Выполнить device/code и MCP initialize/list через proxy env. Assertions:

```ts
expect(proxyRequests).toContain("/api/auth/device/code")
expect(proxyRequests).toContain("/mcp")
expect(directTargetRequests).toBe(0)
```

Для CONNECT считать host/path на соответствующей стороне туннеля; имена counters создать локально возле listeners. Не считать передачу `HTTP_PROXY` доказательством применения. Каждый из двух потоков проверять последовательно и отдельно.
- [ ] **2. Запустить RED:** Host `bun test test/cloud-proxy.test.ts` с pinned Node; Desktop `bun test/loginom/environment-proxy.ts`. Сначала подтвердить фактический пробел; если существующая инициализация уже даёт нужное поведение, production участок не менять.
- [ ] **3. GREEN:** До первого site/MCP request инициализировать native explicit-env proxy в Node entrypoints:

```ts
import http from "node:http"
const native = http as typeof http & { setGlobalProxyFromEnv(): void }
native.setGlobalProxyFromEnv()
```

Для runtime `.mjs` type assertion не нужен. Это существующий подход Desktop, а не новый HTTP wrapper. Передать только существующий фильтр explicit proxy/NO_PROXY, сохранить uppercase/lowercase Windows правила. Не брать proxyResult системного resolver и не добавлять его в shared options.environment. Если инициализация для явно указанного proxy не удалась, запросы cloud/Help должны завершаться безопасной ошибкой, без прямого fallback; не менять модельный sidecar контракт.

Desktop повторно вызывает существующий `useEnvProxy()` **сразу после** `const shellEnv = preferAppEnv(app.getPath("userData"))`, до `desktopLoginom()` и первого запроса Host. Нынешний ранний вызов не видит proxy из login-shell, а вызов при загрузке sidecar происходит уже после Host. Regression запускает main с proxy только из fixture login-shell: самый первый site request и Help проходят через него, direct target count0; эту часть с собранным Desktop выполнить в13. Не подмешивать OS/PAC результат и не откладывать настройку до sidecar.
- [ ] **4. По одному RED→GREEN:** `NO_PROXY` разрешает прямой loopback; недоступный explicit proxy → target count0 и временная ошибка; отсутствие explicit env → прямой запрос несмотря на настроенный OS/PAC fixture; redirect error не достигает второго origin. Node child не наследует model/provider credentials. Установленный системный CA проверяется native в15; локальный сертификат через тестовую CA доказывает только TLS transport, не OS trust store.
- [ ] **5. Проверка/коммит:** Host `bun test test/cloud-proxy.test.ts test/environment.test.ts test/system-proxy.test.ts`, `bun typecheck`; Desktop existing environment proxy check + `bun typecheck`; проверить `--no-proxy-server` в существующем `test/loginom/no-proxy-contract.mjs`. Commit `fix(loginom): apply explicit proxy to cloud and Help requests`.

## Task 10: Две карточки настроек Desktop

**Files:** Modify `packages/app/src/components/{settings-loginom-state.ts,settings-loginom.tsx,settings-loginom.css}`, `packages/app/src/i18n/{en,ru}.ts`. Test `packages/app/test-browser/settings-loginom.test.ts`, `packages/desktop/test/loginom/settings-ux.mjs`. Живой cloud сценарий `settings-live.mjs` добавляется/выполняется в13.

**Interfaces:** UI использует готовые с6 preload/IPC channels `loginom-cloud-start`, `loginom-cloud-cancel`, `loginom-cloud-disconnect`; Check decoder готов с3. UI controller добавляет mode,endpoint,apiKey,apiKeyMode в draft и методы connect/cancelLogin/disconnect. Stored key не возвращается; пустая mask по hasApiKey — только placeholder.

- [ ] **1. RED:** Использовать `setup(initial)`, чьи View/Validation fields и три management stubs уже обновлены в3/6. Добавить поведенческий сценарий save-before-login:

```ts
const f = setup({ state: "connection-required", mode: "cloud", help: { state: "connection-required" } })
try {
  await f.form.load()
  f.form.edit({ username: "other" })
  await f.form.submit(true)
  expect(f.checks[0]).toMatchObject({ mode: "cloud", verifyBrowser: false })
  expect(f.saves).toHaveLength(1)
  expect(f.closed[0].state).toBe("connection-required")
  expect(f.form.state.failed).toBe(false)
} finally { f.dispose() }
```

- [ ] **2. Запустить RED:** из App `bun test --conditions=browser --preload ../ui/test/solid-jsx.ts --preload ./happydom.ts ./test-browser/settings-loginom.test.ts`.
- [ ] **3. GREEN:** В submit формировать Check с mode/endpoint/SecretEdit. `verifyBrowser:false` только save+cloud+!cloud.connected; явный check всегда true. Разрешить saved `connection-required`; watchLoginomApplication завершает polling уведомлением «сохранено, требуется подключение», а не failed и не бесконечным циклом. Не путать checkedBrowser с checkedHelp; browserVerified не утверждает Help ready. В текущем контроллере сохранить dirty/conflict/pending/cleanup правила.
- [ ] **4. Следующий RED→GREEN:** Успешный connect сохраняется немедленно, UI status обновляется без save; draft radio остаётся выбранным пользователем. Closing/Escape/overlay/discard отменяют незавершённый login после принятия существующего dirty-close guard; already completed login/logout сохраняются. `onCleanup` очищает введённые поля и запрашивает cancel, поздние async ответы не трогают disposed store. Не запрещать закрытие формы на всё время device polling.
- [ ] **5. Следующий RED→GREEN:** cloud↔custom сохраняет обе конфигурации; смена только mode/endpoint/key считается dirty. Secret field type=password, stored value не рендерится, preserve не отправляет mask. Проверки полей/сохранение actual activation остаются штатными. Custom карточка не вызывает cloud connect автоматически.
- [ ] **6. GREEN UI:** Вверху shared form добавить radio через `RadioGroup` из `@opencode-ai/ui/radio-group` (`options`, `current`, `label`, `onSelect`); контейнеры через Solid Show. Новые EN/RU typed keys:

| key suffix `loginom.ai.` | RU | EN |
| --- | --- | --- |
| title | Подключение к Loginom AI | Connect to Loginom AI |
| cloud | Облачный сервер | Cloud server |
| custom | Свой сервер | Custom server |
| connect | Подключиться | Connect |
| disconnect | Отключиться | Disconnect |
| cancel | Отменить вход | Cancel sign-in |
| endpoint | Адрес сервера Loginom AI | Loginom AI server URL |
| apiKey | Ключ Loginom AI | Loginom AI key |
| required | Требуется подключение к Loginom AI | Connect to Loginom AI to continue |
| reserve | Используется резервный сервер | Using the reserve server |
| revokeUnconfirmed | Локальное подключение удалено; отзыв на сайте не подтверждён | Local connection removed; server revocation was not confirmed |

Код/ссылка/expiry/email берутся только из management view; link открывается через существующий platform.openExternal после Host проверки origin. Кнопки refresh connection нет. Поля Loginom URL/username/password ниже; folder input не добавлять. Pending/error строки использовать полные фразы с параметрами, без составления локализованных слов из кусков.
- [ ] **7. Browser acceptance:** В `settings-ux.mjs` с IPC fixtures проверить две карточки, default cloud, keyboard radio navigation/labels, cancel, account, скрытый key и отсутствие refresh кнопки. Обновить тестовые API mocks новыми методами/status. Это UI-проверка с заглушками; `settings-live.mjs` с настоящим Host и cloud fixture отложен до13, шаг5, когда Desktop собран с baked tuple. Существующее onboarding условие generation сохраняет смысл «настройки сохранены», не «Help уже ready».
- [ ] **8. Проверка/коммит:** App browser test выше и `bun typecheck`; Desktop `bun test src/main/loginom`, `bun typecheck`; isolated settings-ux штатной командой из Desktop runbook. Не перезапускать пользовательское приложение. Commit `feat(app): add Loginom AI connection settings`.

## Task 11: CLI cloud/custom и отмена длительного входа

**Files:** Modify `packages/opencode/src/cli/{loginom-management,standalone-command,standalone,standalone-cancellation,standalone-run}.ts`; Test `packages/opencode/test/cli/{loginom-management,standalone-status,standalone-preflight,standalone-startup,profile}.test.ts`, `packages/opencode/test/cli/tui/standalone-pty.py`.

**Interfaces:** Команды `loginom connect` и `loginom disconnect`; существующие setup/check/status сохраняются. `connect` делает start/status/cancel короткими запросами, не новый180с await всей авторизации. Для setup stdin поля `mode`, `endpoint`, `apiKey`, `url`, `username`, `password`. JSON final stdout — ровно result; pending code/link выводятся пользователю в stderr, не в transcript. В существующем standalone-cancellation добавить `handoffStandaloneCancellation(): void`: идемпотентно снимает startup SIGINT-handler и очищает общий signal, не отменяя controller и не освобождая профиль; его же cleanup использует finally wrapper.

- [ ] **1. RED:** Custom setupCandidate/interactiveSetup уже реализованы в3. В `loginom-management.test.ts` добавить проверку реального `loginomManagement` через узкий stub `host.request`: текущий View — cloud без credentials, ответ check — `help:connection-required`, browser unknown; save возвращает тот же безопасный статус. Ожидаемые запросы/результат:

```ts
expect(calls.find(call => call.operation === "connection.check")?.input).toMatchObject({
  mode: "cloud", verifyBrowser: false,
})
expect(calls.filter(call => call.operation === "connection.save")).toHaveLength(1)
expect(result).toMatchObject({ state: "connection-required", help: { state: "connection-required" } })
```

- [ ] **2. Запустить RED:** Opencode `bun test test/cli/loginom-management.test.ts`.
- [ ] **3. GREEN:** Сохранить custom parser/prompts из3 и их regression tests. check возвращает actual `checked.help`, а не literal ready; setup без входа сохраняет connection-required с exit0. Перед setup-check явно задать verifyBrowser:false только для cloud без credentials (с учётом выбранного кандидатом режима); явная команда check оставляет true. Отдельный regression fixture-маркер подтверждает отсутствие запуска браузера в CLI setup до входа: этот путь реального Host не требует обращения к site и доступен до13.
- [ ] **4. Следующий RED→GREEN:** connect проверяется вызовом настоящего `loginomManagement` с узкой заглушкой `host.request`, возвращающей start/pending/status/success; записывать порядок запросов и безопасные outputs. Сузить его аргумент до `Pick<Awaited<ReturnType<typeof launchNodeHost>>, "request">`, поскольку management сам не владеет shutdown. Управляемые `wait(ms,signal)` и `now()` в options позволяют пройти срок больше180с без global timers и без запуска настоящего Node Host; каждый management request остаётся коротким. Начало и status fixture задают согласованные expiresAt/clock. Реальный CLI/PTY cloud flow выполняется в13, шаг5, с compiled Host и baked tuple. После cloud-start вывести status.pending и открыть verificationUrl `openUrl` из `@opencode-ai/core/open`; если browser launch недоступен, код и ссылка остаются рабочим результатом. Не ждать успеха браузерного процесса для продолжения polling. При подключённом профиле connect сообщает `LOGINOM_CLOUD_ALREADY_CONNECTED` с подсказкой сначала выйти, не создаёт новую установку.
- [ ] **5. GREEN loop:** Использовать `standaloneCancellation()` в management. В standalone.ts включить существующий `withStandaloneCancellation(() => executeProfile(...))` для `loginom connect` и TUI entry, а в standaloneRun получать `standaloneCancellation()` также при mode=tui (убрать нынешнее условие только mode=run). При отмене startup handler удерживается внешним invocation до Host cleanup и освобождения profile, не снимается при завершении отдельного prompt. После нормального завершения prompts/connect и перед запуском обычного TUI вернуть штатную обработку клавиш:

```ts
if (mode === "tui") {
  if (signal?.aborted) throw Error("CLI_CANCELLED")
  handoffStandaloneCancellation()
}
```

В существующем модуле хранить одну функцию снятия handler рядом с signal; handoff/finally вызывают её идемпотентно. При отмене handoff недостижим, второго controller или самостоятельного signal handler не создавать. Цикл connect ограничен returned expiresAt:

```ts
while (current.cloud.pending && now() < current.cloud.pending.expiresAt && !signal.aborted) {
  await wait(1000, signal)
  const decoded = view(await host.request("connection.status", {}))
  if (Option.isNone(decoded)) throw Error("LOGINOM_REPLY_INVALID")
  current = decoded.value
}
```

`view` — существующий Schema.decodeUnknownOption(Loginom.View) в loginom-management; `now` default Date.now, `wait` default cancellable ожидание. В finally при незавершённом входе запросить cloud-cancel; `host.close()` остаётся во внешнем владельце (standalone-command или standaloneRun), не внутри loginomManagement. Profile guard отпускает только внешний executeProfile после подтверждённых ACK+exit. Ctrl+C exit130, повторный SIGINT не принуждает exit до cleanup. Shutdown error сохраняет guard и имеет приоритет над красивым cancel result.
- [ ] **6. Следующие RED→GREEN:** отказ/expiry; pending код без browser; SIGINT во время start/poll/exchange; cleanup failure оставляет guard; disconnect offline удаляет только local cloud credentials и сообщает remote unconfirmed. Для headless run и automation preflight на connection-required — безопасная ошибка с подсказкой `loginom connect` до запуска модели; не переносить этот запрет на обычный чат TUI. Custom не пытается loginom.ai. Help check и browser check отчёт раздельные.

TUI после существующего setup-предложения повторно читает status; если cloud Help в connection-required, предлагает «Подключиться к Loginom AI сейчас? Можно продолжить обычный чат без подключения». По согласию вызывает `loginomManagement(host, "connect", ...)` с **тем же Host** и существующим profile guard; отдельный CLI subprocess не запускает. Отказ продолжает обычный чат, Loginom actions по-прежнему требуют готового Help. После prompt/management восстановить stdin.resume(). Ctrl+C отменяет текущий запуск с cleanup. Во время открытого TUI другой `loginom connect` получит PROFILE_BUSY, поэтому подсказка для позднего входа: выйти из TUI, выполнить connect, открыть TUI снова; новых механизмов общего профиля не вводить. Проверить TUI: сохранённое поколение без входа тоже предлагает connect, отказ доходит до обычного чата, согласие использует один Host/guard. Существующие ordinary-chat/unconfigured tests сохранить.
Отдельно проверить повторный SIGINT во время TUI startup connect: signal определён, polling отменён, guard остаётся до ACK+exit, второй сигнал не делает ранний exit. До13 unit test проверяет invocation wrapper/отмену; настоящий PTY cloud flow с теми же утверждениями входит в13.
- [ ] **7. Проверка/коммит:** Opencode `bun test test/cli/loginom-management.test.ts test/cli/standalone-status.test.ts test/cli/standalone-preflight.test.ts test/cli/standalone-startup.test.ts test/cli/profile.test.ts`, `bun typecheck`; existing isolated PTY проверяет отказ от входа/обычный чат уже здесь. Реальные connect/cancel через site fixture —13. Commit `feat(cli): add cloud sign-in and custom Dock setup`.

## Task 12: Evals и node acceptance получают custom credentials через stdin

**Files:** Modify `evals/src/profile.ts`, `evals/test/profile.test.ts`, `scripts/node-acceptance/run-check.py`, `scripts/node-acceptance/tests/test_run_check_build.py`, `scripts/node-acceptance/run-check.md`; Modify `evals/fixtures/fake-cli.ts` (existing subprocess driver для profile tests).

**Interfaces:** `setupProfile` передаёт `mode:"custom", endpoint: new URL("/mcp", config.dock.baseUrl).href, apiKey:config.dock.apiKey`. `config.dock.baseUrl` — существующий базовый HTTP API URL, не отдельный новый параметр. Node acceptance читает stand key только при setup, передаёт stdin в уже существующий `phase(...,stdin=...)`; build не читает секрет.

- [ ] **1. RED:** Расширить существующий profile subprocess fixture: прочитать JSON stdin в fake setup и завершить exit2 при отсутствующем mode/custom endpoint/key. Положительный тест вызывает настоящий `setupProfile`; ожидаемое тело:

```ts
expect(input).toMatchObject({
  mode: "custom",
  endpoint: new URL("/mcp", config.dock.baseUrl).href,
  apiKey: config.dock.apiKey,
  username: config.loginom.username,
})
```

`input` захватывается только внутри temp test driver; секреты не сохранять в обычные evidence. Existing canary redaction assertions оставить.
- [ ] **2. Запустить:** из evals `bun test test/profile.test.ts -t 'setupProfile'`; текущий setup не передаёт mode/endpoint.
- [ ] **3. GREEN:** Изменить JSON setup и fresh detection: unconfigured, connection-required, не custom либо нет custom key → нужна подготовка harness; уже совпадающий custom ready профиль не перенастраивается и не меняет generation. `verifyProfile` проверяет mode/custom endpoint/hasApiKey и actual Help readiness; browser отдельно. Проверки user/url для slots сохраняют отказ до перенастройки чужого профиля. Не очищать пользовательские профили ради миграции.
- [ ] **4. Следующий RED→GREEN:** Node acceptance build fixture больше не создаёт `knowledge-key`, build с отсутствующим stand key успешен и env не содержит его. Выполнение setup без stand key завершается явной ошибкой **до прогона модели**. Читать существующий файл `~/.config/loginom-ai-agent/mcp-api-key` можно как секрет стенда; `LOGINOM_MCP_API_KEY` перестаёт быть build input, для harness задать `LOGINOM_DOCK_API_KEY`/`LOGINOM_DOCK_ENDPOINT` с тем же файлом как совместимым ручным источником key. Сохранить default endpoint `https://mcp.loginom.ai/mcp`, если стенд не задан явно; никакого логирования key.

```python
stdin = json.dumps(dict(
    mode='custom', endpoint=os.environ.get('LOGINOM_DOCK_ENDPOINT', 'https://mcp.loginom.ai/mcp'),
    apiKey=stand_knowledge_key(), url=login['url'],
    username=login['username'], password=login['password'],
))
```

Использовать stdin в existing setup phase; helper error говорит «required for setup», не «required to build». Удалить key из build env и assert наличия knowledge-key. Подготовка `--prepare-only` должна собирать без ключа.

В run-check.md и evals runbook записать эксплуатационную зависимость: **до отключения общего legacy key** администратор выдаёт отдельный USER key для evals/node acceptance с чтением официальной KB; секрет стенда обновляется и проверяется реальным setup + чтением KB. Текущий private-файл можно сохранить, но его значение не должно зависеть от общего ключа0.3.9. По исходникам нельзя установить, кому принадлежит уже лежащий в нём ключ; секрет ради проверки не выводить. ADMIN/ROOT harness не выдавать. В canary test подтвердить stdin-only передачу, отсутствие key в build env/artifact/evidence. Production provisioning и отключение legacy key этой задачей не выполнять.
- [ ] **5. Проверка/коммит:** evals `bun test test/profile.test.ts`, `bun typecheck`; из `scripts/node-acceptance` `python3 -m unittest discover -s tests -p 'test_run_check_build.py'`, с TMPDIR. Это проверка настройки harness, не запуск всех live node evals. Commit `fix(evals): configure custom Dock without embedded credentials`.

## Task 13: Удаление встроенного ключа, staging tuple и документация

**Files:** Modify `packages/loginom-host/script/{stage-resources,build-cli,build-node-host}.ts`, Create `packages/loginom-host/script/cloud-build.ts`, `packages/loginom-host/test/cloud-build.test.ts`; Modify `packages/desktop/{scripts/bundle-loginom.ts,electron.vite.config.ts}`, `.github/workflows/release.yml`. Runtime fallback в host.ts удалён в3.

Tests: `packages/loginom-host/test/{node-host,cloud-proxy,cloud-readiness,stage-resources}.test.ts`, `packages/desktop/test/loginom/{settings-live.mjs,environment-proxy.ts}`, `packages/opencode/test/cli/{standalone-status,loginom-management}.test.ts`, `packages/opencode/test/cli/tui/standalone-pty.py`. Существующие custom fixtures уже перенесены в3; здесь завершаются отложенные compiled cloud проверки8–11.

Docs: `packages/app/AGENTS.md`, `packages/loginom-host/AGENTS.md`, `packages/desktop/src/main/loginom/AGENTS.md`, `docs/testing/loginom-ai-agent/{standalone-cli.md,README.md,ci-release.md}`. Не править исторические отчёты так, будто прежние сборки уже работали по новой схеме.

**Interfaces:** Удалить `stageResources.knowledgeKey` и упаковку `knowledge-key`; runtime чтения файла/withKnowledgeKey уже нет с3. Новый **build-only** `cloudBuild(environment: NodeJS.ProcessEnv): CloudEndpoints | undefined`; вход — одна JSON переменная `LOGINOM_AI_AGENT_CLOUD_BUILD` со всеми site/primary/reserve. Она используется только build scripts; compiled constant `import.meta.env.LOGINOM_AI_AGENT_CLOUD_BUILD` передаётся Host из Node bundle и Electron main. Обычный runtime process.env не читается для выбора cloud endpoints.

- [ ] **1. RED:** В stage-resources тесте проверить успешный bundle без key, отсутствие файла; в Host test поставить runtime `LOGINOM_AI_AGENT_KNOWLEDGE_ENDPOINT` и manifest.endpoint на listener-сборщик, а cloud tuple инъекцией на свои три fixtures. Ни одного запроса с cloud key на collector. Существующие custom fixtures использовать через сохранённый endpoint, не legacy env override.
- [ ] **2. Запустить RED:** Host `bun test test/stage-resources.test.ts test/cloud-build.test.ts test/cloud-readiness.test.ts`. Для полноценных staging tests нужны pinned Node/Browser inputs, иначе этот пункт не объявлять пройденным.
- [ ] **3. GREEN:** Удалить embedded key из staging, обоих build callers и release secret checks/env. Проверить, что раннее удаление runtime fallback в3 сохранилось: manifest.endpoint/env не выбирает адресата, custom использует явный endpoint. Shared manifest endpoint при необходимости остаётся историческим metadata. Миграция без mode из3 сохраняется.
- [ ] **4. RED→GREEN — build tuple:** Создать cloud-build тест:

```ts
expect(() => cloudBuild({
  LOGINOM_AI_AGENT_CHANNEL: "prod",
  LOGINOM_AI_AGENT_CLOUD_BUILD: JSON.stringify({
    site: "https://staging.loginom.test", primary: "https://p.loginom.test/mcp", reserve: "https://r.loginom.test/mcp",
  }),
})).toThrow("LOGINOM_CLOUD_BUILD_FORBIDDEN")
expect(cloudBuild({ LOGINOM_AI_AGENT_CHANNEL: "prod" })).toBeUndefined()
```

`cloudBuild` разрешает override только для явного channel `dev`; beta/prod/latest/пустой channel с override отклоняет. JSON содержит ровно три непустых HTTPS URL без credentials; частичный tuple отклонить. Этот один helper реально используется обоими сборщиками, без второго env набора. `Bun.build.define` и Vite main.define встраивают literal, default — fixed Product.cloud. CLI Host bundle и Desktop main получают один tuple из одного вызова helper. Staging запускается только в отдельном dev профиле; примеры команд в runbook явно задают temp profile, а не рабочий Desktop root.

Release workflow может собирать `dev` при ручном запуске. Поэтому `.github/workflows/release.yml` до build steps отвергает **любую заданную** LOGINOM_AI_AGENT_CLOUD_BUILD независимо от канала (в том числе пустую). Guard выполнить в каждом окружении сборки, не только в отдельном preflight job; канал dev остаётся допустимым только для локальной нерелизной сборки с tuple. Пример shell guard для bash build steps:

```bash
if [ "${LOGINOM_AI_AGENT_CLOUD_BUILD+x}" = x ]; then
  echo "::error::LOGINOM_AI_AGENT_CLOUD_BUILD is forbidden in release CI"
  exit 1
fi
```

Не печатать значение tuple. Проверить exact guard с unset / empty / tuple при channel prod и dev: unset проходит, заданная переменная всегда завершает шаг до сборки. Helper channel-check и CI guard решают разные границы; второй не заменяется первым.
- [ ] **5. Следующий RED→GREEN:** В запущенном compiled release Host runtime env CLOUD_BUILD/KNOWLEDGE_ENDPOINT не меняет адрес. Проверки release build/CI с запрещённой override падают до создания artifact, включая CI channel dev. Compiled dev Host и Desktop собраны с одним tuple трёх локальных HTTPS endpoints; отдельные test profiles и доверенная тестовая CA. Здесь завершить отложенные проверки:
  - Node management start/status/cancel из8: настоящие short calls, без endpoint override в handshake и без утечки canaries.
  - Site+Help proxy из9, включая первый Desktop request после login-shell env, direct count0, NO_PROXY и отказ недоступного proxy.
  - `settings-live.mjs` из10: настоящий preload → IPC → Host → fixture, save-before-login → connect → ready в том же поколении, cancel/disconnect; renderer handlers не подменяются.
  - CLI management/PTY из11: настоящий compiled Host, connect/cancel/Ctrl+C, профиль удерживается до cleanup; TUI startup connect использует один Host, отказ сохраняет обычный чат. Unit проверка ожидания больше180с остаётся в11, здесь подтверждается настоящий transport/lifecycle.

Программная unit injection не является public handshake method. До появления этой сборки перечисленные cloud integration checks не отмечать выполненными.
- [ ] **6. Проверить всех потребителей:** `rg -n 'knowledge-key|knowledgeKey|LOGINOM_MCP_API_KEY|LOGINOM_AI_AGENT_KNOWLEDGE_ENDPOINT|hasApiKey' packages scripts evals .github` и классифицировать совпадения. Runtime/build fallback отсутствует; negative tests/исторические документы могут упоминать имя. Fixtures с3 используют custom stdin/records и actual Help state, а не ждут этой задачи для миграции. UI-01 находится в `docs/testing/loginom-ai-agent/README.md`.
- [ ] **7. Docs вместе с поведением:** заменить module правила про встроенный ключ. Зафиксировать API/setup примеры, сохранение до входа, независимость профилей, logout/revoke границу, KB-root ограничение custom, proxy variant A. Добавить в runbook отдельную секцию stage14/15 с ограничениями native/site. Системный proxy v2 не менять.
- [ ] **8. Проверка/коммит:** затронутые Host/CLI/Desktop tests, package typechecks; реальный shared staging и оба build callers штатными runbook командами при наличии inputs. Проверить inventory: `knowledge-key` отсутствует, fixture secret canaries отсутствуют в payload, User profile не включён. `git diff --check`. Commit `chore(loginom): remove embedded Dock key and pin cloud endpoints`.

## Task 14: Проверка ACL/Help на одном Dock и runbook развёртывания

**Files:** Create `services/loginom-ai/tests/server/test_agent_cloud_access.py`, `services/loginom-ai/tests/server/agent_cloud_server.py`, `packages/loginom-runtime/test/support/dock-scope-probe.mjs`; Modify `services/loginom-ai/tests/server/conftest.py`; документация `services/loginom-ai/deploy/loginom-dock/README.md`, `docs/testing/loginom-ai-agent/README.md`. Существующие реализации auth/ACL не переписывать, если нужные гарантии уже проходят. Bootstrap/import/backup остаются существующими средствами.

**Interfaces:** Официальная KB публикуется ADMIN, ACL account включён, на root grant `user:* → read`; эффективные grants потомков не дают USER write/manage. Полный backup — снимок **данного** сервера вместе с реестром, не способ синхронизации KB между серверами. Site использует ADMIN своего account, его масштаб полномочий документируется честно.

- [ ] **1. Минимальная проверка существующих возможностей:** перенаправить server fixture temp dir из hardcoded `test_data/tmp_server` в `Path(tempfile.gettempdir()) / "loginom-dock-server-tests"`; тестовый процесс запускается с заданным TMPDIR. Это перенос тестовых данных, не production поведение. Сохранить function-level UUID cleanup; не запускать удаление общего TMPDIR.
- [ ] **2. Добавить реальный ACL regression test:** использовать `service` fixture и `RequestContext`/`UserIdentifier`/`Role` из существующего `test_content_write_service.py`. ADMIN создаёт root, index row и KB файл по его действующему примеру; USER B читает, не пишет:

```python
await update_account_settings(
    service.viking_fs, admin.account_id,
    AccountSettingsPatch(acl=AccountAclSettings(enabled=True)),
)
await service.fs.set_acl(
    "viking://resources/loginom-dock",
    [{"principal": "user:*", "level": "read"}], ctx=admin,
)
await service.fs.write(
    "viking://resources/loginom-dock/test.md", content="trusted knowledge",
    ctx=admin, mode="create", wait=True,
)
assert await service.viking_fs.read_file(
    "viking://resources/loginom-dock/test.md", ctx=reader,
) == "trusted knowledge"
with pytest.raises(PermissionDeniedError):
    await service.fs.write(
        "viking://resources/loginom-dock/test.md", content="untrusted",
        ctx=reader, mode="append", wait=True,
    )
```

Этот тест может сразу быть зелёным: он проверяет уже существующую серверную гарантию. Не вносить искусственный production change ради RED. Если наблюдаемая гарантия не выполняется, фиксировать её минимальным отдельным RED→GREEN в соответствующей ACL операции, без глобального запрета USER namespaces.
- [ ] **3. Дополнить проверки по одному:** USER не удаляет/не меняет ACL KB и получает403 на admin API; ADMIN повторно публикует ту же KB без выдачи USER более широких direct grants. A может записать чужой текст вне KB; после этого managed Help B все семь чтений направляет только внутрь root. Для настоящего MCP прогона запускать Python Dock отдельным процессом и Node client Task2; in-process MCP function tests не выдавать за сетевой прогон managed клиента.
- [ ] **4. Проверить auth без нового сайта:** existing `test_register_user`, `test_regenerate_key`, `test_user_role_cannot_access_admin_api` подтверждают нужный API. Повтор bootstrap существующего legacy USER не ротирует его ключ (сейчас ранний return). Новая ACL процедура запускается после публикации KB независимо от этого return. Legacy key должен продолжить чтение официальной KB после включения ACL.
- [ ] **5. Настоящая сетевая проверка Help scope:** один loopback Dock процесс с отдельным workspace/auth registry и USER A/B. A записывает текст вне KB, реальный managed client B читает все семь инструментов и не получает его. Ротация B отклоняет старый key и допускает новый; повторная публикация KB сохраняет действующие ключи и legacy USER. Второй локальный Dock не нужен: он проверял бы независимость каталогов по построению. Failover/разные ключи клиента проверяет Task7 двумя MCP fixtures; фактическую топологию двух развёртываний — runbook ниже и15. Тестовые secrets только private temp files/stdin; в evidence только результат, не ключи.
**Конкретная test-only обвязка шага5.** `running_server` в existing conftest отключает mcp_lifespan, поэтому его нельзя переиспользовать для этого сценария. Child `agent_cloud_server.py` читает один JSON из stdin `{workspace,port,root_key}`. Импорты singleton взять из `openviking_cli.utils.config.open_viking_config`; fake model helpers — `tests.server.conftest`. Обработчики auth/ACL/FS/MCP не подменять:

```python
payload = json.loads(sys.stdin.readline())
with pytest.MonkeyPatch.context() as patch:
    _install_fake_embedder(patch)
    _install_fake_vlm(patch)
    OpenVikingConfigSingleton.initialize(config_dict={
        "storage": {"workspace": payload["workspace"],
                    "agfs": {"backend": "local"}, "vectordb": {"backend": "local"}},
        "embedding": {"dense": {"provider": "openai", "model": "test-embedder",
                                "api_key": "test-unused", "dimension": 2048}},
        "retrieval": {"enable_intent": False},
    })
    app = create_app(config=ServerConfig(auth_mode="api_key", root_api_key=payload["root_key"]))
    uvicorn.run(app, host="127.0.0.1", port=payload["port"],
                log_level="warning", access_log=False)
```

Родитель `test_agent_cloud_access.py` запускает `[sys.executable,"-m","tests.server.agent_cloud_server"]` с cwd `services/loginom-ai`, PIPE stdin и private temp log; port выбрать loopback bind0 по существующему conftest. Ready — `/health` и authenticated `GET /api/v1/admin/accounts`, с deadline30с и проверкой child exit. Cleanup только своих процессов: terminate, wait5с, kill/wait при необходимости. Root secrets передаются только stdin.

Provisioning единственного child выполняет HTTP запросами:

| Кто / метод / path | Body или результат |
| --- | --- |
| ROOT POST `/api/v1/admin/accounts` | `{account_id:"loginom-dock",admin_user_id:"publisher"}` → result.user_key ADMIN |
| ADMIN POST `/api/v1/admin/accounts/loginom-dock/users` | `{user_id:"A"|"B"|"loginom-dock",role:"user"}` → result.user_key |
| ADMIN PATCH `/api/v1/admin/accounts/loginom-dock/settings` | `{acl:{enabled:true}}` |
| ADMIN POST `/api/v1/fs/mkdir` | `{uri:"viking://resources/loginom-dock"}` |
| ADMIN POST `/api/v1/content/write` | `{uri,content,mode:"create",wait:true}`; повтор — mode replace |
| ADMIN PUT `/api/v1/acl` | `{uri:root,entries:[{principal:"user:*",level:"read"}]}` |
| ADMIN GET `/api/v1/acl?uri=...` | проверить effective descendants |
| ADMIN POST `/api/v1/admin/accounts/loginom-dock/users/B/key` | сменить ключ B; старый отклоняется, новый работает |

A пишет `hostile-marker` через content API в `viking://resources/hostile-marker.md` и `viking://agent/skills/hostile-marker.md`. ADMIN публикует `trusted-marker` только в KB. ROOT не используется для MCP data plane. JS probe получает `{endpoint,apiKey}` через stdin и импортирует настоящий client:

```js
import assert from 'node:assert/strict';
import { createKnowledgeClient } from '../../client/lib/knowledge-client.mjs';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const knowledge = await createKnowledgeClient(JSON.parse(input));
const root = 'viking://resources/loginom-dock';
try {
  const cases = [
    ['find', {query:'trusted-marker', read_content:true}],
    ['search', {query:'trusted-marker', mode:'list', read_content:true}],
    ['read', {uris:[`${root}/trusted-marker.md`]}],
    ['list', {uri:root, recursive:true}], ['tree', {}],
    ['grep', {uri:root, pattern:'trusted-marker'}], ['glob', {pattern:'**/*.md'}],
  ];
  for (const [name, args] of cases) {
    const result = await knowledge.call({run:'probe',id:name,name,arguments:args});
    assert.notEqual(result.isError, true);
    assert.doesNotMatch(JSON.stringify(result), /hostile-marker|viking:\/\/agent\/skills/);
  }
  await assert.rejects(knowledge.call({run:'probe',id:'mixed',name:'read',arguments:{
    uris:[`${root}/trusted-marker.md`,'viking://agent/skills/hostile-marker.md'],
  }}), /LOGINOM_KNOWLEDGE_SCOPE_DENIED/);
  process.stdout.write(JSON.stringify({ok:true,tools:7})+'\n');
} finally { await knowledge.close(); }
```

В positive read assertion также требовать `trusted-marker` в content; отсутствие hostile само по себе не доказывает работающий read. Indexing дождаться штатным `wait:true`; fake embedder нужен лишь для автономности теста, не для оценки качества поиска. Родитель запускает `[os.environ["LOGINOM_AI_AGENT_TEST_NODE"], probe_path]` с input JSON, timeout120с, check=True; stdout проверяется только как `{ok:true,tools:7}`. В evidence не копировать server responses с user_key. После ротации повторить probe B с новым ключом; после повторной публикации проверить B и legacy USER. Эта проверка не подтверждает production topology.

- [ ] **6. Deployment runbook:** точная последовательность для каждого инстанса: bootstrap своего account → публикация одинаковой source revision через existing Assets/catalog/import с собственным State → включение account ACL → root read grant → аудит **эффективных** descendant grants → USER read/write/admin negative checks. `import-sources.sh` сейчас привязан к `/opt/loginom-dock` и container `loginom-dock-openviking-1`: запускать локально на каждом отдельном сервере с его собственной установкой; не объявлять скрипт общей удалённой репликацией.

В runbook явно записать: `backup-server.sh` включает `/local/_system/accounts.json` и `/local/{account}/_system/users.json`; полный primary restore поверх reserve запрещён для обновления KB. Restore собственного backup может откатить отзыв — сверить состояние ключей до возобновления доступа. Проверить фактические admin exposure, `allow_private_networks` и USER URL-import перед deployment; здесь production настройки не менять и не объявлять безопасными без проверки. ADMIN сайта управляет всей KB/account, ROOT ему для выдачи пользователей не нужен.

При вводе reserve проверить два действительно независимых реестра: одинаковые account/user ID получают разные ключи; primary key не проходит на reserve; ротация primary не меняет reserve; публикация одной source revision KB сохраняет оба ключа. Это внешний gate15, не результат локального однопроцессного теста.
- [ ] **7. Проверка/коммит:** из `services/loginom-ai`:

```bash
uv run pytest tests/server/test_agent_cloud_access.py tests/server/test_admin_api.py::test_register_user tests/server/test_admin_api.py::test_regenerate_key tests/server/test_admin_api.py::test_user_role_cannot_access_admin_api tests/server/test_content_write_service.py::test_shared_resource_creation_inherits_acl_and_preserves_plain_append
```

Эта же pytest команда запускает один настоящий Dock из шага5 и managed MCP probe; простой in-process ACL тест не подменяет сетевой прогон. При недоступном native storage или pinned Node вернуть явный failure/prerequisite report, не permissive mock и не фиктивный PASS. Commit `test(dock): verify cloud user access and Help scope`.

## Task 15: Сквозная приёмка и готовность к выпуску

**Files:** Create `docs/testing/loginom-ai-agent/cloud-auth.md`; при автоматизации повторяемых действий расширять существующие Desktop/CLI acceptance scripts, не новый test runner. Modify ссылки в `docs/testing/loginom-ai-agent/README.md`, checkpoint в `docs/plans/2026-11-05-dock-cloud-auth-design.md`.

**Interfaces:** Реальные staging site + два независимых Dock, нерелизные Desktop и CLI из одного source SHA. Проверки fixtures из1–14 и матрица ниже имеют отдельные результаты. Секретные подготовленные accounts/keys не сохранять в git/evidence. Production rollout и отключение legacy key требуют отдельной команды владельца.

- [ ] **1. Source gate:** выполнить пакетные проверки, перечисленные в задачах, на финальном diff. Повторять только затронутые после последних исправлений; зафиксировать команды, exit codes, source SHA. `git diff --check` и независимое ревью изменения обязательны. Удалить ненужные additions, найденные при ревью.
- [ ] **2. Local integration gate:** управляемый HTTP site fixture + два настоящих MCP fixtures подтверждают login/save/recovery/logout/migration/redaction/redirect/budgets. Документировать как «клиентский контракт», не «Better Auth проверен». Для GUI использовать isolated dev profile; CLI — иной root. Upgrade fixture старой записи проверяет source migration, не подлинный бинарник0.3.9.
- [ ] **3. Native gate Windows/macOS:** на собранных Desktop/CLI проверить system CA и explicit HTTP(S)_PROXY/NO_PROXY для site и Help, недоступный proxy без direct fallback, отсутствие OS/PAC auto-discovery в этих двух клиентах. Проверить native safeStorage/DPAPI/Keychain сохранение/чтение/удаление cloud payload; чужой профиль не расшифровывает CLI Keychain запись. Linux отдельно подтверждает plaintext0600/0700. Browser Loginom остаётся прямым.
- [ ] **4. Внешний gate после готовности сайта/reserve:** выполнить следующую матрицу. До их появления статус этого пункта «не выполнен: отсутствуют внешние сервисы», а не mock PASS.

| Сценарий | Что наблюдать |
| --- | --- |
| Desktop и CLI впервые входят | Общий device flow, регистрация без email confirmation, анкета один раз; явное подтверждение кода; текущий аккаунт можно сменить |
| Две установки одновременно нового пользователя | Разные installation keys, одна и та же действующая пара Dock; новый вход не ротирует её |
| Сохранение до входа / миграция | Loginom настройки сохранены, connection-required; после входа то же поколение ready |
| Закрытие формы / Ctrl+C | Pending flow отменён; late response не пишет credentials; CLI guard освобождён только после Host cleanup |
| Device session cleanup | Raw token той же сессии погашен; browser session остаётся; удаление не доказывается чужим/missing token status:true |
| Ordinary logout одной установки | Её site key отключён, локальные secrets удалены; общая Dock pair/другая установка работают |
| Отзыв установки / пользователя | Соответствующие site connections заблокированы; оба старых Dock key инвалидированы; действующая другая установка refresh без login |
| Частичная ротация и потеря ответа | Сайт возвращает actual key каждого Dock или временную ошибку; не выдаёт старую пару; отзыв не объявляется полным до обоих серверов |
| Гонка GET и revoke | Endpoint повторяет active check под сериализацией; старой installation не выдаёт новую пару |
| Обходные API key paths | Чужой config/unbound key не даёт pair; exact disabledPaths закрыты; server API работает; лимит60/мин задан явно |
| Primary offline / оба offline | Правильные keys, успешный reserve sticky до Host restart; оба failed не закрепляют dead reserve; следующий demand восстанавливается |
| Site offline / HTML401 /429 | Credentials сохраняются, работающий Dock продолжает работу; cooldown/Retry-After соблюдены |
| Подтверждённый access_revoked | Удаление также с диска; новый Host требует вход |
| Неодинаковые auth registry | Одинаковая KB, разные ключи; публикация KB не меняет identities; полный primary restore не используется |
| A пишет agent/skills и resources вне KB | B через все семь managed Help tools это не получает; mixed read/context/traversal не уходит на сервер |
| Осталась browser session после отзыва | Она может подтвердить новый вход; это явно описанная граница, не обещанная блокировка компьютера |

Параметры rate limit, disabledPaths, provisioning/rotation concurrency и server session cleanup проверяет реализация сайта. В этом плане это приёмочные входные условия, не задачи написания маршрутов/БД сайта.
- [ ] **5. Завершить отчёт:** для каждого gate указать «проверено» либо конкретную причину отсутствия результата. Отдельно записать фактическую проверку legacy0.3.9, если бинарник предоставлен, без предположения о совпадении с `dd2f949d11`. Не отключать legacy key этой задачей. Если все source/client этапы пройдены, но site/reserve/native ещё недоступны, клиентскую реализацию можно передать на ревью; cloud выпуск остаётся неготовым.
- [ ] **6. Commit:** `docs(loginom): record cloud connection acceptance`. Публикацию/слияние/релиз автоматически не выполнять.

## Покрытие спецификации и точка возобновления

| Раздел спецификации | Задачи |
| --- | --- |
| §1–2 границы/режимы/решения | Global Constraints,3,5,12–15 |
| §3 UI/save/CLI | 3,6,8,10,11 |
| §4 Device Authorization | 5,8,10,11; настоящий Better Auth15 |
| §5 credentials/API/network/status | 4,5,7–9,13; серверные guarantees15 |
| §6 logout/revoke | 7,8,10,11; server rotation15 |
| §7 single Help/readiness/storage | 1,4,6–8 |
| §8 failover/refresh/deadline | 7,9,15 |
| §9 KB/ACL/reserve | 2,14,15 |
| §10 migration/all consumers | 3,10–13 |
| §11 behavioral checks | По одному TDD циклу в1–14, внешняя матрица15 |
| §12 source paths | Карта файлов и Files каждой задачи |

При завершении задачи отметить её checkboxes и сохранить в журнале проектирования SHA,
проверки, ограничения и следующий Task. Канонические продуктовые решения остаются
в спецификации. В этом документе нет реализации сайта; до завершения15 нельзя
отмечать облачный сценарий готовым к выпуску.


## Проверка плана — 2026-11-06

Самопроверка: все §§1–12 спецификации сопоставлены задачам, пути существующих файлов
сверены, новые файлы явно обозначены, интерфейсы и зависимости согласованы.
Независимое общее ревью — Approved; отдельные проверки Host и Dock/runtime — Approved.
Замечания исправлены в тексте. Это проверка документа по исходникам; команды,
тестовые скелеты, сборки и внешние сервисы на стадии написания плана не запускались.

Повторная проверка замечаний к `64983e8b76`: общее ревью, Host/CLI и Dock — Approved.
Исправлены промежуточная совместимость consumers, порядок fixture/live проверок,
TUI startup/cancellation, release guard, proxy initialization и лишний второй
локальный Dock. Повторный вход ограничен также в спецификации. Документальные
проверки структуры, ссылок и `git diff --check` пройдены; runtime не проверялся.
