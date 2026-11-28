import assert from "node:assert/strict"
import test from "node:test"
import { runInNewContext } from "node:vm"
import { readPackageFolders } from "../src/package-folder.mjs"

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
  return {
    events, fileList, released, form,
    read: (signal, path = folder, query, deadline) => readPackageFolders(page, {
      folder: path, query, origin, username, signal, deadline,
    }),
  }
}

test("FileInfoList returns folders first, packages newest first and no native fields", async () => {
  const f = fixture()
  const { listings: [listing] } = await f.read()
  assert.deepEqual(listing, { folder, entries: expected, slow: false })
  assert.deepEqual(f.events, [["directories", "/user/"], ["packages", "/user/", "*.lgp"]])
  assert.equal(f.released.length, 2)
})

for (const [failure, reply] of [
  ["refused", () => { throw Error("internal credentials in vendor error") }],
  ["changed shape", () => [{ ...newer, Size: "128" }]],
]) test("uses the Files window when FileInfoList " + failure, async () => {
  const f = fixture()
  f.fileList.GetFileInfoItemsEx = reply
  assert.deepEqual((await f.read()).listings[0], { folder, entries: expected, slow: true })
  assert.deepEqual(f.events, [["directories", "/user/"], ["open Files"], ["navigate in Files", "/user/"]])
})

test("empty shared folder is a valid response", async () => {
  const f = fixture()
  f.fileList.GetDirectoryItems = () => []
  f.fileList.GetFileInfoItemsEx = () => []
  assert.deepEqual((await f.read(undefined, "/common")).listings[0], { folder: "/common", entries: [], slow: false })
})

test("canceling a pending folder read rejects instead of publishing a partial result", async () => {
  const f = fixture()
  const active = Promise.withResolvers()
  const controller = new AbortController()
  f.fileList.GetDirectoryItems = () => { active.resolve(); return new Promise(() => {}) }
  const result = f.read(controller.signal)
  await active.promise
  controller.abort(Error("cancelled"))
  await assert.rejects(result, { message: "cancelled" })
  assert.deepEqual(f.events, [])
})

test("a Files window for a different folder does not become a successful empty result", async () => {
  const f = fixture()
  f.fileList.GetDirectoryItems = () => null
  f.form.SetCurrentDirLockWrapper = async () => {}
  await assert.rejects(f.read(), { message: "LOGINOM_PACKAGE_FOLDER_UNAVAILABLE" })
  assert.deepEqual(f.events, [["open Files"]])
})

for (const [size, readCount, truncated] of [[30, 31, false], [120, 40, true]]) {
  test(`recursive search returns ${readCount} pages on a tree with ${size} child folders`, async () => {
    const f = fixture()
    const folders = Array.from({ length: size }, (_, i) => `Folder ${String(i).padStart(3, "0")}`)
    f.fileList.GetDirectoryItems = path => {
      f.events.push(["directories", path])
      return path === "/user/" ? folders.map(FileName => ({ FileName, Attributes: 4 })) : []
    }
    const result = await f.read(undefined, "/user", "ПРОД")
    assert.equal(result.truncated, truncated)
    assert.deepEqual(result.listings.map(page => page.folder), ["/user", ...folders.slice(0, readCount - 1).map(name => `/user/${name}`)])
    assert.deepEqual(result.listings.map(page => page.entries.map(entry => entry.name)), result.listings.map(() => [newer.FileName]))
    assert.equal(f.events.filter(([event]) => event === "directories").length, readCount)
  })
}

test("a slow child returns the completed pages before the startup deadline", async () => {
  const f = fixture()
  f.fileList.GetDirectoryItems = path => path === "/user/" ? [{ FileName: "child" }] : new Promise(() => {})
  const { listings, truncated } = await f.read(undefined, "/user", "ПРОД", Date.now() + 100)
  assert.equal(truncated, true)
  assert.deepEqual(listings.map(page => page.folder), ["/user"])
  assert.deepEqual(listings[0].entries.map(entry => entry.name), [newer.FileName])
})
