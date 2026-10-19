import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rename, rm, rmdir, stat, symlink } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { superviseProcess, writerIdentity } from "../src/process-supervisor"

test("writer identity observes the real unlink-owner then rmdir release window", async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), "evals-writer-release-"))
  const directory = path.join(profile, ".writer")
  try {
    await mkdir(directory, { mode: 0o700 })
    await Bun.write(path.join(directory, "owner"), "original-owner")
    const info = await stat(directory)
    expect(await writerIdentity(profile)).toEqual({ device: info.dev, inode: info.ino, owner: "original-owner" })
    await rm(path.join(directory, "owner"))
    const checked = writerIdentity(profile).then(value => value, error => error)
    await Bun.sleep(20)
    await rmdir(directory)
    expect(await checked).toBeNull()
  } finally { await rm(profile, { recursive: true, force: true }) }
})

test("writer identity refuses a persistently ownerless original directory", async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), "evals-writer-missing-"))
  try {
    await mkdir(path.join(profile, ".writer"), { mode: 0o700 })
    const info = await stat(path.join(profile, ".writer"))
    const refused = await writerIdentity(profile).then(value => value, error => error)
    expect(refused).toMatchObject({ message: "Writer owner unavailable", refusal: {
      operation: "transition", phase: "acquiring", code: null,
      directory: { device: info.dev, inode: info.ino,
        uid: process.getuid!(), mode: 0o700 }, observedAt: expect.any(String),
    } })
    expect((await stat(path.join(profile, ".writer"))).isDirectory()).toBe(true)
  } finally { await rm(profile, { recursive: true, force: true }) }
})

test("supervisor persists the exact writer refusal after confirmed process cleanup", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-writer-refusal-"))
  const profile = path.join(root, "profile")
  try {
    await mkdir(profile, { mode: 0o700 })
    await mkdir(path.join(profile, ".writer"), { mode: 0o700 })
    const info = await stat(path.join(profile, ".writer"))
    const result = await superviseProcess({ cmd: [process.execPath, path.resolve(import.meta.dir, "../fixtures/fake-cli.ts"), "loginom", "status"], cwd: root,
      env: { PATH: process.env.PATH ?? "", EVAL_FAKE_EXIT_DELAY_MS: "500" }, profileDir: profile, outDir: root, timeoutMs: 5000 })
    expect(result.processCleanup).toMatchObject({ status: "confirmed", error: null, capture_complete: true, unknownProcesses: [], writerRefusal: {
      operation: "transition", phase: "acquiring", code: null,
      directory: { device: info.dev, inode: info.ino, uid: info.uid, mode: 0o700 }, observedAt: expect.any(String),
    } })
    expect((await Bun.file(path.join(root, "process-cleanup.json")).json()).writerRefusal).toEqual(result.processCleanup.writerRefusal)
    expect((await stat(path.join(profile, ".writer"))).ino).toBe(info.ino)
  } finally { await rm(root, { recursive: true, force: true }) }
}, 10_000)

for (const replacement of ["directory", "owner", "owner-symlink"] as const)
  test(replacement === "owner" ? "writer initialization observes its first regular owner" : `writer initialization refuses replaced ${replacement}`, async () => {
    const profile = await mkdtemp(path.join(os.tmpdir(), "evals-writer-replacement-"))
    const directory = path.join(profile, ".writer")
    try {
      await mkdir(directory, { mode: 0o700 })
      const original = await stat(directory)
      const pending = writerIdentity(profile).then(value => value, error => error)
      await Bun.sleep(10)
      if (replacement === "directory") {
        await rename(directory, path.join(profile, "original-directory"))
        await mkdir(directory, { mode: 0o700 })
      } else if (replacement === "owner") await Bun.write(path.join(directory, "owner"), "initial-owner")
      else {
        await Bun.write(path.join(profile, "foreign"), "foreign-owner")
        await symlink(path.join(profile, "foreign"), path.join(directory, "owner"))
      }
      const observed = await pending
      if (replacement === "owner") expect(observed).toEqual({ device: original.dev, inode: original.ino, owner: "initial-owner" })
      if (replacement === "directory") expect(String(observed)).toContain("identity changed")
      if (replacement === "owner-symlink") expect(String(observed)).toContain("Writer owner is not a private file")
      expect((await stat(directory)).isDirectory()).toBe(true)
    } finally { await rm(profile, { recursive: true, force: true }) }
  })

for (const entry of ["directory", "owner", "dangling-owner"] as const)
  test(`writer identity refuses ${entry} symlink`, async () => {
    const profile = await mkdtemp(path.join(os.tmpdir(), "evals-writer-symlink-"))
    const directory = path.join(profile, ".writer")
    try {
      if (entry === "directory") {
        await mkdir(path.join(profile, "foreign"))
        await symlink(path.join(profile, "foreign"), directory)
      } else {
        await mkdir(directory)
        if (entry === "owner") await Bun.write(path.join(profile, "foreign"), "private")
        await symlink(path.join(profile, "foreign"), path.join(directory, "owner"))
      }
      await expect(writerIdentity(profile)).rejects.toThrow("Writer")
    } finally { await rm(profile, { recursive: true, force: true }) }
  })

test("writer owner EACCES remains ERROR and preserves the guard", async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), "evals-writer-denied-"))
  const directory = path.join(profile, ".writer")
  try {
    await mkdir(directory)
    await Bun.write(path.join(directory, "owner"), "private-writer-canary")
    await chmod(path.join(directory, "owner"), 0)
    const refused = await writerIdentity(profile).then(value => value, error => error)
    expect(refused).toMatchObject({ message: "Writer owner unavailable", refusal: {
      operation: "owner-open", phase: null, code: "EACCES", directory: { uid: process.getuid!() }, observedAt: expect.any(String),
    } })
    expect(JSON.stringify(refused.refusal)).not.toContain("private-writer-canary")
    expect((await stat(directory)).isDirectory()).toBe(true)
  } finally {
    await chmod(path.join(directory, "owner"), 0o600)
    await rm(profile, { recursive: true, force: true })
  }
})

test("writer identity reads a normal owner and then its completed release", async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), "evals-writer-complete-"))
  const directory = path.join(profile, ".writer")
  try {
    await mkdir(directory)
    await Bun.write(path.join(directory, "owner"), "owner")
    expect((await writerIdentity(profile))?.owner).toBe("owner")
    await rm(path.join(directory, "owner"))
    await rmdir(directory)
    expect(await writerIdentity(profile)).toBeNull()
  } finally { await rm(profile, { recursive: true, force: true }) }
})
