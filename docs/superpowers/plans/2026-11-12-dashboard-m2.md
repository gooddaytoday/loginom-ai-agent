# Dashboard M2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** после одного обновления dev-стенда ROI-dashboard открывается из Studio в песочнице с отдельного адреса `http://dashboards.localhost:32769`, а `MinBudget` меняется в доверенной шапке над ним.

**Architecture:** служба снимков и новый хост приложений — один процесс Node в отдельном контейнере web. Хост приложений раздаёт сборки по адресу `/apps/<ключ>/<хеш>/` с заголовками из плана изоляции. Оболочка в Studio (`shell.js`) открывает сборку в iframe с `sandbox="allow-scripts"` и передаёт данные только через `MessagePort`; приложение получает их через SDK v1 (`onState`, `close`) и ничего не меняет само. `publish.mjs` кладёт сборку в каталог `~/loginom-dashboard/builds` и атомарно переключает указатель `current`; `lookup` возвращает хеш текущей сборки.

**Tech Stack:** TypeScript, Effect Schema, `node:http`, `node:test`, Bun 1.3.14, Node 24.19.0, Chromium 154 и Playwright из Loginom runtime, React 19, Recharts 3, Vite 7.1.4, TypeScript 5.8.2 в шаблоне, Bash, Docker, Apache.

**Spec:** [утверждённый дизайн M2](../specs/2026-11-12-dashboard-m2-design.md). Он опирается на [план изоляции](../../security/dashboard-isolation.md) (заголовки, протокол, «Проверки») и [roadmap](../specs/2026-11-11-dashboard-architecture-roadmap.md) (S4, S5, «Что проверяет `check`»). Исполнитель читает дизайн целиком; план не повторяет его обоснований.

## Global Constraints

- База — ветка `dashboard-app` с этим планом. Работать в отдельном worktree на ветке `dashboard-m2`; целевую ветку PR, слияние и выпуск задаёт владелец.
- Команды тестов — из `packages/dashboard`, не из корня; команды стенда — из корня. `$LOGINOM_AI_AGENT_TEST_NODE` — абсолютный путь к Node 24.19.0, `PLAYWRIGHT_BROWSERS_PATH` — Chromium 154 из [пинов продукта](../../../packages/product/loginom-release.json). В отчётах записывать фактические версии.
- Новых зависимостей нет ни в пакете, ни в шаблоне.
- Адреса стенда: Studio — `http://127.0.0.1:32768` и `http://localhost:32768`; хост приложений — `http://dashboards.localhost:32769` (порт 8101 контейнера web, опубликованный как `127.0.0.1:32769`); API для Apache — порт 8100.
- Заголовки хоста приложений — дословно из раздела «Заголовки» плана изоляции (код в задаче 2). Сообщения — дословно из таблицы «Сообщения» дизайна. Лишние поля и другие типы сообщений игнорируются.
- Числа и тексты дизайна: 10 000 строк, 10 000 символов в ячейке, 5 МБ таблицы (5 000 000 символов JSON строк); `ready` ждём 10 секунд; больше 50 сообщений в секунду закрывают dashboard; пробу ждём 5 секунд; тело отчёта до 64 КиБ. Отказ строгого режима — «Dashboard открывается в Chrome, Edge или Яндекс Браузере на Chromium 152 и новее», нет ответа пробы — «Хост dashboard недоступен», нет `ready` — «Dashboard не ответил», страница вне фрейма — «Откройте dashboard кнопкой Dashboard в Studio».
- Не ослаблять без владельца: никаких `allow-same-origin`, новых типов сообщений от приложения, `Report-Only` вместо принудительного CSP страницы Studio, источников `frame-src` сверх согласованных в задаче 1.
- Desktop не меняется. Снимок (`targets`, `current`) не меняется, кроме текста `adapter`. Пакеты `.lgp` не изменять.
- Поведение M1 не удаляется, пока не закреплено тестом через новый канал (задача 5).
- Комментарии в коде — на английском, как во всём пакете; документы — на русском.
- Оценка изменения: около 40 файлов, 2 500–4 000 добавленных и удалённых строк вместе с тестами и документами (сверка — `git diff --stat --find-renames` от начала реализации). Работы M3–M5 (новый контракт снимка, publisher и builder, compose, `mod_substitute`, `integrity`, TLS) не начинать.

**Уточнения плана к дизайну** (смысл дизайна не меняют; владелец видит их здесь):

1. Хост приложений создаёт отдельная функция `appHost()` рядом с `dashboardServer()`. Отключение `Connection-Allowlist` — её параметр `connectionAllowlist: false`, только в коде тестов; переменной окружения нет, как требует дизайн.
2. Переменная `DASHBOARD_CLIENT_ORIGINS` (origin Studio через запятую) заменяет `DASHBOARD_PUBLIC_HOSTS`: из неё берутся и `frame-ancestors`, и список `Host` для API. `DASHBOARD_BUILDS` заменяет `DASHBOARD_PUBLISH_ROOT` — та же переменная, что у `publish.mjs`.
3. Оболочка закрывает dashboard на **втором** событии `load` iframe: первый `load` может прийти и до, и после первого `ready`. Это строже формулировки «повторный `load` после первого `ready`» и закрывает подмену документа до `ready`.

## Review Focus

| Риск для пользователя | Где и чем обнаруживаем |
|---|---|
| Dashboard читает сессию Studio, пароли или cookie | 7: набор вредоносных dashboard, оба прогона |
| Dashboard выносит показанные данные в сеть или на origin Studio | 7: счётчики TCP-соединений сервера-злоумышленника и запросов фрейма к Studio |
| Порт и данные узла получает подменённый документ | 5, 7: второй `ready`, второй `load`, счётчик `MessageChannel` |
| Принудительный CSP ломает собственные фреймы Studio | 1: разведка `Report-Only`; 12: те же сценарии под принудительным заголовком |
| Шапка пишет не ту переменную или оставляет операцию редактирования открытой | 5: перенесённые проверки M1 `BeginOperationEx/EndOperationEx` |
| Публикация ломает уже открытую страницу или оставляет полусостояние | 3: `current` последним шагом, неудачная сборка ничего не меняет |
| Строгий режим пропускает браузер без заголовка или мешает созданию | 8: проба с заголовком и без, путь «Создать dashboard» без пробы |
| `install` ломает Apache, работает от root, `uninstall` теряет сборки | 10, 12: откат по `apachectl -t`, UID контейнера, `builds/` после `uninstall` |

## Карта изменений и порядок

Ниже `P/` — `packages/dashboard/`. Задача 1 идёт на стенде M1 до кода. Задачи 2–11 — код и документы без изменения стенда. Задача 12 — одно обновление стенда и приёмка.

| Файл | Ответственность | Задачи |
|---|---|---|
| `P/deploy/studio.csp` | шаблон CSP страницы Studio с `<DASH>` | 1, 5, 10 |
| `P/src/web/apps.ts` | хост приложений: заголовки, сборки, `/_reports`, `/_probe/` | 2, 8 |
| `P/src/web/server.ts` | API снимков и `lookup`, запуск обоих серверов | 2, 4 |
| `P/src/contract/snapshot.ts`, `P/src/contract/protocol.ts` | схемы `lookup` и `state` | 2, 4 |
| `P/script/publish.mjs` | сборка в `builds/<ключ>/<хеш>/` | 3 |
| `P/src/sdk/loginom.ts` | SDK v1 приложения, копируется в шаблон и примеры | 4, 9 |
| `P/src/shell/frame.ts`, `P/src/shell/probe.ts` | iframe, протокол и проба | 5, 8 |
| `P/src/shell/index.ts`, `P/src/shell/loginom/*` | шапка, очередь расчётов, чтение таблицы | 5, 6 |
| `P/test/browser/apps/*` | статичные тестовые приложения | 5, 7 |
| `P/deploy/dev-master.sh` | контейнер web, Apache, `check` | 10 |

### Task 1: Разведка `Report-Only` и шаблон CSP страницы Studio

**Files:**
- Create: `P/deploy/studio.csp`
- Modify: `docs/superpowers/specs/2026-11-11-dashboard-architecture-roadmap.md` (абзац «Итог разведки M2» под таблицей spike)

**Interfaces:**
- Produces: `studio.csp` — одна строка без перевода строки в середине; `<DASH>` заменяется адресом хоста приложений. Её читают тестовая страница Studio (задача 5), `install` и `check` (задача 10).

- [ ] **Step 1: Включить пробный заголовок на стенде M1.** Стенд не обновлять. Убедиться, что Apache подключает `*.site.conf` (`docker exec dashboard-master-20261109-studio grep -n site.conf /usr/local/apache2/conf/httpd.conf`), затем:

```bash
docker exec -i dashboard-master-20261109-studio sh -ec 'cat > /usr/local/apache2/conf/dashboard-csp-probe.site.conf' <<'CONF'
<LocationMatch "^/app(-debug)?/(index\.html)?$">
  Header set Content-Security-Policy-Report-Only "frame-src http://dashboards.localhost:32769; object-src 'none'; frame-ancestors 'none'"
</LocationMatch>
CONF
docker exec dashboard-master-20261109-studio apachectl -t
docker exec dashboard-master-20261109-studio apachectl -k graceful
curl -sI http://127.0.0.1:32768/app/ | grep -i '^content-security-policy-report-only'
curl -sI http://127.0.0.1:32768/app-debug/ | grep -i '^content-security-policy-report-only'
```

Expected: `Syntax OK` и по одной строке заголовка на каждый клиент.

- [ ] **Step 2: Пройти сценарии.** В `/app/` и `/app-debug/` с открытыми DevTools (Console и Issues) выполнить: загрузку файла в хранилище, выгрузку файла, импорт данных мастером, визуализатор узла, отчёт, справку. Для каждого сообщения `[Report Only] Refused to frame '<адрес>'` записать адрес, клиент и действие.
- [ ] **Step 3: Убрать пробу.**

```bash
docker exec dashboard-master-20261109-studio rm -f /usr/local/apache2/conf/dashboard-csp-probe.site.conf
docker exec dashboard-master-20261109-studio apachectl -t
docker exec dashboard-master-20261109-studio apachectl -k graceful
curl -sI http://127.0.0.1:32768/app/ | grep -ic '^content-security-policy' # Expected: 0
```

- [ ] **Step 4: Записать шаблон.** Если собственных фреймов Studio нет, содержимое `P/deploy/studio.csp`:

```
frame-src <DASH>; object-src 'none'; frame-ancestors 'none'
```

Если фреймы найдены, показать владельцу список адресов и действий. В `frame-src` после `<DASH>` добавить только одобренные источники. Неодобренный источник означает, что сценарий Studio сломается под принудительным заголовком: это записывается как ограничение M2.
- [ ] **Step 5: Записать итог в roadmap.** Под таблицей spike добавить абзац «Итог разведки M2 (дата)»: клиенты, сценарии, найденные фреймы и решение владельца по каждому; вопрос Embedded закрыт решением 9 дизайна. Коммит:

```bash
git add packages/dashboard/deploy/studio.csp docs/superpowers/specs/2026-11-11-dashboard-architecture-roadmap.md
git commit -m "docs(dashboard): record Studio frame survey"
```

### Task 2: Хост приложений и `lookup`

**Files:**
- Create: `P/src/web/apps.ts`, `P/test/web/apps.test.mjs`
- Modify: `P/src/web/server.ts`, `P/src/contract/snapshot.ts`, `P/src/shell/response.ts`, `P/test/web/server.test.mjs`, `P/test/web/shell-contract.test.mjs`, `P/test/web/dist-smoke.test.mjs`, `P/test/browser/fixture.mjs` (только ответ `lookup`), `P/package.json` (`test:coverage`)

**Interfaces:**
- Produces:

```ts
// src/web/apps.ts
export type Mode = "normal" | "strict"
export function appHeaders(appOrigin: string, clientOrigins: string[], connectionAllowlist?: boolean): Record<string, string>
export function appHost(options: {
  buildsRoot: string
  appOrigin: string
  clientOrigins: string[]
  mode: Mode
  connectionAllowlist?: boolean // tests only; default true
  log?: (line: string) => void // default console.log
}): Server
// src/web/server.ts
export function dashboardServer(options: {
  projectRoot: string
  buildsRoot: string
  appOrigin: string
  mode: Mode
  maxSnapshots?: number
  allowCurrent?: boolean
  allowedHosts?: string[]
}): Server
export function startDashboard(env?: NodeJS.ProcessEnv): { api: Server; apps: Server }
// POST /dashboard/lookup → { key, exists, hash, appOrigin, mode }, exists === (hash !== null)
// src/shell/response.ts
export function lookupResponse(value: unknown): { key: string; exists: boolean; hash: string | null; appOrigin: string; mode: "normal" | "strict" }
```

Переменные окружения `startDashboard`:

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `DASHBOARD_HOST` | `127.0.0.1` | адрес обоих серверов |
| `DASHBOARD_PORT` | `8100` | API |
| `DASHBOARD_APP_PORT` | `8101` | хост приложений |
| `DASHBOARD_BUILDS` | `~/loginom-dashboard/builds` | каталог сборок |
| `DASHBOARD_APP_ORIGIN` | `http://dashboards.localhost:32769` | `<DASH>` и проверка `Host` хоста приложений |
| `DASHBOARD_CLIENT_ORIGINS` | `http://127.0.0.1:32768,http://localhost:32768` | `frame-ancestors`; если задана — и список `Host` API |
| `DASHBOARD_MODE` | `normal` | `normal` или `strict`, иначе ошибка запуска |
| `DASHBOARD_PROJECT_ROOT`, `DASHBOARD_ALLOW_CURRENT` | как в M1 | без изменений |

- [ ] **Step 1: Тесты хоста приложений.** Создать `test/web/apps.test.mjs`: `appHost` на `127.0.0.1:0` с `appOrigin: "http://dashboards.localhost:32769"`, временным `buildsRoot` и сборкой `builds/<"a"×64>/<"b"×64>/` (`index.html`, `assets/app.js`, `assets/app.css`, по файлу `svg png jpg webp woff2`, `assets/map.js.map`). Запросы — через `node:http` с явным `Host`, как в `server.test.mjs`. Проверки:
  - `GET /apps/<k>/<h>/` → 200, `text/html; charset=utf-8`, `Cache-Control: no-store`; каждый разрешённый тип → 200 с верным `Content-Type`, `public, max-age=31536000, immutable` и `Access-Control-Allow-Origin: *`;
  - каждый ответ ниже несёт **полный** набор заголовков — литеральные строки из плана изоляции в тесте, не вызов `appHeaders` — и `no-store`, а статус не 3xx и без `Location`: чужой `Host` → 403; `/`, `/apps/`, `/apps/<k>/<h>` без косой черты, `/apps/<k>/<h>/binding.json`, `/apps/<k>/<h>/sample.json`, `assets/map.js.map`, `assets/..`, `POST /apps/<k>/<h>/`, ключ в верхнем регистре → 404; `index.html` — символьная ссылка сама на себя (`ELOOP`) → 500;
  - символьная ссылка в `assets/` за пределы `<h>/` и каталог `<h>` — ссылка за пределы `builds` → 404;
  - `POST /_reports` с `Cookie: secret=1` и `Authorization: Bearer secret` → 204 с `Access-Control-Allow-Origin: *`, в `log` ровно одна строка с телом и без `secret`; `OPTIONS /_reports` → 204 с `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: POST`, `Access-Control-Allow-Headers: content-type`; тело 64 КиБ + 1 байт → 413, строк в `log` нет;
  - `connectionAllowlist: false` убирает только `Connection-Allowlist`.
- [ ] **Step 2: Тесты API.** В `server.test.mjs` заменить `publishRoot` на `buildsRoot` и передавать `appOrigin`, `mode`. Добавить:
  - `lookup` без сборки → `{key, exists: false, hash: null, appOrigin, mode: "normal"}`; с `builds/<key>/current` = `"<64 hex>\n"` → `exists: true` и этот `hash`; мусор в `current` → `hash: null`; `mode: "strict"` передаётся как есть;
  - `GET /dashboard/apps/<key>/` → 404 (тест «published dashboard keeps its metadata private» переписать так; прежние проверки MIME и выхода за каталог переходят в `apps.test.mjs`);
  - `sample: null` читает `builds/<key>/binding.json` и `sample.json` — прежние тесты с новым путём;
  - `startDashboard` возвращает `{api, apps}`, оба по умолчанию слушают loopback; тест Host переписать на `DASHBOARD_CLIENT_ORIGINS: "http://Example.test:32768, http://localhost:32768"` с прежними ожиданиями (разрешённый `Host` — 404 на `/dashboard/current`, чужой — 403); `DASHBOARD_MODE=fast` и origin с путём бросают ошибку.
- [ ] **Step 3: Убедиться, что тесты падают.**

```bash
cd packages/dashboard
"$LOGINOM_AI_AGENT_TEST_NODE" --test test/web/apps.test.mjs test/web/server.test.mjs
```

Expected: FAIL — `apps.ts` не найден, `lookup` без новых полей.
- [ ] **Step 4: Реализовать `apps.ts`.**

```ts
import { readFile, realpath } from "node:fs/promises"
import { createServer, type IncomingMessage } from "node:http"
import { extname, join, sep } from "node:path"

export type Mode = "normal" | "strict"

export function appHeaders(appOrigin: string, clientOrigins: string[], connectionAllowlist = true) {
  return {
    "content-security-policy":
      `default-src 'none'; script-src ${appOrigin}; style-src ${appOrigin}; img-src ${appOrigin} data: blob:; ` +
      `font-src ${appOrigin}; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; ` +
      `manifest-src 'none'; media-src 'none'; base-uri 'none'; form-action 'none'; ` +
      `frame-ancestors ${clientOrigins.join(" ")}; sandbox allow-scripts; report-to dashboard`,
    ...(connectionAllowlist && { "connection-allowlist": "(response-origin); report-to=dashboard" }),
    "permissions-policy":
      "camera=(), microphone=(), geolocation=(), clipboard-read=(), clipboard-write=(), display-capture=(), " +
      "fullscreen=(), payment=(), publickey-credentials-get=(), identity-credentials-get=(), usb=(), serial=(), hid=(), bluetooth=()",
    "x-dns-prefetch-control": "off",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "reporting-endpoints": `dashboard="${appOrigin}/_reports"`,
  }
}

const types: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
}

export function appHost(options: {
  buildsRoot: string
  appOrigin: string
  clientOrigins: string[]
  mode: Mode
  connectionAllowlist?: boolean
  log?: (line: string) => void
}) {
  const headers = appHeaders(options.appOrigin, options.clientOrigins, options.connectionAllowlist)
  const host = new URL(options.appOrigin).host
  const log = options.log ?? console.log
  return createServer(async (request, response) => {
    const send = (status: number, body: string | Buffer, extra: Record<string, string> = {}) => {
      response.writeHead(status, {
        ...headers,
        "cache-control": "no-store",
        "content-type": "text/plain; charset=utf-8",
        ...extra,
      })
      response.end(body)
    }
    try {
      if (request.headers.host?.toLowerCase() !== host) return send(403, "Forbidden host")
      const path = request.url!.split("?")[0]
      if (path === "/_reports" && request.method === "OPTIONS")
        return send(204, "", {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST",
          "access-control-allow-headers": "content-type",
        })
      if (path === "/_reports" && request.method === "POST") {
        const report = await limited(request, 64 * 1024)
        if (report === undefined) return send(413, "Report exceeds 64 KiB")
        // Request headers stay out of the log: same-site Studio cookies reach this host.
        log("dashboard report " + JSON.stringify(report))
        return send(204, "", { "access-control-allow-origin": "*" })
      }
      const app =
        request.method === "GET" &&
        path.match(/^\/apps\/([a-f0-9]{64})\/([a-f0-9]{64})\/(?:assets\/([\w-][\w.-]*))?$/)
      if (!app) return send(404, "Not found")
      const asset = app[3]
      const type = asset ? types[extname(asset)] : "text/html; charset=utf-8"
      const data = type && (await buildFile(options.buildsRoot, app[1]!, app[2]!, asset ? join("assets", asset) : "index.html"))
      if (!data) return send(404, "Not found")
      if (!asset) return send(200, data, { "content-type": type })
      return send(200, data, {
        "content-type": type,
        "cache-control": "public, max-age=31536000, immutable",
        "access-control-allow-origin": "*",
      })
    } catch {
      send(500, "Could not serve dashboard")
    }
  })
}

async function buildFile(root: string, key: string, hash: string, name: string) {
  try {
    const builds = await realpath(root)
    const dir = await realpath(join(builds, key, hash))
    const file = await realpath(join(dir, name))
    if (!dir.startsWith(builds + sep) || !file.startsWith(dir + sep)) return
    return await readFile(file)
  } catch (error) {
    if (error instanceof Error && "code" in error && ["ENOENT", "ENOTDIR", "EISDIR"].includes(String(error.code))) return
    throw error
  }
}

async function limited(request: IncomingMessage, max: number) {
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of request) {
    length += chunk.length
    if (length > max) return
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString()
}
```

- [ ] **Step 5: Изменить `server.ts`.** Удалить `serveApp`, `mime` и маршрут `/dashboard/apps/`. Переименовать `publishRoot` в `buildsRoot` (пример `sample: null` читается из `join(buildsRoot, key)`). `lookup`:

```ts
if (request.method === "POST" && path === "/dashboard/lookup") {
  const key = appKey(await body(request))
  const hash = await currentBuild(buildsRoot, key)
  return json(response, 200, { key, exists: hash !== null, hash, appOrigin, mode })
}

async function currentBuild(root: string, key: string) {
  try {
    const hash = (await readFile(join(root, key, "current"), "utf8")).trim()
    return /^[a-f0-9]{64}$/.test(hash) ? hash : null
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null
    throw error
  }
}
```

`startDashboard` читает таблицу переменных выше, проверяет каждый origin (`URL.parse(value)?.origin === value`, схема `http:` или `https:`), создаёт `dashboardServer` и `appHost` с одним `buildsRoot`, слушает оба порта и возвращает `{api, apps}`. `allowedHosts` берётся из `DASHBOARD_CLIENT_ORIGINS` (`new URL(origin).host`), только если переменная задана; иначе — loopback по умолчанию, как в M1. `server.ts` добавляет `export { appHeaders, appHost } from "./apps"`: `dist/server.mjs` — единственный собранный модуль, и браузерная фикстура (задача 5) и `check` (задача 10) импортируют обе функции оттуда.
- [ ] **Step 6: Схема и проверка оболочки.** В `src/contract/snapshot.ts`:

```ts
const Hash = Schema.String.check(Schema.makeFilter((value) => /^[a-f0-9]{64}$/.test(value)))
const HttpOrigin = Schema.String.check(
  Schema.makeFilter((value) => {
    const url = URL.parse(value)
    return url?.origin === value && (url.protocol === "http:" || url.protocol === "https:")
  }),
)
export const LookupResponse = Schema.Struct({
  key: Schema.String,
  exists: Schema.Boolean,
  hash: Schema.Union([Schema.Null, Hash]),
  appOrigin: HttpOrigin,
  mode: Schema.Literals(["normal", "strict"]),
})
```

`lookupResponse` в `src/shell/response.ts` проверяет те же поля вручную, без `effect`, и возвращает все пять. В `shell-contract.test.mjs` перебор пар заменить так: от верного ответа `{key: "k", exists: true, hash: "a"×64, appOrigin: "http://dashboards.localhost:32769", mode: "normal"}` менять по одному полю — на каждое значение общего набора `fields`, на отсутствие поля и на особые значения (`"A"×64`, `"a"×63`, `"g"×64`; `"http://h:1/"`, `"http://h:1/x"`, `"ftp://h"`, `"null"`, `"http://h:80"`; `"strict"`, `"Strict"`). Ожидание — как в M1: схема принимает, значит и `lookupResponse` возвращает то же; схема отвергает — `lookupResponse` бросает.
- [ ] **Step 7: Артефакт и браузерная фикстура.** `dist-smoke.test.mjs`: запуск с `DASHBOARD_APP_PORT`, `DASHBOARD_BUILDS`, `DASHBOARD_APP_ORIGIN=http://127.0.0.1:<порт приложений>` и `DASHBOARD_CLIENT_ORIGINS`; прежние POST → 201 и GET по ID; `GET /dashboard/apps/<k>/` → 404; `GET <appOrigin>/apps/<k>/<h>/` → 200 с заголовком `content-security-policy`. В `fixture.mjs` ответ `lookup` дополнить полями `hash: published ? "b".repeat(64) : null`, `appOrigin: origin`, `mode: "normal"`. В `package.json` в `test:coverage` после `test/web/server.test.mjs` добавить `test/web/apps.test.mjs`.
- [ ] **Step 8: Прогон.**

```bash
cd packages/dashboard
bun typecheck
bun run test          # build, web coverage ≥ 90% (server.ts и apps.ts), dist-smoke, shell-contract
bun run test:browser  # M1 behavior is unchanged
```

Expected: всё PASS; отчёт покрытия называет `src/web/apps.ts` и `src/web/server.ts`.
- [ ] **Step 9: Коммит.** `git commit -m "feat(dashboard): serve builds from the app host"` (файлы задачи).

### Task 3: `publish.mjs` пишет сборки по хешу

**Files:**
- Modify: `P/script/publish.mjs`, `P/package.json` (`test:browser`)
- Create: `P/test/publish/publish.test.mjs`

**Interfaces:**
- Consumes: `dashboardServer({projectRoot, buildsRoot, appOrigin, mode})` из задачи 2 как настоящий сервер снимков.
- Produces: `builds/<ключ>/<хеш>/`, `binding.json`, `sample.json`, `current` (хеш и перевод строки). Переменные `DASHBOARD_BASE` (по умолчанию `http://127.0.0.1:32768`), `DASHBOARD_APPS` (`<checkout>/dashboard/apps`), `DASHBOARD_BUILDS` (`~/loginom-dashboard/builds`).

- [ ] **Step 1: Тест.** Каждый тест поднимает `dashboardServer` из `src/web/server.ts` на `127.0.0.1:0` с `projectRoot` = временный каталог и создаёт снимок `POST /dashboard/targets` с примером строк. Приложение — каталог `<tmp>/dashboard/apps/<key>/` с `package.json` (`"typecheck": "node -e \"\""`, `"build": "node build.mjs"`) и `build.mjs`. Скрипт пишет `dist/index.html` и `dist/assets/app.js` из `src/text.txt` и завершается с кодом 1, если есть файл `src/fail`. Запуск — `spawnSync(process.execPath, [publish.mjs, id])` с тремя переменными и `PATH=<каталог process.execPath>:$PATH`, чтобы нашёлся `npm` закреплённого Node. Проверки:
  - первая публикация: код 0; `current` — 64 hex и перевод строки; `builds/<key>/<current>/` содержит те же файлы и байты, что `dist`; `binding.json` и `sample.json` равны данным снимка; во временных именах ничего не осталось (`.build-*`, `*.tmp`);
  - повтор без изменений: тот же `current`, каталогов хешей по-прежнему один;
  - изменённый `src/text.txt`: новый каталог, `current` указывает на него, прежний каталог на месте;
  - `src/fail`: код не 0, `current`, `binding.json` и набор каталогов прежние.
- [ ] **Step 2: Подключить тест к `test:browser`.** Скрипт — `"$LOGINOM_AI_AGENT_TEST_NODE" --test test/browser/*.test.mjs test/publish/*.test.mjs`: этот набор идёт в задаче CI `dashboard-browser`, где установлен `node_modules` шаблона.
- [ ] **Step 3: Убедиться, что тест падает.** `"$LOGINOM_AI_AGENT_TEST_NODE" --test test/publish/publish.test.mjs` → FAIL: снимок читается с жёсткого `127.0.0.1:32768`, далее `docker`.
- [ ] **Step 4: Реализация.** Адрес снимка — `process.env.DASHBOARD_BASE ?? "http://127.0.0.1:32768"`, каталог приложений — `process.env.DASHBOARD_APPS ?? <checkout>/dashboard/apps`; `--init` и проверки пути — как в M1. После `npm run typecheck` и `npm run build` весь блок `docker` заменить:

```js
if (snapshot.tableSource === "unavailable") throw Error("В снимке нет примера результата: выполните узел и откройте Dashboard заново")
const dist = join(sourceDir, "dist")
const files = (await readdir(dist, { recursive: true, withFileTypes: true }))
  .filter(entry => entry.isFile())
  .map(entry => relative(dist, join(entry.parentPath, entry.name)))
  .sort()
const sha = createHash("sha256")
for (const file of files) {
  const bytes = await readFile(join(dist, file))
  sha.update(file).update("\0").update(String(bytes.length)).update("\0").update(bytes)
}
const hash = sha.digest("hex")
const builds = process.env.DASHBOARD_BUILDS ?? join(homedir(), "loginom-dashboard/builds")
const keyDir = join(builds, snapshot.key)
await mkdir(keyDir, { recursive: true, mode: 0o700 })
const target = join(keyDir, hash)
if (!existsSync(target)) {
  const staging = await mkdtemp(join(keyDir, ".build-"))
  try {
    await cp(dist, staging, { recursive: true })
    // A concurrent publication of the same bytes may win the rename.
    await rename(staging, target).catch(error => { if (!existsSync(target)) throw error })
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}
const replace = async (name, text) => {
  const temp = join(keyDir, `.${name}.${process.pid}.tmp`)
  await writeFile(temp, text, { mode: 0o600 })
  await rename(temp, join(keyDir, name))
}
await replace("binding.json", JSON.stringify(snapshot.binding) + "\n")
await replace("sample.json", JSON.stringify({ schema: snapshot.schema, rows: snapshot.rows }) + "\n")
// Last: the open lookup switches only after the whole build and its metadata exist.
await replace("current", hash + "\n")
console.log(`Опубликовано: ${target}`)
```

- [ ] **Step 5: Прогон.** `"$LOGINOM_AI_AGENT_TEST_NODE" --test test/publish/publish.test.mjs` → PASS; `bun run test:browser` → PASS.
- [ ] **Step 6: Коммит.** `git commit -m "feat(dashboard): publish builds by content hash"`.

### Task 4: SDK v1, контракт `state` и шаблон

**Files:**
- Create: `P/src/sdk/loginom.ts`, `P/src/contract/protocol.ts`, `P/test/web/sdk.test.mjs`
- Modify: `P/script/build.ts`, `P/tsconfig.shell.json` (`include` + `src/sdk/**/*.ts`), `P/template/src/loginom.ts` (копия SDK), `P/template/src/main.tsx`, `P/src/web/server.ts` (текст `adapter`), `P/test/web/server.test.mjs`, `P/package.json` (`test`)

**Interfaces:**
- Produces: `onState(listener): () => void`, `close(): void`, `isState(value): boolean`, типы `DashboardState`, `DashboardTable`; схемы `StateMessage`, `DashboardTable` в `src/contract/protocol.ts`. Оболочка (задача 5) импортирует **только тип** `DashboardState`.

- [ ] **Step 1: Тест SDK.** `test/web/sdk.test.mjs`:
  - соответствие: от верного `state` (`type`, `parameters` с одним `{name, value}`, `table` со `schema`, `rows`, `truncated`, `totalRows`, `error: null`, `busy: false`) менять по одному полю, включая вложенные, на значения `[undefined, null, false, true, 0, NaN, 17, "", "x", [], {}, [1]]`, на отсутствие поля и на лишнее поле. Ожидание: `isState(x) === Option.isSome(Schema.decodeUnknownOption(StateMessage, { onExcessProperty: "error" })(x))`, а строка короче `schema` отвергается обоими;
  - `template/src/loginom.ts` побайтно равен `src/sdk/loginom.ts` (примеры добавит задача 9).
- [ ] **Step 2: Тест падает.** `"$LOGINOM_AI_AGENT_TEST_NODE" --test test/web/sdk.test.mjs` → FAIL: модуля нет.
- [ ] **Step 3: Контракт.** `src/contract/protocol.ts`:

```ts
import { Schema } from "effect"
import { Column, Scalar } from "./snapshot.ts"

export const DashboardTable = Schema.Struct({
  schema: Schema.Array(Column),
  rows: Schema.Array(Schema.Array(Scalar)),
  truncated: Schema.Boolean,
  totalRows: Schema.Number,
}).check(Schema.makeFilter((table) => table.rows.every((row) => row.length === table.schema.length)))

export const StateMessage = Schema.Struct({
  type: Schema.Literal("state"),
  parameters: Schema.Array(Schema.Struct({ name: Schema.String, value: Schema.Union([Schema.Null, Schema.Number]) })),
  table: Schema.Union([Schema.Null, DashboardTable]),
  error: Schema.Union([Schema.Null, Schema.String]),
  busy: Schema.Boolean,
})
```

- [ ] **Step 4: SDK.** `src/sdk/loginom.ts` — один файл без зависимостей. Если тест соответствия покажет расхождение по `NaN`, привести SDK к схеме.

```ts
export type DashboardTable = {
  schema: { name: string; type: number | string }[]
  rows: (string | number | boolean | null)[][]
  truncated: boolean
  totalRows: number
}
export type DashboardState = {
  parameters: { name: string; value: number | null }[]
  table: DashboardTable | null
  error: string | null
  busy: boolean
}

const listeners = new Set<(state: DashboardState) => void>()
let last: DashboardState | undefined

export function onState(listener: (state: DashboardState) => void) {
  listeners.add(listener)
  if (last) listener(last)
  return () => {
    listeners.delete(listener)
  }
}

export function close() {
  parent.postMessage({ type: "loginom-dashboard/close", version: 1 }, "*")
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
const exact = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
const cell = (value: unknown) => value === null || ["string", "number", "boolean"].includes(typeof value)

export function isState(value: unknown): value is DashboardState & { type: "state" } {
  if (!record(value) || !exact(value, ["type", "parameters", "table", "error", "busy"]) || value.type !== "state") return false
  if (typeof value.busy !== "boolean" || (value.error !== null && typeof value.error !== "string")) return false
  const parameters = value.parameters
  if (
    !Array.isArray(parameters) ||
    !parameters.every(
      (p) => record(p) && exact(p, ["name", "value"]) && typeof p.name === "string" && (p.value === null || typeof p.value === "number"),
    )
  )
    return false
  const table = value.table
  if (table === null) return true
  if (!record(table) || !exact(table, ["schema", "rows", "truncated", "totalRows"])) return false
  if (typeof table.truncated !== "boolean" || typeof table.totalRows !== "number") return false
  const schema = table.schema
  const rows = table.rows
  return (
    Array.isArray(schema) &&
    schema.every((c) => record(c) && exact(c, ["name", "type"]) && typeof c.name === "string" && ["number", "string"].includes(typeof c.type)) &&
    Array.isArray(rows) &&
    rows.every((row) => Array.isArray(row) && row.length === schema.length && row.every(cell))
  )
}

// Node imports this file for the contract test; only a browser connects.
if (typeof window === "object") {
  let port: MessagePort | undefined
  addEventListener("message", (event) => {
    const data: unknown = event.data
    if (port || event.source !== parent || event.ports.length !== 1) return
    if (!record(data) || !exact(data, ["type", "version"]) || data.type !== "loginom-dashboard/init" || data.version !== 1) return
    port = event.ports[0]!
    port.onmessage = (message) => {
      if (!isState(message.data)) return console.warn("Loginom dashboard: invalid state ignored")
      const state = message.data
      last = { parameters: state.parameters, table: state.table, error: state.error, busy: state.busy }
      listeners.forEach((listener) => listener(last!))
    }
  })
  addEventListener("keydown", (event) => {
    if (event.key === "Escape") close()
  })
  parent.postMessage({ type: "loginom-dashboard/ready", version: 1 }, "*")
}
```

- [ ] **Step 5: Копия и шаблон.** В конце `script/build.ts`:

```ts
await Bun.write(join(import.meta.dirname, "../template/src/loginom.ts"), Bun.file(join(import.meta.dirname, "../src/sdk/loginom.ts")))
```

`template/src/main.tsx`:

```tsx
import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { onState, type DashboardState } from "./loginom"

function App() {
  const [state, setState] = useState<DashboardState>()
  useEffect(() => onState(setState), [])
  if (window.parent === window) return <p role="status">Откройте dashboard кнопкой Dashboard в Studio</p>
  if (!state || state.busy) return <p role="status">Идёт расчёт</p>
  if (state.error) return <p role="alert">{state.error}</p>
  if (!state.table || state.table.rows.length === 0) return <p role="status">Нет данных</p>
  return (
    <p role="status">
      Строк в результате: {state.table.rows.length}
      {state.table.truncated && ` из ${state.table.totalRows}: показана часть`}
    </p>
  )
}

createRoot(document.getElementById("root")!).render(<App />)
```

- [ ] **Step 6: Текст `adapter` в снимке.** Заменить строку в `server.ts` описанием SDK v1, в тесте снимка проверить, что текст содержит `onState` и не содержит `frameElement`:

```
SDK v1: import { onState, close, type DashboardState } from "./loginom". onState(listener) calls listener with {parameters: {name, value: number|null}[], table: {schema: {name, type}[], rows, truncated: boolean, totalRows: number}|null, error: string|null, busy: boolean} and returns an unsubscribe function; a late subscriber immediately receives the last state. close() closes the dashboard; Escape calls it automatically. The app only displays data: parameters are edited in the trusted Loginom header above the iframe, so add no inputs, no «Выполнить» button and no requests — the sandbox has no network, storage, forms or popups. Show «Идёт расчёт» while busy, the error text, an empty table as a successful result, and a note when truncated. Show parameter values as text, for example «Расчёт при пороге MinBudget = 10 000». Snapshot rows are examples: never embed them in code. Use the installed React/TypeScript/Vite/Recharts template. For ROI use two decimal places and — for an undefined ratio.
```

- [ ] **Step 7: Прогон.** В `package.json` добавить `test/web/sdk.test.mjs` в список Node-тестов скрипта `test`.

```bash
cd packages/dashboard
bun run build        # copies the SDK into the template; sdk.test.mjs compares the copy
bun typecheck
bun run test
(cd template && npm run typecheck && npm run build)
```

Expected: всё PASS; шаблон собирается. Браузерное поведение шаблона проверит задача 5.
- [ ] **Step 8: Коммит.** `git commit -m "feat(dashboard): add SDK v1 and template"`.

### Task 5: Оболочка: шапка, песочница и протокол

**Files:**
- Create: `P/src/shell/frame.ts`, `P/test/browser/apps/recorder/index.html`, `P/test/browser/apps/recorder/assets/recorder.js`, `P/test/browser/apps/silent/index.html`
- Modify: `P/src/shell/index.ts`, `P/src/shell/loginom/parameters.ts`, `P/src/shell/loginom/types.ts`, `P/src/shell/loginom/adapter.ts`, `P/test/browser/fixture.mjs`, `P/test/browser/shell.test.mjs`, `P/test/browser/parameter.test.mjs`, `P/script/check-size.ts`

**Interfaces:**
- Consumes: `appHost` из `dist/server.mjs` (задача 2); тип `DashboardState` (задача 4); `deploy/studio.csp` (задача 1).
- Produces:

```ts
// src/shell/frame.ts
export const ALLOW: string // the allow attribute from the isolation plan, verbatim
export function isMessage(data: unknown, type: string): boolean // exactly {type, version: 1}
export function sandboxFrame(src: string): HTMLIFrameElement
export function mountDashboard(
  frame: HTMLIFrameElement,
  handlers: { close(): void; silent(): void },
): { send(state: DashboardState & { type: "state" }): void; stop(reason?: string): void }
// src/shell/loginom/parameters.ts → { name: string; value: number | null; integer: boolean }[]
// src/shell/loginom/adapter.ts: table(node, maxRows = Infinity) → { schema, rows, truncated: rows.length < totalRows, totalRows }
```

Фикстура (её используют задачи 6–9) экспортирует `fixture(t, options)` с новыми параметрами `app` (`"recorder"`, `"silent"`, `"malicious"` или абсолютный путь к собранному `dist`), `mode`, `lookupMode`, `connectionAllowlist`, `table` (`{schema, rows}` для узла) и возвращает дополнительно `appOrigin`, `frame()` (Playwright `Frame` iframe dashboard), `states()` (записанные `state`), `settled(count)` (ждёт `state` номер `count + 1` с `busy: false` и возвращает его), `reports` (строки `log` хоста приложений), `clientHits()` (запросы к origin Studio из фрейма dashboard).

- [ ] **Step 1: Фикстура.** В `fixture.mjs`:
  - хост приложений — настоящий `appHost` из `../../dist/server.mjs` на заранее выбранном свободном порту, `appOrigin = http://dashboards.localhost:<порт>`, `clientOrigins: [origin]` (адрес тестовой Studio), `log` пишет в `reports`, временный `buildsRoot` со сборкой `builds/<"a"×64>/<"b"×64>/` из выбранного `app`. Для `recorder` SDK собирается один раз на процесс: `execFileSync("bun", ["build", "src/sdk/loginom.ts", "--target=browser", "--format=esm"])` → `assets/loginom.js`;
  - `context.route` перехватывает **только** origin Studio (`origin + "/**"`): запросы к хосту приложений и к другим адресам Playwright не трогает. Ответ `/app/` несёт `content-security-policy` — `deploy/studio.csp` с `<DASH>` = `appOrigin`. Запрос из фрейма, отличного от `page.mainFrame()`, увеличивает `clientHits`;
  - узел фикстуры берёт колонки из `window.fixture.columns` (по умолчанию `[{name: "count", type: 1}]`), строки — из `window.fixture.rows`;
  - `context.addInitScript` дополнительно считает `MessageChannel` (`window.channels`) и собирает события `securitypolicyviolation` в `window.violations` во всех фреймах.

  Тестовые приложения:

```html
<!-- test/browser/apps/recorder/index.html -->
<!doctype html><meta charset="utf-8"><title>Recorder</title><script type="module" src="assets/recorder.js"></script>
```

```js
// test/browser/apps/recorder/assets/recorder.js
import { onState } from "./loginom.js"
window.states = []
onState((state) => window.states.push(state))
window.late = () => {
  let first
  onState((state) => { first ??= state })()
  return first
}
```

`silent/index.html` — `<!doctype html><title>Silent</title>` без скриптов.
- [ ] **Step 2: Новые проверки и перенос M1.** Каждая проверка M1 через `frame.dashboard` или `contentDocument` переписывается на поле шапки или `states()`; старая проверка удаляется только в этом же шаге, когда новая написана.

| Тест M1 | Как проверяется в M2 |
|---|---|
| Desktop chat, unload guard, раскладка шапки | без изменений; кнопок в шапке по-прежнему две, высота шапки в прежних пределах (поля — компактные, правится стиль, не тест) |
| executes an inactive node before loading its iframe | `states()[0].table` равен таблице фикстуры, `error: null`, `fixture.calls` = 1 |
| reopening retries a saved error | ошибка вызывается вводом `MinBudget` = 5 в шапке при `executeError`: последний `state` — `error`, `table: null`; повторное открытие показывает ошибку без iframe; после снятия ошибки — данные, `calls` = 3 |
| active and empty results | `states()[0].table.rows` — `[[42]]`, затем `[]`; `calls` = 0 |
| closing during a parameter calculation | ввод 17 при `wait`, закрытие, повторное открытие ждёт без второго расчёта; первый `state` — `MinBudget` = 17 |
| initial calculation error stays visible | без изменений, кроме чтения `states()` |
| creation calculates its sample | `snapshots[0].sample` равен `{schema, rows}` без `truncated` и `totalRows`; параметры снимка без признака `integer` |
| queued submissions finish in order | ввод 17 и 29 подряд, закрытие, `writes` = `[17, 29]`; при новом открытии `MinBudget` = 29 |
| Escape closes the dashboard | `frame().press("body", "Escape")` закрывает dashboard (SDK шлёт `close`); Esc в шапке тоже закрывает |
| parameter.test: active read without operation | параметры первого `state` — `Budget` 12.5, `Count` 3, `Unset` null; операций нет |
| inactive read, cancelled operation | то же с `begin` и `end` с `cancel: true`; значения не изменились |
| writes a finite value and commits | ввод `Budget` = 17.25 и Enter: `writes`, `begin` и `end` с `cancel: false`, в последнем `state` `Budget` = 17.25 |
| rejects a fractional integer | шапка: `Count` = 1.5 → `validationMessage` поля «Недопустимое значение параметра», операций нет. Защита адаптера: после открытия фикстура меняет тип `Budget` на целый, ввод `Budget` = 1.5 → `state` с ошибкой «Значение не соответствует числовому типу переменной Budget», `begin` и `end` с `cancel: true` |
| rejects a disappeared variable | переменная удаляется после открытия, ввод `Budget` = 5 → ошибка «Числовая переменная не найдена: Budget», `cancel: true` |
| closes the operation when an RPC fails | `rpcError` после открытия, ввод значения → последний `state` с текстом «Fixture RPC failed after begin», `busy: false`; у каждого `begin` есть `end` с `cancel: true`; значения не изменились |
| rejects a non-finite float | ввод `1e999` в шапке → поле отклонено, операций нет |
| missing API, malformed responses, ROI binding, login order | без изменений |

Новые проверки в `shell.test.mjs`:
  - iframe: `sandbox` = `allow-scripts`, `referrerpolicy` = `no-referrer`, `allow` = `ALLOW`, `src` = `<appOrigin>/apps/<"a"×64>/<"b"×64>/`;
  - `state` доходит: `states()[0]` — `{type: "state", parameters: [{name: "MinBudget", value: 0}], table: {schema, rows: [[42]], truncated: false, totalRows: 1}, error: null, busy: false}`; `frame().evaluate(() => late())` возвращает тот же `state`;
  - изменение в шапке: `MinBudget` = 10 и Enter → следующий `state` с `busy: true` и прежней таблицей, затем `busy: false`; `writes` = `[10]`; то же значение уходом из поля (`blur`);
  - шапка выводит имя узла, путь пакета и подпись поля только через `textContent`: имя переменной `<img src=x onerror=alert(1)>` видно как текст, диалогов нет;
  - `silent`: через 10 секунд вместо iframe текст «Dashboard не ответил» (ожидание до 12 секунд);
  - шаблон: собрать `template` во временный каталог (`npm run build -- --outDir <tmp> --emptyOutDir` с `PATH` закреплённого Node) и открыть как `app`. Видны «Идёт расчёт» (при `wait`), текст ошибки, «Нет данных», «Строк в результате: 1»; адрес сборки, открытый во вкладке, — «Откройте dashboard кнопкой Dashboard в Studio».
- [ ] **Step 3: Тесты падают.** `bun run build && "$LOGINOM_AI_AGENT_TEST_NODE" --test test/browser/shell.test.mjs test/browser/parameter.test.mjs` → FAIL: iframe не в песочнице, `states()` пуст.
- [ ] **Step 4: `frame.ts`.**

```ts
import type { DashboardState } from "../sdk/loginom"

export const ALLOW =
  "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; " +
  "display-capture 'none'; fullscreen 'none'; payment 'none'; publickey-credentials-get 'none'; " +
  "identity-credentials-get 'none'; usb 'none'; serial 'none'; hid 'none'; bluetooth 'none'"

export function isMessage(data: unknown, type: string) {
  if (typeof data !== "object" || data === null || Object.keys(data).length !== 2) return false
  const message = data as Record<string, unknown>
  return message.type === type && message.version === 1
}

export function sandboxFrame(src: string) {
  const frame = document.createElement("iframe")
  frame.setAttribute("sandbox", "allow-scripts")
  frame.referrerPolicy = "no-referrer"
  frame.allow = ALLOW
  frame.src = src
  return frame
}

export function mountDashboard(frame: HTMLIFrameElement, handlers: { close(): void; silent(): void }) {
  let port: MessagePort | undefined
  let last: (DashboardState & { type: "state" }) | undefined
  let loads = 0
  let count = 0
  let since = 0
  const timer = setTimeout(() => {
    stop()
    handlers.silent()
  }, 10_000)
  function stop(reason?: string) {
    if (reason) console.warn("Dashboard closed: " + reason)
    clearTimeout(timer)
    removeEventListener("message", listen)
    port?.close()
  }
  const close = (reason?: string) => {
    stop(reason)
    handlers.close()
  }
  function listen(event: MessageEvent) {
    if (event.source !== frame.contentWindow) return
    const now = performance.now()
    if (now - since > 1000) {
      since = now
      count = 0
    }
    if (++count > 50) return close("message flood")
    if (isMessage(event.data, "loginom-dashboard/close")) return close()
    if (!isMessage(event.data, "loginom-dashboard/ready")) return
    if (port) return close("second ready")
    clearTimeout(timer)
    const channel = new MessageChannel()
    port = channel.port1
    frame.contentWindow!.postMessage({ type: "loginom-dashboard/init", version: 1 }, "*", [channel.port2])
    if (last) port.postMessage(last)
  }
  // The first load may come before or after the first ready; any later document is foreign.
  frame.addEventListener("load", () => {
    if (++loads > 1) close("frame navigated")
  })
  addEventListener("message", listen)
  return {
    send(state: DashboardState & { type: "state" }) {
      last = state
      port?.postMessage(state)
    },
    stop,
  }
}
```

- [ ] **Step 5: `index.ts`, параметры и таблица.**
  - `parameters.ts` добавляет к строке `integer: type === studio.bg.TBGDataType.dtInteger`; проверка записи остаётся. `types.ts`: удалить `State`, `Dashboard`, `Frame`; `Parameters` — `{name: string; value: number | null; integer: boolean}[]`.
  - `adapter.table(node, maxRows = Infinity)` читает `totalRows = await source.get_RowCount()` и возвращает `{schema, rows, truncated: rows.length < totalRows, totalRows}`. Пример для снимка отправляется как `{schema, rows}`.
  - Порядок `open()`: `lookup` → (строгий режим — задача 8) → выполнение неактивного узла или повтор ошибки, как в M1 → `parameters()` → снимок, параметры без `integer` → при `hash === null` путь «Создать dashboard», как в M1 → иначе шапка, начальный `state` и iframe `sandboxFrame(appOrigin + "/apps/" + key + "/" + hash + "/")` (`src` до вставки в DOM). Подпись кнопки и `action` ссылки Desktop определяются по `hash`.
  - Шапка: заголовок — имя узла, рядом путь пакета (`binding.packagePath`), поля, «Изменить в чате», «Вернуться к сценарию». Поле переменной:

```ts
const label = document.createElement("label")
label.textContent = parameter.name + " "
const input = document.createElement("input")
input.type = "number"
input.step = "any"
input.value = parameter.value === null ? "" : String(parameter.value)
input.style.cssText = "width:8em;padding:4px"
// change fires on Enter and on leaving a modified field.
input.onchange = () => {
  const value = input.valueAsNumber
  const valid = Number.isFinite(value) && (!parameter.integer || Number.isSafeInteger(value))
  input.setCustomValidity(valid ? "" : "Недопустимое значение параметра")
  if (!valid) return input.reportValidity()
  run({ name: parameter.name, value })
}
label.append(input)
```

  - Очередь — как в M1, без ответа приложению:

```ts
const state = async () => {
  const params = await parameters()
  const error = errors.get(lookup.key) ?? null
  return {
    type: "state" as const,
    parameters: params.map((parameter) => ({ name: parameter.name, value: parameter.value })),
    table: !error && (await studio.active(node)) ? await studio.table(node) : null,
    error,
    busy: false,
  }
}
let current = await state()
const run = (update: Update) => {
  busy++
  const task = pending.then(async () => {
    dashboard.send({ ...current, busy: true })
    try {
      await studio.parameters(form, update)
      await studio.execute(node)
      errors.delete(lookup.key)
    } catch (e: unknown) {
      errors.set(lookup.key, message(e))
    }
    current = await state().catch((e: unknown) => ({ type: "state" as const, parameters: [], table: null, error: message(e), busy: false }))
    dashboard.send(current)
  })
  pending = task.then(finish, finish)
}
```

  `dashboard` — результат `mountDashboard(frame, { close, silent: () => frame.replaceWith(note("Dashboard не ответил")) })`, где `note` создаёт `<p role="status">`. После закрытия `send` ничего не доставляет, а очередь доходит до конца, как в M1. `close()` overlay вызывает `dashboard.stop()`.
  - Удалить `frame.dashboard`, `change`, `run` для приложения, заплатку `MinBudget >= 0` и подписку на `contentDocument`.
- [ ] **Step 6: Прогон.**

```bash
cd packages/dashboard
bun typecheck
bun run build
"$LOGINOM_AI_AGENT_TEST_NODE" --test test/browser/shell.test.mjs test/browser/parameter.test.mjs
```

Expected: PASS; `rg -n "frameElement|contentDocument|MinBudget" src/shell` ничего не находит.
- [ ] **Step 7: Размер.** `bun run check:size` покажет новый размер. В `check-size.ts` записать замер M2 и предел с запасом около 2,5%, как в M1; комментарий — база M1 9 474 байта и замер M2. Задачи 6 и 8 обновляют замер.
- [ ] **Step 8: Коммит.** `bun run test:browser` → PASS; `git commit -m "feat(dashboard): open dashboards in a sandboxed frame"`.

### Task 6: Лимиты таблицы

**Files:**
- Modify: `P/src/shell/loginom/adapter.ts`, `P/test/browser/shell.test.mjs`, `P/script/check-size.ts`

**Interfaces:**
- Produces: `table(node, maxRows = 10_000)` → `{schema, rows, truncated, totalRows}` с пределами ниже.

- [ ] **Step 1: Тесты.** В `shell.test.mjs`:
  - 10 001 строка → в `state` 10 000 строк, `truncated: true`, `totalRows: 10 001`;
  - ячейка из 10 001 символа → 10 000 символов и `truncated: true`, `totalRows` = числу строк;
  - 600 строк с ячейкой по 10 000 символов → строк меньше 600, суммарная длина `JSON.stringify` строк ≤ 5 000 000, `truncated: true`, `totalRows: 600`;
  - шаблон при 10 001 строке показывает «Строк в результате: 10000 из 10001: показана часть».
- [ ] **Step 2: Тесты падают.** `bun run build && "$LOGINOM_AI_AGENT_TEST_NODE" --test test/browser/shell.test.mjs` → FAIL.
- [ ] **Step 3: Реализация** в цикле чтения `table`:

```ts
// Limits from the isolation plan; refine them on real nodes.
const limits = { rows: 10_000, cell: 10_000, json: 5_000_000 }
async function table(node: Node, maxRows = limits.rows) {
  // ...schema as before
  const totalRows = await source.get_RowCount()
  const rows: (string | number | boolean | null)[][] = []
  let truncated = totalRows > maxRows
  let size = 0
  for (let r = 0, n = Math.min(totalRows, maxRows); r < n; r++) {
    const row: (string | number | boolean | null)[] = []
    // ...cells as before; for a string cell:
    // if (text.length > limits.cell) { text = text.slice(0, limits.cell); truncated = true }
    const length = JSON.stringify(row).length
    if (size + length > limits.json) {
      truncated = true
      break
    }
    size += length
    rows.push(row)
  }
  return { schema, rows, truncated, totalRows }
}
```

- [ ] **Step 4: Прогон и размер.** `bun run build && bun run check:size && bun run test:browser` → PASS; обновить замер в `check-size.ts`.
- [ ] **Step 5: Коммит.** `git commit -m "feat(dashboard): limit dashboard tables"`.

### Task 7: Набор вредоносных dashboard

**Files:**
- Create: `P/test/browser/apps/malicious/index.html`, `P/test/browser/apps/malicious/assets/attack.js`, `P/test/browser/isolation.test.mjs`
- Modify: `P/test/browser/fixture.mjs` (сервер-злоумышленник; при `app: "malicious"` рядом публикуется `recorder` по адресу `<"c"×64>/<"b"×64>/`), `docs/security/dashboard-isolation.md` («Проверки»: `dns-prefetch` вне автотестов, итог по `preconnect`)

**Interfaces:**
- Consumes: фикстура задачи 5 (`app: "malicious"`, `connectionAllowlist`, `clientHits`, `frame()`, `window.channels`).
- Produces: `attacker(t)` в `fixture.mjs` → `{origin, connections(), requests()}`: HTTP-сервер на `127.0.0.1:0` с адресом `http://attacker.localhost:<порт>`, считает события `connection` и запросы, отдаёт `/embed?src=<url>` — страницу с `<iframe src=url>`.

- [ ] **Step 1: Вредоносное приложение.** `index.html` подключает классический скрипт `assets/attack.js`. Скрипт сам проходит рукопожатие: шлёт `ready`, принимает порт от `parent` и записывает в `window.port` всё, что пришло. Он также определяет `window.attacks` — функции `(target) => Promise<string>`, которые возвращают `"blocked"` или описание утечки:
  - `parent`: `window.parent.document`; `bg`: `parent.bg`; `frameElement`: `window.frameElement`;
  - `credentials`: `navigator.credentials.get({password: true})`; `storage`: `localStorage`; `cookie`: `document.cookie`;
  - `fetch`, `beacon` (`navigator.sendBeacon`), `websocket` (`ws://` к цели), `image` (картинка-маяк) — к цели;
  - `webrtc`: `new RTCPeerConnection({iceServers: [{urls: "stun:" + host цели}]})`, канал данных, `createOffer` и `setLocalDescription`;
  - `preconnect`: `<link rel="preconnect" href=цель>` в `head`;
  - `navigate`: `location.href = цель`; `top`: `top.location = цель`; `open`: `window.open(цель)`; `form`: POST-форма на цель и `submit()`; `modal`: `alert("x")` и `prompt("x")`;
  - `sibling`: `location.href = <appOrigin>/apps/<"c"×64>/<"b"×64>/` — сборка `recorder`, опубликованная рядом;
  - протокол: `forgedState` (`parent.postMessage({type: "state", parameters: [{name: "MinBudget", value: 1}], table: null, error: null, busy: false}, "*")`), `secondReady`, `flood` (60 сообщений), `huge` (строка в 20 000 000 символов), `uncloneable` (`parent.postMessage({f() {}}, "*")` — ожидается `DataCloneError`).
- [ ] **Step 2: Тесты.** `isolation.test.mjs` идёт дважды: `for (const connectionAllowlist of [true, false])`. Для каждой попытки dashboard открывается заново, попытка запускается через `frame().evaluate`, затем тест ждёт 1 секунду. Общие ожидания: `"blocked"` (или `DataCloneError`), `attacker.connections() === 0`, `clientHits() === 0`, `fixture.writes` пуст, `fixture.calls` не изменился, `dialogs` пуст, нет всплывающих окон, URL страницы прежний. Особые случаи:
  - целью сетевых попыток служат и сервер-злоумышленник, и origin Studio;
  - `webrtc` и `preconnect` — только в прогоне с заголовком. Во втором прогоне `preconnect` — положительный контроль: в течение 5 секунд `attacker.connections() > 0`. Если Chromium 154 соединения не открывает, по правилу дизайна проверка `preconnect` убирается из автотеста, а в «Проверки» плана изоляции добавляется запись;
  - `navigate`, `sibling`, `secondReady`, `flood`: dashboard закрыт или фрейм не ушёл с адреса, `window.channels === 1` — порт получил только первый документ;
  - `forgedState`, `huge`, `uncloneable`, а также `close` и `ready` из главного окна страницы (чужой источник): параметры не изменились, узел не запускался, dashboard в лучшем случае закрыт;
  - адрес сборки во вкладке: `document.cookie` бросает исключение, `origin === "null"`;
  - `<attacker>/embed?src=<адрес сборки>`: дочерний фрейм не содержит приложения — его `location.href` начинается с `chrome-error://`;
  - `dns-prefetch` автотестом не проверяется (дизайн, раздел «Проверки»).
- [ ] **Step 3: Прогон.** `bun run build && "$LOGINOM_AI_AGENT_TEST_NODE" --test test/browser/isolation.test.mjs`. Ожидается PASS. Если тест выявил дыру, её чинят в оболочке или в заголовках с тестом, а не ослабляют ожидание. Исключение — правило `preconnect` выше.
- [ ] **Step 4: План изоляции.** В разделе «Проверки» записать: `dns-prefetch` вне автотестов, потому что Chromium сам разрешает `*.localhost` и запрос к DNS снаружи не виден, а канал закрывают `Connection-Allowlist` и `X-DNS-Prefetch-Control: off`. Записать и итог по `preconnect`. В M2 не входят пункты про сборку и publisher — это M4.
- [ ] **Step 5: Коммит.** `git commit -m "test(dashboard): cover malicious dashboards"`.

### Task 8: Строгий режим

**Files:**
- Create: `P/src/shell/probe.ts`, `P/test/browser/strict.test.mjs`
- Modify: `P/src/web/apps.ts`, `P/test/web/apps.test.mjs`, `P/src/shell/index.ts`, `P/script/check-size.ts`

**Interfaces:**
- Consumes: `isMessage`, `sandboxFrame` (задача 5); `mode` из `lookup` (задача 2).
- Produces: `GET /_probe/` и `GET /_probe/probe.js` только при `mode: "strict"`; `probe(appOrigin: string, container: HTMLElement): Promise<boolean | null>` (`null` — нет ответа за 5 секунд).

- [ ] **Step 1: Тесты web.** В `apps.test.mjs`: в обычном режиме `/_probe/` и `/_probe/probe.js` → 404 с полным набором заголовков; в строгом → 200, `text/html; charset=utf-8` и `text/javascript; charset=utf-8`, `no-store`, полный набор.
- [ ] **Step 2: Тесты браузера.** `strict.test.mjs` (фикстура с `lookupMode: "strict"`):
  - хост приложений в строгом режиме с заголовком: dashboard открывается, узел выполнен, снимок отправлен;
  - `connectionAllowlist: false`: текст «Dashboard открывается в Chrome, Edge или Яндекс Браузере на Chromium 152 и новее», `calls` = 0 при неактивном узле, `snapshots.length` = 0; повторное открытие даёт тот же отказ без нового запроса `/_probe/` (`context.on("request")`);
  - хост приложений в обычном режиме (на `/_probe/` — 404, ответа нет): через 5 секунд текст «Хост dashboard недоступен»; повторное открытие снова запрашивает `/_probe/`;
  - без опубликованной сборки (`hash: null`) путь «Создать dashboard» доходит до ссылки Desktop без запроса `/_probe/`.
- [ ] **Step 3: Тесты падают.** `bun run build && "$LOGINOM_AI_AGENT_TEST_NODE" --test test/web/apps.test.mjs test/browser/strict.test.mjs` → FAIL.
- [ ] **Step 4: Проба на хосте приложений.** В `appHost` до разбора `/apps/`:

```ts
if (options.mode === "strict" && request.method === "GET" && path === "/_probe/")
  return send(200, '<!doctype html><meta charset="utf-8"><script src="probe.js"></script>', { "content-type": "text/html; charset=utf-8" })
if (options.mode === "strict" && request.method === "GET" && path === "/_probe/probe.js")
  return send(200, probeScript, { "content-type": "text/javascript; charset=utf-8" })
```

```ts
// ok: true means the constructor threw, so the browser enforces Connection-Allowlist.
const probeScript = `let answered = false
addEventListener("message", (event) => {
  const data = event.data
  if (answered || event.source !== parent || event.ports.length !== 1 || typeof data !== "object" || data === null ||
      Object.keys(data).length !== 2 || data.type !== "loginom-dashboard/init" || data.version !== 1) return
  answered = true
  let ok = false
  try { new RTCPeerConnection().close() } catch { ok = true }
  event.ports[0].postMessage({ type: "probe", ok })
})
parent.postMessage({ type: "loginom-dashboard/ready", version: 1 }, "*")
`
```

- [ ] **Step 5: Проба в оболочке.** `src/shell/probe.ts`:

```ts
import { isMessage, sandboxFrame } from "./frame"

export function probe(appOrigin: string, container: HTMLElement) {
  return new Promise<boolean | null>((resolve) => {
    const frame = sandboxFrame(appOrigin + "/_probe/")
    frame.hidden = true
    const done = (result: boolean | null) => {
      clearTimeout(timer)
      removeEventListener("message", listen)
      frame.remove()
      resolve(result)
    }
    const timer = setTimeout(() => done(null), 5_000)
    function listen(event: MessageEvent) {
      if (event.source !== frame.contentWindow || !isMessage(event.data, "loginom-dashboard/ready")) return
      removeEventListener("message", listen)
      const channel = new MessageChannel()
      channel.port1.onmessage = (answer) => {
        const data: unknown = answer.data
        if (typeof data !== "object" || data === null || Object.keys(data).length !== 2) return
        const reply = data as Record<string, unknown>
        if (reply.type === "probe" && typeof reply.ok === "boolean") done(reply.ok)
      }
      frame.contentWindow!.postMessage({ type: "loginom-dashboard/init", version: 1 }, "*", [channel.port2])
    }
    addEventListener("message", listen)
    container.append(frame)
  })
}
```

В `index.ts` результат хранится до перезагрузки страницы, `null` не запоминается. Проверка — сразу после `lookup`, до выполнения узла и снимка:

```ts
let supported: boolean | undefined
// ...in open(), after lookup:
if (lookup.mode === "strict" && lookup.hash !== null) {
  const result = supported ?? (await probe(lookup.appOrigin, document.body))
  if (result !== null) supported = result
  if (overlay !== section) return
  if (result === null) return void (note.textContent = "Хост dashboard недоступен")
  if (!result) return void (note.textContent = "Dashboard открывается в Chrome, Edge или Яндекс Браузере на Chromium 152 и новее")
}
```

- [ ] **Step 6: Прогон.** `bun typecheck && bun run test && bun run build && bun run check:size && bun run test:browser` → PASS; обновить замер в `check-size.ts`.
- [ ] **Step 7: Коммит.** `git commit -m "feat(dashboard): add strict browser mode"`.

### Task 9: Примеры на SDK v1 и S5

**Files:**
- Modify: `dashboard/apps/{f42521cd…,4760e202…,c597ab9c…}/src/loginom.ts` (копия SDK), их `src/main.tsx` (и `style.css`, если стили полей больше не нужны), `P/test/web/sdk.test.mjs`
- Create: `P/test/browser/examples.test.mjs`
- Возможно: `P/src/web/apps.ts`, `P/test/web/apps.test.mjs`, `docs/security/dashboard-isolation.md`, roadmap (запасной вариант S5)

**Interfaces:**
- Consumes: `onState` (задача 4), фикстура с `app: <путь к dist>` и `table` (задача 5).

- [ ] **Step 1: Тесты.** `sdk.test.mjs`: копии SDK в трёх примерах побайтно равны `src/sdk/loginom.ts`. `examples.test.mjs`:
  - для каждого из трёх примеров: если нет `node_modules`, создать ссылку на `node_modules` шаблона (как делает `publish.mjs`); `npm run typecheck` и `npm run build -- --outDir <tmp>/<ключ> --emptyOutDir` с `PATH` закреплённого Node → код 0, в результате есть `index.html`;
  - S5: собранный ROI открывается фикстурой с колонками ROI (`channel`, `total_budget`, `total_revenue`, `roi_pct`, `campaigns`) и пятью строками каналов. В фрейме появляется `svg.recharts-surface` с пятью подписями каналов, текст «Расчёт при пороге MinBudget = 0»; ввод `MinBudget` = 10 000 в шапке — новый `state` и текст «… = 10 000»; `window.violations` во всех фреймах пуст, в консоли нет `Refused`.
- [ ] **Step 2: Тесты падают.** `"$LOGINOM_AI_AGENT_TEST_NODE" --test test/web/sdk.test.mjs test/browser/examples.test.mjs` → FAIL: в примерах старый `loginom.ts`.
- [ ] **Step 3: Переписать примеры.** Скопировать `src/sdk/loginom.ts` в `src/loginom.ts` каждого примера. В `main.tsx`: состояние — из `useEffect(() => onState(...), [])`. Убрать поля ввода, кнопку «Выполнить», `change`, `run`, `state()`, черновики, ревизии запросов и сообщение «Откройте dashboard…» про `frameElement` (вместо него — проверка `window.parent === window`, как в шаблоне). Значение параметра — текстом: `Расчёт при пороге MinBudget = ${number.format(value)}` или «не задан». При `busy` — «Идёт расчёт…» поверх прежних данных; при ошибке — текст ошибки; при `truncated` — пометка «показана часть: N из M». Расчёты таблиц и графиков не трогать.
- [ ] **Step 4: Прогон.** `bun run test && "$LOGINOM_AI_AGENT_TEST_NODE" --test test/browser/examples.test.mjs` → PASS.
- [ ] **Step 5: Запасной вариант S5 — только если тест показал нарушение `style-src`.** По решению 5 владельца добавить `'unsafe-inline'` в `style-src` в `appHeaders` и в литерал теста `apps.test.mjs`. Записать решение в roadmap (S5) и в раздел «Заголовки» плана изоляции. Другие директивы не ослаблять; при иных нарушениях остановиться и показать их владельцу.
- [ ] **Step 6: Коммит.** `git commit -m "feat(dashboard): move examples to SDK v1"`.

### Task 10: `dev-master.sh`: контейнер web, Apache и `check`

**Files:**
- Modify: `P/deploy/dev-master.sh`

**Interfaces:**
- Consumes: `dist/server.mjs` с `startDashboard` и `appHeaders` (задачи 2, 8); `deploy/studio.csp` (задача 1).
- Produces: `./packages/dashboard/deploy/dev-master.sh install [--strict] [--web NAME] | check [--web NAME] | uninstall [--web NAME]`. Состояние — `~/loginom-dashboard/{builds,node,server.mjs}`; контейнер `dashboard-master-20261109-web`.

- [ ] **Step 1: Разбор аргументов и общие значения.**

```bash
usage="Usage: $0 install [--strict] [--web NAME] | check [--web NAME] | uninstall [--web NAME]"
[[ $# -ge 1 ]] || die "$usage"
command=$1
shift
mode=normal
web=dashboard-master-20261109-web
while [[ $# -gt 0 ]]; do
  case $1 in
    --strict) [[ $command == install ]] || die "$usage"; mode=strict; shift;;
    --web) [[ $# -ge 2 ]] || die "$usage"; web=$2; shift 2;;
    *) die "$usage";;
  esac
done
case $command in install|check|uninstall) ;; *) die "$usage";; esac
net=dashboard-master-20261109-net
state=$HOME/loginom-dashboard
builds=${DASHBOARD_BUILDS:-$state/builds}
app_origin=http://dashboards.localhost:32769
client_origins=http://127.0.0.1:32768,http://localhost:32768
image=debian:bookworm-slim@sha256:<digest> # resolved once in Step 2
csp=$(sed "s|<DASH>|$app_origin|g" "$pkg/deploy/studio.csp")
conf=/usr/local/apache2/conf/dashboard-app.site.conf
```

- [ ] **Step 2: Закрепить образ.** Выполнить `docker pull debian:bookworm-slim` и `docker image inspect --format '{{index .RepoDigests 0}}' debian:bookworm-slim`, подставить digest в `image=`. Если сеть закрыта, взять образ через принятый на машине прокси; другой образ не подставлять.
- [ ] **Step 3: `install`.** Порядок:
  1. `[[ $(id -u) != 0 ]] || die "install от root не поддерживается: запустите от пользователя, который публикует dashboard"`; проверки артефактов, Node, шаблона и fixture — как в M1; `docker network inspect "$net" >/dev/null`.
  2. Каталог состояния и копии:

```bash
mkdir -p -m 700 "$state" "$builds"
install -m 755 "$node_bin" "$state/node.new" && mv -f "$state/node.new" "$state/node"
install -m 644 "$pkg/dist/server.mjs" "$state/server.mjs.new" && mv -f "$state/server.mjs.new" "$state/server.mjs"
docker run --rm --network none --read-only --user "$(id -u):$(id -g)" \
  -v "$state/node:/opt/dashboard/node:ro" -v "$state/server.mjs:/opt/dashboard/server.mjs:ro" "$image" \
  /opt/dashboard/node -e 'if (process.versions.node !== process.argv[1]) process.exit(1); import("/opt/dashboard/server.mjs")' "$pin"
```

  3. Служба M1: `stop_service`, затем `docker exec -u 0 "$server" rm -f /app/dashboard-node "$app/server.mjs"`. `/workdir/dashboard-app` не трогать.
  4. Контейнер web:

```bash
if docker container inspect "$web" >/dev/null 2>&1; then docker rm -f "$web" >/dev/null; fi
docker run -d --name "$web" --network "$net" --user "$(id -u):$(id -g)" \
  --read-only --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --memory 512m --pids-limit 64 --log-opt max-size=10m --log-opt max-file=3 --restart unless-stopped \
  -p 127.0.0.1:32769:8101 \
  -v "$state/node:/opt/dashboard/node:ro" -v "$state/server.mjs:/opt/dashboard/server.mjs:ro" -v "$builds:/builds:ro" \
  -e DASHBOARD_HOST=0.0.0.0 -e DASHBOARD_PORT=8100 -e DASHBOARD_APP_PORT=8101 -e DASHBOARD_BUILDS=/builds \
  -e DASHBOARD_PROJECT_ROOT="$project" -e DASHBOARD_APP_ORIGIN="$app_origin" \
  -e DASHBOARD_CLIENT_ORIGINS="$client_origins" -e DASHBOARD_MODE="$mode" -e DASHBOARD_ALLOW_CURRENT=0 \
  "$image" /opt/dashboard/node /opt/dashboard/server.mjs
```

  5. Оболочка и `client.json` — как в M1 (`sed`, статический `shell.js`).
  6. Конфигурация Apache — сначала во временный файл, затем откат при ошибке:

```bash
cat > "$tmp/site.conf" <<CONF
Alias "/app/client.json" "$htdocs/dashboard-config/client.json"
Alias "/app-debug/client.json" "$htdocs/dashboard-config/client-debug.json"
<FilesMatch "^(index\.html|shell\.js)$">
  Header set Cache-Control "no-cache"
</FilesMatch>
<LocationMatch "^/app(-debug)?/(index\.html)?$">
  Header set Content-Security-Policy "$csp"
  Header set X-Content-Type-Options "nosniff"
  Header set Referrer-Policy "same-origin"
</LocationMatch>
<Location "/dashboard/">
  Require expr "tolower(req('Host')) == '127.0.0.1:32768' || tolower(req('Host')) == 'localhost:32768'"
  ProxyPreserveHost On
  Header always set Content-Security-Policy "sandbox; default-src 'none'"
  Header always set X-Content-Type-Options "nosniff"
</Location>
ProxyPass /dashboard/ http://$web:8100/dashboard/ connectiontimeout=2 timeout=30 disablereuse=On
ProxyPassReverse /dashboard/ http://$web:8100/dashboard/
CONF
docker exec "$studio" sh -ec 'rm -f "$1.bak"; if [ -e "$1" ]; then cp -p "$1" "$1.bak"; fi' sh "$conf"
docker exec -i "$studio" sh -ec 'cat > "$1.new"; mv -f "$1.new" "$1"' sh "$conf" < "$tmp/site.conf"
if ! docker exec "$studio" apachectl -t; then
  docker exec "$studio" sh -ec 'if [ -e "$1.bak" ]; then mv -f "$1.bak" "$1"; else rm -f "$1"; fi' sh "$conf"
  die "apachectl -t отклонил конфигурацию dashboard; прежний файл возвращён"
fi
docker exec "$studio" rm -f "$conf.bak"
docker exec "$studio" apachectl -k graceful
```

  7. Ожидание web — `curl --retry 5` на `lookup`, как в M1. Подсказка в конце: опубликовать ROI по свежему снимку, затем выполнить `check`.
- [ ] **Step 4: `check`.** Сохранить проверки M1 (`current` → 404, чужой `Host` → 403, одна оболочка в каждом клиенте, оба `client.json`, живая проба `check-studio.mjs master`). Удалить проверку публикации внутри контейнера сервера. Добавить:
  - контейнер существует; `docker inspect`: `.Config.User` = `$(id -u):$(id -g)` и UID не 0; `ReadonlyRootfs` = true; `CapDrop` = `[ALL]`; `SecurityOpt` содержит `no-new-privileges`; монтирование `/builds` — источник `$builds`, только чтение; режим — значение `DASHBOARD_MODE` из окружения контейнера;
  - `current=$(cat "$builds/$roi_sha256/current" 2>/dev/null || true)`; если пусто — `die "Не проверено: опубликуйте ROI"`. `lookup` ROI → `key` = ROI, `exists: true`, `hash` = `current`, `appOrigin` = `$app_origin`, `mode` = режим контейнера; у ответа `Content-Security-Policy: sandbox; default-src 'none'` и `nosniff`;
  - хост приложений через `curl --resolve dashboards.localhost:32769:127.0.0.1`: `/apps/$roi/$current/` → 200; первый файл из `$builds/$roi/$current/assets/` → 200; `/apps/` → 404; `/apps/$roi/$current` без косой черты → 404 без `Location`; `/apps/$roi/$current/binding.json` и `sample.json` → 404; `Host: evil.localhost:32769` → 403. Заголовки каждого ответа сверяются с `appHeaders` из установленного `$state/server.mjs` (плюс ожидаемый `Cache-Control`), чтобы текст заголовков не дублировался в Bash:

```bash
"$state/node" --input-type=module -e '
  import { readFileSync } from "node:fs"
  const [file, server, origin, clients, cache] = process.argv.slice(1)
  const { appHeaders } = await import(server)
  const actual = Object.fromEntries(readFileSync(file, "utf8").split(/\r?\n/).slice(1).filter(Boolean)
    .map(line => [line.slice(0, line.indexOf(":")).toLowerCase(), line.slice(line.indexOf(":") + 1).trim()]))
  for (const [name, value] of Object.entries({ ...appHeaders(origin, clients.split(",")), "cache-control": cache }))
    if (actual[name] !== value) throw Error(file + ": " + name)
' "$tmp/headers" "$state/server.mjs" "$app_origin" "$client_origins" no-store
```

  Порядок аргументов важен: если первым передать `server.mjs`, защита `import.meta.url === pathToFileURL(process.argv[1]).href` в `server.ts` запустит службу при импорте.

  У файла `assets/` ожидаемый `Cache-Control` — `public, max-age=31536000, immutable`, и дополнительно проверяется `Access-Control-Allow-Origin: *`.

  - старый `$base/dashboard/apps/$roi_sha256/` → 404;
  - страница `/app/` и `/app-debug/`: `Content-Security-Policy` точно равен `$csp`, `Content-Security-Policy-Report-Only` отсутствует, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`; `appOrigin` из `lookup` входит в источники `frame-src` присланного заголовка.
- [ ] **Step 5: `uninstall`.** Удалить контейнер web (если есть), `$state/node` и `$state/server.mjs`; `builds/` сохранить. Конфигурацию Apache убрать с проверкой `apachectl -t` и `graceful`. Оболочку и `client.json` — как в M1. Остановить службу M1, если она осталась.
- [ ] **Step 6: Статические проверки и проверка контейнера без стенда.**

```bash
bash -n packages/dashboard/deploy/dev-master.sh
shellcheck packages/dashboard/deploy/dev-master.sh
```

Затем вручную, без стенда: тот же `docker run`, что в `install`, с именем `dashboard-m2-smoke`, временным каталогом состояния, сетью по умолчанию, свободным портом (например, `-p 127.0.0.1:32779:8101`) и `DASHBOARD_APP_ORIGIN=http://dashboards.localhost:32779`. Процесс слушает оба порта (`docker logs` без ошибок), `curl --resolve dashboards.localhost:32779:127.0.0.1 http://dashboards.localhost:32779/apps/` → 404 с CSP. `docker inspect` показывает флаги. Затем `docker rm -f dashboard-m2-smoke` и удаление временного каталога.
- [ ] **Step 7: Коммит.** `git commit -m "feat(dashboard): run web in its own container"`.

### Task 11: Документы

**Files:**
- Modify: `AGENTS.md` (корень), `docs/security/dashboard-isolation.md`, `docs/superpowers/specs/2026-11-11-dashboard-architecture-roadmap.md`, `P/AGENTS.md`, `dashboard/AGENTS.md`, `docs/superpowers/specs/2026-11-09-loginom-dashboard-design.md`, `dashboard/README.md`, `dashboard/HANDOFF.md`, `dashboard/stand/README.md`, `docs/testing/loginom-ai-agent/README.md`
- Create: `docs/testing/loginom-ai-agent/dashboard-m2.md`

- [ ] **Step 1: Инварианты и инструкции.**
  - Корневой `AGENTS.md`, запись `packages/dashboard` в карте модулей: «dashboard — недоверенный код; пакет `.lgp` не меняется».
  - `P/AGENTS.md`: что нельзя ослаблять без владельца (`allow-same-origin`, новые типы сообщений, заголовки хоста приложений, источники `frame-src`, режимы, лимиты, принудительный CSP страницы Studio); `publish.mjs` до M4 — только для доверенного кода, потому что он выполняет `npm run` приложения; новые команды тестов (`test/publish`, примеры) и стенда (`--strict`, `~/loginom-dashboard`); строка «До M2 открывайте только свои доверенные dashboard» удаляется.
  - `dashboard/AGENTS.md`: SDK v1 для приложений — `onState`, `close`, пять состояний, параметры только в шапке, сети и хранилищ нет, данные примера не вшиваются.
- [ ] **Step 2: План изоляции и roadmap.** В плане изоляции отметить пункты M2, имена сообщений как в дизайне, `dns-prefetch` вне автотестов (если не сделано в задаче 7) и `style-src` (если сработал запасной вариант S5). В roadmap — решения дизайна M2 в разделе M2 и итоги S4 и S5 (окончательные значения после задачи 12).
- [ ] **Step 3: Описание стенда.** В дизайне 2026-11-09, `dashboard/README.md` и `dashboard/HANDOFF.md` записать: среда недоверенная, параметр меняется в шапке, приложение работает на SDK v1. В рецепте стенда — контейнер web, порт 32769, каталог `~/loginom-dashboard/`, `install --strict`, порядок «install → перепубликовать ROI → check».
- [ ] **Step 4: Runbook.** `dashboard-m2.md` — восемь шагов раздела «Приёмка» дизайна с командами задачи 12, ожидаемыми результатами и местом для записи итога (сборка, дата, клиенты, ограничения). Без учётных данных и сырых журналов. Строка о runbook — в `docs/testing/loginom-ai-agent/README.md`.
- [ ] **Step 5: Коммит.** `git commit -m "docs(dashboard): describe M2 isolation"`.

### Task 12: Обновление стенда и приёмка

**Files:**
- Modify: `docs/testing/loginom-ai-agent/dashboard-m2.md` (итоги), `dashboard/stand/README.md` (раздел «Приёмка M2»), roadmap (итоги S4 и S5)

Готовность: задачи 1–11 зелёные локально и в CI (`unit`, `dashboard-browser`). Если на стенде найден дефект, его чинят тестом и кодом в задаче, к которой он относится, затем повторяют шаг приёмки.

- [ ] **Step 1: Разведка.** Итог задачи 1 записан в roadmap (S4).
- [ ] **Step 2: Обновление поверх M1.**

```bash
(cd packages/dashboard && bun run build)
./packages/dashboard/deploy/dev-master.sh install
```

В Studio выбрать узел «По убыванию ROI» и нажать «Создать dashboard»: сборки ROI в M2 ещё нет. Взять ID свежего снимка из ссылки Desktop и выполнить `node packages/dashboard/script/publish.mjs <ID>`. Затем `DASHBOARD_STUDIO_CONFIG=<приватный JSON> ./packages/dashboard/deploy/dev-master.sh check` → проходит в обоих клиентах.
- [ ] **Step 3: Studio под принудительным CSP.** Повторить сценарии задачи 1 в `/app/` и `/app-debug/`. Нарушений CSP в консоли нет.
- [ ] **Step 4: ROI.** В обоих клиентах `MinBudget` в шапке 0 → 10 000 → 0 даёт 500 → 453 → 500 кампаний; таблица и график совпадают с независимым расчётом по `dashboard/fixture/dataset.csv`. Esc закрывает dashboard и из iframe, и из шапки. «Изменить в чате» выдаёт свежий ID снимка в Desktop.
- [ ] **Step 5: S4.** В `chrome://process-internals` записать процессы iframe и вкладки с адресом приложения. Скопировать fixture в новый путь (`/user/dashboard-roi-s4/campaign.lgp`), создать для её узла dashboard через `--init` и добавить в `main.tsx` вызов `fetch("http://attacker.localhost:1/")`. Опубликовать и открыть: в течение минуты (браузер отправляет отчёты пачками) `docker logs dashboard-master-20261109-web | grep 'dashboard report'` показывает отчёт. После приёмки вручную удалить `~/loginom-dashboard/builds/<ключ копии>` и исходники копии. Во вкладке с адресом приложения `document.cookie` бросает исключение. Встраивание в чужую страницу блокирует `frame-ancestors` — подтверждено автотестом задачи 7.
- [ ] **Step 6: S5.** На стенде у ROI нет нарушений CSP: консоль фрейма и `docker logs` без отчётов.
- [ ] **Step 7: Firefox и строгий режим.** Firefox, обычный режим: ROI открывается и пересчитывается. `install --strict` и `check` → Firefox получает отказ с объяснением, Chromium 154 открывает dashboard. Затем `install` без флага и `check`.
- [ ] **Step 8: Удаление и повтор.** После `uninstall` Studio работает без элементов dashboard, а `~/loginom-dashboard/builds/` на месте. После `install` и `check` ROI открывается без перепубликации.
- [ ] **Step 9: Запись итогов.** В runbook и в разделе «Приёмка M2» рецепта стенда — сборка Studio, версии Node и Chromium, результат каждого шага и ограничения. В roadmap — окончательные итоги S4 и S5. Коммит: `git commit -m "docs(dashboard): record M2 stand acceptance"`. Слияние — по команде владельца.
