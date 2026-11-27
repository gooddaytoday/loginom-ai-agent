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
    const saved = await bounded(() => page.evaluate(async ({ origin, username, name, content, temporary }) => {
      const mapTree = () => globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree
      const connection = mapTree()?.FServerConnection
      const session = connection?.Session
      const ownsSession = () => location.origin === origin && connection?.Connected === true
        && connection.UserName === username && mapTree()?.FServerConnection === connection && connection.Session === session
      if (!session || !ownsSession()) return null
      const storage = await session.get_FileStorage()
      const bytes = Uint8Array.from(atob(content), character => character.charCodeAt(0))
      if (!ownsSession()) return null
      const path = `/user/${name}`
      const staged = `/user/.loginom-agent-${temporary}.part`
      let moved = false
      const stream = await storage.CreateFile(staged)
      try {
        try {
          for (let offset = 0; offset < bytes.length; offset += 512 * 1024)
            await stream.WriteBuffer(bytes.subarray(offset, offset + 512 * 1024))
        } finally {
          await ReleaseObject(stream, true)
        }
        if (!ownsSession() || await storage.MoveFile(staged, path, false) !== true) return null
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
        if (!moved && ownsSession()) await storage.DeleteFile(staged)
      }
    }, { origin, username, name: upload.name, content: upload.content, temporary }), 60_000, signal)
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
