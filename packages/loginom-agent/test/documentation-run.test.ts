import { expect, test } from "bun:test"
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { prepareDocumentation } from "../src/documentation-run"

test("a documentation run opens a private copy without changing the selected file", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "loginom-documentation-run-")))
  try {
    const path = join(root, "Учебный.lgp")
    await writeFile(path, "test package")
    const first = await prepareDocumentation(path, root)
    const second = await prepareDocumentation(path, root)
    expect(first.directory).not.toBe(second.directory)
    expect(first.filename).toBe("Учебный.lgp")
    expect(await readFile(join(first.directory, first.filename), "utf8")).toBe("test package")
    await writeFile(join(first.directory, first.filename), "changed copy")
    expect(await readFile(path, "utf8")).toBe("test package")
    expect(await readFile(join(second.directory, second.filename), "utf8")).toBe("test package")
    await expect(prepareDocumentation(root, root)).rejects.toThrow("PACKAGE_DOCS_LGP_REQUIRED")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
