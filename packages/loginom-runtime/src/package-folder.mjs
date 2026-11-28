import { packageFolderPath } from "./package-folder-path.mjs"

const unavailable = "LOGINOM_PACKAGE_FOLDER_UNAVAILABLE"

export function isPackageFolder(folder) {
  return typeof folder === "string" && folder.length <= 1024 && folder.isWellFormed() && packageFolderPath.test(folder)
}

function bounded(work, timeout, signal) {
  signal?.throwIfAborted()
  let timer, cancel
  const stop = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Error(unavailable)), timeout)
    cancel = () => reject(signal.reason)
    signal?.addEventListener("abort", cancel, { once: true })
  })
  return Promise.race([Promise.resolve().then(work), stop]).finally(() => {
    clearTimeout(timer)
    signal?.removeEventListener("abort", cancel)
  })
}

// Web Studio's two FileInfoList methods return remote collections.
async function nativeRows(page, input) {
  return page.evaluate(async ({ folder, origin, username }) => {
    const mapTree = () => globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree
    const connection = mapTree()?.FServerConnection
    const session = connection?.Session
    const ownsSession = () => location.origin === origin && connection?.Connected === true
      && connection.UserName === username && mapTree()?.FServerConnection === connection && connection.Session === session
    if (!session || !ownsSession()) return null
    const storage = await session.get_FileStorage()
    const list = await storage.FileInfoList
    const read = async (items, kind, select) => {
      try {
        const rows = []
        const project = await bg.selectAllAsync(items, select)
        let observed = false
        await project(result => {
          observed = true
          bg.forEach(result, row => rows.push({
            kind, name: row.FileName,
            ...(kind === "package" && {
              sizeBytes: row.Size,
              modifiedAt: row.Time instanceof Date ? row.Time.toISOString() : row.Time,
            }),
          }))
        })
        if (!observed) throw Error("FileInfoList projection missing")
        return rows
      } finally {
        await ReleaseObject(items, true)
      }
    }
    const directories = await read(await list.GetDirectoryItems(folder + "/"), "folder", item => [item.FileName])
    const files = await read(await list.GetFileInfoItemsEx(folder + "/", ["*.lgp"]), "package",
      item => [item.FileName, item.Time, item.Size])
    return ownsSession() ? [...directories, ...files] : null
  }, input)
}

// Open the same Files window as dock_storage_list, then let its controller
// navigate and load its FileStore. Reading the store includes virtualized rows.
async function filesRows(page, input) {
  await page.locator('[data-tid="MF;cntMain;tlbMainToolbar;btnFilestorage"]').click({ timeout: 8000 })
  const ready = await page.waitForFunction(({ origin, username }) => {
    const main = globalThis.bg?.app?.Application?.FInstance?.FMainForm
    const connection = main?.FMapTree?.FServerConnection
    const form = main?.Items?.Workspace?.getActiveTab?.()?.Controller?.FController
    return location.origin === origin && connection?.Connected === true && connection.UserName === username
      && form?.constructor?.name === "FileStorageForm" && form.FFileSenderManager && !form.FChanging
      && form.FFileStore?.isLoading?.() === false
  }, input, { timeout: 8000 })
  await ready.dispose()
  return page.evaluate(async ({ folder, origin, username }) => {
    const main = globalThis.bg?.app?.Application?.FInstance?.FMainForm
    const active = () => main?.Items?.Workspace?.getActiveTab?.()?.Controller?.FController
    const form = active()
    const connection = main?.FMapTree?.FServerConnection
    const session = connection?.Session
    const ownsSession = () => location.origin === origin && connection?.Connected === true
      && connection.UserName === username && connection.Session === session && main.FMapTree.FServerConnection === connection
      && main === globalThis.bg?.app?.Application?.FInstance?.FMainForm && active() === form
    if (!session || !ownsSession() || form?.constructor?.name !== "FileStorageForm") return null
    const directory = folder + "/"
    await form.SetCurrentDirLockWrapper(directory)
    const store = form.FFileStore
    if (!ownsSession() || form.FChanging || form.CurrentDirPath !== directory || form.FPreviousFolder !== directory
      || form.FFileSenderManager?.CurrentDirectory !== directory || store?.$className !== "bg.filedialog.FileStore"
      || store.isLoading() || store.isBufferedStore || store.isFiltered()) return null
    const records = store.getRange()
    if (!Array.isArray(records) || store.getCount() !== records.length || store.getTotalCount() !== records.length) return null
    const rows = []
    for (const record of records) {
      const data = record?.data
      if (record?.isModel !== true || !data) return null
      if ((data.Type === 2 && data.FileName === "..") || data.IsVirtual || data.IsFavoriteItem) continue
      if ((data.Type !== 0 && data.Type !== 1) || typeof data.FileName !== "string") return null
      if (data.Type === 0 && !/\.lgp$/i.test(data.FileName)) continue
      const path = directory + data.FileName + (data.Type === 1 ? "/" : "")
      if (data.FilePath !== path || data.id !== path) return null
      rows.push(data.Type === 1 ? { kind: "folder", name: data.FileName } : {
        kind: "package", name: data.FileName, sizeBytes: data.Size,
        modifiedAt: data.Time instanceof Date ? data.Time.toISOString() : data.Time,
      })
    }
    return rows
  }, input)
}

function listing(folder, rows, slow) {
  if (!Array.isArray(rows)) throw Error(unavailable)
  const paths = new Set(), directories = [], packages = []
  for (const row of rows) {
    if (typeof row?.name !== "string" || !row.name || row.name.includes("/")) throw Error(unavailable)
    const path = folder + "/" + row.name
    if (!isPackageFolder(path) || paths.has(path)) throw Error(unavailable)
    paths.add(path)
    const { kind, name, sizeBytes, modifiedAt } = row
    if (kind === "folder") {
      directories.push({ kind, name, path })
      continue
    }
    if (kind !== "package" || !/\.lgp$/i.test(name) || !Number.isSafeInteger(sizeBytes) || sizeBytes < 0
      || typeof modifiedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(modifiedAt) || !Number.isFinite(Date.parse(modifiedAt))) throw Error(unavailable)
    packages.push({ kind, name, path, sizeBytes, modifiedAt: new Date(modifiedAt).toISOString() })
  }
  const byName = (a, b) => a.name.localeCompare(b.name, "ru")
  directories.sort(byName)
  packages.sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt) || byName(a, b))
  return { folder, entries: [...directories, ...packages], slow }
}

async function readPackageFolder(page, input, signal) {
  if (!isPackageFolder(input.folder)) throw Error("LOGINOM_PACKAGE_FOLDER_INVALID")
  try {
    return listing(input.folder, await bounded(() => nativeRows(page, input), 15_000, signal), false)
  } catch {
    signal?.throwIfAborted()
  }
  try {
    return listing(input.folder, await bounded(() => filesRows(page, input), 30_000, signal), true)
  } catch {
    signal?.throwIfAborted()
    throw Error(unavailable)
  }
}

export async function withPackageFolderSession({ login, folder, origin, username, signal }) {
  return withPackageStorage({ login, origin, username }, async page => {
    const started = performance.now()
    const listing = await readPackageFolder(page, { folder, origin, username }, signal)
    return { listing, readMs: Math.round(performance.now() - started) }
  })
}

export async function withPackageUploadSession({ login, origin, username, signal, upload, temporary }) {
  return withPackageStorage({ login, origin, username }, async page => {
    signal?.throwIfAborted()
    let settled = false
    const pending = page.evaluate(async ({ origin, username, name, content, temporary }) => {
      const mapTree = () => globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree
      const connection = mapTree()?.FServerConnection
      const session = connection?.Session
      const ownsSession = () => location.origin === origin && connection?.Connected === true
        && connection.UserName === username && mapTree()?.FServerConnection === connection && connection.Session === session
      if (!session || !ownsSession()) return null
      let cancelled = false
      let stop
      const stopped = new Promise(resolve => { stop = resolve })
      globalThis.loginomPackageUpload = { token: temporary, cancel: () => { cancelled = true; stop(false) } }
      const storage = await session.get_FileStorage()
      const bytes = Uint8Array.from(atob(content), character => character.charCodeAt(0))
      if (!ownsSession() || cancelled) return null
      const path = `/user/${name}`
      const staged = `/user/.loginom-agent-${temporary}.part`
      let moved = false
      try {
        const creating = Promise.resolve(storage.CreateFile(staged)).then(async stream => {
          if (!cancelled) return stream
          if (stream && ownsSession()) await ReleaseObject(stream, true)
          return null
        })
        const stream = await Promise.race([creating, stopped])
        if (!stream) return null
        try {
          for (let offset = 0; offset < bytes.length; offset += 512 * 1024) {
            if (cancelled) return null
            const write = Promise.resolve(stream.WriteBuffer(bytes.subarray(offset, offset + 512 * 1024)))
            if (!await Promise.race([write.then(() => true), stopped])) return null
          }
        } finally {
          await ReleaseObject(stream, true)
        }
        if (!ownsSession() || cancelled) return null
        if (await storage.MoveFile(staged, path, false) !== true) {
          const existing = await storage.GetFileInfo(path)
          if (!existing) return null
          await ReleaseObject(existing, true)
          return "name_taken"
        }
        moved = true
        const info = await storage.GetFileInfo(path)
        if (!info) return null
        try {
          const sizeBytes = await info.Size
          const time = await info.Time
          return sizeBytes === bytes.length && ownsSession()
            ? { kind: "package", name, path, modifiedAt: time instanceof Date ? time.toISOString() : time, sizeBytes }
            : null
        } finally {
          await ReleaseObject(info, true)
        }
      } finally {
        if (!moved) {
          try {
            if (!ownsSession()) return "cleanup_failed"
            if (await storage.DeleteFile(staged) === false) {
              const remaining = await storage.GetFileInfo(staged)
              if (remaining) {
                await ReleaseObject(remaining, true)
                return "cleanup_failed"
              }
            }
          } catch {
            return "cleanup_failed"
          }
        }
      }
    }, { origin, username, name: upload.name, content: upload.content, temporary }).finally(() => { settled = true })
    let saved
    try {
      saved = await bounded(() => pending, 60_000, signal)
    } catch (error) {
      const cleaned = settled
        ? await pending.catch(() => undefined) !== "cleanup_failed"
        : await bounded(async () => {
          await page.evaluate(token => {
            const current = globalThis.loginomPackageUpload
            if (current?.token === token) current.cancel()
          }, temporary)
          return await pending !== "cleanup_failed"
        }, 6_000).catch(() => false)
      if (!cleaned) throw Error("LOGINOM_RUNTIME_CLEANUP_FAILED")
      throw error
    }
    if (saved === "cleanup_failed") throw Error("LOGINOM_RUNTIME_CLEANUP_FAILED")
    signal?.throwIfAborted()
    if (saved === "name_taken") throw Error("LOGINOM_PACKAGE_UPLOAD_NAME_TAKEN")
    if (!saved) throw Error("LOGINOM_PACKAGE_UPLOAD_UNCONFIRMED")
    return saved
  })
}

async function withPackageStorage({ login, origin, username }, work) {
  const { context } = await login()
  const page = context.pages()[0]
  try {
    return await work(page)
  } finally {
    try {
      const loggedOut = await bounded(() => page.evaluate(async ({ origin, username }) => {
        const app = globalThis.bg?.app?.Application?.FInstance
        const connection = app?.FMainForm?.FMapTree?.FServerConnection
        if (location.origin !== origin || connection?.Connected !== true || connection.UserName !== username) return false
        await app.LogOut()
        return !app.FServerConnection && !app.FMainForm
      }, { origin, username }), 6000)
      if (!loggedOut) throw Error("LOGINOM_RUNTIME_CLEANUP_FAILED")
    } catch {
      throw Error("LOGINOM_RUNTIME_CLEANUP_FAILED")
    } finally {
      await context.close().catch(() => { throw Error("LOGINOM_RUNTIME_CLEANUP_FAILED") })
    }
  }
}
