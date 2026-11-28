import assert from "node:assert/strict"
import test from "node:test"
import { runInNewContext } from "node:vm"
import { observePackages } from "../../src/package-access.mjs"

const packagePath = "/user/shared/plan.lgp"
const binding = { origin: "https://loginom.example", pathname: "/app/", account: "user" }

function windowFixture() {
  const node = { Package: {}, PackageFileName: "user\\shared\\plan.lgp", ReadOnly: true }
  const reads = []
  const storage = {
    async FileExists(path) {
      reads.push(path)
      return true
    },
  }
  const connection = {
    Connected: true,
    UserName: "user",
    Session: { get_FileStorage: async () => storage },
  }
  const nodes = [node, { Package: {}, PackageFileName: null, ReadOnly: false }]
  const map = {
    FServerConnection: connection,
    PackageNodes: { get Count() { return nodes.length }, Items: (i) => nodes[i] },
  }
  const app = { Version: "7.4.2", Application: { FInstance: { FMainForm: { FMapTree: map, FReconnecting: false } } } }
  const page = {
    async evaluate(fn, args) {
      const value = await runInNewContext(`(${fn})(args)`, {
        args, bg: { app }, location: { origin: binding.origin, pathname: binding.pathname },
      })
      return structuredClone(value)
    },
  }
  return { node, reads, storage, connection, nodes, page }
}

test("observes a persisted package and checks only its exact lock marker on demand", async () => {
  const f = windowFixture()
  assert.deepEqual(await observePackages(f.page, binding), { packages: [{ path: packagePath, readOnly: true }] })
  assert.deepEqual(f.reads, [])
  assert.deepEqual(await observePackages(f.page, binding, packagePath), {
    packages: [{ path: packagePath, readOnly: true }], lockMarker: "present",
  })
  assert.deepEqual(f.reads, ["/user/shared/.plan.lgp.lck"])
  f.storage.FileExists = async (path) => path === packagePath + ".lck"
  assert.deepEqual(await observePackages(f.page, binding, packagePath), {
    packages: [{ path: packagePath, readOnly: true }], lockMarker: "present",
  })
  f.storage.FileExists = async () => false
  assert.deepEqual(await observePackages(f.page, binding, packagePath), {
    packages: [{ path: packagePath, readOnly: true }], lockMarker: "not_observed",
  })
  f.node.ReadOnly = false
  f.storage.FileExists = () => assert.fail("writable packages require no marker check")
  assert.deepEqual(await observePackages(f.page, binding, packagePath), {
    packages: [{ path: packagePath, readOnly: false }], lockMarker: "unknown",
  })
})

test("retains read-only when storage denies access and drops observations for a replaced login or package", async () => {
  const f = windowFixture()
  f.storage.FileExists = async () => { throw Error("Access denied") }
  assert.deepEqual(await observePackages(f.page, binding, packagePath), {
    packages: [{ path: packagePath, readOnly: true }], lockMarker: "unknown",
  })
  assert.equal(await observePackages(f.page, binding, "/user/other.lgp"), null)
  assert.equal(await observePackages(f.page, { ...binding, account: "other" }, packagePath), null)
  assert.equal(await observePackages(f.page, { ...binding, pathname: "/other-app/" }, packagePath), null)
  f.storage.FileExists = async () => {
    f.connection.Session = {}
    f.nodes.shift()
    return true
  }
  assert.equal(await observePackages(f.page, binding, packagePath), null)
})
