import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
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
  assert.equal(Buffer.byteLength(dashboardRequest({ binding, content: JSON.stringify('x'.repeat(1_048_574)), expected: null }, "dashboardPublish").content), 1_048_576)
  const content = '{"title":"Проверка"}'
  assert.equal(dashboardRequest({ binding, content, expected: null }, "dashboardPublish").content, content)
  for (const content of ['"\ud800"', 'not json', JSON.stringify('x'.repeat(1_048_575))])
    assert.throws(() => dashboardRequest({ binding, content, expected: null }, "dashboardPublish"), /DASHBOARD_INPUT_INVALID/)
  assert.throws(() => dashboardRequest({ binding, content, expected: { name: "../escape.json", sourceHash: "0".repeat(64) } }, "dashboardPublish"), /DASHBOARD_INPUT_INVALID/)
})

function fixture(move = (files, part, final) => {
  if (files.has(final)) return false
  files.set(final, files.get(part))
  return files.delete(part)
}, discard = (files, path) => files.delete(path)) {
  const files = new Map()
  const directories = new Set()
  const locks = new Set()
  const storage = {
    GetFileInfo: path => path === binding.packagePath || files.has(path) ? { Size: Buffer.byteLength(files.get(path) ?? "") } : null,
    DirectoryExists: path => directories.has(path) || [...files.keys()].some(file => file.startsWith(path + "/")),
    CreateDirectory: path => Boolean(directories.add(path)),
    FileInfoList: {
      GetFileInfoItemsEx: (path, masks, attributes) => {
        assert.deepEqual([...masks], ["*.json"])
        assert.equal(attributes, 1)
        return [...files.keys()].filter(file => file.startsWith(path))
          .map(file => file.slice(path.length))
          .filter(name => name.endsWith(".json") && !name.includes("/"))
          .map(FileName => ({ FileName }))
      },
    },
    OpenFile: (path, mode, share) => {
      if (mode === 0) return { ReadBuffer: buffer => buffer.set(Buffer.from(files.get(path))) }
      assert.equal(mode, 2)
      assert.equal(share, 0)
      if (!files.has(path)) throw Error(`Невозможно открыть файл: "${path}": No such file or directory`)
      if (locks.has(path)) throw Error(`Невозможно открыть файл: "${path}": Try again`)
      locks.add(path)
      return { close: () => locks.delete(path) }
    },
    CreateFile: path => {
      files.set(path, "")
      return { WriteBuffer: buffer => files.set(path, Buffer.from(buffer).toString()) }
    },
    MoveFile: (part, final, overwrite) => {
      assert.equal(overwrite, false)
      return move(files, part, final)
    },
    DeleteFile: path => discard(files, path),
  }
  const connection = { Connected: true, UserName: "user", Session: { get_FileStorage: () => storage } }
  const evaluate = (callback, argument) => runInNewContext(`(${callback})(argument)`, {
    argument, TextEncoder, TextDecoder, ReleaseObject: value => value.close?.(),
    bg: {
      TBGFileOpenMode: { fomRead: 0, fomReadWrite: 2 },
      TBGShareFileMode: { sfmExclusive: 0 },
      TBGFileInfoAttributes: { fiaNormalFilesOnly: 1 },
      selectAllAsync: items => cb => cb(items),
      forEach: (items, cb) => items.forEach(cb),
      app: { Application: { FInstance: { FMainForm: { FMapTree: { FServerConnection: connection } } } } },
    },
  })
  const context = { pages: () => [{
    evaluate,
    evaluateHandle: async (callback, argument) => {
      const value = await evaluate(callback, argument)
      return { evaluate: cb => Promise.resolve(evaluate(cb, value)), dispose: async () => undefined }
    },
  }] }
  return {
    files,
    connection,
    locks,
    publish: () => dashboardStorage(context, { binding, content: '{"title":"Draft"}', expected: null }, "dashboardPublish"),
    versions: (target = binding) => dashboardStorage(context, { binding: target }, "dashboardVersions"),
    deleteVersions: (expected, target = binding) => dashboardStorage(context, { binding: target, expected }, "dashboardDelete"),
  }
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

test("deletion removes only the two approved versions through FileStorage", async () => {
  const deleted = []
  const f = fixture(undefined, (files, path) => {
    deleted.push(path)
    return files.delete(path)
  })
  const directory = dashboardRequest({ binding }).directory
  const first = "20261119T090000Z.json"
  const second = "20261119T090001Z.json"
  const own = JSON.stringify({ binding })
  const neighbour = { ...binding, nodeGuid: "33333333-3333-4333-8333-333333333333" }
  const neighbourPath = dashboardRequest({ binding: neighbour }).directory + "/" + first
  const preserved = new Map([
    [neighbourPath, JSON.stringify({ binding: neighbour })],
    [directory + "/20261119T090002Z.json", JSON.stringify({ binding: neighbour })],
    [directory + "/notes.json", "{}"],
    [directory + "/" + first + ".other.part", "{}"],
  ])
  for (const [path, content] of preserved) f.files.set(path, content)
  f.files.set(directory + "/" + second, own)
  f.files.set(directory + "/" + first, own)
  const sourceHash = createHash("sha256").update(own).digest("hex")
  const expected = await f.versions()
  assert.deepEqual(expected, [{ name: first, sourceHash }, { name: second, sourceHash }])
  assert.deepEqual(await f.deleteVersions(expected), { status: "empty" })
  assert.deepEqual(deleted, [directory + "/" + first, directory + "/" + second])
  assert.deepEqual(await f.versions(), [])
  assert.deepEqual(f.files, new Map([...preserved, [directory + "/.delete.lock", ""]]))
  assert.equal(f.locks.size, 0)
})

test("deletion without a browser page reports storage unavailable and zero removals", async () => {
  const result = await dashboardStorage({ pages: () => [] }, { binding, expected: [] }, "dashboardDelete")
  assert.deepEqual(result, { status: "failed", reason: "DASHBOARD_STORAGE_UNAVAILABLE", confirmedRemoved: 0 })
})

test("replacement under the same publication name changes the approved set before any delete", async () => {
  const f = fixture(undefined, () => assert.fail("unapproved versions must not be removed"))
  const directory = dashboardRequest({ binding }).directory
  const path = directory + "/20261119T090000Z.json"
  f.files.set(path, JSON.stringify({ binding, revision: "original" }))
  const expected = await f.versions()
  const replacement = JSON.stringify({ binding, revision: "replacement" })
  f.files.set(path, replacement)
  assert.deepEqual(await f.deleteVersions(expected), {
    status: "changed",
    remaining: [{ name: expected[0].name, sourceHash: createHash("sha256").update(replacement).digest("hex") }],
    confirmedRemoved: 0,
  })
  assert.equal(f.files.get(path), replacement)
  assert.equal(f.locks.size, 0)
})

test("an active node deletion excludes another client and preserves versions published during deletion", async () => {
  const other = { ...binding, nodeGuid: "33333333-3333-4333-8333-333333333333" }
  const directory = dashboardRequest({ binding }).directory
  const first = "20261119T090000Z.json"
  const second = "20261119T090001Z.json"
  const latest = "20261119T090002Z.json"
  const firstPath = directory + "/" + first
  const otherPath = dashboardRequest({ binding: other }).directory + "/" + first
  const changed = Promise.withResolvers()
  const resume = Promise.withResolvers()
  const deleted = []
  const f = fixture(undefined, async (files, path) => {
    deleted.push(path)
    const removed = files.delete(path)
    if (path === firstPath) {
      changed.resolve()
      await resume.promise
    }
    return removed
  })
  const original = JSON.stringify({ binding })
  const replacement = JSON.stringify({ binding, revision: "new publication" })
  f.files.set(firstPath, original)
  f.files.set(directory + "/" + second, original)
  f.files.set(otherPath, JSON.stringify({ binding: other }))
  const expected = await f.versions()
  const deleting = f.deleteVersions(expected)
  try {
    await Promise.race([changed.promise, deleting.then(() => assert.fail("deletion did not reach FileStorage"))])
    assert.deepEqual(await f.deleteVersions(expected), {
      status: "failed", reason: "DASHBOARD_DELETE_BUSY", confirmedRemoved: 0,
    })
    assert.deepEqual(await f.deleteVersions(await f.versions(other), other), { status: "empty" })
    f.files.set(firstPath, replacement)
    f.files.set(directory + "/" + latest, replacement)
  } finally {
    resume.resolve()
  }
  const sourceHash = createHash("sha256").update(replacement).digest("hex")
  assert.deepEqual(await deleting, {
    status: "changed", confirmedRemoved: 2, remaining: [{ name: first, sourceHash }, { name: latest, sourceHash }],
  })
  assert.deepEqual(deleted, [firstPath, otherPath, directory + "/" + second])
  assert.equal(f.files.get(firstPath), replacement)
  assert.equal(f.files.get(directory + "/" + latest), replacement)
  assert.equal(f.locks.size, 0)
})

test("losing the connection after DeleteFile preserves its receipt but leaves the final set unknown", async () => {
  const deleted = []
  const f = fixture(undefined, (files, path) => {
    deleted.push(path)
    f.connection.Connected = false
    return files.delete(path)
  })
  const path = dashboardRequest({ binding }).directory + "/20261119T090000Z.json"
  f.files.set(path, JSON.stringify({ binding }))
  assert.deepEqual(await f.deleteVersions(await f.versions()), {
    status: "failed", reason: "DASHBOARD_DELETE_UNKNOWN", confirmedRemoved: 1,
  })
  assert.deepEqual(deleted, [path])
  f.connection.Connected = true
  assert.deepEqual(await f.versions(), [])
  assert.equal(f.locks.size, 0)
})

test("a node without a publication directory is confirmed empty without creating a lock file", async () => {
  const f = fixture(undefined, () => assert.fail("an empty node has no files to remove"))
  const expected = await f.versions()
  assert.deepEqual(expected, [])
  assert.deepEqual(await f.deleteVersions(expected), { status: "empty" })
  assert.equal(f.files.size, 0)
  assert.equal(f.locks.size, 0)
})

test("an absent version after a lost DeleteFile reply does not count as confirmed", async () => {
  const deleted = []
  const f = fixture(undefined, (files, path) => {
    deleted.push(path)
    files.delete(path)
    throw Error("Connection unavailable")
  })
  const path = dashboardRequest({ binding }).directory + "/20261119T090000Z.json"
  f.files.set(path, JSON.stringify({ binding }))
  assert.deepEqual(await f.deleteVersions(await f.versions()), {
    status: "failed", reason: "DASHBOARD_DELETE_UNKNOWN", confirmedRemoved: 0, remaining: [],
  })
  assert.deepEqual(deleted, [path])
  assert.equal(f.files.has(path), false)
  assert.equal(f.locks.size, 0)
})

test("a read-only node denies opening the delete lock before removing any version", async () => {
  const deleted = []
  const f = fixture(undefined, (files, path) => {
    deleted.push(path)
    return files.delete(path)
  })
  const directory = dashboardRequest({ binding }).directory
  const lock = directory + "/.delete.lock"
  const path = directory + "/20261119T090000Z.json"
  const content = JSON.stringify({ binding })
  f.files.set(path, content)
  f.files.set(lock, "")

  const storage = f.connection.Session.get_FileStorage()
  const open = storage.OpenFile
  storage.OpenFile = (path, mode, share) => {
    if (path === lock && mode === 2 && share === 0) {
      throw Object.assign(Error('Невозможно открыть файл "' + path + '" на запись'), { name: "EBGException" })
    }
    return open(path, mode, share)
  }

  const expected = await f.versions()
  assert.equal(expected.length, 1)
  assert.deepEqual(await f.deleteVersions(expected), {
    status: "failed", reason: "DASHBOARD_ACCESS_DENIED", confirmedRemoved: 0,
  })
  assert.deepEqual(deleted, [])
  assert.equal(f.files.get(path), content)
})
