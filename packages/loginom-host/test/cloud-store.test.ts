import { expect, spyOn, test } from "bun:test"
import { chmod, open, mkdtemp, rm, readdir, readFile, stat, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { cloudStore } from "../src/connection/cloud-store"
import { credentials } from "../src/connection/credentials"

const value = {
  kind: "loginom-cloud-v1" as const,
  installationKey: "site-canary",
  email: "user@example.test",
  dock: { primary: { apiKey: "primary-canary" }, reserve: { apiKey: "reserve-canary" } },
}

test("cloud credentials survive reopening and are removed by logout", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloud-store-"))
  try {
    const store = cloudStore(root, credentials("linux"))
    await store.write(value)
    expect(await cloudStore(root, credentials("linux")).read()).toEqual(value)
    expect(await readdir(root)).not.toContain("generations")
    await store.clear()
    expect(await cloudStore(root, credentials("linux")).read()).toBeUndefined()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("invalid cloud kind cannot replace the saved credentials", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloud-store-"))
  try {
    const store = cloudStore(root, credentials("linux"))
    await store.write(value)
    // Runtime input can cross the typed boundary.
    await expect(store.write({ ...value, kind: "invalid" } as unknown as typeof value)).rejects.toThrow(
      /^LOGINOM_CLOUD_STORE_INVALID$/,
    )
    expect(await store.read()).toEqual(value)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("incomplete or empty cloud credentials preserve the complete saved pair", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloud-store-"))
  try {
    const store = cloudStore(root, credentials("linux"))
    await store.write(value)
    for (const invalid of [
      { ...value, installationKey: "" },
      { ...value, email: "" },
      { ...value, dock: { primary: value.dock.primary } },
      { ...value, dock: { ...value.dock, reserve: { apiKey: "" } } },
    ]) {
      await expect(store.write(invalid as typeof value)).rejects.toThrow(/^LOGINOM_CLOUD_STORE_INVALID$/)
      expect(await store.read()).toEqual(value)
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("damaged protected payload is rejected before replacing saved credentials", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloud-store-"))
  try {
    const store = cloudStore(root, credentials("linux"))
    await store.write(value)
    const damaged = cloudStore(root, {
      encode: () => ({ kind: "broken", private: "damage-canary" }),
      decode: (value) => value,
    })
    await expect(damaged.write({ ...value, installationKey: "replacement-canary" })).rejects.toThrow(
      /^LOGINOM_CLOUD_STORE_INVALID$/,
    )
    expect(await store.read()).toEqual(value)
    expect((await readdir(root)).filter((name) => name.endsWith(".tmp"))).toEqual([])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test.skipIf(process.platform === "win32")("cloud store refuses a public directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloud-store-"))
  try {
    await chmod(root, 0o755)
    const store = cloudStore(root, credentials("linux"))
    await expect(store.write(value)).rejects.toThrow(/^LOGINOM_STORE_PERMISSIONS_INVALID$/)
    await expect(store.read()).rejects.toThrow(/^LOGINOM_STORE_PERMISSIONS_INVALID$/)
    await expect(store.clear()).rejects.toThrow(/^LOGINOM_STORE_PERMISSIONS_INVALID$/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test.skipIf(process.platform === "win32")("cloud store enforces private file permissions", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloud-store-"))
  try {
    const store = cloudStore(root, credentials("linux"))
    await store.write(value)
    expect((await stat(root)).mode & 0o777).toBe(0o700)
    expect((await stat(join(root, "cloud.json"))).mode & 0o777).toBe(0o600)
    await chmod(join(root, "cloud.json"), 0o644)
    await expect(store.read()).rejects.toThrow(/^LOGINOM_STORE_PERMISSIONS_INVALID$/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test.skipIf(process.platform === "win32")(
  "post-rename directory fsync failure reports an error and leaves the actual new record readable",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "cloud-store-"))
    const directory = await open(root)
    const prototype = Object.getPrototypeOf(directory)
    const sync = prototype.sync
    try {
      const store = cloudStore(root, credentials("linux"))
      await store.write(value)
      const failure = spyOn(prototype, "sync").mockImplementation(async function (this: typeof directory) {
        if ((await this.stat()).isDirectory()) throw Error("directory fsync failed")
        return sync.call(this)
      })
      try {
        const next = { ...value, installationKey: "next-canary" }
        await expect(store.write(next)).rejects.toThrow("directory fsync failed")
        expect(await store.read()).toEqual(next)
      } finally {
        failure.mockRestore()
      }
    } finally {
      await directory.close()
      await rm(root, { recursive: true, force: true })
    }
  },
)

test.skipIf(process.platform === "win32")(
  "logout syncs deletion and reports a directory sync failure after deletion",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "cloud-store-"))
    const directory = await open(root)
    const prototype = Object.getPrototypeOf(directory)
    try {
      const store = cloudStore(root, credentials("linux"))
      await store.write(value)
      const failure = spyOn(prototype, "sync").mockRejectedValue(Error("directory fsync failed"))
      try {
        await expect(store.clear()).rejects.toThrow("directory fsync failed")
        expect(await store.read()).toBeUndefined()
      } finally {
        failure.mockRestore()
      }
    } finally {
      await directory.close()
      await rm(root, { recursive: true, force: true })
    }
  },
)

test.skipIf(process.platform === "win32")(
  "file fsync failure preserves the old cloud record and cleans the temporary file",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "cloud-store-"))
    const directory = await open(root)
    const prototype = Object.getPrototypeOf(directory)
    try {
      const store = cloudStore(root, credentials("linux"))
      await store.write(value)
      const failure = spyOn(prototype, "sync").mockRejectedValue(Error("file fsync failed"))
      try {
        await expect(store.write({ ...value, installationKey: "next-canary" })).rejects.toThrow("file fsync failed")
        expect(await store.read()).toEqual(value)
        expect(await readdir(root)).toEqual(["cloud.json"])
      } finally {
        failure.mockRestore()
      }
    } finally {
      await directory.close()
      await rm(root, { recursive: true, force: true })
    }
  },
)

test("cloud store refuses symlinked directories and files without reading their target", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloud-store-"))
  const target = await mkdtemp(join(tmpdir(), "cloud-target-"))
  try {
    await symlink(target, join(root, "linked"))
    await expect(cloudStore(join(root, "linked"), credentials("linux")).write(value)).rejects.toThrow(
      /^LOGINOM_STORE_OWNER_INVALID$/,
    )
    await writeFile(join(target, "private.json"), JSON.stringify(value), { mode: 0o600 })
    await symlink(join(target, "private.json"), join(root, "cloud.json"))
    await expect(cloudStore(root, credentials("linux")).read()).rejects.toThrow(/^LOGINOM_STORE_READ_FAILED$/)
    await cloudStore(root, credentials("linux")).clear()
    expect(await readFile(join(target, "private.json"), "utf8")).toBe(JSON.stringify(value))
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(target, { recursive: true, force: true })
  }
})

test("corrupt cloud records fail with a fixed error without exposing their contents", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloud-store-"))
  try {
    const store = cloudStore(root, credentials("linux"))
    for (const invalid of ["private-canary-not-json", JSON.stringify({ ...value, dock: {} }), "null"]) {
      await writeFile(join(root, "cloud.json"), invalid, { mode: 0o600 })
      await expect(store.read()).rejects.toThrow(/^LOGINOM_CLOUD_STORE_INVALID$/)
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
