import assert from "node:assert/strict"
import { readdir } from "node:fs/promises"
import { join, relative } from "node:path"

export default async function* (source) {
  const root = join(import.meta.dirname, "..")
  const workers = process.env.DASHBOARD_COVERAGE_SCOPE === "workers"
  const directories = workers ? ["publisher", "builder"] : ["web"]
  const expected = (await Promise.all(directories.map(async directory =>
    (await readdir(join(root, "src", directory), { recursive: true }))
      .filter(file => file.endsWith(".ts"))
      .map(file => join(root, "src", directory, file)),
  ))).flat()
  if (!workers) expected.push(join(root, "src", "log.ts"))
  expected.sort()
  assert.ok(expected.length > 0, "Service coverage requires TS source files")
  let measured = false
  for await (const event of source) {
    if (event.type !== "test:coverage") continue
    const files = event.data.summary.files
    assert.deepEqual(files.map(file => file.path).sort(), expected, "Coverage must measure every selected service TS source and no other files")
    assert.ok(files.every(file => file.totalLineCount > 0), "Service coverage cannot measure empty files")
    measured = true
    yield `Service coverage measured: ${files.map(file => relative(root, file.path)).join(", ")}\n`
  }
  assert.ok(measured, "Service coverage report is missing")
}
