import assert from "node:assert/strict"
import { resolve } from "node:path"
import test from "node:test"
import { checkCss, checkSource, checkSpecifier, dashboardResolver } from "../../template/resolver.mjs"

const src = resolve("/w/src")
const importer = resolve("/w/src/main.tsx")

test("relative module paths stay inside src", () => {
  for (const specifier of ["./a", "./a/b.ts", "./data.json", "../src/x"])
    assert.equal(checkSpecifier(specifier, importer, src), undefined, specifier)
  for (const specifier of ["../x", "../../etc/hostname"])
    assert.match(checkSpecifier(specifier, importer, src) ?? "", /выходит за пределы src\//, specifier)
})

test("absolute paths and address schemes are refused", () => {
  for (const specifier of ["/etc/hostname", "C:/x", "file:///etc/hostname", "http://h/x", "node:fs"])
    assert.match(checkSpecifier(specifier, importer, src) ?? "", /по абсолютному пути или адресу запрещён/, specifier)
})

test("only exact module entry points from the template are allowed", () => {
  for (const specifier of ["react", "react/jsx-runtime", "react/jsx-dev-runtime", "react-dom", "react-dom/client", "recharts"])
    assert.equal(checkSpecifier(specifier, importer, src), undefined, specifier)
  for (const specifier of ["lodash", "@scope/pkg", "recharts/../../../../etc/hostname", "react/../x", "recharts/es6/index.js"])
    assert.match(checkSpecifier(specifier, importer, src) ?? "", /не входит в шаблон dashboard/, specifier)
})

test("CSS image sets cannot escape src", () => {
  assert.match(checkCss('image-set("../../../etc/hostname" 1x)', resolve("/w/src/a/style.css"), src) ?? "", /CSS.*только на файл внутри src\//)
})

test("module query strings and fragments are refused", () => {
  for (const specifier of ["./a?raw", "./a?url", "./a#x"])
    assert.match(checkSpecifier(specifier, importer, src) ?? "", /с параметрами запрещён/, specifier)
})

test("CSS references allow local files and refuse external addresses and query strings", () => {
  const file = resolve("/w/src/a/style.css")
  for (const css of ['url(font.woff2)', 'url("./font.woff2")', '@import "./a.css"'])
    assert.equal(checkCss(css, file, src), undefined, css)
  for (const css of ['url(../../../etc/hostname)', 'url(/etc/hostname)', 'url(data:font/woff2;base64,AA)', 'url(http://h/f)', '@import url("https://h/a.css")', 'url(./f.woff2?x)'])
    assert.match(checkCss(css, file, src) ?? "", /CSS.*только на файл внутри src\//, css)
})

test("source asset shortcuts are refused while ordinary URL construction remains valid", () => {
  assert.match(checkSource('import.meta.glob("/**")') ?? "", /import\.meta\.glob запрещён/)
  assert.match(checkSource('new URL("/etc/hostname", import.meta.url)') ?? "", /new URL.*запрещён/)
  assert.equal(checkSource("new URL(location.href)"), undefined)
})

test("Vite rejects unsafe imports from source and leaves kit and virtual imports to Vite", () => {
  const plugin = dashboardResolver(resolve("/w"))
  const context = { error(message) { throw Error(message) } }
  const source = importer.replaceAll("\\", "/") + "?v=synthetic"
  assert.throws(() => plugin.resolveId.call(context, "../outside", source), /выходит за пределы src\//)
  assert.equal(plugin.resolveId.call(context, "./a", source), null)
  assert.equal(plugin.resolveId.call(context, "node:fs", resolve("/w/node_modules/kit/index.js")), null)
  assert.equal(plugin.resolveId.call(context, "node:fs", "\0vite:synthetic"), null)
  assert.equal(plugin.resolveId.call(context, "\0vite:synthetic", source), null)
})
