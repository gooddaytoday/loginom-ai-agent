import assert from "node:assert/strict"
import { readdir } from "node:fs/promises"
import { join, relative } from "node:path"

export default async function* (source) {
  const root = join(import.meta.dirname, "..")
  const expected = (await readdir(join(root, "src/web"), { recursive: true }))
    .filter(file => file.endsWith(".ts"))
    .map(file => join(root, "src/web", file))
    .sort()
  assert.ok(expected.length > 0, "Web coverage requires TS source files")
  let measured = false
  for await (const event of source) {
    if (event.type !== "test:coverage") continue
    const files = event.data.summary.files
    assert.deepEqual(files.map(file => file.path).sort(), expected, "Coverage must measure every web TS source and no other files")
    assert.ok(files.every(file => file.totalLineCount > 0), "Web coverage cannot measure empty files")
    measured = true
    yield `Web coverage measured: ${files.map(file => relative(root, file.path)).join(", ")}\n`
  }
  assert.ok(measured, "Web coverage report is missing")
}
