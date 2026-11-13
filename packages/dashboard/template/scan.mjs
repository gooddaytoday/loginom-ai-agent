import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs"
import { dirname, isAbsolute, join, resolve, sep } from "node:path"
import Input from "postcss/lib/input"
import tokenize from "postcss/lib/tokenize"
import ts from "typescript"
import { checkSpecifier } from "./resolver.mjs"

// TypeScript follows type-only imports and references; Vite inlines nested CSS before transform.
// Check every source file before either tool runs.
const src = resolve("src")
const errors = []
const styles = []
for (const entry of readdirSync(src, { recursive: true, withFileTypes: true })) {
  const file = join(entry.parentPath, entry.name)
  if (entry.isFile() && entry.name.endsWith(".css")) styles.push({ file, code: readFileSync(file, "utf8") })
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
  const error = checkSource(ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true))
  if (error) errors.push(`${file}: ${error}`)
}
if (errors.length) {
  console.error(errors.join("\n"))
  process.exit(1)
}

if (styles.length) {
  const { resolveConfig } = await import("vite")
  // Explicit roots avoid Vite's ancestor workspace discovery under Node permissions.
  const config = await resolveConfig({ root: process.cwd(), configFile: false, envFile: false, css: { postcss: { plugins: [] } }, server: { fs: { allow: [process.cwd()] } } }, "build", "production", "production")
  // Match the installed Vite CSS URL and @import resolver modes.
  const assets = config.createResolver({ preferRelative: true, tryIndex: false, extensions: [] })
  const imports = config.createResolver({ extensions: [".css"], mainFields: ["style"], conditions: ["style", "production"], tryIndex: false, preferRelative: true })
  const canonical = realpathSync(src)
  for (const style of styles) for (const reference of cssReferences(style.code, style.file)) {
    try {
      const specifier = reference.imported ? reference.specifier : decodeURI(reference.specifier)
      if (/[?#]/.test(specifier) || isAbsolute(specifier) || /^[a-z][a-z0-9+.-]*:/i.test(specifier) || !inside(src, resolve(dirname(style.file), specifier))) {
        errors.push(`${style.file}: Ссылка «${specifier}» в CSS разрешена только на файл внутри src/`)
        continue
      }
      const target = await (reference.imported ? imports : assets)(specifier, style.file)
      if (!target || !inside(canonical, resolve(target)) || !inside(canonical, realpathSync(target)) || !statSync(target).isFile())
        errors.push(`${style.file}: Ссылка «${reference.specifier}» в CSS не ведёт к файлу внутри src/`)
    } catch (error) {
      errors.push(`${style.file}: Ссылка «${reference.specifier}» в CSS не ведёт к файлу внутри src/: ${error.message}`)
    }
  }
}
if (errors.length) {
  console.error(errors.join("\n"))
  process.exit(1)
}

function cssReferences(code, file) {
  const scanner = tokenize(new Input(code, { from: file }))
  const references = []
  const groups = []
  let word = ""
  let imported = false
  const add = (value, stylesheet) => {
    const text = value.trim()
    references.push({ specifier: text[0] === '"' || text[0] === "'" ? text.slice(1, -1) : text, imported: stylesheet })
  }
  while (!scanner.endOfFile()) {
    const token = scanner.nextToken()
    if (token[0] === "space" || token[0] === "comment") continue
    if (token[0] === "at-word") {
      imported = token[1].toLowerCase() === "@import"
      word = ""
      continue
    }
    if (token[0] === "word") {
      word = token[1].toLowerCase()
      continue
    }
    if (token[0] === "(") {
      groups.push({ name: word, start: token[2] + 1, imported: word === "url" && imported })
      imported = false
    }
    if (token[0] === ")") {
      const group = groups.pop()
      if (group?.name === "url") add(code.slice(group.start, token[2]), group.imported)
    }
    if (token[0] === "brackets" && word === "url") {
      add(token[1].slice(1, -1), imported)
      imported = false
    }
    if (token[0] === "string") {
      if (imported) {
        add(token[1], true)
        imported = false
      }
      if (groups.at(-1)?.name === "image-set" || groups.at(-1)?.name === "-webkit-image-set") add(token[1], false)
    }
    if (token[0] === ";" || token[0] === "{" || token[0] === "}") imported = false
    word = ""
  }
  return references
}

function inside(root, file) {
  return file === root || file.startsWith(root + sep)
}

function checkSource(node) {
  if (ts.isCallExpression(node) && isMetaProperty(node.expression, "glob")) return "import.meta.glob запрещён"
  if (ts.isNewExpression(node) && ts.isIdentifier(unwrap(node.expression)) && unwrap(node.expression).text === "URL" && isMetaProperty(node.arguments?.[1], "url"))
    return "new URL(…, import.meta.url) запрещён"
  return ts.forEachChild(node, checkSource)
}

function isMetaProperty(node, name) {
  const value = unwrap(node)
  if (!value) return false
  const property = ts.isPropertyAccessExpression(value) ? value.name.text : ts.isElementAccessExpression(value) && ts.isStringLiteralLike(value.argumentExpression) ? value.argumentExpression.text : undefined
  if (property !== name) return false
  const expression = unwrap(value.expression)
  return expression?.kind === ts.SyntaxKind.MetaProperty && expression.keywordToken === ts.SyntaxKind.ImportKeyword && expression.name.text === "meta"
}

function unwrap(node) {
  if (node && ts.isParenthesizedExpression(node)) return unwrap(node.expression)
  return node
}
