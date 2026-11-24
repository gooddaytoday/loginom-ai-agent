import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rename, rm, stat, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { prepareLocalSkill } from "../src/skill-install/index"

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
    })
    try {
      expect(candidate.path).toBe(installed)
      expect(admitted.has(join(source, "references/example.bin"))).toBe(true)
      expect(await Bun.file(join(installed, "SKILL.md")).exists()).toBe(false)
      await rename(source, join(root, "moved"))
      expect(await candidate.publish()).toBe("installed")
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
    const prepare = () => prepareLocalSkill(source, home, async () => {})
    await expect(prepare()).rejects.toThrow("SKILL.md, example/SKILL.md")
    await rm(nested)
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
