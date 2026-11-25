import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rename, rm, stat, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Flock } from "../../core/src/util/flock"
import { prepareLocalSkill } from "../src/skill-install/index"

const lock = <T>(name: string, control: string, run: () => Promise<T>) =>
  Flock.withLock("skill-install:" + name, run, { dir: control })

test("publication copies the prepared tree and survives moving the original", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-install-"))
  try {
    const source = join(root, "columns")
    const home = join(root, "home")
    await mkdir(home)
    await Bun.write(join(source, "SKILL.md"), "---\nname: columns\ndescription: Checks columns.\n---\n[Resource](references/example.bin)\n")
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
