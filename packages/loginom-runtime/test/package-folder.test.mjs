import assert from "node:assert/strict"
import test from "node:test"
import { createContext, runInContext } from "node:vm"
import { withPackageFolderSession, withPackageUploadSession } from "../src/package-folder.mjs"

const origin = "https://stand.example.test"
const folder = "/user"
const username = "fixture-user"
const older = { FileName: "Анализ.lgp", Size: 32, Time: new Date("2026-01-01T10:00:00Z") }
const newer = { FileName: "Продажи.LGP", Size: 128, Time: new Date("2026-02-03T14:30:00Z") }
const expected = [
  { kind: "folder", name: "Архив", path: "/user/Архив" },
  { kind: "package", name: "Продажи.LGP", path: "/user/Продажи.LGP", sizeBytes: 128, modifiedAt: "2026-02-03T14:30:00.000Z" },
  { kind: "package", name: "Анализ.lgp", path: "/user/Анализ.lgp", sizeBytes: 32, modifiedAt: "2026-01-01T10:00:00.000Z" },
]

function fixture() {
  const events = [], released = []
  const fileList = {
    GetDirectoryItems(path) {
      events.push(["directories", path])
      return [{ FileName: "Архив", Attributes: 4 }]
    },
    GetFileInfoItemsEx(path, masks) {
      events.push(["packages", path, ...masks])
      return [older, { ...newer, internalToken: "private-native-value" }]
    },
  }
  const storage = { FileInfoList: fileList }
  const connection = { Connected: true, UserName: username, Session: { get_FileStorage: async () => storage } }
  const data = [
    { FileName: "..", Type: 2 },
    { FileName: "Архив", Type: 1, FilePath: "/user/Архив/", id: "/user/Архив/" },
    { FileName: "notes.txt", Type: 0 },
    ...[older, newer].map(file => ({ ...file, Type: 0, FilePath: folder + "/" + file.FileName, id: folder + "/" + file.FileName })),
  ]
  class FileStorageForm {
    CurrentDirPath = "/common/"
    FFileSenderManager = { CurrentDirectory: this.CurrentDirPath }
    FFileStore = {
      $className: "bg.filedialog.FileStore",
      isLoading: () => false,
      isFiltered: () => false,
      getCount: () => data.length,
      getTotalCount: () => data.length,
      getRange: () => data.map(data => ({ data, isModel: true })),
    }
    async SetCurrentDirLockWrapper(path) {
      events.push(["navigate in Files", path])
      this.CurrentDirPath = path
      this.FPreviousFolder = path
      this.FFileSenderManager.CurrentDirectory = path
    }
  }
  const form = new FileStorageForm()
  let activeForm
  const app = {
    FServerConnection: connection,
    FMainForm: {
      FMapTree: { FServerConnection: connection },
      Items: { Workspace: { getActiveTab: () => ({ Controller: { FController: activeForm } }) } },
    },
    async LogOut() {
      events.push(["logout"])
      this.FServerConnection = null
      this.FMainForm = null
    },
  }
  const scope = createContext({
    Date, atob, location: new URL(origin),
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: (...args) => clearTimeout(...args),
    ReleaseObject: (value, awaited) => { assert.equal(awaited, true); released.push(value) },
    bg: {
      app: { Application: { FInstance: app } },
      selectAllAsync: async (items, project) => {
        if (!Array.isArray(items)) throw Error("unknown collection")
        if (items.length) project(items[0])
        return cb => cb(items)
      },
      forEach: (items, cb) => items.forEach(cb),
    },
  })
  const evaluate = async (fn, input) => runInContext(`(${fn})`, scope)(input)
  const page = {
    evaluate,
    locator: selector => ({ click: async () => {
      assert.match(selector, /btnFilestorage/)
      events.push(["open Files"])
      activeForm = form
    } }),
    waitForFunction: async (fn, input) => {
      assert.equal(await evaluate(fn, input), true)
      return { dispose: async () => {} }
    },
  }
  const login = async () => ({
    context: { pages: () => [page], close: async () => { events.push(["close browser"]) } },
  })
  return { events, fileList, released, form, app, storage, login, read: (signal, path = folder) => withPackageFolderSession({
    login, folder: path, origin, username, signal,
  }) }
}

test("FileInfoList returns folders first, packages newest first and no native fields", async () => {
  const f = fixture()
  const { listing } = await f.read()
  assert.deepEqual(listing, { folder, entries: expected, slow: false })
  assert.deepEqual(f.events, [["directories", "/user/"], ["packages", "/user/", "*.lgp"], ["logout"], ["close browser"]])
  assert.equal(f.released.length, 2)
})

for (const [failure, reply] of [
  ["refused", () => { throw Error("internal credentials in vendor error") }],
  ["changed shape", () => [{ ...newer, Size: "128" }]],
]) test("uses the Files window when FileInfoList " + failure, async () => {
  const f = fixture()
  f.fileList.GetFileInfoItemsEx = reply
  assert.deepEqual((await f.read()).listing, { folder, entries: expected, slow: true })
  assert.deepEqual(f.events, [["directories", "/user/"], ["open Files"], ["navigate in Files", "/user/"], ["logout"], ["close browser"]])
})

test("empty shared folder is a valid response", async () => {
  const f = fixture()
  f.fileList.GetDirectoryItems = () => []
  f.fileList.GetFileInfoItemsEx = () => []
  assert.deepEqual((await f.read(undefined, "/common")).listing, { folder: "/common", entries: [], slow: false })
})

test("canceling a pending folder read still logs out and closes the browser", async () => {
  const f = fixture()
  const active = Promise.withResolvers()
  const controller = new AbortController()
  f.fileList.GetDirectoryItems = () => { active.resolve(); return new Promise(() => {}) }
  const result = f.read(controller.signal)
  await active.promise
  controller.abort(Error("cancelled"))
  await assert.rejects(result, { message: "cancelled" })
  assert.deepEqual(f.events, [["logout"], ["close browser"]])
})

test("a Files window for a different folder does not become a successful empty result", async () => {
  const f = fixture()
  f.fileList.GetDirectoryItems = () => null
  f.form.SetCurrentDirLockWrapper = async () => {}
  await assert.rejects(f.read(), { message: "LOGINOM_PACKAGE_FOLDER_UNAVAILABLE" })
  assert.deepEqual(f.events, [["open Files"], ["logout"], ["close browser"]])
})

test("uploads exact bytes as a copy and never overwrites an existing package", async () => {
  const files = new Map()
  const bytes = Buffer.concat([Buffer.alloc(512 * 1024, 47), Buffer.from("demo")])
  const path = "/user/Продажи.lgp"
  const date = new Date("2026-11-25T15:11:00Z")
  for (const exists of [false, true]) {
    const f = fixture()
    Object.assign(f.storage, {
      CreateFile(name) {
        const chunks = []
        files.set(name, chunks)
        return { WriteBuffer: (chunk) => chunks.push(Buffer.from(chunk)) }
      },
      MoveFile(from, to, overwrite) {
        if (!overwrite && files.has(to)) return false
        files.set(to, files.get(from))
        files.delete(from)
        return true
      },
      GetFileInfo(name) {
        return files.has(name) ? { Size: Buffer.concat(files.get(name)).length, Time: date } : null
      },
      DeleteFile(name) { return files.delete(name) },
    })
    const copy = (content) => withPackageUploadSession({
      login: f.login, origin, username, temporary: "fixture", upload: { name: "Продажи.lgp", content },
    })
    if (exists) await assert.rejects(copy(Buffer.from("other").toString("base64")), { message: "LOGINOM_PACKAGE_UPLOAD_NAME_TAKEN" })
    else assert.deepEqual({ ...(await copy(bytes.toString("base64"))) }, {
      kind: "package", name: "Продажи.lgp", path, sizeBytes: bytes.length, modifiedAt: date.toISOString(),
    })
    assert.deepEqual([...files.keys()], [path])
    assert.deepEqual(Buffer.concat(files.get(path)), bytes)
    assert.deepEqual(f.events, [["logout"], ["close browser"]])
  }
})

test("cancelling an active package write removes its temporary file and never moves it", async () => {
  const f = fixture()
  const abort = new AbortController()
  const writing = Promise.withResolvers()
  const release = Promise.withResolvers()
  const staged = new Set()
  Object.assign(f.storage, {
    CreateFile(name) {
      staged.add(name)
      return { async WriteBuffer() { writing.resolve(); await release.promise } }
    },
    MoveFile() { assert.fail("cancelled upload moved its staged file") },
    DeleteFile(name) { return staged.delete(name) },
  })
  const pending = withPackageUploadSession({
    login: f.login, origin, username, temporary: "abort", signal: abort.signal,
    upload: { name: "Copy.lgp", content: Buffer.from("sample").toString("base64") },
  })
  await writing.promise
  abort.abort(Error("cancelled"))
  release.resolve()
  await assert.rejects(pending, { message: "cancelled" })
  assert.deepEqual([...staged], [])
  assert.deepEqual(f.events, [["logout"], ["close browser"]])
})

test("a timed-out WriteBuffer removes its staged file before logout even if the write never settles", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const f = fixture()
  const writing = Promise.withResolvers()
  const staged = new Set()
  Object.assign(f.storage, {
    CreateFile(name) {
      staged.add(name)
      return { WriteBuffer() { writing.resolve(); return new Promise(() => {}) } }
    },
    MoveFile() { assert.fail("timed-out upload moved its staged file") },
    DeleteFile(name) { assert.equal(staged.delete(name), true); f.events.push(["delete staged file"]); return true },
  })
  const pending = withPackageUploadSession({
    login: f.login, origin, username, temporary: "timeout",
    upload: { name: "Copy.lgp", content: Buffer.from("sample").toString("base64") },
  })
  await writing.promise
  assert.equal(staged.size, 1)
  t.mock.timers.tick(60_000)
  await assert.rejects(pending, { message: "LOGINOM_PACKAGE_FOLDER_UNAVAILABLE" })
  assert.equal(staged.size, 0)
  assert.deepEqual(f.events, [["delete staged file"], ["logout"], ["close browser"]])
})

for (const stop of ["cancel", "timeout"]) {
  test(`${stop} removes the staged file even when CreateFile never returns its handle`, async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] })
    const f = fixture()
    const abort = new AbortController()
    const created = Promise.withResolvers()
    const staged = new Set()
    Object.assign(f.storage, {
      CreateFile(name) {
        staged.add(name)
        created.resolve()
        return new Promise(() => {})
      },
      MoveFile() { assert.fail("unconfirmed upload moved its staged file") },
      DeleteFile(name) { assert.equal(staged.delete(name), true); f.events.push(["delete staged file", name]); return true },
    })
    const pending = assert.rejects(withPackageUploadSession({
      login: f.login, origin, username, temporary: "no-handle", signal: abort.signal,
      upload: { name: "Copy.lgp", content: Buffer.from("sample").toString("base64") },
    }), { message: stop === "cancel" ? "cancelled" : "LOGINOM_PACKAGE_FOLDER_UNAVAILABLE" })
    await created.promise
    if (stop === "cancel") abort.abort(Error("cancelled"))
    else t.mock.timers.tick(60_000)
    await new Promise(resolve => setImmediate(resolve))
    t.mock.timers.tick(4_000)
    await pending
    assert.deepEqual([...staged], [])
    assert.deepEqual(f.events, [["delete staged file", "/user/.loginom-agent-no-handle.part"], ["logout"], ["close browser"]])
  })
}

for (const result of ["late reply", "late file without reply", "no reply or file", "rejected request without a file"]) {
  test(`cancelling CreateFile handles ${result} before closing the session`, async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] })
    const f = fixture()
    const abort = new AbortController()
    const requested = Promise.withResolvers()
    const response = Promise.withResolvers()
    const staged = new Set()
    const stream = { WriteBuffer() { assert.fail("cancelled upload wrote to the file") } }
    Object.assign(f.storage, {
      CreateFile(name) { requested.resolve(name); return response.promise },
      MoveFile() { assert.fail("cancelled upload moved its staged file") },
      DeleteFile(name) {
        if (!staged.delete(name)) return false
        f.events.push(["delete staged file", name])
        return true
      },
      GetFileInfo(name) { return staged.has(name) ? {} : null },
    })
    const uncertain = result === "no reply or file" || result === "rejected request without a file"
    const pending = assert.rejects(withPackageUploadSession({
      login: f.login, origin, username, temporary: "late-create", signal: abort.signal,
      upload: { name: "Copy.lgp", content: Buffer.from("sample").toString("base64") },
    }), { message: uncertain ? "LOGINOM_RUNTIME_CLEANUP_FAILED" : "cancelled" })
    const path = await requested.promise
    abort.abort(Error("cancelled"))
    await new Promise(resolve => setImmediate(resolve))
    if (result === "rejected request without a file") response.reject(Error("connection interrupted"))
    if (!uncertain) staged.add(path)
    if (result === "late reply") response.resolve(stream)
    else t.mock.timers.tick(4_000)
    await pending
    assert.equal(staged.size, 0)
    assert.deepEqual(f.events, [
      ...(uncertain ? [] : [["delete staged file", "/user/.loginom-agent-late-create.part"]]),
      ["logout"], ["close browser"],
    ])
    if (result === "late reply") assert.deepEqual(f.released, [stream])
  })
}
