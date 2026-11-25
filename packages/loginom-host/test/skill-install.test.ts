import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rename, rm, stat, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { Flock } from "../../core/src/util/flock"
import { prepareLocalSkill } from "../src/skill-install/index"

const columns = "---\nname: columns\ndescription: Checks columns.\n---\n"
const lock = <T>(name: string, control: string, run: () => Promise<T>) =>
  Flock.withLock("skill-install:" + name, run, { dir: control })

test("publication copies the prepared tree and survives moving the original", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-install-"))
  try {
    const source = join(root, "columns")
    const home = join(root, "home")
    await mkdir(home)
    await Bun.write(join(source, "SKILL.md"), [
      "---", "name: columns", "description: Checks columns.", "compatibility: Node 24",
      "allowed-tools: Read", "---", "[Resource](references/example.bin)", "",
    ].join("\n"))
    const bytes = new Uint8Array([0, 10, 255])
    await Bun.write(join(source, "references/example.bin"), bytes)
    const script = join(source, "scripts/columns.sh")
    await Bun.write(script, "#!/bin/sh\n")
    if (process.platform !== "win32") await chmod(script, 0o755)
    await Bun.write(join(source, ".git/config"), "excluded")
    const installed = join(home, ".agents/skills/columns")
    const admitted = new Set<string>()
    const candidate = await prepareLocalSkill(source, home, (paths) => {
      paths.forEach((path) => admitted.add(path))
      return Promise.resolve()
    }, { lock })
    try {
      expect(candidate.path).toBe(installed)
      expect(candidate.warnings).toEqual([
        "Declared environment requirements: Node 24",
        "Declared tools (permissions unchanged): Read",
      ])
      expect(admitted.has(join(source, "references/example.bin"))).toBe(true)
      expect(await Bun.file(join(installed, "SKILL.md")).exists()).toBe(false)
      await rename(source, join(root, "moved"))
      expect(await candidate.publish(undefined)).toBe("installed")
      expect(new Uint8Array(await Bun.file(join(installed, "references/example.bin")).arrayBuffer())).toEqual(bytes)
      expect(await Bun.file(join(installed, ".git/config")).exists()).toBe(false)
      if (process.platform !== "win32") expect((await stat(join(installed, "scripts/columns.sh"))).mode & 0o111).toBe(0o111)
    } finally {
      await candidate.dispose()
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("local preparation blocks a second skill and linked files outside the source", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-install-scope-"))
  try {
    const source = join(root, "columns")
    const home = join(root, "home")
    await mkdir(home)
    const header = "---\nname: columns\ndescription: Checks columns.\n---\n"
    await Bun.write(join(source, "SKILL.md"), header)
    const nested = join(source, "example", "SKILL.md")
    await Bun.write(nested, header.replace("name: columns", "name: example"))
    const prepare = () => prepareLocalSkill(source, home, async () => {}, { lock })
    await expect(prepare()).rejects.toThrow("SKILL.md, example/SKILL.md")
    await rm(nested)
    const lowercase = join(source, "example", "skill.md")
    await Bun.write(lowercase, header.replace("name: columns", "name: example"))
    await expect(prepare()).rejects.toThrow("SKILL.md, example/skill.md")
    await rm(lowercase)
    if (process.platform !== "win32") {
      await Bun.write(join(root, "outside.txt"), "outside resource")
      await symlink("../outside.txt", join(source, "outside.txt"))
      await expect(prepare()).rejects.toThrow("Link leaves the portable skill folder")
    }
    expect(await Bun.file(join(home, ".agents/skills/columns/SKILL.md")).exists()).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test.skipIf(process.platform === "win32")("an unreadable installed directory is authorized before its entries are resolved", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-install-root-access-"))
  try {
    const source = join(root, "columns")
    const home = join(root, "home")
    const installed = join(home, ".agents/skills/columns")
    await mkdir(installed, { recursive: true })
    await Bun.write(join(source, "SKILL.md"), "---\nname: columns\ndescription: Checks columns.\n---\n")
    await symlink("missing-private-resource", join(installed, "unreadable-entry"))
    await expect(prepareLocalSkill(source, home, async () => {}, {
      lock,
      async authorizeInstalled(path, resources) {
        expect(path).toBe(installed)
        expect(resources).toEqual([installed])
        throw Error("installed root access refused")
      },
    })).rejects.toThrow("installed root access refused")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("concurrent replacement candidates get consent for the installed revision", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-replace-race-"))
  try {
    const source = join(root, "columns")
    const home = join(root, "home")
    await mkdir(home)
    await Bun.write(join(source, "SKILL.md"), "---\nname: columns\ndescription: Checks columns.\n---\n")
    const asset = join(source, "references/value.md")
    await Bun.write(asset, "original")
    const first = await prepareLocalSkill(source, home, async () => {}, { lock })
    await first.publish(undefined)
    await first.dispose()
    await Bun.write(asset, "first revision")
    const winner = await prepareLocalSkill(source, home, async () => {}, { lock })
    await Bun.write(asset, "second revision")
    const other = await prepareLocalSkill(source, home, async () => {}, { lock })
    const [a, b] = await Promise.all([winner.publish(winner.previous), other.publish(other.previous)])
    const published = a === "installed" ? winner : other
    const stale = a === "installed" ? other : winner
    const previousValue = a === "installed" ? "first revision" : "second revision"
    const requestedValue = a === "installed" ? "second revision" : "first revision"
    const disputed = a === "installed" ? b : a
    expect([a, b].filter((item) => item === "installed")).toHaveLength(1)
    expect(disputed).toMatchObject({ previous: { digest: published.digest } })
    const installedResource = join(other.path, "references/value.md")
    expect(await Bun.file(installedResource).text()).toBe(previousValue)
    if (typeof disputed === "string") throw Error("The stale approval unexpectedly published")
    expect(await stale.publish(disputed.previous)).toBe("installed")
    expect(await Bun.file(installedResource).text()).toBe(requestedValue)
    await Promise.all([winner.dispose(), other.dispose()])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("publication failure restores the previous tree and a later attempt recovers an interrupted move", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-replace-recover-"))
  try {
    const source = join(root, "columns")
    const home = join(root, "home")
    await mkdir(home)
    await Bun.write(join(source, "SKILL.md"), "---\nname: columns\ndescription: Checks columns.\n---\n")
    const asset = join(source, "references/value.md")
    await Bun.write(asset, "previous")
    const first = await prepareLocalSkill(source, home, async () => {}, { lock })
    expect(await first.publish(undefined)).toBe("installed")
    await first.dispose()
    await Bun.write(asset, "candidate")
    const resource = join(first.path, "references/value.md")

    const failed = await prepareLocalSkill(source, home, async () => {}, {
      lock,
      async move(from, to) {
        if (String(from).includes("draft-") && to === first.path) throw Error("injected publication failure")
        await rename(from, to)
      },
    })
    await expect(failed.publish(failed.previous)).rejects.toThrow("injected publication failure")
    expect(await Bun.file(resource).text()).toBe("previous")
    await failed.dispose()

    const interrupted = await prepareLocalSkill(source, home, async () => {}, {
      lock,
      async move(from, to) {
        await rename(from, to)
        if (from === first.path) throw Error("interrupted after saving predecessor")
      },
    })
    await expect(interrupted.publish(interrupted.previous)).rejects.toThrow("interrupted after saving predecessor")
    expect(await Bun.file(resource).exists()).toBe(false)
    await interrupted.dispose()
    const recovered = await prepareLocalSkill(source, home, async () => {}, { lock })
    expect(await Bun.file(resource).text()).toBe("previous")
    expect(recovered.previous?.digest).toBe(first.digest)
    expect(await recovered.publish(recovered.previous)).toBe("installed")
    expect(await Bun.file(resource).text()).toBe("candidate")
    await recovered.dispose()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("replacement reauthorizes new resources before comparing the installed revision", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-install-read-race-"))
  try {
    const source = join(root, "columns")
    const home = join(root, "home")
    const local = join(source, "SKILL.md")
    await Bun.write(local, columns)
    await mkdir(home)
    const first = await prepareLocalSkill(source, home, async () => {}, { lock })
    await first.publish(undefined)
    await first.dispose()
    await Bun.write(local, columns + "Replacement")
    const added = join(first.path, "references/addition.md")
    const reads: string[][] = []
    let addedOnce = false
    const candidate = await prepareLocalSkill(source, home, async () => {}, {
      lock: (name, control, run) => lock(name, control, async () => {
        if (!addedOnce) {
          addedOnce = true
          await Bun.write(added, "New installed resource")
        }
        return run()
      }),
      async authorizeInstalled(_path, paths) { reads.push(paths) },
    })
    try {
      expect(reads.at(0)).toEqual([first.path])
      expect(reads.at(-1)?.includes(added)).toBe(true)
      expect(candidate.previous?.digest).not.toBe(first.digest)
      expect(await candidate.publish(first)).toEqual({ previous: candidate.previous })
      expect(await Bun.file(added).text()).toBe("New installed resource")
    } finally {
      await candidate.dispose()
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("a retry cleans a predecessor only when it recognizes the published revision", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-install-published-"))
  try {
    const source = join(root, "columns")
    const home = join(root, "home")
    const local = join(source, "SKILL.md")
    const prepare = () => prepareLocalSkill(source, home, async () => {}, { lock })
    await Bun.write(local, columns + "Old copy")
    await mkdir(home)
    const first = await prepare()
    await first.publish(undefined)
    await first.dispose()

    const published = columns + "New copy"
    await Bun.write(local, published)
    const installed = join(first.path, "SKILL.md")
    let backup: string | undefined
    const candidate = await prepareLocalSkill(source, home, async () => {}, {
      lock,
      async move(from, to) {
        await rename(from, to)
        if (to === first.path) throw Error("interrupted after publishing")
        if (from === first.path) backup = String(to)
      },
    })
    await expect(candidate.publish(candidate.previous)).rejects.toThrow("interrupted after publishing")
    await candidate.dispose()
    expect(await Bun.file(installed).text()).toBe(published)

    await Bun.write(installed, columns + "Edited externally")
    await expect(prepare()).rejects.toThrow("the versions were kept")
    expect(await Bun.file(installed).text()).toBe(columns + "Edited externally")
    if (!backup) throw Error("Expected the previous skill copy")
    expect(await Bun.file(join(backup, "SKILL.md")).text()).toBe(columns + "Old copy")

    await Bun.write(installed, published)
    const retry = await prepare()
    try {
      expect(await retry.publish(retry.previous)).toBe("already-installed")
      await expect(stat(backup)).rejects.toMatchObject({ code: "ENOENT" })
    } finally {
      await retry.dispose()
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
  "successful replacement is retained when the old copy temporarily cannot be removed",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "loginom-install-cleanup-"))
    try {
      const source = join(root, "columns")
      const home = join(root, "home")
      const local = join(source, "SKILL.md")
      const prepare = () => prepareLocalSkill(source, home, async () => {}, { lock })
      await mkdir(home)
      await Bun.write(local, columns + "Old copy")
      const first = await prepare()
      await first.publish(undefined)
      await first.dispose()

      await Bun.write(local, columns + "New copy")
      let backup: string | undefined
      const candidate = await prepareLocalSkill(source, home, async () => {}, {
        lock,
        async move(from, to) {
          await rename(from, to)
          if (from === first.path) {
            backup = String(to)
            await chmod(dirname(backup), 0o500)
          }
        },
      })
      try {
        expect(await candidate.publish(candidate.previous)).toBe("installed")
        expect(await Bun.file(join(first.path, "SKILL.md")).text()).toBe(columns + "New copy")
        expect(backup).toBeDefined()
        expect(await stat(backup!).then((info) => info.isDirectory())).toBe(true)
      } finally {
        if (backup) await chmod(dirname(backup), 0o700)
        await candidate.dispose()
      }
      const retry = await prepare()
      try {
        expect(await retry.publish(retry.previous)).toBe("already-installed")
        await expect(stat(backup!)).rejects.toMatchObject({ code: "ENOENT" })
      } finally {
        await retry.dispose()
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
)
