import path from "node:path"
import { createRequire } from "node:module"
import { readFile, writeFile } from "node:fs/promises"

const spec = JSON.parse(await readFile(process.argv[2], "utf8"))
const credentials = JSON.parse(await readFile(spec.secretFile, "utf8"))
const { chromium } = createRequire(path.join(spec.resources, "runtime/client/package.json"))("playwright-core")
const context = await chromium.launchPersistentContext(path.join(spec.directory, "browser-profile"), {
  executablePath: spec.browser, headless: true, timeout: 30000,
})
const exists = file => readFile(file).then(() => true, error => { if (error.code === "ENOENT") return false; throw error })
const wait = async file => {
  const deadline = Date.now() + 90000
  while (!await exists(file)) {
    if (Date.now() > deadline) throw Error("Live peer did not reach its barrier")
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}
try {
  const page = context.pages()[0] ?? await context.newPage()
  await page.goto(spec.url)
  await page.locator('input[placeholder="Логин"]').fill(credentials.username)
  const password = page.locator('input[placeholder="Пароль"]')
  await password.focus()
  await password.fill(credentials.password)
  await password.blur()
  await page.getByText("Войти", { exact: true }).click()
  await page.waitForFunction(() => typeof bg !== "undefined" && Boolean(bg.app?.Application?.FInstance?.FServerConnection?.ServerContainer?.Session))
  await page.evaluate(async name => {
    const session = bg.app.Application.FInstance.FServerConnection.ServerContainer.Session
    const file = await (await session.FileStorage).CreateFile(name)
    try { await file.WriteBuffer(new Uint8Array([65, 66, 67])) }
    finally { await ReleaseObject(file, true) }
    // Retain the native session for the already-open admin to close after client exit.
    window.onpagehide = null
  }, spec.name)
  await writeFile(path.join(spec.directory, "ready"), "ready", { mode: 0o600 })
  await wait(path.join(spec.peerDirectory, "ready"))
  const isolation = await page.evaluate(async ({ name, peer, peerName }) => {
    const storage = await bg.app.Application.FInstance.FServerConnection.ServerContainer.Session.FileStorage
    const denied = []
    for (const root of [`/${peer}`, `/workdir/UserStorage/${peer}`, `../${peer}`]) {
      const file = await storage.OpenFile(`${root}/${peerName}`, bg.TBGFileOpenMode.fomRead, bg.TBGShareFileMode.sfmShareDenyNone).catch(() => null)
      denied.push(file === null)
      if (file) await ReleaseObject(file, true)
    }
    const file = await storage.OpenFile(name, bg.TBGFileOpenMode.fomRead, bg.TBGShareFileMode.sfmShareDenyNone)
    try {
      const buffer = new Uint8Array(3)
      await file.ReadBuffer(buffer)
      return { denied, own: [...buffer] }
    } finally { await ReleaseObject(file, true) }
  }, { name: spec.name, peer: spec.peer, peerName: spec.peerName })
  await writeFile(path.join(spec.directory, "isolation.json"), JSON.stringify(isolation), { mode: 0o600 })
  if (spec.checkPeerSurvival) {
    await wait(path.join(spec.directory, "check"))
    const survived = await page.evaluate(async name => {
      const session = bg.app.Application.FInstance.FServerConnection.ServerContainer.Session
      const file = await (await session.FileStorage).OpenFile(name, bg.TBGFileOpenMode.fomRead, bg.TBGShareFileMode.sfmShareDenyNone)
      try {
        const bytes = new Uint8Array(3)
        await file.ReadBuffer(bytes)
        return { size: await file.Size, bytes: [...bytes], username: await (await session.CurrentUser).Name }
      }
      finally { await ReleaseObject(file, true) }
    }, spec.name)
    await writeFile(path.join(spec.directory, "survived.json"), JSON.stringify(survived), { mode: 0o600 })
  }
  await wait(path.join(spec.directory, "stop"))
} finally { await context.close() }
