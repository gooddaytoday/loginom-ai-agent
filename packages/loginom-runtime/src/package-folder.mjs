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
  const alreadyOpen = await page.evaluate(() => {
    const workspace = globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace
    return workspace?.getActiveTab?.()?.Controller?.FController?.constructor?.name === "FileStorageForm"
  })
  if (!alreadyOpen) await page.locator('[data-tid="MF;cntMain;tlbMainToolbar;btnFilestorage"]').click({ timeout: 8000 })
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

export async function logoutPackageSession(page, { origin, username, required }, onPhase) {
  const started = performance.now()
  try {
    const loggedOut = await bounded(() => page.evaluate(async ({ origin, username, required }) => {
      const app = globalThis.bg?.app?.Application?.FInstance
      const connection = app?.FServerConnection ?? app?.FMainForm?.FMapTree?.FServerConnection
      if (location.origin !== origin) return false
      if (connection?.Connected !== true) return required ? false : null
      if (connection.UserName !== username) return false
      await app.LogOut()
      return !app.FServerConnection && !app.FMainForm
    }, { origin, username, required }), 6000)
    if (loggedOut === false) throw Error("LOGINOM_RUNTIME_CLEANUP_FAILED")
    if (loggedOut) await onPhase?.({ phase: "packages.logout", status: "ready", duration_ms: Math.round(performance.now() - started) })
  } catch {
    throw Error("LOGINOM_RUNTIME_CLEANUP_FAILED")
  }
}

export async function withPackageFolderSession({ login, folder, query, origin, username, signal, onPhase }) {
  const { context } = await login()
  const page = context.pages()[0]
  try {
    const started = performance.now()
    const listings = []
    const pending = [folder]
    const normalize = text => text.normalize("NFC").toLocaleLowerCase("ru")
    const match = query === undefined ? undefined : normalize(query.trim())
    while (pending.length) {
      signal?.throwIfAborted()
      const current = pending.pop()
      const listing = await readPackageFolder(page, { folder: current, origin, username }, signal)
      if (match === undefined) listings.push(listing)
      else {
        const directories = listing.entries.filter(entry => entry.kind === "folder")
        for (const directory of directories.reverse()) pending.push(directory.path)
        listings.push({ ...listing, entries: listing.entries.filter(entry =>
          entry.kind === "package" && normalize(entry.name).includes(match)) })
      }
    }
    return { listings, readMs: Math.round(performance.now() - started) }
  } finally {
    try {
      await logoutPackageSession(page, { origin, username, required: true }, onPhase)
    } finally {
      await context.close().catch(() => { throw Error("LOGINOM_RUNTIME_CLEANUP_FAILED") })
    }
  }
}
