import path from "node:path"
import { constants } from "node:fs"
import { lstat, mkdir, open, readFile, readdir, realpath } from "node:fs/promises"
import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { createInterface } from "node:readline"

const operations = ["init", "inspect", "reconcile-user", "close-session", "confirm-session-absent", "dispose"]
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
    if (request.op === "close-session" || request.op === "confirm-session-absent") {
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
            if (binding.absenceOnly) return { outcome: "not_applied", data: { code: "SESSION_STILL_PRESENT" } }
            // Agent closure requires its archived history and the frozen post-CLI package count.
            if (retained[0].packageCount !== binding.retainedPackageCount || retained[0].pendingDisconnect !== true)
              return { outcome: "not_applied", data: { code: "SESSION_NOT_IDLE", packageCount: retained[0].packageCount,
                pendingDisconnect: retained[0].pendingDisconnect, expectedPackageCount: binding.retainedPackageCount } }
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
          // The qualified writer is closed; fresh server absence completes this bound observation.
          return { outcome: "confirmed", data: { closed: true, disposition: "observed_absent" } }
        } catch { return { outcome: applied ? "unknown" : "not_applied", data: { code: "SESSION_CLOSE_UNKNOWN" } } }
      }, { ...binding, deadline: request.deadline, absenceOnly: request.op === "confirm-session-absent" }))
      respond(id, result.outcome, result.data)
      continue
    }
    if (request.op === "reconcile-user") {
      const payload = request.payload
      if (!["blocked", "configure", "acl", "activate", "session-probe", "session-crash-probe", "session-package-crash-probe", "session-backup-probe", "session-shared-probe", "session-progress-probe", "session-storage-probe", "session-component-probe"].includes(payload?.phase)) throw Error("ADMIN_CAPABILITY_UNSUPPORTED")
      if (payload.peer !== undefined && (!["session-storage-probe", "session-component-probe"].includes(payload.phase) || !payload.peer || Object.keys(payload.peer).length !== 2 ||
        typeof payload.peer.name !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(payload.peer.name) || payload.peer.name === payload.slot?.username ||
        typeof payload.peer.objectId !== "string" || !payload.peer.objectId)) throw Error("ADMIN_REQUEST_INVALID")
      if (!payload || Object.keys(payload).length !== (payload.peer !== undefined ? 9 :
        ["acl", "activate", "session-probe", "session-crash-probe", "session-package-crash-probe", "session-backup-probe", "session-shared-probe", "session-progress-probe", "session-storage-probe", "session-component-probe"].includes(payload.phase) ? 8 : 7) || !payload.slot || typeof payload.slot.username !== "string" ||
        !payload.slot.username || payload.slot.username.includes("\0") || typeof payload.secretFile !== "string" ||
        typeof payload.preparationNonce !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(payload.preparationNonce) ||
        [payload.desiredHash, payload.secretHash].some(hash => typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) ||
        payload.phase !== "blocked" && !payload.owned || payload.owned !== null && (!payload.owned ||
          Object.keys(payload.owned).length !== (payload.phase !== "blocked" ? 5 : 4) || typeof payload.owned.objectId !== "string" || !payload.owned.objectId ||
          payload.owned.name !== payload.slot.username || payload.owned.userKind !== 0 || payload.owned.preparationNonce !== payload.preparationNonce ||
          payload.phase !== "blocked" && payload.owned.secretHash !== null && (typeof payload.owned.secretHash !== "string" || !/^[0-9a-f]{64}$/.test(payload.owned.secretHash))))
        throw Error("ADMIN_REQUEST_INVALID")
      if (["acl", "activate", "session-probe", "session-crash-probe", "session-package-crash-probe", "session-backup-probe", "session-shared-probe", "session-progress-probe", "session-storage-probe", "session-component-probe"].includes(payload.phase) && (!Array.isArray(payload.expectedPolicy) || payload.expectedPolicy.some(directory => !directory ||
        Object.keys(directory).length !== 3 || typeof directory.objectId !== "string" || !directory.objectId || typeof directory.name !== "string" || !directory.name ||
        !Array.isArray(directory.permissions) || directory.permissions.some(principal => !principal || Object.keys(principal).length !== 3 ||
          typeof principal.objectId !== "string" || !principal.objectId || typeof principal.name !== "string" || !principal.name || ![0, 1, 2].includes(principal.userKind)))))
        throw Error("ADMIN_REQUEST_INVALID")
      if ((payload.peer || payload.phase === "session-component-probe") && payload.expectedPolicy.some(directory => !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(directory.name)))
        throw Error("ADMIN_CAPABILITY_UNSUPPORTED")
      const credentials = await readCredentials(payload.secretFile)
      if (credentials.username !== payload.slot.username || createHash("sha256").update(JSON.stringify(credentials)).digest("hex") !== payload.secretHash)
        throw Error("ADMIN_CREDENTIAL_INVALID")
      dispatched = true
      const result = await bounded(request, page.evaluate(async ({ username, owned, phase, password, secretHash, expectedPolicy, peer }) => {
        let applied = false
        let stage = "ENUMERATE"
        try {
          console.info("ADMIN_USER_STAGE_ENUMERATE")
          const session = await bg.app.Application.FInstance.FServerConnection.ServerContainer.Session
          const users = await session.GetUsers()
          const enumerator = await users.GetEnumerator(bg.TBGDeductorUserKinds.dukAll)
          const matches = []
          const peers = []
          try {
            while (await enumerator.MoveNext()) {
              const user = await enumerator.Current
              if ((await user.Name).toLowerCase() === username.toLowerCase()) matches.push(user)
              if (peer && await user.Name === peer.name) peers.push(user)
            }
          } finally {
            // Deferred disposal can retain the enumeration lock while Add waits.
            await ReleaseObject(enumerator, true)
          }
          const peerUser = peer && peers.length === 1 ? await cast(peers[0], bg.IBGDeductorUser) : null
          if (peer && (!peerUser || await peerUser.UserKind !== 0 ||
            (await bg.ProxyObjectsHelper.GetObjectId(peerUser)).toString() !== peer.objectId || await peerUser.Blocked !== false))
            return { outcome: "not_applied", data: { code: "ADMIN_PEER_IDENTITY_CHANGED" } }
          if (!owned && matches.length || owned && (matches.length !== 1 || await matches[0].Name !== owned.name ||
            await matches[0].UserKind !== owned.userKind || (await bg.ProxyObjectsHelper.GetObjectId(matches[0])).toString() !== owned.objectId))
            return { outcome: "not_applied", data: { code: "ADMIN_USER_OWNERSHIP_CONFLICT" } }
          if (!owned) applied = true
          stage = "ADD"
          console.info("ADMIN_USER_STAGE_ADD")
          const user = await cast(owned ? matches[0] : await users.Add(username, bg.TBGDeductorUserKind.dukUser), bg.IBGDeductorUser)
          const flags = [["IsAdmin", false], ["IsDesigner", true], ["IsViewer", false], ["UseGlobalFileStorage", false], ["SchedulerFullAccess", false], ["AllowPublish", false]]
          if (owned && !["activate", "session-probe", "session-crash-probe", "session-package-crash-probe", "session-backup-probe", "session-shared-probe", "session-progress-probe", "session-storage-probe", "session-component-probe"].includes(phase) && await user.Blocked !== true) return { outcome: "not_applied", data: { code: "ADMIN_USER_NOT_IDLE" } }
          if (["acl", "activate", "session-probe", "session-crash-probe", "session-package-crash-probe", "session-backup-probe", "session-shared-probe", "session-progress-probe", "session-storage-probe", "session-component-probe"].includes(phase)) {
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
            if (["activate", "session-probe", "session-crash-probe", "session-package-crash-probe", "session-backup-probe", "session-shared-probe", "session-progress-probe", "session-storage-probe", "session-component-probe"].includes(phase)) {
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
        password: payload.phase === "configure" ? credentials.password : null, secretHash: payload.secretHash, expectedPolicy: payload.expectedPolicy ?? null, peer: payload.peer ?? null }))
      if (["session-probe", "session-crash-probe", "session-package-crash-probe", "session-backup-probe", "session-shared-probe", "session-progress-probe", "session-storage-probe", "session-component-probe"].includes(payload.phase) && result.outcome === "confirmed") {
        const retainedPackage = ["session-package-crash-probe", "session-backup-probe", "session-shared-probe", "session-progress-probe"].includes(payload.phase)
        const storageRoots = ["session-backup-probe", "session-shared-probe"].includes(payload.phase) ? await bounded(request, page.evaluate(async () => {
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
            if (["session-backup-probe", "session-shared-probe"].includes(payload.phase)) await probePage.waitForFunction(() =>
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
            const handle = await bounded(request, probePage.evaluateHandle(async phase => {
              const session = await bg.app.Application.FInstance.FServerConnection.ServerContainer.Session
              return ["session-component-probe", "session-progress-probe"].includes(phase)
                ? session.OpenPackage(phase === "session-progress-probe" ? "progress-probe.lgp" : "component-probe.lgp") : session.CreatePackage()
            }, payload.phase))
            try {
              const withPackage = await snapshot()
              const progress = payload.phase === "session-progress-probe" ? await bounded(request, probePage.evaluate(async ({ item, deadline }) => {
                const unit = await (await (await item.ModelUnits).getItem(0)).ModelUnit
                const nodes = await (await unit.WorkFlow).Nodes
                if (await nodes.Count !== 1) throw Error("ADMIN_CAPABILITY_UNSUPPORTED")
                const node = await nodes.getItem(0)
                const engine = await cast(await (await node.Component).Engine, bg.IBGCodeModelComponentEngine)
                const source = await engine.Code
                const activation = await item.Activate(0)
                try {
                  while (!await activation.Finished && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25))
                  return { source, finished: await activation.Finished, failed: await activation.Failed, status: await node.Status }
                } finally { await ReleaseObject(activation, true) }
              }, { item: handle, deadline: request.deadline })) : null
              const components = payload.phase === "session-component-probe" ? await bounded(request, probePage.evaluate(async ({ item, deadline, shared, peer }) => {
                const finish = async activation => {
                  try {
                    while (!await activation.Finished && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25))
                    return { finished: await activation.Finished, failed: await activation.Failed }
                  } finally { await ReleaseObject(activation, true) }
                }
                const positive = await finish(await item.Activate(0))
                if (!positive.finished || positive.failed) return { ...positive, continued: false, denials: [] }
                console.info("ADMIN_USER_STAGE_COMPONENT_BIND")
                const units = await item.ModelUnits
                console.info("ADMIN_USER_COMPONENT_UNITS_" + await units.Count)
                if (await units.Count !== 1) throw Error("ADMIN_CAPABILITY_UNSUPPORTED")
                const unit = await (await units.getItem(0)).ModelUnit
                const workflow = await unit.WorkFlow
                const nodes = await workflow.Nodes
                console.info("ADMIN_USER_COMPONENT_NODES_" + await nodes.Count)
                if (await nodes.Count !== 3) throw Error("ADMIN_CAPABILITY_UNSUPPORTED")
                const input = await nodes.getItem(0)
                const output = await nodes.getItem(2)
                const importer = await cast(await (await input.Component).Engine, bg.IBGImportTextFile)
                const exporter = await cast(await (await output.Component).Engine, bg.IBGExportTextFile)
                if (await importer.FileName !== "data/sales.csv" || await exporter.FileName !== "group_sum_qty.result.csv")
                  throw Error("ADMIN_CAPABILITY_UNSUPPORTED")
                const configure = async (source, target) => {
                  const deactivated = await finish(await workflow.DeactivateAllAsync())
                  if (!deactivated.finished || deactivated.failed) throw Error("ADMIN_COMPONENT_DEACTIVATION_UNCONFIRMED")
                  await importer.set_FileName(source)
                  await exporter.set_FileName(target)
                  await input.UpdateConfiguration()
                  await output.UpdateConfiguration()
                  if (await importer.FileName !== source || await exporter.FileName !== target) throw Error("ADMIN_COMPONENT_READBACK_UNCONFIRMED")
                }
                const positives = []
                const denials = []
                const files = ["component-input.csv", ...["space name.csv", "tab\tname.csv", "line\nname.csv", "Юникод.csv", "-leading.csv", ".hidden.csv", "nested/file.csv", "copy.csv.autosave"].map(name => `component-input/${name}`)]
                for (const file of files) {
                  const relative = file === "component-input.csv" ? "normal" : file.slice("component-input/".length)
                  const ownSource = file === "component-input.csv" ? "data/sales.csv" : file
                  const ownTarget = file === "component-input.csv" ? "group_sum_qty.result.csv" : `component-output/${relative}.tsv`
                  await configure(ownSource, ownTarget)
                  const activation = await finish(await item.Activate(0))
                  positives.push({ file, output: ownTarget, ...activation })
                  if (!activation.finished || activation.failed) return { ...positive, continued: false, positives, denials }
                  for (const resource of [...(peer ? [{ scope: "neighbor", name: peer.name }] : []), ...shared.map(name => ({ scope: `shared:${name}`, name }))]) {
                    for (const [kind, root] of [["virtual", `/${resource.name}`], ["absolute", `/workdir/UserStorage/${resource.name}`], ["traversal", `../${resource.name}`]]) {
                      for (const operation of ["import", "export"]) {
                        console.info("ADMIN_USER_STAGE_COMPONENT_NEGATIVE")
                        const source = operation === "import" ? `${root}/${file}` : ownSource
                        const target = operation === "export" ? `${root}/component-output/${relative}.forbidden.tsv` : ownTarget
                        await configure(source, target)
                        const activation = await finish(await item.Activate(0))
                        const targetStatus = await (operation === "import" ? input : output).Status
                        denials.push({ pathKind: `${resource.scope}:${kind}`, file, operation, ...activation, targetStatus,
                          denied: activation.finished && activation.failed && targetStatus === bg.TBGModelNodeStatus.mnsInactiveError })
                      }
                    }
                  }
                }
                console.info("ADMIN_USER_STAGE_COMPONENT_RESET")
                await configure("data/sales.csv", "group_sum_qty.result.csv")
                const continued = await finish(await item.Activate(0))
                return { ...positive, continued: continued.finished && !continued.failed, positives, denials }
              }, { item: handle, deadline: request.deadline, shared: payload.expectedPolicy.map(directory => directory.name).sort(), peer: payload.peer ?? null })) : null
              const storage = payload.phase === "session-storage-probe" ? await bounded(request, probePage.evaluate(async ({ item, peer, shared }) => {
                const session = await bg.app.Application.FInstance.FServerConnection.ServerContainer.Session
                const source = peer ? "access-peer-probe.lgp" : "access-probe.lgp"
                const target = peer ? "access-peer-copy.lgp" : "access-copy.lgp"
                console.info("ADMIN_USER_STAGE_STORAGE_SAVE")
                await session.SavePackageAs(item, source)
                const storage = await session.FileStorage
                console.info("ADMIN_USER_STAGE_STORAGE_READ")
                const stream = await storage.OpenFile(source, bg.TBGFileOpenMode.fomRead, bg.TBGShareFileMode.sfmShareDenyNone)
                const size = await stream.Size
                const buffer = new Uint8Array(Math.min(size, 64))
                try { await stream.ReadBuffer(buffer) }
                finally { await ReleaseObject(stream, true) }
                console.info("ADMIN_USER_STAGE_STORAGE_COPY")
                const copied = await storage.CopyFile(source, target, false, false)
                const info = await storage.GetFileInfo(target)
                const copySize = await info.Size
                await ReleaseObject(info, true)
                const directory = peer ? "access-peer-positive" : "access-positive"
                await storage.CreateDirectory(directory)
                await storage.CreateDirectory(`${directory}/nested`)
                const unusual = []
                for (const name of ["space name.lgp", "tab\tname.lgp", "line\nname.lgp", "Юникод.lgp", "-leading.lgp", ".hidden.lgp", "nested/file.lgp", "copy.lgp.autosave"]) {
                  const copied = await storage.CopyFile(source, `${directory}/${name}`, false, false)
                  const stream = await storage.OpenFile(`${directory}/${name}`, bg.TBGFileOpenMode.fomRead, bg.TBGShareFileMode.sfmShareDenyNone)
                  try {
                    const size = await stream.Size
                    const buffer = new Uint8Array(Math.min(size, 64))
                    await stream.ReadBuffer(buffer)
                    const writer = await storage.CreateFile(`${directory}/${name}.write`)
                    try {
                      await writer.WriteBuffer(new Uint8Array([65]))
                      unusual.push({ name, copied, size, written: await writer.Size === 1, readConfirmed: size > 0 && buffer.some(value => value !== 0) })
                    } finally { await ReleaseObject(writer, true) }
                  } finally { await ReleaseObject(stream, true) }
                }
                const denials = []
                if (peer) {
                  console.info("ADMIN_USER_STAGE_STORAGE_DENIALS")
                  const roots = [["virtual", `/${peer.name}`], ["absolute", `/workdir/UserStorage/${peer.name}`], ["traversal", `../${peer.name}`],
                    ...shared.flatMap(name => [[`shared:${name}:virtual`, `/${name}`], [`shared:${name}:absolute`, `/workdir/UserStorage/${name}`], [`shared:${name}:traversal`, `../${name}`]])]
                  for (const [pathKind, root] of roots) {
                    for (const [index, file] of ["access-probe.lgp", ...unusual.map(row => `access-positive/${row.name}`)].entries()) {
                      for (const operation of ["read", "write", "copy-out", "copy-in"]) {
                        const denied = await (async () => {
                          try {
                            if (operation === "read") {
                              const stream = await storage.OpenFile(`${root}/${file}`, bg.TBGFileOpenMode.fomRead, bg.TBGShareFileMode.sfmShareDenyNone)
                              try { await stream.ReadBuffer(new Uint8Array(1)) }
                              finally { await ReleaseObject(stream, true) }
                              return false
                            }
                            if (operation === "write") {
                              const stream = await storage.CreateFile(`${root}/${file}.forbidden-write.write`)
                              try { await stream.WriteBuffer(new Uint8Array([65])) }
                              finally { await ReleaseObject(stream, true) }
                              return false
                            }
                            if (operation === "copy-out") return !await storage.CopyFile(`${root}/${file}`, `access-stolen-${pathKind.replaceAll(":", "-")}-${index}.lgp`, false, false)
                            return !await storage.CopyFile(source, `${root}/${file}.forbidden-copy.lgp`, false, false)
                          } catch { return true }
                        })()
                        denials.push({ pathKind, file, operation, denied })
                      }
                    }
                  }
                }
                const continued = await storage.OpenFile(source, bg.TBGFileOpenMode.fomRead, bg.TBGShareFileMode.sfmShareDenyNone)
                try { return { readConfirmed: size > 0 && buffer.some(value => value !== 0), size, copySize: copied ? copySize : null,
                  continued: await continued.Size === size, unusual, denials } }
                finally { await ReleaseObject(continued, true) }
              }, { item: handle, peer: payload.peer ?? null, shared: payload.expectedPolicy.map(directory => directory.name).sort() })) : null
              const backup = ["session-backup-probe", "session-shared-probe"].includes(payload.phase) ? await bounded(request, probePage.evaluate(async ({ item, deadline, phase }) => {
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
                const shared = phase === "session-shared-probe" ? await (async () => {
                  const library = await session.CreatePackage()
                  await (await library.ModelUnits).AddDefault()
                  await session.SavePackageAs(library, "shared-probe.lgp")
                  await session.ClosePackage(new Ref(library), 5000)
                  const references = await item.References
                  const link = await references.AddModelPackageLink("shared-probe.lgp")
                  return { path: await (await link.Package).FileName, hintPath: await link.HintPath, count: await references.Count }
                })() : null
                await item.set_BinaryCmpUniqValues(!await item.BinaryCmpUniqValues)
                const modified = await session.IsPackageModified(item)
                console.info("ADMIN_USER_STAGE_BACKUP_MODIFIED")
                await session.set_PackageAutoSavePeriod(5000)
                const periodMs = await session.PackageAutoSavePeriod
                console.info("ADMIN_USER_STAGE_BACKUP_PERIOD")
                if (periodMs !== 5000) return { ...(shared ? { shared } : {}), periodMs, modified, before, after: await snapshot(), nonemptyObserved: false, reason: "policy_mismatch" }
                console.info("ADMIN_USER_STAGE_BACKUP_WAIT")
                const until = Math.min(deadline - 200, Date.now() + 2 * periodMs)
                while (Date.now() < until) {
                  const observedPeriodMs = await session.PackageAutoSavePeriod
                  if (observedPeriodMs !== periodMs) {
                    console.info("ADMIN_USER_STAGE_BACKUP_DRIFT")
                    return { ...(shared ? { shared } : {}), periodMs, observedPeriodMs, modified, before, after: await snapshot(), nonemptyObserved: false, reason: "period_drift" }
                  }
                  const after = await snapshot()
                  if (after.some(row => row.packageCount > 0)) return { ...(shared ? { shared } : {}), periodMs, modified, before, after, nonemptyObserved: true }
                  await new Promise(resolve => setTimeout(resolve, Math.min(periodMs / 4, until - Date.now())))
                }
                return { ...(shared ? { shared } : {}), periodMs, modified, before, after: await snapshot(), nonemptyObserved: false, reason: "not_observed" }
              }, { item: handle, deadline: request.deadline, phase: payload.phase })) : null
              if (!retainedPackage) {
                process.stderr.write("ADMIN_USER_PROBE_STAGE_CLOSE\n")
                await bounded(request, probePage.evaluate(async item => {
                  const session = await bg.app.Application.FInstance.FServerConnection.ServerContainer.Session
                  await session.ClosePackage(new Ref(item), 5000)
                }, handle))
              }
              const afterPackage = await snapshot()
              // Interrupt only this owned renderer's orderly logout; the native server/RPC remains real.
              if (!["session-probe", "session-storage-probe", "session-component-probe"].includes(payload.phase)) await probePage.evaluate(() => { window.onpagehide = null })
              return { ownSession, baseline, opened, withPackage, afterPackage, sessionIdentityQualified: false, ...(storage ? { storage } : {}), ...(components ? { components } : {}), ...(progress ? { progress } : {}), ...(backup ? { backup, storageRoots } : {}) }
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
      if (request.payload?.packages === true) {
        if (Object.keys(request.payload).length !== 1) throw Error("ADMIN_REQUEST_INVALID")
        dispatched = true
        const collections = await bounded(request, page.evaluate(async () => {
          const session = await bg.app.Application.FInstance.FServerConnection.ServerContainer.Session
          const manager = await (await bg.ScopeGetObjectAsync(session, bg.IBGDeductorSessionsManagerContainer)).GetSessionsManager()
          await manager.UpdateSessionInfos()
          const collections = []
          const count = await manager.Count
          for (let index = 0; index < count; index++) {
            const row = await manager.SessionInfo(index)
            const packages = []
            const packageCount = await row.Count
            for (let index = 0; index < packageCount; index++) {
              const item = await row.PackageInfo(index)
              const progress = await item.Progress
              packages.push({ objectId: (await bg.ProxyObjectsHelper.GetObjectId(item)).toString(), name: await item.Name,
                path: await item.Path, readOnly: await item.ReadOnly, referenceCount: await item.ReferenceCount,
                progress: progress ? { percent: await progress.Percent, startedAt: await progress.StartTime } : null })
            }
            if (await row.Count !== packageCount) throw Error("changed")
            collections.push({ objectId: (await bg.ProxyObjectsHelper.GetObjectId(row)).toString(), name: await row.Name,
              sessionType: await row.SessionType, packageCount, packages })
          }
          if (await manager.Count !== count) throw Error("changed")
          return collections
        }))
        respond(id, "confirmed", { identity, collections })
        continue
      }
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
  if (/^ADMIN_USER_COMPONENT_(UNITS|NODES)_\d{1,2}$/.test(message.text())) process.stderr.write(message.text() + "\n")
  if (/^ADMIN_USER_(STAGE_(ENUMERATE|ADD|BLOCK|CONFIGURE|ACL|ACTIVATE|READBACK|COMPONENT_(BIND|NEGATIVE|RESET)|STORAGE_(SAVE|READ|COPY|DENIALS)|BACKUP_(BASELINE|MODIFIED|PERIOD|WAIT|DRIFT))|WRITE_(AUTHMODE|PASSWORD))$/.test(message.text())) process.stderr.write(message.text() + "\n")
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
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(payload.proofId) || !adopt ||
    typeof adopt.receipt !== "string" || ![`session-${payload.proofId}.json`, `management-session-${payload.proofId}.json`, `agent-session-${payload.proofId}.json`].includes(path.basename(adopt.receipt)) ||
    typeof adopt.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(adopt.sha256)) throw Error("SESSION_SOURCE_UNCONFIRMED")
  const claim = await readSessionReceipt(adopt.receipt)
  if (["owned-management-session", "owned-agent-session"].includes(claim?.kind)) return readCausalBinding(payload, identity, claim)
  if (Object.keys(adopt).length !== 2 || path.basename(adopt.receipt) !== `session-${payload.proofId}.json` || !claim || claim.version !== 2 || claim.kind !== "owned-server-session" || claim.state !== "observed" ||
    JSON.stringify(claim.identity) !== JSON.stringify(identity) || JSON.stringify(claim.binding) !== JSON.stringify(payload.session) ||
    createHash("sha256").update(JSON.stringify(claim)).digest("hex") !== adopt.sha256 || claim.source?.id !== payload.proofId ||
    typeof claim.source.path !== "string" || path.basename(claim.source.path) !== `${payload.proofId}.json`)
    throw Error("SESSION_SOURCE_UNCONFIRMED")
  const request = claim.observation?.payload, reply = claim.observation?.reply
  const own = reply?.data?.ownSession
  if (!request || !["session-probe", "session-crash-probe", "session-package-crash-probe"].includes(request.phase) || !request.owned ||
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
  const retainedPackage = request.phase === "session-package-crash-probe"
  if (retainedPackage) {
    const data = reply.data, binding = payload.session
    if (data.sessionIdentityQualified !== false || [data.baseline, data.opened, data.withPackage, data.afterPackage, data.afterDisconnect]
      .some(rows => !Array.isArray(rows) || rows.some(row => !row || typeof row.objectId !== "string"))) throw Error("SESSION_SOURCE_UNCONFIRMED")
    const created = data.opened.filter(row => !data.baseline.some(old => old.objectId === row.objectId))
    if (created.length !== 1 || created[0].objectId !== binding.remoteKey || created[0].name !== binding.name ||
      created[0].createdAt !== binding.createdAt || created[0].packageCount !== 0 ||
      [data.withPackage, data.afterPackage, data.afterDisconnect].some((rows, index) => {
        const matches = rows.filter(row => row.objectId === binding.remoteKey)
        return matches.length !== 1 || matches[0].name !== binding.name || matches[0].createdAt !== binding.createdAt ||
          matches[0].packageCount !== 1 || index === 2 && matches[0].pendingDisconnect !== true
      })) throw Error("SESSION_SOURCE_UNCONFIRMED")
  }
  return { session: payload.session, userObjectId: request.owned.objectId, retainedPackageCount: retainedPackage ? 1 : 0 }
}

// Parent qualifies the frozen process/native sources under held slot and server fences immediately before dispatch.
async function readCausalBinding(payload, identity, claim) {
  const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex")
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)
  const root = path.dirname(payload.adopt.receipt)
  const agent = claim.kind === "owned-agent-session"
  if (!/^[a-f0-9]{64}$/.test(payload.proofId) || Object.keys(payload.adopt).length !== (agent ? 3 : 2) ||
    path.basename(payload.adopt.receipt) !== `${agent ? "agent" : "management"}-session-${payload.proofId}.json` ||
    Object.keys(claim).length !== 13 || claim.version !== 2 || claim.state !== "observed" || claim.id !== payload.proofId ||
    hash(claim) !== payload.adopt.sha256 || !same(claim.identity, identity) || !same(claim.binding, payload.session) ||
    Object.keys(claim.actor ?? {}).length !== (agent ? 4 : 5) || claim.actor.kind !== (agent ? "agent" : "management") ||
    (agent ? claim.actor.attemptId !== claim.source?.process?.id : claim.actor.attemptId !== null) ||
    Object.keys(claim.binding ?? {}).length !== 6 || claim.binding.serverEpoch !== identity.serverEpoch ||
    !claim.binding.name?.startsWith(claim.binding.username + ":") || !/^[1-9]\d*$/.test(claim.binding.name.slice(claim.binding.username.length + 1)) ||
    Object.keys(claim.source ?? {}).length !== (agent ? 4 : 3) || path.dirname((agent ? claim.source.process?.path : claim.source.inventoryFile) ?? "") !== root)
    throw Error("SESSION_SOURCE_UNCONFIRMED")
  const lease = await readSessionReceipt(path.join(root, `slot-${claim.slotId}-${claim.leaseToken}.lease.json`))
  const prepared = await readSessionReceipt(path.join(root, `prepare-${claim.slotId}.json`))
  const user = await readSessionReceipt(path.join(root, `user-${claim.slotId}.json`))
  const activation = await readSessionReceipt(path.join(root, `activation-${claim.slotId}.json`))
  if (lease.version !== 2 || lease.state !== "retained" || lease.recoveryOnly === true || lease.token !== claim.leaseToken ||
    !same(lease.identity, identity) || lease.slot?.id !== claim.slotId || lease.slot.username !== claim.binding.username || lease.commandId !== claim.actor.runId ||
    prepared.kind !== "user-preparation" || prepared.state !== "staged" || prepared.nonce !== claim.preparationNonce ||
    prepared.slotId !== claim.slotId || prepared.username !== claim.binding.username || !same(prepared.identity, identity) ||
    user.kind !== "owned-loginom-user" || user.preparationNonce !== claim.preparationNonce || user.objectId !== claim.userObjectId ||
    user.userKey !== claim.binding.userKey || user.username !== claim.binding.username || !same(user.identity, identity) ||
    activation.kind !== "user-activation-intent" || activation.nonce !== claim.activationNonce || activation.preparationNonce !== claim.preparationNonce ||
    activation.objectId !== claim.userObjectId || activation.userKey !== claim.binding.userKey || !same(activation.identity, identity))
    throw Error("SESSION_SOURCE_UNCONFIRMED")
  if (agent) return readAgentBinding(payload, identity, claim, lease)
  const results = []
  for (const entry of [claim.source.connection, claim.source.command]) {
    if (entry?.state !== "confirmed" || entry.proof?.path !== path.join(entry.directory ?? "", "process-cleanup.json") ||
      entry.result?.path !== path.join(entry.directory ?? "", "management-result.json")) throw Error("SESSION_SOURCE_UNCONFIRMED")
    const proof = await readSessionReceipt(entry.proof.path), result = await readSessionReceipt(entry.result.path)
    if (hash(proof) !== entry.proof.sha256 || hash(result) !== entry.result.sha256 || proof.status !== "confirmed" || proof.error !== null ||
      proof.capture_complete !== true || proof.observation_mode !== "continuous" || !same(proof.unknownProcesses, []) ||
      proof.verification?.length !== 2 || proof.verification.some(pass => pass.owned_remaining !== 0) || !same(proof.lifetime?.owner, entry.owner) ||
      result.version !== 2 || result.kind !== "management-command-result" || !same(result.identity, identity) || result.leaseToken !== claim.leaseToken ||
      result.slotId !== claim.slotId || result.profileDir !== lease.slot.profileDir || result.commandId !== claim.actor.runId ||
      !same(result.owner, entry.owner) || !same(result.operation, entry.operation) || !same(result.process, entry.proof) ||
      !Number.isSafeInteger(result.exitCode) || typeof result.timedOut !== "boolean" || typeof result.interrupted !== "boolean")
      throw Error("SESSION_SOURCE_UNCONFIRMED")
    results.push(result)
  }
  const connection = results[0], command = results[1], entry = claim.source.command
  const interruptedCheck = same(command.operation, ["loginom", "check"]) && command.interrupted === true && command.timedOut === false
  if (!same(connection.operation, ["loginom", "setup"]) || connection.exitCode !== 0 || connection.timedOut || connection.interrupted ||
    connection.reply?.browser !== "verified" || connection.reply.username !== claim.binding.username ||
    connection.reply.url !== prepared.endpoint || connection.reply.hasApiKey !== true || !same(command.owner, claim.actor.owner) ||
    !same(command.operation, claim.actor.operation) || !["loginom setup", "loginom check"].includes(command.operation.join(" ")) ||
    !interruptedCheck && (command.exitCode !== 0 || command.timedOut || command.interrupted || command.reply?.browser !== "verified") ||
    command.operation[1] === "setup" && !same(entry.proof, claim.source.connection.proof) ||
    command.operation[1] === "check" && !interruptedCheck && (command.reply?.code !== "LOGINOM_CONNECTION_VALID" || command.reply.ok !== true))
    throw Error("SESSION_SOURCE_UNCONFIRMED")
  const snapshots = []
  if (!entry.sessions?.during?.length) throw Error("SESSION_SOURCE_UNCONFIRMED")
  for (const source of [entry.sessions.before, ...entry.sessions.during, entry.sessions.after]) {
    const snapshot = await readSessionReceipt(source?.path)
    if (hash(snapshot) !== source.sha256 || snapshot.kind !== "admin-session-inventory" || !same(snapshot.identity, identity) ||
      !Array.isArray(snapshot.sessions)) throw Error("SESSION_SOURCE_UNCONFIRMED")
    snapshots.push(snapshot)
  }
  const rows = snapshots.slice(1, -1).flatMap(snapshot => snapshot.sessions.filter(row => row.name.startsWith(claim.binding.username + ":") &&
    !snapshots[0].sessions.some(previous => previous.objectId === row.objectId)))
  if (!rows.length || rows.some(row => row.objectId !== claim.binding.remoteKey || row.name !== claim.binding.name ||
    row.createdAt !== claim.binding.createdAt || row.packageCount !== 0) ||
    snapshots.at(-1).sessions.some(row => row.objectId === claim.binding.remoteKey && (row.name !== claim.binding.name || row.createdAt !== claim.binding.createdAt)))
    throw Error("SESSION_SOURCE_UNCONFIRMED")
  return { session: payload.session, userObjectId: claim.userObjectId, retainedPackageCount: 0 }
}

async function readAgentBinding(payload, identity, claim, lease) {
  const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex")
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)
  const root = path.dirname(payload.adopt.receipt), source = claim.source
  const inventory = await readSessionReceipt(source.process.path)
  const entry = inventory.processes?.find(entry => entry.id === source.process.id)
  if (inventory.version !== 2 || inventory.kind !== "eval-agent-processes" || inventory.commandId !== claim.actor.runId ||
    inventory.slotId !== claim.slotId || !["open", "paused", "sealed"].includes(inventory.state) || !entry || entry.state !== "confirmed" ||
    hash(entry) !== source.process.sha256 || !same(entry.owner, claim.actor.owner) || entry.owner.kind !== "slot" || entry.owner.id !== claim.slotId ||
    path.dirname(entry.directory ?? "") !== root || !path.basename(entry.directory).startsWith("agent-process-") ||
    entry.proof?.path !== path.join(entry.directory, "process-cleanup.json")) throw Error("SESSION_SOURCE_UNCONFIRMED")
  const proof = await readSessionReceipt(entry.proof.path), lifetime = proof.lifetime
  if (hash(proof) !== entry.proof.sha256 || proof.status !== "confirmed" || proof.error !== null || proof.capture_complete !== true ||
    proof.observation_mode !== "continuous" || !same(proof.unknownProcesses, []) || proof.verification?.length !== 2 ||
    proof.verification.some(pass => pass.owned_remaining !== 0) || !same(lifetime?.owner, entry.owner) || lifetime.producer_pid !== inventory.producerPid ||
    !proof.browserBindings?.length || !proof.runtimeDirectories?.length || proof.runtimeDirectories.some(dir => !dir.startsWith(lease.slot.profileDir + path.sep)) ||
    proof.browserBindings.some(binding => !proof.processes?.some(process => same(process, binding.process)) ||
      !proof.runtimeDirectories.includes(binding.runtimeDirectory) || !Number.isFinite(Date.parse(binding.observed_at)) ||
      Date.parse(binding.observed_at) < Date.parse(lifetime.started_at) || Date.parse(binding.observed_at) > Date.parse(lifetime.finished_at)))
    throw Error("SESSION_SOURCE_UNCONFIRMED")
  const snapshots = []
  if (!Array.isArray(source.during) || !source.during.length) throw Error("SESSION_SOURCE_UNCONFIRMED")
  for (const ref of [source.before, ...source.during, source.after]) {
    if (path.dirname(ref.path ?? "") !== path.dirname(source.before.path) || path.dirname(path.dirname(ref.path)) !== root)
      throw Error("SESSION_SOURCE_UNCONFIRMED")
    const snapshot = await readSessionReceipt(ref.path), command = await readSessionReceipt(snapshot.command?.path)
    if (hash(snapshot) !== ref.sha256 || snapshot.kind !== "admin-session-inventory" || !same(snapshot.identity, identity) ||
      !Array.isArray(snapshot.sessions) || hash(command) !== snapshot.command.sha256 || command.kind !== "loginom-admin-command" ||
      command.state !== "confirmed" || command.op !== "inspect" || !same(command.expectedIdentity, identity) ||
      command.id !== snapshot.reply?.id || command.replyHash !== snapshot.reply.sha256 || command.desiredHash !== hash({}) ||
      !Number.isFinite(Date.parse(command.at)) || !Number.isFinite(Date.parse(command.settledAt)) || Date.parse(command.at) > Date.parse(command.settledAt))
      throw Error("SESSION_SOURCE_UNCONFIRMED")
    snapshots.push({ ...snapshot, startedAt: command.at, finishedAt: command.settledAt })
  }
  if (Date.parse(snapshots[0].finishedAt) > Date.parse(lifetime.started_at) || Date.parse(snapshots.at(-1).startedAt) < Date.parse(lifetime.finished_at) ||
    snapshots.slice(1, -1).some(snapshot => Date.parse(snapshot.startedAt) > Date.parse(lifetime.finished_at) || Date.parse(snapshot.finishedAt) < Date.parse(lifetime.started_at)))
    throw Error("SESSION_SOURCE_UNCONFIRMED")
  const rows = snapshots.slice(1, -1).flatMap(snapshot => snapshot.sessions.filter(row => row.objectId === claim.binding.remoteKey))
  const retained = snapshots.at(-1).sessions.filter(row => row.objectId === claim.binding.remoteKey)
  if (!rows.length || snapshots[0].sessions.some(row => row.objectId === claim.binding.remoteKey || row.name.toLowerCase() === claim.binding.name.toLowerCase()) ||
    [...rows, ...retained].some(row => row.name !== claim.binding.name || row.createdAt !== claim.binding.createdAt) || retained.length > 1 ||
    retained.some(row => !Number.isSafeInteger(row.packageCount) || row.packageCount < 0)) throw Error("SESSION_SOURCE_UNCONFIRMED")
  const ref = payload.adopt.archive
  if (ref?.path !== path.join(root, `agent-archive-${entry.id}.json`) || Object.keys(ref).length !== 2) throw Error("SESSION_SOURCE_UNCONFIRMED")
  const archive = await readSessionReceipt(ref.path)
  if (hash(archive) !== ref.sha256 || archive.kind !== "profile-archive" || archive.status !== "committed" || archive.profile !== lease.slot.profileDir ||
    path.dirname(archive.archive ?? "") !== lease.slot.historyDir || !Number.isFinite(Date.parse(archive.at)) || !Number.isFinite(Date.parse(archive.committedAt)) ||
    Date.parse(archive.at) < Date.parse(lifetime.finished_at) || Date.parse(archive.committedAt) < Date.parse(archive.at))
    throw Error("SESSION_SOURCE_UNCONFIRMED")
  return { session: payload.session, userObjectId: claim.userObjectId, retainedPackageCount: retained[0]?.packageCount ?? 0 }
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
