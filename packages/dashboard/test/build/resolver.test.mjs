import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"
import { checkSpecifier, dashboardResolver } from "../../template/resolver.mjs"

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
  for (const specifier of ["lodash", ".hidden", "@scope/pkg", "recharts/../../../../etc/hostname", "react/../x", "recharts/es6/index.js"])
    assert.match(checkSpecifier(specifier, importer, src) ?? "", /не входит в шаблон dashboard/, specifier)
})

test("module query strings and fragments are refused", () => {
  for (const specifier of ["./a?raw", "./a?url", "./a#x"])
    assert.match(checkSpecifier(specifier, importer, src) ?? "", /с параметрами запрещён/, specifier)
})

test("Vite rejects unsafe imports from source and leaves kit and virtual imports to Vite", async () => {
  const plugin = dashboardResolver(resolve("/w"))
  const context = { error(message) { throw Error(message) }, async resolve() { return null } }
  const source = importer.replaceAll("\\", "/") + "?v=synthetic"
  await assert.rejects(() => plugin.resolveId.call(context, "../outside", source), /выходит за пределы src\//)
  assert.equal(await plugin.resolveId.call(context, "./a", source), null)
  assert.equal(await plugin.resolveId.call(context, "node:fs", resolve("/w/node_modules/kit/index.js")), null)
  assert.equal(await plugin.resolveId.call(context, "node:fs", "\0vite:synthetic"), null)
  assert.equal(await plugin.resolveId.call(context, "\0vite:synthetic", source), null)
})

test("Vite refuses an actual resolved module outside src and kit before load", async t => {
  const root = await mkdtemp(join(tmpdir(), "dashboard-resolver-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, "project/src"), { recursive: true })
  await mkdir(join(root, "project/node_modules"))
  const external = join(root, "external.ts")
  await writeFile(external, 'export const value = "synthetic"')
  const plugin = dashboardResolver(join(root, "project"))
  const context = {
    error(message) { throw Error(message) },
    async resolve(source, importer, options) {
      assert.equal(source, "./pkg")
      assert.equal(importer, join(root, "project/src/main.tsx"))
      assert.deepEqual(options, { skipSelf: true })
      return { id: external }
    },
  }
  await assert.rejects(async () => plugin.resolveId.call(context, "./pkg", join(root, "project/src/main.tsx")), /Модуль.*вне src/)
})
