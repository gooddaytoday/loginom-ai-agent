import { expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { prepareDocumentation, xdgDocuments } from "../src/documentation-run"

test("a documentation run opens a private copy without changing the selected file", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "loginom-documentation-run-")))
  try {
    const path = join(root, "Учебный.lgp")
    await writeFile(path, "test package")
    const documents = join(root, "Мои документы")
    await mkdir(documents)
    await writeFile(join(root, "user-dirs.dirs"), 'XDG_DOCUMENTS_DIR="$HOME/Мои документы"\n')
    const folders = { documents: () => xdgDocuments(root, root), profile: join(root, "profile") }
    const first = await prepareDocumentation(path, undefined, folders)
    const second = await prepareDocumentation(path, undefined, folders)
    expect(dirname(first.directory)).toBe(join(documents, "Loginom AI Agent", "Без проекта"))
    expect(first.directory).not.toBe(second.directory)
    expect(first.filename).toBe("Учебный.lgp")
    expect(await readFile(join(first.directory, first.filename), "utf8")).toBe("test package")
    await writeFile(join(first.directory, first.filename), "changed copy")
    expect(await readFile(path, "utf8")).toBe("test package")
    expect(await readFile(join(second.directory, second.filename), "utf8")).toBe("test package")
    await expect(prepareDocumentation(root, undefined, folders)).rejects.toThrow("PACKAGE_DOCS_LGP_REQUIRED")

    await writeFile(join(root, "user-dirs.dirs"), 'XDG_DOCUMENTS_DIR="$HOME/Учебный.lgp"\n')
    const fallback = await prepareDocumentation(path, undefined, folders)
    expect(dirname(fallback.directory)).toBe(join(folders.profile, "documentation-runs"))
    expect(await readFile(join(fallback.directory, fallback.filename), "utf8")).toBe("test package")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
