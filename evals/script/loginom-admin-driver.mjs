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
const sessionBindings = new Map()

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
      const transportDisconnect = context && identity ? await bounded(request, page.evaluate(async () => {
        const session = bg.app.Application.FInstance.FServerConnection.ServerContainer.FServerConnector.$FSession
        if (!session || typeof session.Disconnect !== "function") throw Error("ADMIN_CAPABILITY_UNSUPPORTED")
        // Connector.Dispose starts this Task without awaiting it; browser closure may cancel the flush.
        const task = session.Disconnect()
        if (!task || typeof task.then !== "function") throw Error("ADMIN_CAPABILITY_UNSUPPORTED")
        await task
        window.onpagehide = null
        return "confirmed"
      })) : undefined
      if (context) await bounded(request, context.close())
      context = undefined
      disposed = true
      respond(id, "confirmed", { disposed: true, ...(transportDisconnect ? { transportDisconnect } : {}) })
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
      page.on("console", traceConsole)
      page.setDefaultTimeout(remaining(request))
      process.stderr.write("ADMIN_INIT_STAGE_NAVIGATION\n")
      await page.goto(url.href, { timeout: remaining(request) })
      process.stderr.write("ADMIN_INIT_STAGE_FORM\n")
      const login = page.locator('input[placeholder="Логин"]')
      const password = page.locator('input[placeholder="Пароль"]')
      const submit = page.getByText("Войти", { exact: true })
      await Promise.all([login, password, submit].map(locator => locator.waitFor({ state: "visible", timeout: remaining(request) })))
      if (await login.count() !== 1 || await password.count() !== 1 || await submit.count() !== 1) throw Error("ADMIN_CAPABILITY_UNSUPPORTED")
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
      await submit.click()
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
    if (request.op === "close-session") {
      if (typeof request.payload?.proofId !== "string") throw Error("SESSION_IDENTITY_UNSUPPORTED")
      const binding = request.payload.adopt === undefined ? sessionBindings.get(request.payload.proofId)
        : await readSessionBinding(request.payload, identity)
      if (!binding) { respond(id, "not_applied", { code: "SESSION_OWNERSHIP_UNCONFIRMED" }); continue }
      if (Object.keys(request.payload).length !== (request.payload.adopt === undefined ? 2 : 3) || !request.payload.session || Object.keys(request.payload.session).length !== 6 ||
        Object.entries(binding.session).some(([key, value]) => request.payload.session[key] !== value)) {
        respond(id, "not_applied", { code: "SESSION_IDENTITY_CHANGED" }); continue
      }
      dispatched = true
      const result = await bounded(request, page.evaluate(async binding => {
        let applied = false
        try {
          const session = await bg.app.Application.FInstance.FServerConnection.ServerContainer.Session
          const scoped = await bg.ScopeGetObjectAsync(session, bg.IBGDeductorSessionsManagerContainer)
          const manager = await scoped.GetSessionsManager()
          const users = await session.GetUsers()
          const enumerator = await users.GetEnumerator(bg.TBGDeductorUserKinds.dukAll)
          const matches = []
          try {
            while (await enumerator.MoveNext()) {
              const user = await enumerator.Current
              if ((await user.Name).toLowerCase() === binding.session.username.toLowerCase()) matches.push(user)
            }
          } finally { await ReleaseObject(enumerator, true) }
          if (matches.length !== 1 || await matches[0].Name !== binding.session.username || await matches[0].UserKind !== 0 ||
            (await bg.ProxyObjectsHelper.GetObjectId(matches[0])).toString() !== binding.userObjectId)
            return { outcome: "not_applied", data: { code: "SESSION_USER_IDENTITY_CHANGED" } }
          await manager.UpdateSessionInfos()
          const rows = []
          for (let index = 0; index < await manager.Count; index++) {
            const row = await manager.SessionInfo(index)
            rows.push({ proxy: row, objectId: (await bg.ProxyObjectsHelper.GetObjectId(row)).toString(), name: await row.Name,
              createdAt: (await row.CreateTime).toISOString(), pendingDisconnect: await row.PendingDisconnect, packageCount: await row.Count })
          }
          const retained = rows.filter(row => row.objectId === binding.session.remoteKey ||
            row.name === binding.session.name && row.createdAt === binding.session.createdAt)
          if (retained.length > 1) return { outcome: "not_applied", data: { code: "SESSION_IDENTITY_AMBIGUOUS" } }
          if (retained.some(row => row.name !== binding.session.name || row.createdAt !== binding.session.createdAt))
            return { outcome: "not_applied", data: { code: "SESSION_IDENTITY_CHANGED" } }
          if (retained.length) {
            // Only fixed probes attest one package created without execution after closing the writer context.
            if (retained[0].packageCount !== 0 && (binding.retainedPackageCount !== 1 || retained[0].packageCount !== 1) || retained[0].pendingDisconnect !== true)
              return { outcome: "not_applied", data: { code: "SESSION_NOT_IDLE" } }
            applied = true
            if (!await manager.CloseSession(retained[0].proxy, 5000)) throw Error("close")
            while (Date.now() < binding.deadline) {
              await manager.UpdateSessionInfos()
              const current = []
              for (let index = 0; index < await manager.Count; index++) {
                const row = await manager.SessionInfo(index)
                current.push({ objectId: (await bg.ProxyObjectsHelper.GetObjectId(row)).toString(), name: await row.Name,
                  createdAt: (await row.CreateTime).toISOString() })
              }
              if (!current.some(row => row.objectId === binding.session.remoteKey ||
                row.name === binding.session.name && row.createdAt === binding.session.createdAt))
                return { outcome: "confirmed", data: { closed: true, disposition: "rpc_closed" } }
            }
            throw Error("deadline")
          }
          // The fixed probe closed its only writer context; fresh server absence completes this bound observation.
          return { outcome: "confirmed", data: { closed: true, disposition: "observed_absent" } }
        } catch { return { outcome: applied ? "unknown" : "not_applied", data: { code: "SESSION_CLOSE_UNKNOWN" } } }
      }, { ...binding, deadline: request.deadline }))
      respond(id, result.outcome, result.data)
      continue
    }
    if (request.op === "reconcile-user") {
      const payload = request.payload
      if (!["blocked", "configure", "acl", "activate", "session-probe", "session-crash-probe", "session-package-crash-probe", "session-backup-probe", "session-storage-probe"].includes(payload?.phase)) throw Error("ADMIN_CAPABILITY_UNSUPPORTED")
      if (!payload || Object.keys(payload).length !== (["acl", "activate", "session-probe", "session-crash-probe", "session-package-crash-probe", "session-backup-probe", "session-storage-probe"].includes(payload.phase) ? 8 : 7) || !payload.slot || typeof payload.slot.username !== "string" ||
        !payload.slot.username || payload.slot.username.includes("\0") || typeof payload.secretFile !== "string" ||
        typeof payload.preparationNonce !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(payload.preparationNonce) ||
        [payload.desiredHash, payload.secretHash].some(hash => typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) ||
        payload.phase !== "blocked" && !payload.owned || payload.owned !== null && (!payload.owned ||
          Object.keys(payload.owned).length !== (payload.phase !== "blocked" ? 5 : 4) || typeof payload.owned.objectId !== "string" || !payload.owned.objectId ||
          payload.owned.name !== payload.slot.username || payload.owned.userKind !== 0 || payload.owned.preparationNonce !== payload.preparationNonce ||
          payload.phase !== "blocked" && payload.owned.secretHash !== null && (typeof payload.owned.secretHash !== "string" || !/^[0-9a-f]{64}$/.test(payload.owned.secretHash))))
        throw Error("ADMIN_REQUEST_INVALID")
      if (["acl", "activate", "session-probe", "session-crash-probe", "session-package-crash-probe", "session-backup-probe", "session-storage-probe"].includes(payload.phase) && (!Array.isArray(payload.expectedPolicy) || payload.expectedPolicy.some(directory => !directory ||
        Object.keys(directory).length !== 3 || typeof directory.objectId !== "string" || !directory.objectId || typeof directory.name !== "string" || !directory.name ||
        !Array.isArray(directory.permissions) || directory.permissions.some(principal => !principal || Object.keys(principal).length !== 3 ||
          typeof principal.objectId !== "string" || !principal.objectId || typeof principal.name !== "string" || !principal.name || ![0, 1, 2].includes(principal.userKind)))))
        throw Error("ADMIN_REQUEST_INVALID")
      const credentials = await readCredentials(payload.secretFile)
      if (credentials.username !== payload.slot.username || createHash("sha256").update(JSON.stringify(credentials)).digest("hex") !== payload.secretHash)
        throw Error("ADMIN_CREDENTIAL_INVALID")
      dispatched = true
      const result = await bounded(request, page.evaluate(async ({ username, owned, phase, password, secretHash, expectedPolicy }) => {
        let applied = false
        let stage = "ENUMERATE"
        try {
          console.info("ADMIN_USER_STAGE_ENUMERATE")
          const session = await bg.app.Application.FInstance.FServerConnection.ServerContainer.Session
          const users = await session.GetUsers()
          const enumerator = await users.GetEnumerator(bg.TBGDeductorUserKinds.dukAll)
          const matches = []
          try {
            while (await enumerator.MoveNext()) {
              const user = await enumerator.Current
              if ((await user.Name).toLowerCase() === username.toLowerCase()) matches.push(user)
            }
          } finally {
            // Deferred disposal can retain the enumeration lock while Add waits.
            await ReleaseObject(enumerator, true)
          }
          if (!owned && matches.length || owned && (matches.length !== 1 || await matches[0].Name !== owned.name ||
            await matches[0].UserKind !== owned.userKind || (await bg.ProxyObjectsHelper.GetObjectId(matches[0])).toString() !== owned.objectId))
            return { outcome: "not_applied", data: { code: "ADMIN_USER_OWNERSHIP_CONFLICT" } }
          if (!owned) applied = true
          stage = "ADD"
          console.info("ADMIN_USER_STAGE_ADD")
          const user = await cast(owned ? matches[0] : await users.Add(username, bg.TBGDeductorUserKind.dukUser), bg.IBGDeductorUser)
          const flags = [["IsAdmin", false], ["IsDesigner", true], ["IsViewer", false], ["UseGlobalFileStorage", false], ["SchedulerFullAccess", false], ["AllowPublish", false]]
          if (owned && !["activate", "session-probe", "session-crash-probe", "session-package-crash-probe", "session-backup-probe", "session-storage-probe"].includes(phase) && await user.Blocked !== true) return { outcome: "not_applied", data: { code: "ADMIN_USER_NOT_IDLE" } }
          if (["acl", "activate", "session-probe", "session-crash-probe", "session-package-crash-probe", "session-backup-probe", "session-storage-probe"].includes(phase)) {
            stage = "ACL"
            console.info("ADMIN_USER_STAGE_ACL")
            const snapshot = async () => {
              const collection = await session.GetSharedDirectories()
              const enumerator = await collection.GetEnumerator()
              const directories = []
              try {
                while (await enumerator.MoveNext()) {
                  const directory = await enumerator.Current
                  const access = await directory.Permissions
                  const grants = await access.GetEnumerator()
                  const permissions = []
                  try {
                    while (await grants.MoveNext()) {
                      const principal = await grants.Current
                      permissions.push({ principal, objectId: (await bg.ProxyObjectsHelper.GetObjectId(principal)).toString(), name: await principal.Name, userKind: await principal.UserKind })
                    }
                  } finally { await ReleaseObject(grants, true) }
                  directories.push({ access, objectId: (await bg.ProxyObjectsHelper.GetObjectId(directory)).toString(), name: await directory.Name, permissions })
                }
              } finally { await ReleaseObject(enumerator, true) }
              return directories
            }
            const normalize = directories => directories.map(directory => ({ objectId: directory.objectId, name: directory.name,
              permissions: directory.permissions.map(principal => ({ objectId: principal.objectId, name: principal.name, userKind: principal.userKind }))
                .sort((a, b) => a.objectId.localeCompare(b.objectId)) })).sort((a, b) => a.objectId.localeCompare(b.objectId))
            const forbidden = principal => principal.name === "Everyone" && principal.userKind === 2 ||
              principal.name === username && principal.userKind === 0 && principal.objectId === owned.objectId
            const before = await snapshot()
            if (JSON.stringify(normalize(before)) !== JSON.stringify(normalize(expectedPolicy)))
              return { outcome: "not_applied", data: { code: "ADMIN_ACL_POLICY_CHANGED" } }
            if (["activate", "session-probe", "session-crash-probe", "session-package-crash-probe", "session-backup-probe", "session-storage-probe"].includes(phase)) {
              const safePolicy = async () => owned.secretHash === secretHash && await user.AuthMode === bg.TBGDeductorUserAuthMode.uamLocal &&
                (await Promise.all(flags.map(async ([name, value]) => await user[name] === value))).every(Boolean)
              if (before.some(directory => directory.permissions.length) || !await safePolicy())
                return { outcome: "not_applied", data: { code: "ADMIN_USER_POLICY_CHANGED" } }
              stage = "ACTIVATE"
              console.info("ADMIN_USER_STAGE_ACTIVATE")
              const blocked = await user.Blocked
              if (typeof blocked !== "boolean") throw Error("readback")
              if (phase !== "activate") return blocked ? { outcome: "not_applied", data: { code: "ADMIN_USER_NOT_ACTIVE" } }
                : { outcome: "confirmed", data: { probeAllowed: true } }
              if (blocked) { applied = true; await user.set_Blocked(false) }
              const observed = { objectId: (await bg.ProxyObjectsHelper.GetObjectId(user)).toString(), name: await user.Name,
                userKind: await user.UserKind, blocked: await user.Blocked }
              if (observed.objectId !== owned.objectId || observed.name !== username || observed.userKind !== 0 || observed.blocked !== false ||
                !await safePolicy()) throw Error("readback")
              return { outcome: "confirmed", data: { activated: blocked, user: observed } }
            }
            if (before.some(directory => directory.permissions.some(principal => principal.name === username && principal.userKind === 0 && principal.objectId !== owned.objectId)))
              return { outcome: "not_applied", data: { code: "ADMIN_ACL_PRINCIPAL_CHANGED" } }
            let removed = 0
            for (const directory of before) {
              const targets = directory.permissions.filter(forbidden)
              if (!targets.length) continue
              applied = true
              await directory.access.Delete(targets.map(target => target.principal))
              removed += targets.length
            }
            const policy = normalize(await snapshot())
            const preserved = normalize(before.map(directory => ({ ...directory, permissions: directory.permissions.filter(principal => !forbidden(principal)) })))
            if (JSON.stringify(policy) !== JSON.stringify(preserved)) throw Error("readback")
            return { outcome: "confirmed", data: { removed, policy } }
          }
          stage = "BLOCK"
          console.info("ADMIN_USER_STAGE_BLOCK")
          if (!owned) await user.set_Blocked(true)
          const authModeChanged = phase === "configure" && await user.AuthMode !== bg.TBGDeductorUserAuthMode.uamLocal
          const passwordChanged = phase === "configure" && (authModeChanged || owned.secretHash !== secretHash)
          if (phase === "configure") {
            stage = "CONFIGURE"
            console.info("ADMIN_USER_STAGE_CONFIGURE")
            if (authModeChanged) { applied = true; console.info("ADMIN_USER_WRITE_AUTHMODE"); await user.set_AuthMode(bg.TBGDeductorUserAuthMode.uamLocal) }
            if (passwordChanged) { applied = true; console.info("ADMIN_USER_WRITE_PASSWORD"); await user.SetPassword(password) }
            for (const [name, value] of flags) {
              if (await user[name] === value) continue
              applied = true
              await user["set_" + name](value)
            }
          }
          stage = "READBACK"
          console.info("ADMIN_USER_STAGE_READBACK")
          const observed = { objectId: (await bg.ProxyObjectsHelper.GetObjectId(user)).toString(), name: await user.Name,
            userKind: await user.UserKind, blocked: await user.Blocked, ...(phase === "configure" ? { authMode: await user.AuthMode,
              isAdmin: await user.IsAdmin, isDesigner: await user.IsDesigner, isViewer: await user.IsViewer,
              useGlobalFileStorage: await user.UseGlobalFileStorage, schedulerFullAccess: await user.SchedulerFullAccess, allowPublish: await user.AllowPublish } : {}) }
          if (observed.name !== username || observed.userKind !== 0 || observed.blocked !== true) throw Error("readback")
          if (phase === "configure" && (observed.authMode !== bg.TBGDeductorUserAuthMode.uamLocal || observed.isAdmin !== false ||
            observed.isDesigner !== true || observed.isViewer !== false || observed.useGlobalFileStorage !== false ||
            observed.schedulerFullAccess !== false || observed.allowPublish !== false)) throw Error("readback")
          return { outcome: "confirmed", data: phase === "configure" ? { authModeChanged, passwordChanged, secretHash, user: observed } : { created: !owned, user: observed } }
        } catch { return { outcome: applied ? "unknown" : "not_applied", data: { code: "ADMIN_USER_" + stage + "_UNKNOWN" } } }
      }, { username: payload.slot.username, owned: payload.owned, phase: payload.phase,
        password: payload.phase === "configure" ? credentials.password : null, secretHash: payload.secretHash, expectedPolicy: payload.expectedPolicy ?? null }))
      if (["session-probe", "session-crash-probe", "session-package-crash-probe", "session-backup-probe", "session-storage-probe"].includes(payload.phase) && result.outcome === "confirmed") {
        const retainedPackage = ["session-package-crash-probe", "session-backup-probe"].includes(payload.phase)
        const storageRoots = payload.phase === "session-backup-probe" ? await bounded(request, page.evaluate(async () => {
          const session = await bg.app.Application.FInstance.FServerConnection.ServerContainer.Session
          const settings = await session.Settings
          return { userStorage: await settings.UserStorageDirectory, sessionBackup: await settings.SessionBackupDirectory, keepAliveMs: await settings.SessionKeepAlive }
        })) : null
        const snapshot = () => bounded(request, page.evaluate(async () => {
          const session = await bg.app.Application.FInstance.FServerConnection.ServerContainer.Session
          const manager = await (await bg.ScopeGetObjectAsync(session, bg.IBGDeductorSessionsManagerContainer)).GetSessionsManager()
          await manager.UpdateSessionInfos()
          const rows = []
          for (let index = 0; index < await manager.Count; index++) {
            const row = await manager.SessionInfo(index)
            rows.push({ objectId: (await bg.ProxyObjectsHelper.GetObjectId(row)).toString(), name: await row.Name,
              createdAt: (await row.CreateTime).toISOString(), pendingDisconnect: await row.PendingDisconnect, packageCount: await row.Count })
          }
          return rows
        }))
        const baseline = await snapshot()
        process.stderr.write("ADMIN_USER_PROBE_STAGE_BROWSER\n")
        const probeContext = await context.browser().newContext()
        const observed = await (async () => {
          try {
            const probePage = await probeContext.newPage()
            probePage.on("console", traceConsole)
            await probePage.goto(page.url(), { timeout: remaining(request) })
            const login = probePage.locator('input[placeholder="Логин"]')
            const password = probePage.locator('input[placeholder="Пароль"]')
            const submit = probePage.getByText("Войти", { exact: true })
            await Promise.all([login, password, submit].map(locator => locator.waitFor({ state: "visible", timeout: remaining(request) })))
            if (await login.count() !== 1 || await password.count() !== 1 || await submit.count() !== 1) throw Error("ADMIN_CAPABILITY_UNSUPPORTED")
            process.stderr.write("ADMIN_USER_PROBE_STAGE_LOGIN\n")
            await login.fill(credentials.username)
            await password.focus()
            await password.fill(credentials.password)
            await password.blur()
            await submit.click()
            await probePage.waitForFunction(() => typeof bg !== "undefined" && Boolean(bg.app?.Application?.FInstance?.FServerConnection?.ServerContainer?.Session), null, { timeout: remaining(request) })
            // MainForm initializes the design user's autosave setting after publishing Session.
            if (payload.phase === "session-backup-probe") await probePage.waitForFunction(() =>
              typeof bg.markdown?.Markdown?.OnLoadAllowedLinkURLs === "function", null, { timeout: remaining(request) })
            process.stderr.write("ADMIN_USER_PROBE_STAGE_SESSION\n")
            const ownSession = await bounded(request, probePage.evaluate(async () => {
              const session = await bg.app.Application.FInstance.FServerConnection.ServerContainer.Session
              const user = await session.CurrentUser
              return { guid: String(await session.Guid), objectId: (await bg.ProxyObjectsHelper.GetObjectId(session)).toString(),
                userObjectId: (await bg.ProxyObjectsHelper.GetObjectId(user)).toString(), username: await user.Name,
                isAdmin: await user.IsAdmin, isDesigner: await user.IsDesigner }
            }))
            if (ownSession.username !== credentials.username || ownSession.userObjectId !== payload.owned.objectId ||
              ownSession.isAdmin !== false || ownSession.isDesigner !== true) throw Error("ADMIN_USER_IDENTITY_CHANGED")
            const opened = await snapshot()
            process.stderr.write("ADMIN_USER_PROBE_STAGE_CREATE\n")
            const handle = await bounded(request, probePage.evaluateHandle(async () =>
              (await bg.app.Application.FInstance.FServerConnection.ServerContainer.Session).CreatePackage()))
            try {
              const withPackage = await snapshot()
              const storage = payload.phase === "session-storage-probe" ? await bounded(request, probePage.evaluate(async item => {
                const session = await bg.app.Application.FInstance.FServerConnection.ServerContainer.Session
                await session.SavePackageAs(item, "access-probe.lgp")
                const storage = await session.FileStorage
                const stream = await storage.OpenFile("access-probe.lgp", bg.TBGFileOpenMode.fomRead, bg.TBGShareFileMode.sfmShareDenyNone)
                const size = await stream.Size
                const buffer = new Uint8Array(Math.min(size, 64))
                try { await stream.ReadBuffer(buffer) }
                finally { await ReleaseObject(stream, true) }
                const copied = await storage.CopyFile("access-probe.lgp", "access-copy.lgp", false, false)
                const info = await storage.GetFileInfo("access-copy.lgp")
                try { return { readConfirmed: size > 0 && buffer.some(value => value !== 0), size, copySize: copied ? await info.Size : null } }
                finally { await ReleaseObject(info, true) }
              }, handle)) : null
              const backup = payload.phase === "session-backup-probe" ? await bounded(request, probePage.evaluate(async ({ item, deadline }) => {
                const session = await bg.app.Application.FInstance.FServerConnection.ServerContainer.Session
                const manager = await session.SessionBackupManager
                const snapshot = async () => {
                  const list = await manager.GetSessionsList()
                  const rows = []
                  try {
                    for (let index = 0; index < await list.Count; index++) {
                      const row = await list.getItem(index)
                      rows.push({ objectId: (await bg.ProxyObjectsHelper.GetObjectId(row)).toString(), packageCount: await row.PackageCount,
                        startTime: (await row.StartTime).toISOString(), backupTime: (await row.BackupTime).toISOString() })
                    }
                  } finally { await ReleaseObject(list, true) }
                  return rows
                }
                const before = await snapshot()
                console.info("ADMIN_USER_STAGE_BACKUP_BASELINE")
                const unit = await (await item.ModelUnits).AddDefault()
                await unit.set_DisplayName("Backup probe")
                await session.SavePackageAs(item, "backup-probe.lgp")
                await item.set_BinaryCmpUniqValues(!await item.BinaryCmpUniqValues)
                const modified = await session.IsPackageModified(item)
                console.info("ADMIN_USER_STAGE_BACKUP_MODIFIED")
                await session.set_PackageAutoSavePeriod(5000)
                const periodMs = await session.PackageAutoSavePeriod
                console.info("ADMIN_USER_STAGE_BACKUP_PERIOD")
                if (periodMs !== 5000) return { periodMs, modified, before, after: await snapshot(), nonemptyObserved: false, reason: "policy_mismatch" }
                console.info("ADMIN_USER_STAGE_BACKUP_WAIT")
                const until = Math.min(deadline - 200, Date.now() + 2 * periodMs)
                while (Date.now() < until) {
                  const observedPeriodMs = await session.PackageAutoSavePeriod
                  if (observedPeriodMs !== periodMs) {
                    console.info("ADMIN_USER_STAGE_BACKUP_DRIFT")
                    return { periodMs, observedPeriodMs, modified, before, after: await snapshot(), nonemptyObserved: false, reason: "period_drift" }
                  }
                  const after = await snapshot()
                  if (after.some(row => row.packageCount > 0)) return { periodMs, modified, before, after, nonemptyObserved: true }
                  await new Promise(resolve => setTimeout(resolve, Math.min(periodMs / 4, until - Date.now())))
                }
                return { periodMs, modified, before, after: await snapshot(), nonemptyObserved: false, reason: "not_observed" }
              }, { item: handle, deadline: request.deadline })) : null
              if (!retainedPackage) {
                process.stderr.write("ADMIN_USER_PROBE_STAGE_CLOSE\n")
                await bounded(request, probePage.evaluate(async item => {
                  const session = await bg.app.Application.FInstance.FServerConnection.ServerContainer.Session
                  await session.ClosePackage(new Ref(item), 5000)
                }, handle))
              }
              const afterPackage = await snapshot()
              // Interrupt only this owned renderer's orderly logout; the native server/RPC remains real.
              if (!["session-probe", "session-storage-probe"].includes(payload.phase)) await probePage.evaluate(() => { window.onpagehide = null })
              return { ownSession, baseline, opened, withPackage, afterPackage, sessionIdentityQualified: false, ...(storage ? { storage } : {}), ...(backup ? { backup, storageRoots } : {}) }
            } finally { await handle.dispose() }
          } finally { await probeContext.close() }
        })()
        const candidates = observed.opened.filter(row => !observed.baseline.some(previous => previous.objectId === row.objectId) &&
          row.name.startsWith(credentials.username + ":") && /^[1-9]\d*$/.test(row.name.slice(credentials.username.length + 1)) && row.packageCount === 0 &&
          observed.withPackage.some(item => item.objectId === row.objectId && item.name === row.name && item.createdAt === row.createdAt && item.packageCount === 1) &&
          observed.afterPackage.some(item => item.objectId === row.objectId && item.name === row.name && item.createdAt === row.createdAt && item.packageCount === (retainedPackage ? 1 : 0)))
        if (candidates.length !== 1) throw Error("SESSION_IDENTITY_UNSUPPORTED")
        const binding = { remoteKey: candidates[0].objectId,
          userKey: createHash("sha256").update(JSON.stringify({ generation: payload.preparationNonce, name: credentials.username, userKind: 0 })).digest("hex"),
          username: credentials.username, serverEpoch: identity.serverEpoch, name: candidates[0].name, createdAt: candidates[0].createdAt }
        sessionBindings.set(request.id, { session: binding, userObjectId: payload.owned.objectId,
          retainedPackageCount: retainedPackage ? 1 : 0 })
        respond(id, "confirmed", { ...observed, afterDisconnect: await snapshot(), binding })
        continue
      }
      respond(id, result.outcome, result.data)
      continue
    }
    if (request.op === "inspect") {
      dispatched = true
      const observation = await bounded(request, page.evaluate(async () => {
        const session = await bg.app.Application.FInstance.FServerConnection.ServerContainer.Session
        const scoped = await bg.ScopeGetObjectAsync(session, bg.IBGDeductorSessionsManagerContainer)
        const manager = await scoped.GetSessionsManager()
        await manager.UpdateSessionInfos()
        const rows = []
        for (let index = 0; index < await manager.Count; index++) {
          const row = await manager.SessionInfo(index)
          const targetSession = await bg.ScopeFindObjectAsync(row, bg.IBGCustomDeductorServerSession)
          rows.push({ objectId: (await bg.ProxyObjectsHelper.GetObjectId(row)).toString(),
            sessionGuid: targetSession ? String(await targetSession.Guid) : null, name: await row.Name, createdAt: await row.CreateTime, pendingDisconnect: await row.PendingDisconnect,
            packageCount: await row.Count, activeOperations: null })
        }
        const ownManaged = await bg.ScopeFindObjectAsync(session, bg.IBGManagedSessionInfo)
        const user = await session.CurrentUser
        const users = []
        const collection = await session.GetUsers()
        const enumerator = await collection.GetEnumerator(bg.TBGDeductorUserKinds.dukUser)
        try {
          while (await enumerator.MoveNext()) {
            const listed = await cast(await enumerator.Current, bg.IBGDeductorUser)
            users.push({ objectId: (await bg.ProxyObjectsHelper.GetObjectId(listed)).toString(), name: await listed.Name, userKind: await listed.UserKind,
              isAdmin: await listed.IsAdmin, isDesigner: await listed.IsDesigner, isViewer: await listed.IsViewer, blocked: await listed.Blocked,
              useGlobalFileStorage: await listed.UseGlobalFileStorage, schedulerFullAccess: await listed.SchedulerFullAccess })
          }
        } finally { await ReleaseObject(enumerator, true) }
        const sharedDirectories = []
        const directories = await session.GetSharedDirectories()
        const directoryEnumerator = await directories.GetEnumerator()
        try {
          while (await directoryEnumerator.MoveNext()) {
            const directory = await directoryEnumerator.Current
            const permissions = []
            const access = await directory.Permissions
            const permissionEnumerator = await access.GetEnumerator()
            try {
              while (await permissionEnumerator.MoveNext()) {
                const principal = await permissionEnumerator.Current
                permissions.push({ objectId: (await bg.ProxyObjectsHelper.GetObjectId(principal)).toString(), name: await principal.Name, userKind: await principal.UserKind })
              }
            } finally { await ReleaseObject(permissionEnumerator, true) }
            sharedDirectories.push({ objectId: (await bg.ProxyObjectsHelper.GetObjectId(directory)).toString(), name: await directory.Name, permissions })
          }
        } finally { await ReleaseObject(directoryEnumerator, true) }
        return { sessions: rows, ownSession: { guid: String(await session.Guid),
          username: await user.Name, userObjectId: (await bg.ProxyObjectsHelper.GetObjectId(user)).toString(),
          isAdmin: await user.IsAdmin, isDesigner: await user.IsDesigner,
          managedObjectId: ownManaged ? (await bg.ProxyObjectsHelper.GetObjectId(ownManaged)).toString() : null,
          objectId: (await bg.ProxyObjectsHelper.GetObjectId(session)).toString() }, users, sharedDirectories }
      }))
      respond(id, "confirmed", { identity, rawSessions: observation.sessions, ownSession: observation.ownSession,
        users: observation.users, sharedDirectories: observation.sharedDirectories, sessionIdentityQualified: false })
      continue
    }
    // Name/CreateTime and package Count are not yet qualified ownership/operation proofs.
    throw Error(request.op === "close-session" ? "SESSION_IDENTITY_UNSUPPORTED" : "ADMIN_CAPABILITY_UNSUPPORTED")
  } catch (error) {
    const codes = ["ADMIN_REQUEST_INVALID", "ADMIN_DEADLINE", "ADMIN_ALREADY_INITIALIZED", "ADMIN_NOT_INITIALIZED", "ADMIN_CREDENTIAL_PRIVATE",
      "ADMIN_CREDENTIAL_INVALID", "ADMIN_RUNTIME_PATH", "ADMIN_RUNTIME_HASH", "ADMIN_PROFILE_OWNERSHIP", "ADMIN_CAPABILITY_UNSUPPORTED",
      "ADMIN_IDENTITY_CHANGED", "ADMIN_USER_IDENTITY_CHANGED", "SERVER_EPOCH_CHANGED", "SESSION_IDENTITY_UNSUPPORTED", "SESSION_SOURCE_UNCONFIRMED"]
    respond(id, dispatched ? "unknown" : "not_applied", { code: codes.includes(error?.message) ? error.message : "ADMIN_OUTCOME_UNKNOWN" })
  }
}
await context?.close().catch(() => { process.stderr.write("ADMIN_DISPOSE_UNKNOWN\n"); process.exitCode = 2 })

function traceConsole(message) {
  if (/^ADMIN_USER_(STAGE_(ENUMERATE|ADD|BLOCK|CONFIGURE|ACL|ACTIVATE|READBACK|BACKUP_(BASELINE|MODIFIED|PERIOD|WAIT|DRIFT))|WRITE_(AUTHMODE|PASSWORD))$/.test(message.text())) process.stderr.write(message.text() + "\n")
}

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

async function readSessionBinding(payload, identity) {
  const adopt = payload.adopt
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(payload.proofId) || !adopt || Object.keys(adopt).length !== 2 ||
    typeof adopt.receipt !== "string" || path.basename(adopt.receipt) !== `session-${payload.proofId}.json` ||
    typeof adopt.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(adopt.sha256)) throw Error("SESSION_SOURCE_UNCONFIRMED")
  const claim = await readSessionReceipt(adopt.receipt)
  if (!claim || claim.version !== 2 || claim.kind !== "owned-server-session" || claim.state !== "observed" ||
    JSON.stringify(claim.identity) !== JSON.stringify(identity) || JSON.stringify(claim.binding) !== JSON.stringify(payload.session) ||
    createHash("sha256").update(JSON.stringify(claim)).digest("hex") !== adopt.sha256 || claim.source?.id !== payload.proofId ||
    typeof claim.source.path !== "string" || path.basename(claim.source.path) !== `${payload.proofId}.json`)
    throw Error("SESSION_SOURCE_UNCONFIRMED")
  const request = claim.observation?.payload, reply = claim.observation?.reply
  const own = reply?.data?.ownSession
  if (!request || !["session-probe", "session-crash-probe"].includes(request.phase) || !request.owned ||
    typeof request.owned.objectId !== "string" || !request.owned.objectId || request.owned.userKind !== 0 ||
    request.owned.name !== payload.session?.username || own?.userObjectId !== request.owned.objectId || own.username !== payload.session.username ||
    own.isAdmin !== false || own.isDesigner !== true || reply?.v !== 1 || reply.id !== payload.proofId || reply.outcome !== "confirmed" ||
    JSON.stringify(reply.data.binding) !== JSON.stringify(payload.session)) throw Error("SESSION_SOURCE_UNCONFIRMED")
  const source = await readSessionReceipt(claim.source.path)
  if (!source || source.version !== 1 || source.kind !== "loginom-admin-command" || source.state !== "confirmed" ||
    source.id !== payload.proofId || source.op !== "reconcile-user" || JSON.stringify(source.expectedIdentity) !== JSON.stringify(identity) ||
    createHash("sha256").update(JSON.stringify(source)).digest("hex") !== claim.source.sha256 ||
    source.desiredHash !== createHash("sha256").update(JSON.stringify(request)).digest("hex") ||
    source.replyHash !== createHash("sha256").update(JSON.stringify(reply)).digest("hex")) throw Error("SESSION_SOURCE_UNCONFIRMED")
  return { session: payload.session, userObjectId: request.owned.objectId, retainedPackageCount: 0 }
}

async function readSessionReceipt(file) {
  if (typeof file !== "string" || !path.isAbsolute(file) || path.resolve(file) !== file ||
    await realpath(path.dirname(file)).catch(() => undefined) !== path.dirname(file)) throw Error("SESSION_SOURCE_UNCONFIRMED")
  const directory = await lstat(path.dirname(file))
  if (!directory.isDirectory() || directory.uid !== process.getuid() || (directory.mode & 0o777) !== 0o700) throw Error("SESSION_SOURCE_UNCONFIRMED")
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() => { throw Error("SESSION_SOURCE_UNCONFIRMED") })
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.nlink !== 1 || info.uid !== process.getuid() || (info.mode & 0o777) !== 0o600 || info.size > 1024 * 1024)
      throw Error("SESSION_SOURCE_UNCONFIRMED")
    return JSON.parse(await handle.readFile("utf8"))
  } catch { throw Error("SESSION_SOURCE_UNCONFIRMED") }
  finally { await handle.close() }
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
