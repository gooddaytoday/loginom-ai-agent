import path from "node:path"
import { constants } from "node:fs"
import { lstat, mkdir, open, readFile, readdir, realpath } from "node:fs/promises"
import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { createInterface } from "node:readline"

const operations = ["init", "inspect", "reconcile-user", "close-session", "dispose"]
let context
let page
let identity
let disposed = false

for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  const request = (() => { try { return JSON.parse(line) } catch { return undefined } })()
  const valid = request && Object.keys(request).length === 6 && request.v === 1 &&
    typeof request.id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(request.id) && operations.includes(request.op) &&
    Number.isSafeInteger(request.deadline) && request.expectedIdentity && Object.keys(request.expectedIdentity).length === 6 &&
    ["containerId", "serverEpoch", "studioContainerId", "configurationHash"].every(key => typeof request.expectedIdentity[key] === "string" && /^[a-f0-9]{64}$/.test(request.expectedIdentity[key])) &&
    ["startedAt", "studioStartedAt"].every(key => typeof request.expectedIdentity[key] === "string" && Number.isFinite(Date.parse(request.expectedIdentity[key]))) &&
    Object.hasOwn(request, "payload") && Buffer.byteLength(line) <= 1024 * 1024
  const id = typeof request?.id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(request.id) ? request.id : "invalid"
  let dispatched = false
  try {
    if (!valid || disposed) throw Error("ADMIN_REQUEST_INVALID")
    if (request.deadline <= Date.now()) throw Error("ADMIN_DEADLINE")
    if (request.op === "dispose") {
      dispatched = Boolean(context)
      if (context) await bounded(request, context.close())
      context = undefined
      disposed = true
      respond(id, "confirmed", { disposed: true })
      continue
    }
    if (request.op === "init") {
      if (context) throw Error("ADMIN_ALREADY_INITIALIZED")
      const payload = request.payload
      if (!payload || Object.keys(payload).length !== 5 || typeof payload.resourceRoot !== "string" || typeof payload.manifestHash !== "string" ||
        typeof payload.url !== "string" || typeof payload.credentialsFile !== "string" || typeof payload.profileDir !== "string") throw Error("ADMIN_REQUEST_INVALID")
      const url = new URL(payload.url)
      if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/app/" ||
        url.username || url.password || url.search || url.hash) throw Error("ADMIN_REQUEST_INVALID")
      const credentials = await readCredentials(payload.credentialsFile)
      const resources = await realpath(payload.resourceRoot)
      if (resources !== payload.resourceRoot) throw Error("ADMIN_RUNTIME_PATH")
      const manifest = await readFile(path.resolve(resources, "../../cli-manifest.json"))
      if (createHash("sha256").update(manifest).digest("hex") !== payload.manifestHash) throw Error("ADMIN_RUNTIME_HASH")
      const resource = JSON.parse(await readFile(path.join(resources, "resource-manifest.json"), "utf8"))
      if (resource.protocol !== 1 || resource.target !== "linux-x64" || resource.node !== "bin/node" || typeof resource.browser !== "string" ||
        !resource.browser.startsWith("browsers/") || resource.browser.split("/").some(part => !part || part === "." || part === "..")) throw Error("ADMIN_RUNTIME_PATH")
      const browser = await realpath(path.join(resources, resource.browser))
      if (await realpath(process.execPath) !== await realpath(path.join(resources, resource.node)) || !browser.startsWith(resources + path.sep) ||
        createHash("sha256").update(await readFile(browser)).digest("hex") !== resource.browserSha256) throw Error("ADMIN_RUNTIME_HASH")
      const require = createRequire(path.join(resources, "runtime/client/package.json"))
      if (!(await realpath(require.resolve("playwright-core"))).startsWith(path.join(resources, "runtime/client") + path.sep)) throw Error("ADMIN_RUNTIME_PATH")
      await requireProfile(payload.profileDir)
      const { chromium } = require("playwright-core")
      dispatched = true
      process.stderr.write("ADMIN_INIT_STAGE_BROWSER\n")
      context = await chromium.launchPersistentContext(payload.profileDir, { executablePath: browser, headless: true, timeout: remaining(request) })
      page = context.pages()[0] ?? await context.newPage()
      page.setDefaultTimeout(remaining(request))
      process.stderr.write("ADMIN_INIT_STAGE_NAVIGATION\n")
      await page.goto(url.href, { timeout: remaining(request) })
      process.stderr.write("ADMIN_INIT_STAGE_FORM\n")
      const login = page.locator('input[placeholder="Логин"]')
      const password = page.locator('input[placeholder="Пароль"]')
      if (await login.count() !== 1 || await password.count() !== 1 || await page.getByText("Войти", { exact: true }).count() !== 1) throw Error("ADMIN_CAPABILITY_UNSUPPORTED")
      process.stderr.write("ADMIN_INIT_STAGE_USERNAME\n")
      await login.fill(credentials.username)
      process.stderr.write("ADMIN_INIT_STAGE_PASSWORD\n")
      const passwordState = await password.evaluate(element => element.disabled ? "DISABLED" : element.readOnly ? "READONLY"
        : element.getClientRects().length ? "READY" : "HIDDEN")
      process.stderr.write("ADMIN_INIT_PASSWORD_" + passwordState + "\n")
      // Studio removes its password autofill guard on the native focus event.
      await password.focus()
      await password.fill(credentials.password)
      process.stderr.write("ADMIN_INIT_STAGE_BLUR\n")
      await password.blur()
      process.stderr.write("ADMIN_INIT_STAGE_LOGIN\n")
      await page.getByText("Войти", { exact: true }).click()
      process.stderr.write("ADMIN_INIT_STAGE_SESSION\n")
      await page.waitForFunction(() => typeof bg !== "undefined" && Boolean(bg.app?.Application?.FInstance?.FServerConnection?.ServerContainer?.Session), null, { timeout: remaining(request) })
      process.stderr.write("ADMIN_INIT_STAGE_ROLE\n")
      const current = await bounded(request, page.evaluate(async () => {
        const user = await bg.app.Application.FInstance.FServerConnection.ServerContainer.Session.CurrentUser
        return { username: await user.Name, admin: await user.IsAdmin }
      }))
      if (current.username !== credentials.username || current.admin !== true) throw Error("ADMIN_IDENTITY_CHANGED")
      identity = request.expectedIdentity
      respond(id, "confirmed", { initialized: true, username: current.username, sessionIdentityQualified: false })
      continue
    }
    if (!context || !identity) throw Error("ADMIN_NOT_INITIALIZED")
    if (JSON.stringify(request.expectedIdentity) !== JSON.stringify(identity)) throw Error("SERVER_EPOCH_CHANGED")
    if (request.op === "inspect") {
      dispatched = true
      const rows = await bounded(request, page.evaluate(async () => {
        const session = bg.app.Application.FInstance.FServerConnection.ServerContainer.Session
        const scoped = await bg.ScopeGetObjectAsync(session, bg.IBGDeductorSessionsManagerContainer)
        const manager = await scoped.GetSessionsManager()
        await manager.UpdateSessionInfos()
        const rows = []
        for (let index = 0; index < await manager.Count; index++) {
          const row = await manager.SessionInfo(index)
          rows.push({ name: await row.Name, createdAt: await row.CreateTime, pendingDisconnect: await row.PendingDisconnect,
            packageCount: await row.Count, activeOperations: null })
        }
        return rows
      }))
      respond(id, "confirmed", { identity, rawSessions: rows, sessionIdentityQualified: false })
      continue
    }
    // Name/CreateTime and package Count are not yet qualified ownership/operation proofs.
    throw Error(request.op === "close-session" ? "SESSION_IDENTITY_UNSUPPORTED" : "ADMIN_CAPABILITY_UNSUPPORTED")
  } catch (error) {
    const codes = ["ADMIN_REQUEST_INVALID", "ADMIN_DEADLINE", "ADMIN_ALREADY_INITIALIZED", "ADMIN_NOT_INITIALIZED", "ADMIN_CREDENTIAL_PRIVATE",
      "ADMIN_CREDENTIAL_INVALID", "ADMIN_RUNTIME_PATH", "ADMIN_RUNTIME_HASH", "ADMIN_PROFILE_OWNERSHIP", "ADMIN_CAPABILITY_UNSUPPORTED",
      "ADMIN_IDENTITY_CHANGED", "SERVER_EPOCH_CHANGED", "SESSION_IDENTITY_UNSUPPORTED"]
    respond(id, dispatched ? "unknown" : "not_applied", { code: codes.includes(error?.message) ? error.message : "ADMIN_OUTCOME_UNKNOWN" })
  }
}
await context?.close().catch(() => { process.stderr.write("ADMIN_DISPOSE_UNKNOWN\n"); process.exitCode = 2 })

function respond(id, outcome, data) {
  const frame = JSON.stringify({ v: 1, id, outcome, data })
  if (Buffer.byteLength(frame) > 1024 * 1024) { process.stderr.write("ADMIN_FRAME_TOO_LARGE\n"); process.exitCode = 2; return }
  process.stdout.write(frame + "\n")
}

function remaining(request) {
  if (request.deadline <= Date.now()) throw Error("ADMIN_DEADLINE")
  return request.deadline - Date.now()
}

async function bounded(request, promise) {
  let timer
  try { return await Promise.race([promise, new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(Error("ADMIN_DEADLINE")), remaining(request))
  })]) }
  finally { clearTimeout(timer) }
}

async function readCredentials(file) {
  if (!path.isAbsolute(file) || await realpath(path.dirname(file)).catch(() => undefined) !== path.dirname(file)) throw Error("ADMIN_CREDENTIAL_PRIVATE")
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() => { throw Error("ADMIN_CREDENTIAL_PRIVATE") })
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.nlink !== 1 || info.uid !== process.getuid() || (info.mode & 0o777) !== 0o600) throw Error("ADMIN_CREDENTIAL_PRIVATE")
    const value = JSON.parse(await handle.readFile("utf8"))
    if (!value || Object.keys(value).length !== 2 || typeof value.username !== "string" || !value.username || typeof value.password !== "string" || !value.password ||
      value.username.includes("\0") || value.password.includes("\0")) throw Error("ADMIN_CREDENTIAL_INVALID")
    return value
  } catch (error) { throw Error(error.message === "ADMIN_CREDENTIAL_PRIVATE" ? "ADMIN_CREDENTIAL_PRIVATE" : "ADMIN_CREDENTIAL_INVALID") }
  finally { await handle.close() }
}

async function requireProfile(directory) {
  if (!path.isAbsolute(directory)) throw Error("ADMIN_PROFILE_OWNERSHIP")
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const info = await lstat(directory)
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o777) !== 0o700 ||
    await realpath(directory) !== directory || (await readdir(directory)).length) throw Error("ADMIN_PROFILE_OWNERSHIP")
}
