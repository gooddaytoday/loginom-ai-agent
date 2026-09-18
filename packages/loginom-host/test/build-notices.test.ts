import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { collectBuildNotices } from "../script/collect-build-notices"

test.skipIf(process.platform === "win32")(
  "real build notices retain package identity and missing licenses, reject escaped texts",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "loginom-notices-"))
    try {
      const nested = join(root, "node_modules/@sample/nested")
      const missing = join(root, "node_modules/readme-only")
      await Bun.write(
        join(nested, "package.json"),
        JSON.stringify({ name: "@sample/nested", version: "1.2.3", license: "MIT" }),
      )
      await Bun.write(join(nested, "dist/package.json"), JSON.stringify({ type: "module" }))
      await Bun.write(join(nested, "dist/index.js"), "export const value = 41")
      await Bun.write(join(nested, "LICENSE"), "Fixture copyright and license\n")
      await Bun.write(
        join(missing, "package.json"),
        JSON.stringify({ name: "readme-only", version: "2.0.0", license: "MIT" }),
      )
      await Bun.write(join(missing, "index.js"), "export const other = 1")
      await Bun.write(join(missing, "README.md"), "# License\nMIT\n")
      await Bun.write(
        join(root, "entry.js"),
        'import { value } from "./node_modules/@sample/nested/dist/index.js"; import { other } from "./node_modules/readme-only/index.js"; console.log(value + other)',
      )
      const build = await Bun.build({ entrypoints: [join(root, "entry.js")], target: "bun", metafile: true })
      expect(build.success).toBe(true)
      if (!build.metafile) throw Error("Expected actual Bun metafile")
      const output = join(root, "notices")
      const inventory = await collectBuildNotices(output, [{ root: process.cwd(), metafile: build.metafile }])
      expect(inventory.packages.map((pkg) => pkg.name).sort()).toEqual(["@sample/nested", "readme-only"])
      expect(inventory.missing).toEqual(["readme-only@2.0.0"])
      expect(inventory.status).toBe("incomplete")
      const licensed = inventory.packages.find((pkg) => pkg.name === "@sample/nested")!
      expect(licensed.version).toBe("1.2.3")
      expect(await Bun.file(join(output, licensed.files[0].path)).text()).toBe("Fixture copyright and license\n")
      const documented = inventory.packages.find((pkg) => pkg.name === "readme-only")!
      expect(documented.files).toHaveLength(0)
      expect(documented.documentation).toHaveLength(1)
      expect(documented.documentation[0].sha256).toBe(createHash("sha256").update("# License\nMIT\n").digest("hex"))

      await rm(join(nested, "LICENSE"))
      await Bun.write(join(root, "outside.txt"), "Unrelated private file")
      await symlink(join(root, "outside.txt"), join(nested, "LICENSE"))
      await expect(
        collectBuildNotices(join(root, "rejected"), [{ root: process.cwd(), metafile: build.metafile }]),
      ).rejects.toThrow("LOGINOM_NOTICE_SOURCE_ESCAPE")
      expect(await Bun.file(join(root, "rejected/inventory.json")).exists()).toBe(false)
      expect(await Bun.file(join(root, "outside.txt")).text()).toBe("Unrelated private file")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
)
