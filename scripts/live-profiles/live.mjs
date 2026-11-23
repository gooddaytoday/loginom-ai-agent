// B3.3: live 0.3.9 and 0.4.x profiles. The installed Desktop of a release writes a profile the way a user does:
// its own backend, reached through the window (DevTools protocol), gets a provider with a key, sessions, a file read by a
// tool and an attachment; an own skill lies in the configuration directory. Then the OpenCode 2 CLI of the product takes
// the profile over: `serve` (the B3.1b guard) or `migrate` first, each from the same untouched copy, and a rerun.
// Runs on the Node bundled with the installed Desktop (`resources/loginom/bin/node[.exe]`, Node 24), on Linux and
// Windows, as the ordinary user whose profile it is, without XDG or database overrides. The provider key is made up; it
// is compared, never printed. The Desktop backend password stays in memory.
//   node live.mjs old --app <Desktop executable> --label <release> --state <dir>
//   node live.mjs v2 --bin <opencode> --state <dir> --path serve|migrate
import { spawn, spawnSync } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import path from "node:path"

const win = process.platform === "win32"
const home = os.homedir()
const args = Object.fromEntries(
  process.argv
    .slice(3)
    .flatMap((value, index, all) => (value.startsWith("--") ? [[value.slice(2), all[index + 1]]] : [])),
)
const KEY = "b33-made-up-provider-key"
const PROVIDER = "b33stub"
const MODEL = "b33-model"
const SKILL = "b33-sales-summary"
// The places of a prod-channel profile on both systems (B3.1, B3.2): backend data and configuration under the home
// directory, Desktop userData under the application data directory.
const places = {
  data: path.join(process.env.XDG_DATA_HOME || path.join(home, ".local", "share"), "loginom-ai-agent"),
  config: path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "loginom-ai-agent"),
  desktop: path.join(
    win
      ? process.env.APPDATA || path.join(home, "AppData", "Roaming")
      : process.env.XDG_CONFIG_HOME || path.join(home, ".config"),
    "com.loginom.aiagent",
  ),
}
const projects = path.join(home, "Проекты B33")
const directories = {
  plain: path.join(projects, "Анализ продаж"),
  ...(win ? {} : { repo: path.join(projects, "repo") }),
}
const notes = { name: "заметки к отчёту.txt", text: "Три строки данных: север, юг, запад.\n" }

const command = process.argv[2]
if (command === "old") await old()
else if (command === "v2") await v2()
else throw new Error("usage: node live.mjs old|v2 --state <dir> ...")

async function old() {
  const state = required("state")
  fs.mkdirSync(state, { recursive: true })
  fs.mkdirSync(directories.plain, { recursive: true })
  fs.writeFileSync(path.join(directories.plain, notes.name), notes.text)
  if (directories.repo) repository(directories.repo)
  const skill = path.join(places.config, "skills", SKILL, "SKILL.md")
  fs.mkdirSync(path.dirname(skill), { recursive: true })
  fs.writeFileSync(
    skill,
    `---\nname: ${SKILL}\ndescription: Сводка продаж по регионам.\n---\n\nСгруппируй строки по региону.\n`,
  )
  const model = await mock(Number(args["model-port"] ?? 20000 + crypto.randomInt(10000)))
  const report = { label: required("label"), modelPort: model.port, home, places, directories }
  const app = launch(required("app"), 20000 + crypto.randomInt(10000), path.join(state, "desktop.log"))
  try {
    const cdp = await connect(app.port)
    // The window's own way to its backend; the password is not written anywhere.
    const server = await cdp.evaluate("window.api.awaitInitialization()", 180_000)
    const call = v1(server)
    await until("Desktop backend", 120_000, () => call("GET", "/path").then(() => true))
    report.backend = (await call("GET", "/path")).data ?? (await call("GET", "/path"))
    // As the Desktop custom provider dialog does: the key, then the provider; then the model.
    await call("PUT", `/auth/${PROVIDER}`, { type: "api", key: KEY })
    await call("PATCH", "/global/config", {
      provider: {
        [PROVIDER]: {
          npm: "@ai-sdk/openai-compatible",
          name: "B3.3 stub",
          options: { baseURL: `http://127.0.0.1:${model.port}/v1` },
          models: { [MODEL]: { name: "B3.3 model", tool_call: true } },
        },
      },
      disabled_providers: [],
    })
    await call("PATCH", "/global/config", { model: `${PROVIDER}/${MODEL}` })
    const ask = async (session, directory, note, steps, extra = []) =>
      call("POST", `/session/${session}/message?directory=${encodeURIComponent(directory)}`, {
        model: { providerID: PROVIDER, modelID: MODEL },
        parts: [{ type: "text", text: script(steps, note) }, ...extra],
      })
    const open = async (directory) => (await call("POST", `/session?directory=${encodeURIComponent(directory)}`, {})).id
    const first = await open(directories.plain)
    await ask(first, directories.plain, "Первая сессия: какой ответ?", [{ text: "Ответ — 42." }])
    await ask(first, directories.plain, "Второй ход первой сессии.", [{ text: "По-прежнему 42." }])
    const second = await open(directories.plain)
    await ask(second, directories.plain, "Вторая сессия: прочитай заметки.", [
      { tool: "read", input: { filePath: path.join(directories.plain, notes.name) } },
      { text: "В заметках три строки." },
    ])
    const third = await open(directories.plain)
    await ask(
      third,
      directories.plain,
      "Третья сессия: что во вложении?",
      [{ text: "Во вложении одна строка." }],
      [
        {
          type: "file",
          mime: "text/plain",
          filename: notes.name,
          url: `data:text/plain;base64,${Buffer.from(notes.text).toString("base64")}`,
        },
      ],
    )
    if (directories.repo) {
      const fourth = await open(directories.repo)
      await ask(fourth, directories.repo, "Четвёртая сессия: в git-репозитории.", [{ text: "Ответ из репозитория." }])
    }
    const skills = await call("GET", `/skill?directory=${encodeURIComponent(directories.plain)}`)
    report.oldSkill = skills.filter((item) => item.name === SKILL).map((item) => item.location)
    report.loginom = await cdp
      .evaluate(
        `(async () => {
          const view = await window.api.loginom.read()
          // 0.4 refuses a check until its bundled runtime files are verified, which takes minutes on Windows; retry.
          const deadline = Date.now() + 540_000
          const check = async (tries) => {
            const attempt = await window.api.loginom
              .check({ revision: view.revision, url: "http://127.0.0.1:9/", username: "b33", password: { operation: "replace", value: "b33-made-up-loginom-password" } })
              .then((value) => ({ ok: true, value, tries }), (error) => ({ ok: false, error: String(error?.message ?? error), tries }))
            if (attempt.ok || Date.now() > deadline) return attempt
            await new Promise((resolve) => setTimeout(resolve, 10_000))
            return check(tries + 1)
          }
          const attempt = await check(1)
          // The host keeps a validation even when the login page is unreachable; saving it writes the store as the
          // window would, without a Loginom server.
          const saved = attempt.ok
            ? await window.api.loginom
                .save({ revision: view.revision, validationId: attempt.value.validationId })
                .then((value) => ({ ok: true, state: value.state, generation: value.generation, url: value.url, hasPassword: value.hasPassword }), (error) => ({ ok: false, error: String(error?.message ?? error) }))
            : undefined
          return { before: { state: view.state, generation: view.generation }, tries: attempt.tries, browser: attempt.ok ? attempt.value.browser : attempt.error, saved }
        })()`,
        // On Windows the host first checks the bundled runtime files; with Defender this takes minutes.
        600_000,
      )
      .catch((error) => ({ error: String(error.message ?? error) }))
    report.sessions = await collect(call)
    report.modelCalls = model.calls.length
    report.close = await close(cdp, app, server)
  } finally {
    stop(app)
    model.server.close()
  }
  report.databases = find(home, (name) => /^loginom-ai-agent.*\.db$/.test(name)).map((file) =>
    path.relative(home, file),
  )
  if (!fs.existsSync(path.join(places.data, "loginom-ai-agent.db"))) {
    print("old: no database where OpenCode 2 looks for it", { expected: places.data, found: report.databases })
    process.exit(1)
  }
  report.counts = counts(path.join(places.data, "loginom-ai-agent.db"), state)
  report.connection = find(path.join(places.desktop, "loginom", "connection"), () => true).map((file) =>
    path.relative(places.desktop, file).replaceAll("\\", "/"),
  )
  // The untouched copy both v2 paths start from, taken after every Desktop process has gone.
  fs.rmSync(path.join(state, "pristine"), { recursive: true, force: true })
  for (const name of ["data", "config"])
    fs.cpSync(places[name], path.join(state, "pristine", name), { recursive: true })
  report.pristine = snapshot()
  fs.writeFileSync(path.join(state, "old.json"), JSON.stringify(report, null, 2))
  print("old", {
    label: report.label,
    sessions: report.sessions.length,
    messages: report.sessions.reduce((sum, item) => sum + item.messages.length, 0),
    parts: report.sessions.reduce(
      (sum, item) => sum + item.messages.reduce((all, message) => all + message.parts.length, 0),
      0,
    ),
    counts: report.counts,
    modelCalls: report.modelCalls,
    skill: report.oldSkill,
    loginom: report.loginom,
    databases: report.databases,
    connection: report.connection,
    close: report.close,
  })
}

async function v2() {
  const state = required("state")
  const kind = required("path")
  const bin = required("bin")
  const old = JSON.parse(fs.readFileSync(path.join(state, "old.json"), "utf8"))
  // Both paths start from the same copy of the old profile.
  for (const name of ["data", "config"]) {
    fs.rmSync(places[name], { recursive: true, force: true })
    fs.cpSync(path.join(state, "pristine", name), places[name], { recursive: true })
  }
  const before = snapshot()
  const original = before.data["loginom-ai-agent.db"]
  const report = { path: kind, before }
  const model = await mock(old.modelPort)
  try {
    if (kind === "migrate") {
      report.migrate = cli(bin, ["migrate"])
      report.afterMigrate = snapshot()
      report.migrateAgain = cli(bin, ["migrate"])
      report.afterMigrateAgain = snapshot()
    }
    report.serve = await serve(bin, old, model, state, `${kind}-serve`, true)
    report.afterServe = snapshot()
    report.serveAgain = await serve(bin, old, model, state, `${kind}-serve-again`, false)
    report.afterServeAgain = snapshot()
    report.migrateAfter = cli(bin, ["migrate"])
    report.afterMigrateAfter = snapshot()
  } finally {
    model.server.close()
  }
  const backup = "loginom-ai-agent.v1-backup.db"
  // The data directory also holds the CLI log, which every run appends to; "unchanged" is about the database and its
  // WAL. The WAL index (-shm) is left out: on Windows the server is terminated without a checkpoint, and the next reader
  // rebuilds the index of the WAL it finds.
  const databases = (value) =>
    Object.fromEntries(Object.entries(value.data).filter(([name]) => name.includes(".db") && !name.endsWith("-shm")))
  const kept = (from, to, name) =>
    JSON.stringify(name === "data" ? databases(from) : from[name]) ===
    JSON.stringify(name === "data" ? databases(to) : to[name])
  const guard = fs
    .readFileSync(path.join(places.data, "log", "loginom-ai-agent.log"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("Loginom AI Agent 0.3.9/0.4"))
  const result = {
    path: kind,
    original: original,
    backup: report.afterServe.data[backup],
    backupIsOriginal: report.afterServe.data[backup] === original,
    guard,
    databasesAfter: databases(report.afterMigrateAfter),
    backups: Object.keys(report.afterMigrateAfter.data).filter((name) => name.includes("backup")),
    leftovers: Object.keys(report.afterMigrateAfter.data).filter((name) => /migrating|\.lock/.test(name)),
    configSkillsKept: kept(before, report.afterMigrateAfter, "config"),
    desktopKept: kept(before, report.afterMigrateAfter, "desktop"),
    authKept: before.data["auth.json"] === report.afterMigrateAfter.data["auth.json"],
    ...(kind === "migrate"
      ? {
          migrate: brief(report.migrate),
          migrateAgain: brief(report.migrateAgain),
          migrateAgainChangedNothing: kept(report.afterMigrate, report.afterMigrateAgain, "data"),
        }
      : {}),
    serve: report.serve,
    serveAgain: report.serveAgain,
    serveAgainSameSessions: JSON.stringify(report.serve.listing) === JSON.stringify(report.serveAgain.listing),
    backupAfterServeAgain: report.afterServeAgain.data[backup] === original,
    migrateAfter: brief(report.migrateAfter),
    migrateAfterChangedNothing: kept(report.afterServeAgain, report.afterMigrateAfter, "data"),
    walIndexChanged: Object.keys(report.afterMigrateAfter.data)
      .filter((name) => name.endsWith("-shm"))
      .filter((name) => report.afterServeAgain.data[name] !== report.afterMigrateAfter.data[name]),
  }
  fs.writeFileSync(path.join(state, `v2-${kind}.json`), JSON.stringify({ ...report, result }, null, 2))
  print(`v2 ${kind}`, result)
}

// One server run: it must list every 0.4 session with its messages and parts, the sessions of each directory in that
// directory's project, the own skill and the provider; with `prompt` the provider answers with the key 0.4 kept.
async function serve(bin, old, model, state, name, prompt) {
  const password = crypto.randomUUID()
  const log = fs.openSync(path.join(state, `${name}.log`), "w")
  const started = Date.now()
  const child = spawn(bin, ["serve", "--port", "0", "--hostname", "127.0.0.1"], {
    env: { ...process.env, LOGINOM_AI_AGENT_PASSWORD: password },
    stdio: ["ignore", "pipe", log],
    windowsHide: true,
  })
  try {
    const base = await listening(child)
    const ready = Date.now() - started
    const call = async (method, route, body, directory) => {
      const response = await fetch(new URL(route, base), {
        method,
        headers: {
          authorization: `Basic ${Buffer.from(`loginom-ai-agent:${password}`).toString("base64")}`,
          "content-type": "application/json",
          ...(directory ? { "x-opencode-directory": encodeURIComponent(directory) } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      })
      const text = await response.text()
      if (!response.ok) throw new Error(`${method} ${route}: ${response.status} ${text.slice(0, 500)}`)
      return text ? JSON.parse(text) : undefined
    }
    // Follows cursor.next; a cursor replaces the order of the first page.
    const page = async (route, cursor, all = []) => {
      const url = new URL(route, base)
      if (cursor) url.searchParams.delete("order")
      if (cursor) url.searchParams.set("cursor", cursor)
      const answer = await call("GET", url.pathname + url.search)
      all.push(...answer.data)
      return answer.cursor?.next && answer.data.length ? page(route, answer.cursor.next, all) : all
    }
    const sessions = await page("/api/session?limit=100")
    const ids = new Set(sessions.map((item) => item.id))
    const checks = await Promise.all(
      old.sessions.map(async (session) => {
        const messages = ids.has(session.id) ? await page(`/api/session/${session.id}/message?limit=200&order=asc`) : []
        const json = JSON.stringify(messages)
        const found = new Set(messages.map((item) => item.id))
        return {
          session: session.id,
          listed: ids.has(session.id),
          messages: `${session.messages.filter((message) => found.has(message.id)).length}/${session.messages.length}`,
          v2Messages: messages.length,
          missing: session.messages.flatMap((message) =>
            message.parts.flatMap((part) =>
              [part.text, part.callID, part.tool, part.data]
                .filter((value) => typeof value === "string" && value.length > 0)
                .filter((value) => !json.includes(JSON.stringify(value).slice(1, -1)))
                .map((value) => `${message.id}/${part.type}: ${value.slice(0, 60)}`),
            ),
          ),
        }
      }),
    )
    const owners = await Promise.all(
      Object.entries(old.directories).map(async ([key, directory]) => {
        const project = (await call("GET", "/api/location", undefined, directory)).project.id
        const listed = new Set(
          (await page(`/api/session?limit=100&project=${encodeURIComponent(project)}`)).map((item) => item.id),
        )
        const own = old.sessions.filter((item) => item.directory === directory).map((item) => item.id)
        return {
          directory: key,
          project: project === "global" ? "global" : "own",
          listed: `${own.filter((id) => listed.has(id)).length}/${own.length}`,
        }
      }),
    )
    // Skills load with the plugins of a cold Location, so a one-shot client waits for the entry it needs.
    const skill = await until("own skill", 30_000, async () =>
      (await call("GET", `/api/skill?location[directory]=${encodeURIComponent(old.directories.plain)}`)).data.find(
        (item) => item.id === SKILL,
      ),
    ).catch(() => undefined)
    const config = await call("GET", "/api/config", undefined, old.directories.plain)
    const result = {
      readyMs: ready,
      sessions: sessions.length,
      oldSessionsListed: `${checks.filter((item) => item.listed).length}/${old.sessions.length}`,
      checks,
      owners,
      skill: skill
        ? { path: skill.path === path.join(places.config, "skills", SKILL, "SKILL.md") ? "config/skills" : skill.path }
        : null,
      provider: Boolean(JSON.stringify(config).includes(PROVIDER)),
      listing: sessions.map((item) => item.id).sort(),
    }
    if (prompt) {
      const before = model.calls.length
      const session = (await call("POST", "/api/session", { location: { directory: old.directories.plain } })).data.id
      await call("POST", `/api/session/${session}/prompt`, { text: "Скажи привет" })
      await call("POST", `/api/experimental/session/${session}/wait`, {})
      const calls = model.calls.slice(before)
      result.prompt = {
        session,
        modelCalls: calls.length,
        keyFromOldProfile: calls.length > 0 && calls.every((value) => value === `Bearer ${KEY}`),
      }
      result.listing = (await page("/api/session?limit=100")).map((item) => item.id).sort()
    }
    return result
  } finally {
    child.kill()
    await new Promise((resolve) => (child.exitCode === null ? child.once("exit", resolve) : resolve()))
    fs.closeSync(log)
  }
}

function cli(bin, list) {
  const run = spawnSync(bin, list, { env: process.env, encoding: "utf8", timeout: 600_000, windowsHide: true })
  return { code: run.status, stdout: run.stdout, stderr: run.stderr }
}

function brief(run) {
  return { code: run.code, stdout: run.stdout.trim().split(/\r?\n/), stderr: run.stderr.trim() }
}

function listening(child) {
  return new Promise((resolve, reject) => {
    const output = { text: "" }
    const timer = setTimeout(() => reject(new Error(`server did not start: ${output.text}`)), 300_000)
    child.stdout.on("data", (chunk) => {
      output.text += chunk.toString()
      const url = /server listening on (http:\/\/\S+)/.exec(output.text)?.[1]
      if (url) {
        clearTimeout(timer)
        resolve(url)
      }
    })
    child.once("exit", (code) => {
      clearTimeout(timer)
      reject(new Error(`server exited ${code}: ${output.text}`))
    })
  })
}

// An OpenAI-compatible model that answers by the script embedded in the last user message (as the B3.1 fixtures)
// and remembers the authorization header of every call in memory.
async function mock(port) {
  const calls = []
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1")
    if (url.pathname.endsWith("/models")) {
      response.writeHead(200, { "content-type": "application/json" })
      return response.end(JSON.stringify({ object: "list", data: [{ id: MODEL, object: "model" }] }))
    }
    if (!url.pathname.endsWith("/chat/completions")) {
      response.writeHead(404)
      return response.end()
    }
    calls.push(request.headers.authorization ?? "")
    try {
      await answer(request, response)
    } catch (error) {
      response.writeHead(500)
      response.end(String(error))
    }
  })
  async function answer(request, response) {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    const text = (content) =>
      typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content.map((part) => part.text ?? "").join("\n")
          : ""
    const index = body.messages.findLastIndex(
      (item) => item.role === "user" && text(item.content).includes("B33-SCRIPT:"),
    )
    const steps =
      index < 0
        ? []
        : JSON.parse(
            Buffer.from(
              /B33-SCRIPT:([A-Za-z0-9+/=]+):END/.exec(text(body.messages[index].content))[1],
              "base64",
            ).toString(),
          )
    const done = body.messages.slice(index + 1).filter((item) => item.role === "assistant").length
    const step = !body.tools?.length ? { text: "Заголовок B3.3" } : (steps[done] ?? { text: "Привет" })
    const chunk = (delta, finish = null) =>
      `data: ${JSON.stringify({ id: "b33", object: "chat.completion.chunk", created: 0, model: MODEL, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`
    response.writeHead(200, { "content-type": "text/event-stream" })
    response.end(
      [
        "tool" in step
          ? chunk({
              role: "assistant",
              tool_calls: [
                {
                  index: 0,
                  id: `call_b33_${calls.length}`,
                  type: "function",
                  function: { name: step.tool, arguments: JSON.stringify(step.input) },
                },
              ],
            }) + chunk({}, "tool_calls")
          : chunk({ role: "assistant", content: step.text }) + chunk({}, "stop"),
        `data: ${JSON.stringify({ id: "b33", object: "chat.completion.chunk", created: 0, model: MODEL, choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })}\n\n`,
        "data: [DONE]\n\n",
      ].join(""),
    )
  }
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, "127.0.0.1", resolve)
  })
  return { server, port: server.address().port, calls }
}

function script(steps, note) {
  return `${note}\nB33-SCRIPT:${Buffer.from(JSON.stringify(steps)).toString("base64")}:END`
}

function v1(server) {
  const authorization = `Basic ${Buffer.from(`${server.username}:${server.password}`).toString("base64")}`
  return async (method, route, body) => {
    const response = await fetch(new URL(route, server.url), {
      method,
      headers: { authorization, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`${method} ${route}: ${response.status} ${text.slice(0, 500)}`)
    return text ? JSON.parse(text) : undefined
  }
}

// Sessions, messages and parts as the 0.4 backend serves them, without the attachment bytes.
async function collect(call) {
  const seen = new Map()
  for (const directory of Object.values(directories)) {
    const list = await call("GET", `/session?directory=${encodeURIComponent(directory)}`)
    for (const session of list) {
      if (seen.has(session.id)) continue
      const messages = await call("GET", `/session/${session.id}/message?directory=${encodeURIComponent(directory)}`)
      seen.set(session.id, {
        id: session.id,
        directory: session.directory,
        projectID: session.projectID,
        title: session.title,
        messages: messages.map((message) => ({
          id: message.info.id,
          role: message.info.role,
          parts: message.parts.map((part) => ({
            type: part.type,
            ...(part.type === "text" && part.text ? { text: part.text } : {}),
            ...(part.type === "tool" ? { tool: part.tool, callID: part.callID } : {}),
            ...(part.type === "file" && part.url?.startsWith("data:")
              ? { data: part.url.slice(part.url.indexOf(",") + 1) }
              : {}),
            ...(part.type === "file" ? { filename: part.filename } : {}),
          })),
        })),
      })
    }
  }
  return [...seen.values()]
}

function launch(executable, port, logFile) {
  const log = fs.openSync(logFile, "w")
  const child = win
    ? spawn(executable, [`--remote-debugging-port=${port}`], { stdio: ["ignore", log, log], windowsHide: false })
    : spawn(
        "xvfb-run",
        ["-a", "-s", "-screen 0 1280x800x24", executable, "--no-sandbox", `--remote-debugging-port=${port}`],
        {
          stdio: ["ignore", log, log],
          detached: true,
        },
      )
  return { child, port, log }
}

function stop(app) {
  if (app.child.exitCode !== null || app.child.signalCode !== null) return
  if (win) spawnSync("taskkill", ["/pid", String(app.child.pid), "/t", "/f"])
  else process.kill(-app.child.pid, "SIGKILL")
}

// window.close() closes the BrowserWindow like its close button; the last window quits the app (B0.4).
async function close(cdp, app, server) {
  const started = Date.now()
  await cdp.evaluate("setTimeout(() => window.close(), 50), true", 10_000).catch(() => undefined)
  cdp.socket.close()
  const timer = { id: undefined }
  const code = await Promise.race([
    new Promise((resolve) => app.child.once("exit", (value) => resolve(value))),
    new Promise((resolve) => (timer.id = setTimeout(() => resolve("timeout"), 90_000))),
  ])
  clearTimeout(timer.id)
  const backendGone = await fetch(new URL("/path", server.url), { signal: AbortSignal.timeout(3000) }).then(
    () => false,
    () => true,
  )
  return { code, ms: Date.now() - started, backendGone }
}

async function connect(port) {
  const target = await until("DevTools page", 120_000, async () => {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) })).json()
    return list.find((item) => item.type === "page" && !item.url.startsWith("devtools://"))
  })
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.onopen = resolve
    socket.onerror = reject
  })
  const pending = new Map()
  socket.onmessage = (message) => {
    const data = JSON.parse(String(message.data))
    pending.get(data.id)?.(data)
    pending.delete(data.id)
  }
  const counter = { id: 0 }
  const evaluate = (expression, timeout) =>
    new Promise((resolve, reject) => {
      const id = ++counter.id
      const timer = setTimeout(() => reject(new Error(`evaluate timed out: ${expression.slice(0, 60)}`)), timeout)
      pending.set(id, (data) => {
        clearTimeout(timer)
        const result = data.result
        if (result?.exceptionDetails)
          return reject(new Error(result.exceptionDetails.exception?.description ?? "exception"))
        resolve(result?.result?.value)
      })
      socket.send(
        JSON.stringify({
          id,
          method: "Runtime.evaluate",
          params: { expression, awaitPromise: true, returnByValue: true },
        }),
      )
    })
  return { socket, evaluate }
}

function repository(directory) {
  fs.mkdirSync(directory, { recursive: true })
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "B3.3",
    GIT_AUTHOR_EMAIL: "b33@example.invalid",
    GIT_COMMITTER_NAME: "B3.3",
    GIT_COMMITTER_EMAIL: "b33@example.invalid",
    GIT_AUTHOR_DATE: "2026-11-22T00:00:00Z",
    GIT_COMMITTER_DATE: "2026-11-22T00:00:00Z",
  }
  for (const list of [
    ["init", "-q"],
    ["commit", "-q", "--allow-empty", "-m", "B3.3 root"],
  ]) {
    const run = spawnSync("git", list, { cwd: directory, env, encoding: "utf8" })
    if (run.status !== 0) throw new Error(`git ${list.join(" ")}: ${run.stderr}`)
  }
}

// Row counts of the old database, read from a throwaway copy so the profile itself is not opened.
function counts(file, state) {
  const copy = path.join(state, "count.db")
  fs.copyFileSync(file, copy)
  for (const suffix of ["-wal", "-shm"]) if (fs.existsSync(file + suffix)) fs.copyFileSync(file + suffix, copy + suffix)
  const { DatabaseSync } = process.getBuiltinModule("node:sqlite")
  const db = new DatabaseSync(copy)
  const one = (sql) => Object.values(db.prepare(sql).get())[0]
  const result = {
    session: one("SELECT count(*) FROM session"),
    message: one("SELECT count(*) FROM message"),
    part: one("SELECT count(*) FROM part"),
    migrations: one("SELECT count(*) FROM migration"),
    lastMigration: one("SELECT id FROM migration ORDER BY rowid DESC LIMIT 1"),
    credentialRows: one("SELECT count(*) FROM credential"),
  }
  db.close()
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(copy + suffix, { force: true })
  return result
}

// Size and SHA-256 prefix of every file in the profile places, by place and relative path.
function snapshot() {
  return Object.fromEntries(
    Object.entries(places).map(([name, root]) => [
      name,
      Object.fromEntries(
        (fs.existsSync(root) ? fs.readdirSync(root, { recursive: true, withFileTypes: true }) : [])
          .filter((entry) => entry.isFile())
          .map((entry) => path.join(entry.parentPath, entry.name))
          .sort()
          .map((file) => [
            path.relative(root, file).replaceAll("\\", "/"),
            `${fs.statSync(file).size} ${crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 16)}`,
          ]),
      ),
    ]),
  )
}

function find(root, match, depth = 6) {
  if (depth < 0) return []
  return (fs.existsSync(root) ? fs.readdirSync(root, { withFileTypes: true }) : []).flatMap((entry) => {
    const file = path.join(root, entry.name)
    if (entry.isSymbolicLink()) return []
    if (entry.isDirectory())
      return ["node_modules", "Microsoft", "Packages", "Temp", "Cache", "Code Cache"].includes(entry.name)
        ? []
        : find(file, match, depth - 1)
    return match(entry.name) ? [file] : []
  })
}

async function until(what, timeout, probe) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const value = await Promise.resolve()
      .then(probe)
      .catch(() => undefined)
    if (value) return value
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`timed out waiting for ${what}`)
}

function required(name) {
  if (!args[name]) throw new Error(`--${name} is required`)
  return args[name]
}

function print(title, value) {
  process.stdout.write(`== ${title}\n${JSON.stringify(value, null, 2)}\n`)
}
