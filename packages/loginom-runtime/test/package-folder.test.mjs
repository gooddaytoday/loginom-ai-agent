import assert from "node:assert/strict"
import test from "node:test"
import { runInNewContext } from "node:vm"
import { withPackageFolderSession } from "../src/package-folder.mjs"

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
  const evaluate = (fn, input) => runInNewContext(`(${fn})(input)`, {
    Date, input, location: new URL(origin),
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
  return { events, fileList, released, form, app, read: (signal, path = folder) => withPackageFolderSession({
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
