import test from "node:test"
import assert from "node:assert/strict"
import { runInNewContext } from "node:vm"
import { publicationName, dashboardRequest, dashboardStorage } from "../src/dashboard-storage.mjs"

test("UTC publication names advance past latest when the local clock is behind", () => {
  assert.equal(publicationName(null, Date.UTC(2026, 10, 15, 1, 2, 3)), "20261115T010203Z.json")
  assert.equal(publicationName("20261115T010203Z.json", Date.UTC(2026, 10, 14)), "20261115T010204Z.json")
})

const binding = { packagePath: "/user/example.lgp", workflowGuid: "11111111-1111-4111-8111-111111111111", nodeGuid: "22222222-2222-4222-8222-222222222222" }
test("dashboard storage accepts only a bound saved package and node directory", () => {
  assert.equal(dashboardRequest({ binding }).directory, binding.packagePath + ".dashboards/" + binding.nodeGuid)
  for (const packagePath of ["relative.lgp", "/user/../example.lgp", "/user/example.txt", "/user/example\\bad.lgp"])
    assert.throws(() => dashboardRequest({ binding: { ...binding, packagePath } }), /DASHBOARD_INPUT_INVALID/)
  assert.throws(() => dashboardRequest({ binding: { ...binding, nodeGuid: "../escape" } }), /DASHBOARD_INPUT_INVALID/)
})

test("publication input preserves UTF-8 bytes and refuses oversized, malformed or unbound expectations", () => {
  assert.equal(Buffer.byteLength(dashboardRequest({ binding, content: JSON.stringify('x'.repeat(1_048_574)), expected: null }, true).content), 1_048_576)
  const content = '{"title":"Проверка"}'
  assert.equal(dashboardRequest({ binding, content, expected: null }, true).content, content)
  for (const content of ['"\ud800"', 'not json', JSON.stringify('x'.repeat(1_048_575))])
    assert.throws(() => dashboardRequest({ binding, content, expected: null }, true), /DASHBOARD_INPUT_INVALID/)
  assert.throws(() => dashboardRequest({ binding, content, expected: { name: "../escape.json", sourceHash: "0".repeat(64) } }, true), /DASHBOARD_INPUT_INVALID/)
})

function fixture(move, discard = (files, path) => files.delete(path)) {
  const files = new Map()
  const storage = {
    GetFileInfo: path => path === binding.packagePath || files.has(path) ? { Size: Buffer.byteLength(files.get(path) ?? "") } : null,
    DirectoryExists: () => false,
    CreateDirectory: () => true,
    OpenFile: path => ({ ReadBuffer: buffer => buffer.set(Buffer.from(files.get(path))) }),
    CreateFile: path => ({ WriteBuffer: buffer => files.set(path, Buffer.from(buffer).toString()) }),
    MoveFile: (part, final) => move(files, part, final),
    DeleteFile: path => discard(files, path),
  }
  const connection = { Connected: true, UserName: "user", Session: { get_FileStorage: () => storage } }
  const context = { pages: () => [{ evaluate: (callback, argument) => runInNewContext(`(${callback})(argument)`, {
    argument, TextEncoder, TextDecoder, ReleaseObject: () => undefined,
    bg: {
      TBGFileOpenMode: { fomRead: 0 },
      app: { Application: { FInstance: { FMainForm: { FMapTree: { FServerConnection: connection } } } } },
    },
  }) }] }
  return { files, publish: () => dashboardStorage(context, { binding, content: '{"title":"Draft"}', expected: null }, true) }
}

test("publication collision removes only its own temporary file", async () => {
  const f = fixture((files, part, final) => {
    files.set(final, '{"title":"Existing"}')
    files.set(final + ".other.part", '{"title":"Other draft"}')
    throw Error("System error, (OS Code 17): File exists")
  })
  await assert.rejects(f.publish(), { message: "DASHBOARD_VERSION_EXISTS" })
  assert.deepEqual([...f.files.values()], ['{"title":"Existing"}', '{"title":"Other draft"}'])
})

test("publication refused by storage removes its temporary upload", async () => {
  const f = fixture(() => { throw Error("System error, (OS Code 13): Permission denied") })
  await assert.rejects(f.publish(), { message: "DASHBOARD_ACCESS_DENIED" })
  assert.equal(f.files.size, 0)
})

test("unknown outcome removes the temporary upload and preserves a final file with different contents", async () => {
  const f = fixture((files, part, final) => {
    files.set(final, '{"title":"Other publication"}')
    throw Error("Connection unavailable")
  })
  await assert.rejects(f.publish(), { message: "DASHBOARD_WRITE_UNKNOWN" })
  assert.deepEqual([...f.files.values()], ['{"title":"Other publication"}'])
})

test("a cleanup failure preserves the original publication error", async () => {
  const f = fixture(() => { throw Error("System error, (OS Code 17): File exists") }, () => {
    throw Error("Connection unavailable")
  })
  await assert.rejects(f.publish(), { message: "DASHBOARD_VERSION_EXISTS" })
})

test("the exact final file confirms a publication after its reply is lost", async () => {
  const f = fixture((files, part, final) => {
    files.set(final, files.get(part))
    files.delete(part)
    throw Error("Connection unavailable")
  })
  assert.equal((await f.publish()).status, "written")
  assert.deepEqual([...f.files.values()], ['{"title":"Draft"}'])
})
