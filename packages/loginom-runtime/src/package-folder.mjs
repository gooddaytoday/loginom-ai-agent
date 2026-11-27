import { packageFolderPath, packageStoragePath } from "./package-folder-path.mjs"

const unavailable = "LOGINOM_PACKAGE_FOLDER_UNAVAILABLE"
const denied = "LOGINOM_PACKAGE_FOLDER_ACCESS_DENIED"

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
    try {
      const directories = await read(await list.GetDirectoryItems(folder + "/"), "folder", item => [item.FileName])
      const files = await read(await list.GetFileInfoItemsEx(folder + "/", ["*.lgp"]), "package",
        item => [item.FileName, item.Time, item.Size])
      return ownsSession() ? [...directories, ...files] : null
    } catch (error) {
      if (ownsSession() && (typeof bg.EPrivilege === "function" && error instanceof bg.EPrivilege
        || /^System error, \(OS Code 13\):/.test(String(error?.message ?? error?._message ?? "")))) return "denied"
      throw error
    }
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

function listing(folder, rows, slow, validPath) {
  if (!Array.isArray(rows)) throw Error(unavailable)
  const paths = new Set(), directories = [], packages = []
  for (const row of rows) {
    if (typeof row?.name !== "string" || !row.name || row.name.includes("/")) throw Error(unavailable)
    const path = folder + "/" + row.name
    if (!validPath(path) || paths.has(path)) throw Error(unavailable)
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

async function readPackageFolder(page, input, signal, validPath) {
  if (!validPath(input.folder)) throw Error("LOGINOM_PACKAGE_FOLDER_INVALID")
  try {
    const rows = await bounded(() => nativeRows(page, input), 15_000, signal)
    if (rows === "denied") throw Error(denied)
    return listing(input.folder, rows, false, validPath)
  } catch (error) {
    signal?.throwIfAborted()
    if (error?.message === denied) throw error
  }
  try {
    return listing(input.folder, await bounded(() => filesRows(page, input), 30_000, signal), true, validPath)
  } catch {
    signal?.throwIfAborted()
    throw Error(unavailable)
  }
}

async function readPackageFile(page, { path, origin, username }, signal) {
  const bytes = await bounded(() => page.evaluate(async ({ path, origin, username }) => {
    const current = () => globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree?.FServerConnection
    const connection = current()
    const session = connection?.Session
    const ownsSession = () => location.origin === origin && current() === connection && connection?.Connected === true
      && connection.UserName === username && connection.Session === session
    if (!session || !ownsSession()) return null
    const storage = await session.get_FileStorage()
    const info = await storage.GetFileInfo(path)
    if (!info) return null
    let size
    try { size = await info.Size } finally { await ReleaseObject(info, true) }
    if (!ownsSession() || !Number.isSafeInteger(size) || size <= 0 || size > 16 * 1024 * 1024) return null
    const stream = await storage.OpenFile(path, bg.TBGFileOpenMode.fomRead)
    try {
      const buffer = new Uint8Array(size)
      await stream.ReadBuffer(buffer)
      if (!ownsSession()) return null
      let binary = ""
      for (let offset = 0; offset < buffer.length; offset += 8192)
        binary += String.fromCharCode(...buffer.subarray(offset, offset + 8192))
      return btoa(binary)
    } finally { await ReleaseObject(stream, true) }
  }, { path, origin, username }), 15_000, signal)
  if (!bytes) throw Error(unavailable)
  return bytes
}

export async function openPackageStorage({ login, origin, username, signal, scan = false }) {
  const { context } = await login()
  const page = context.pages()[0]
  const validPath = scan ? (path) => typeof path === "string" && path.length <= 1024 && path.isWellFormed()
    && packageStoragePath.test(path) && [username, "common"].includes(path.split("/")[1]) : isPackageFolder
  return {
    list: (folder) => readPackageFolder(page, { folder, origin, username }, signal, validPath),
    read: (path) => {
      if (!validPath(path) || !/\.lgp$/i.test(path)) throw Error("LOGINOM_PACKAGE_FOLDER_INVALID")
      return readPackageFile(page, { path, origin, username }, signal)
    },
    async close() {
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
    },
  }
}

export async function withPackageFolderSession(input) {
  const storage = await openPackageStorage(input)
  try {
    const started = performance.now()
    const listing = await storage.list(input.folder)
    return { listing, readMs: Math.round(performance.now() - started) }
  } finally {
    await storage.close()
  }
}
