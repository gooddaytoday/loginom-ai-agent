import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, resolve, sep } from "node:path"
import ts from "typescript"
import { checkCss, checkSource, checkSpecifier } from "./resolver.mjs"

// TypeScript follows type-only imports and references; Vite inlines nested CSS before transform.
// Check every source file before either tool runs.
const src = resolve("src")
const errors = []
for (const entry of readdirSync(src, { recursive: true, withFileTypes: true })) {
  const file = join(entry.parentPath, entry.name)
  if (entry.isFile() && entry.name.endsWith(".css")) {
    const error = checkCss(readFileSync(file, "utf8"), file, src)
    if (error) errors.push(`${file}: ${error}`)
  }
  if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue
  const code = readFileSync(file, "utf8")
  const info = ts.preProcessFile(code, true, true)
  for (const reference of info.referencedFiles) {
    const target = resolve(dirname(file), reference.fileName)
    if (target !== src && !target.startsWith(src + sep)) errors.push(`${file}: /// <reference path="${reference.fileName}"> выходит за пределы src/`)
  }
  for (const reference of info.typeReferenceDirectives) errors.push(`${file}: /// <reference types="${reference.fileName}"> запрещён`)
  for (const imported of info.importedFiles) {
    const error = checkSpecifier(imported.fileName, file, src)
    if (error) errors.push(`${file}: ${error}`)
  }
  const error = checkSource(code)
  if (error) errors.push(`${file}: ${error}`)
}
if (errors.length) {
  console.error(errors.join("\n"))
  process.exit(1)
}
