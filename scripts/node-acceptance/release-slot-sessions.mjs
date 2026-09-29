import { parseArgs } from "node:util"
import { readFile, mkdir } from "node:fs/promises"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

// Закрывает серверные сессии одного слота перед холодным открытием пакета.
// Чужие пользователи не трогаются. Учётные данные в stdout не попадают.
process.umask(0o077)
const args = parseArgs({
  options: {
    resources: { type: "string" },
    accounts: { type: "string" },
    "slot-user": { type: "string" },
    output: { type: "string" },
  },
  strict: true,
}).values
if (!args.resources || !args.accounts || !args["slot-user"] || !args.output)
  throw Error("Required: --resources --accounts --slot-user --output")

const slotUser = args["slot-user"]
const accounts = JSON.parse(await readFile(args.accounts, "utf8"))
const url = new URL(accounts.url)
url.searchParams.set("testable", "true")
const root = resolve(args.resources)
const runtime = await import(pathToFileURL(join(root, "runtime", "src/connection-check.mjs")).href)
const resourcesModule = await import(pathToFileURL(join(root, "runtime", "src/resources.mjs")).href)
const resources = await resourcesModule.verifyResources(root)
await mkdir(args.output, { recursive: true, mode: 0o700 })
const authenticated = await runtime.loginBrowser({
  browserPath: resources.browserPath,
  profile: join(args.output, "browser"),
  candidate: { url: url.href, username: accounts.admin_user, password: accounts.admin_password },
  headless: process.env.LOGINOM_AI_AGENT_TEST_HEADLESS !== "0",
  keepOpen: true,
})
const page = authenticated.context.pages()[0]
const tid = (value) => `[data-tid=${JSON.stringify(value)}]`
const suffix = (value) => `[data-tid$=${JSON.stringify(value)}]:visible`
try {
  const target = "MapTreeForm;colNavigation_Сервер>Администрирование>Диспетчер;TreeText"
  if (!(await page.locator(suffix(target)).count()))
    await page.locator(tid("MF;cntMain;tlbMainToolbar;btnNavigator")).click()
  await page.locator(suffix(target)).first().click()
  await page.locator(suffix("SessionsManagerForm;btnRefresh")).click()
  const ids = await page.locator('[data-tid*="SessionsManagerForm;colSession_Root>"]').evaluateAll((elements) => [
    ...new Set(
      elements
        .map((element) => element.getAttribute("data-tid")?.match(/;colSession_Root>([^>;]+)$/)?.[1])
        .filter(Boolean),
    ),
  ])
  const owned = ids.filter((id) => id === slotUser || id.startsWith(`${slotUser}:`))
  let closed = 0
  for (const sessionId of owned) {
    const row = page.locator(suffix(`SessionsManagerForm;colSession_Root>${sessionId}`))
    await row.click({ button: "right" })
    await page.locator(`${tid("mn;btnClose")}:visible`).click()
    const yes = page.locator(`${tid("msgbox;tlb;yes")}:visible`)
    const deadline = Date.now() + 20000
    while (Date.now() < deadline) {
      if ((await row.count()) === 0) break
      if (await yes.count()) await yes.first().click()
      await page.waitForTimeout(300)
    }
    await row.waitFor({ state: "hidden", timeout: 5000 })
    closed += 1
  }
  // A disappeared row is insufficient if another session appeared meanwhile.
  await page.locator(suffix("SessionsManagerForm;btnRefresh")).click()
  const remaining = await page.locator('[data-tid*="SessionsManagerForm;colSession_Root>"]').evaluateAll((elements, user) =>
    elements.some((element) => {
      const id = element.getAttribute("data-tid")?.match(/;colSession_Root>([^>;]+)$/)?.[1]
      return id === user || id?.startsWith(`${user}:`)
    }), slotUser)
  if (remaining) throw Error("SLOT_SESSIONS_REMAIN")
  await page.locator(tid("MF;cntMain;tlbMainToolbar;btnAvatar")).click()
  await page.locator(tid("MF;AppMenuForm;btnLogOut")).click()
  await page.locator(tid("LoginForm;Login;edtUsername")).waitFor({ timeout: 30000 })
  process.stdout.write(JSON.stringify({ slotUser, seen: owned.length, closed, loggedOut: true }) + "\n")
} finally {
  await authenticated.context.close().catch(() => undefined)
}
