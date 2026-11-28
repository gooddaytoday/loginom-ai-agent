import { createDecipheriv, createHash, randomBytes } from "node:crypto"
import { readFile, readdir, realpath, stat, writeFile } from "node:fs/promises"
import { basename, dirname, join, relative } from "node:path"
import { _electron, expect } from "../../packages/app/node_modules/@playwright/test/index.mjs"

const [root, executablePath, ...args] = process.argv.slice(2)
const marker = `sec01-${randomBytes(24).toString("hex")}`
const legacyMarker = `sec01-${randomBytes(24).toString("hex")}`
const retiredMarker = `sec01-${randomBytes(24).toString("hex")}`
const needles = [marker, legacyMarker, retiredMarker].flatMap((value) => [
  Buffer.from(value),
  Buffer.from(value, "utf16le"),
  Buffer.from(Buffer.from(value).toString("base64")),
])
const username = "sec01-fixture-user"
const signIns = []
let logouts = 0
const network = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const path = new URL(request.url).pathname
    if (path === "/fixture-login" && request.method === "POST") {
      const input = await request.json()
      if (input.username !== username || ![marker, legacyMarker].includes(input.password))
        return new Response(null, { status: 403 })
      signIns.push(input.password)
      return new Response(null, { status: 204 })
    }
    if (path === "/fixture-logout" && request.method === "POST") {
      logouts++
      return new Response(null, { status: 204 })
    }
    if (path === "/app/") return new Response(loginPage(), { headers: { "content-type": "text/html" } })
    if (path === "/v1/models") return Response.json({ data: [{ id: "fixture" }] })
    return new Response(null, { status: 404 })
  },
})

const replies = []
const matches = []
const seen = new Set()
let replyCount = 0
let desktop
let step = "starting Desktop"
try {
  const modelList = await fetch(`${network.url.origin}/v1/models`).then((response) => response.json())
  require(modelList.data[0]?.id === "fixture", "local model fixture is unavailable")
  let page = await launch()
  step = "opening Loginom settings"
  let form = await settings(page)
  step = "saving and checking the fixture login"
  await form.getByRole("textbox", { name: /^(Address|Адрес)$/ }).fill(`${network.url.origin}/app/`)
  await form.getByRole("textbox", { name: /^(Username|Пользователь)$/ }).fill(username)
  await form.getByText(/^(No password required|Пароль не нужен)$/).click()
  await form.locator('input[type="password"]').fill(marker)
  await save(form, marker)
  await recordReplies()
  for (const method of ["status", "check", "save"]) require(seen.has(method), `no successful ${method} RPC response`)
  console.log("SEC-01: form save and local Loginom sign-in/logout: OK")

  step = "checking profile, config and local logs"
  const files = await scanFiles(root)
  const active = files.filter((file) => file.endsWith("/loginom/connection/connection.json"))
  require(active.length === 1, "expected one active connection record")
  require(files.some((file) => file.endsWith(".log")), "no local logs to scan")
  require(!matches.length, "plaintext found")
  const profile = await verifyRecord(active[0], marker)
  console.log("SEC-01: clean profile — connection files 0600, password decrypts with Secret Service: OK")

  step = "checking a cold restart of the clean profile"
  await desktop.close()
  page = await launch()
  form = await settings(page)
  await checkStored(form, marker)
  await recordReplies()
  await desktop.close()
  desktop = undefined
  console.log("SEC-01: cold restart — saved password works without re-entry: OK")

  step = "upgrading the old profile"
  const directory = dirname(active[0])
  const generations = join(directory, "generations")
  await command("secret-tool", "clear", "application", "loginom-ai-agent", "desktop-profile", profile)
  await seedLegacy(join(generations, "1.json"), 1, retiredMarker)
  await seedLegacy(join(generations, "2.json"), 2, legacyMarker)
  await seedLegacy(active[0], 2, legacyMarker)
  await seedLegacy(join(directory, "pending.json"), 2, legacyMarker)
  await seedLegacy(join(generations, "3.json.01234567-89ab-4cde-8abc-0123456789ab.tmp"), 3, retiredMarker)
  page = await launch()
  form = await settings(page)
  await checkStored(form, legacyMarker)
  await verifyRecord(active[0], legacyMarker)
  await scanFiles(root)
  require(!matches.length, "plaintext found after startup migration")
  console.log("SEC-01: upgraded profile — old credential works and plaintext is absent before resave: OK")

  step = "resaving the migrated profile"
  await form.locator('input[type="password"]').fill(marker)
  await save(form, marker, active[0], 3)
  await verifyRecord(active[0], marker)
  await verifyRetired(join(generations, "1.json"))
  await verifyRetired(join(generations, "2.json"))
  console.log("SEC-01: resave — prior generations retain no secrets: OK")

  step = "checking a cold restart after migration and resave"
  await recordReplies()
  await desktop.close()
  page = await launch()
  form = await settings(page)
  await checkStored(form, marker)
  console.log("SEC-01: upgraded profile cold restart — replacement password works without re-entry: OK")

  step = "exporting and scanning LOG-01 diagnostics"
  await exportLogs(page)
  await desktop.close()
  desktop = undefined
  await recordReplies()
  const scanned = await scanFiles(root)
  require(!matches.length, "plaintext found")
  console.log(
    `SEC-01: 0 matches — profile/config/logs (${scanned.length} files), API (${replyCount} responses), LOG-01 ZIP`,
  )
} catch (error) {
  console.error(`SEC-01 FAIL: ${step}: ${withoutCanary(error.message).slice(0, 900)}`)
  for (const path of new Set(matches)) {
    console.error(`  match: ${withoutCanary(path)}`)
  }
  process.exitCode = 1
} finally {
  await desktop?.close().catch(() => {})
  network.stop(true)
}

async function save(form, password, active, generation) {
  const before = signIns.length
  const priorLogouts = logouts
  await form.getByRole("button", { name: /^(Save|Сохранить)$/ }).click()
  await expect.poll(() => signIns.length, { timeout: 150_000 }).toBeGreaterThan(before)
  if (active)
    await expect
      .poll(async () => JSON.parse(await readFile(active, "utf8")).generation, { timeout: 90_000 })
      .toBe(generation)
  await expect(form.getByText(/(Connected as|Подключён как) sec01-fixture-user/)).toBeVisible({ timeout: 150_000 })
  require(signIns.slice(before).includes(password) && logouts > priorLogouts, "unexpected fixture sign-in/logout")
  await expect(form.locator('input[type="password"]')).toHaveValue("")
}

async function checkStored(form, password) {
  const before = signIns.length
  await expect(form.locator('input[type="password"]')).toHaveValue("")
  await expect(form.locator('input[type="password"]')).toHaveAttribute(
    "placeholder",
    /^(Password saved|Пароль сохранён)$/,
  )
  await form.getByRole("button", { name: /^(Check|Проверить)$/ }).click()
  await expect(form.getByText(/^(Checked, not yet saved|Проверено, ещё не сохранено)$/)).toBeVisible({
    timeout: 150_000,
  })
  require(signIns.slice(before).includes(password), "fixture did not receive the stored password")
}

async function seedLegacy(file, generation, password) {
  await writeFile(
    file,
    JSON.stringify({
      generation,
      revision: generation,
      url: `${network.url.origin}/app/`,
      urlSource: "explicit",
      username,
      secrets: {
        format: "loginom-cli-secrets-v1",
        protection: "plaintext",
        payload: JSON.stringify({ apiKey: "", password }),
      },
    }),
    { mode: 0o600 },
  )
}

async function verifyRetired(file) {
  const record = JSON.parse(await readFile(file, "utf8"))
  require(record.secrets?.retired === true, "old generation not retired")
  require(Object.keys(record.secrets).length === 1, "old generation retained secrets")
}

async function verifyRecord(active, password) {
  const files = await scanFiles(dirname(active))
  const secrets = JSON.parse(await readFile(active, "utf8")).secrets
  require(secrets?.protection === "secret-service", "not an OS-protected record")
  for (const file of files.filter((name) => name.endsWith(".json"))) {
    require(((await stat(file)).mode & 0o777) === 0o600, `not 0600: ${relative(root, file)}`)
  }
  const profile = createHash("sha256")
    .update(await realpath(join(dirname(active), "..")))
    .digest("hex")
  const key = await command("secret-tool", "lookup", "application", "loginom-ai-agent", "desktop-profile", profile)
  require(/^[A-Za-z0-9+/]{43}=$/.test(key.toString()), "no profile key in the isolated Secret Service")
  const keyBytes = Buffer.from(key.toString(), "base64")
  needles.push(key, keyBytes)
  const envelope = JSON.parse(secrets.payload)
  const decipher = createDecipheriv("aes-256-gcm", keyBytes, Buffer.from(envelope.nonce, "base64"))
  decipher.setAAD(Buffer.from(`loginom-cli-secrets-v1:${profile}`))
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"))
  const persisted = Buffer.concat([decipher.update(envelope.ciphertext, "base64"), decipher.final()])
  require(JSON.parse(persisted).password === password, "the saved record did not decrypt to the fixture password")
  return profile
}

async function exportLogs(page) {
  await page.keyboard.press("Escape")
  await page.keyboard.press("Control+Shift+P")
  const palette = page.getByRole("dialog").filter({ has: page.getByRole("combobox") })
  await palette.getByRole("combobox").fill("Export logs")
  await palette.getByRole("option", { name: /^(Export logs|Экспортировать журналы)/ }).click()
  const downloads = await desktop.evaluate(({ app }) => app.getPath("downloads"))
  require(!relative(root, downloads).startsWith(".."), "Desktop downloads escaped the isolated profile")
  const archives = () => readdir(downloads).then((files) => files.filter((file) => /-debug-.*\.zip$/.test(file)))
  await expect.poll(async () => (await archives()).length, { timeout: 60_000 }).toBe(1)
  const zip = join(downloads, (await archives())[0])
  await expect.poll(async () => await validZip(zip), { timeout: 30_000 }).toBe(true)
  const members = await command("unzip", "-Z1", zip)
  const entries = members.toString().split("\n")
  require(entries.some((entry) => /^(desktop|server[^/]*)\/.+\.log$/.test(entry)), "no logs in diagnostics")
  require(entries.includes("manifest.json"), "no diagnostics manifest")
  scan("diagnostics member names", members)
  scan("uncompressed diagnostics", await command("unzip", "-p", zip))
}

async function launch() {
  desktop = await _electron.launch({
    executablePath,
    args: [...args, "--lang=en-US", "--disable-background-networking"],
    env: {
      ...process.env,
      LOGINOM_AI_AGENT_DISABLE_MODELS_FETCH: "1",
      LOGINOM_AI_AGENT_DISABLE_FREE_MODELS: "1",
      LOGINOM_AI_AGENT_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: "1",
      LOGINOM_AI_AGENT_MODELS_URL: `${network.url.origin}/models.json`,
      ...(args[0] ? { LOGINOM_AI_AGENT_RESOURCES: join(args[0], "resources/loginom") } : {}),
      LOGINOM_AI_AGENT_CONFIG_CONTENT: JSON.stringify({
        model: "test/fixture",
        enabled_providers: ["test"],
        provider: {
          test: {
            npm: "@ai-sdk/openai-compatible",
            options: { baseURL: `${network.url.origin}/v1` },
            models: { fixture: { name: "SEC-01 fixture" } },
          },
        },
      }),
    },
    timeout: 60_000,
  })
  for (const stream of ["stdout", "stderr"]) {
    desktop.process()[stream]?.on("data", (chunk) => scan(`Desktop ${stream}`, chunk))
  }
  const page = await desktop.firstWindow({ timeout: 60_000 })
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname
    if (!path.startsWith("/api/")) return
    const method = path.match(/^\/api\/rpc\/loginom\.connection\/(status|check|save)$/)?.[1]
    if (!method && !(response.headers()["content-type"] ?? "").includes("json")) return
    replies.push(
      response.body().then(
        (body) => ({ method, path, body }),
        () => ({ method, path }),
      ),
    )
  })
  page.setDefaultTimeout(30_000)
  return page
}

async function settings(page) {
  await expect(page.getByRole("button", { name: /^(Home|Главная)$/ })).toBeVisible({ timeout: 90_000 })
  await page.keyboard.press("Control+,")
  await page.getByRole("tab", { name: "Loginom", exact: true }).click()
  const form = page.getByRole("tabpanel", { name: "Loginom", exact: true })
  const address = form.getByRole("textbox", { name: /^(Address|Адрес)$/ })
  const reload = form.getByRole("button", { name: /^(Reload connection|Обновить подключение)$/ })
  await expect
    .poll(
      async () => {
        if (await address.isEditable({ timeout: 250 }).catch(() => false)) return true
        if (await reload.isVisible()) await reload.click()
        return false
      },
      { timeout: 90_000, intervals: [1_000] },
    )
    .toBe(true)
    .catch(async () => {
      throw Error(`settings unavailable: ${await form.innerText({ timeout: 1000 }).catch(() => "tabpanel missing")}`)
    })
  return form
}

async function recordReplies() {
  for (const { body, path, method } of await Promise.all(replies.splice(0))) {
    if (!body) {
      require(!method, `unreadable ${method} RPC response`)
      continue
    }
    replyCount++
    scan(path, body)
    if (method && JSON.parse(body).output?.ok === true) seen.add(method)
  }
}

function require(condition, message) {
  if (!condition) throw new Error(message)
}

function withoutCanary(text) {
  return needles.reduce((safe, value) => safe.replaceAll(value.toString(), "<redacted>"), text)
}

function scan(label, bytes) {
  if (needles.some((needle) => bytes.includes(needle))) matches.push(label)
}

async function scanFiles(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code !== "ENOENT") throw error
    return []
  })) {
    const file = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await scanFiles(file)))
    if (!entry.isFile()) continue
    const bytes = await readFile(file).catch((error) => {
      if (error.code !== "ENOENT") throw error
      return null
    })
    if (!bytes) continue
    scan(relative(root, file), bytes)
    scan(relative(root, file), Buffer.from(basename(file)))
    files.push(file)
  }
  return files
}

async function command(program, ...args) {
  const child = Bun.spawn([program, ...args], { stdout: "pipe", stderr: "ignore" })
  const bytes = Buffer.from(await new Response(child.stdout).arrayBuffer())
  require((await child.exited) === 0, `${program} failed`)
  return bytes
}

async function validZip(file) {
  return command("unzip", "-tq", file).then(
    () => true,
    () => false,
  )
}

function loginPage() {
  return `<!doctype html><title>Local SEC-01 fixture</title>
<form id="login">
  <label data-tid="LoginForm;Login;edtUsername"><input name="username" required></label>
  <label data-tid="LoginForm;Login;edtPassword"><input name="password" type="password" required></label>
  <button data-tid="LoginForm;Login;btnLogin">Login</button>
</form>
<button id="avatar" data-tid="MF;cntMain;tlbMainToolbar;btnAvatar" hidden>Account</button>
<button id="logout" data-tid="MF;AppMenuForm;btnLogOut" hidden>Logout</button>
<script>
  const login = document.getElementById("login"), avatar = document.getElementById("avatar"), logout = document.getElementById("logout")
  login.onsubmit = async (event) => {
    event.preventDefault()
    const input = Object.fromEntries(new FormData(login))
    const reply = await fetch("/fixture-login", { method: "POST", body: JSON.stringify(input) })
    if (!reply.ok) return
    globalThis.bg = { app: { Application: { FInstance: { FMainForm: { FMapTree: { FServerConnection: { UserName: input.username } } } } } } }
    login.reset()
    login.hidden = true
    avatar.hidden = false
  }
  avatar.onclick = () => { logout.hidden = false }
  logout.onclick = async () => {
    await fetch("/fixture-logout", { method: "POST" })
    delete globalThis.bg
    avatar.hidden = logout.hidden = true
    login.hidden = false
  }
</script>`
}
