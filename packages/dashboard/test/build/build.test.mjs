import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import test from "node:test"
import { buildDashboard, PLATFORM_FILES, sourceFiles } from "../../src/agent/build.ts"

const template = resolve(import.meta.dirname, "../../template")
const node = process.env.LOGINOM_AI_AGENT_TEST_NODE ?? process.execPath

async function fixture(t, src = join(template, "src")) {
  const root = await mkdtemp(join(tmpdir(), "dashboard-build-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const work = join(root, "work")
  await cp(src, join(work, "src"), { recursive: true })
  return { work, out: join(root, "control/draft"), node, template }
}

test("the platform template builds from project sources to an immutable hash", async t => {
  const input = await fixture(t)
  const build = await buildDashboard(input)
  assert.equal(build.ok, true, build.output)
  assert.match(build.hash, /^[a-f0-9]{64}$/)
  assert.equal(build.dir, join(input.out, build.hash))
  assert.match(await readFile(join(build.dir, "index.html"), "utf8"), /<title>Dashboard<\/title>/)
  assert.ok((await readdir(join(build.dir, "assets"))).some(name => name.endsWith(".js")))
  assert.equal(await readFile(join(input.out, "current"), "utf8"), build.hash + "\n")
  const repeated = await buildDashboard(input)
  assert.equal(repeated.ok, true, repeated.output)
  assert.equal(repeated.hash, build.hash)
  assert.deepEqual((await readdir(input.out)).filter(name => /^[a-f0-9]{64}$/.test(name)), [build.hash])
})

for (const key of ["roi", "campaign-summary", "channel-summary"]) test(`SDK example typechecks/builds: ${key}`, async t => {
  const input = await fixture(t, resolve(import.meta.dirname, "../../examples", key, "src"))
  const build = await buildDashboard(input)
  assert.equal(build.ok, true, build.output)
})

test("a symbolic src root is refused before invoking the compiler", async t => {
  const input = await fixture(t)
  const outside = join(input.work, "../outside")
  await rename(join(input.work, "src"), outside)
  await symlink(outside, join(input.work, "src"), process.platform === "win32" ? "junction" : "dir")
  const result = await buildDashboard({ ...input, node: join(input.work, "missing-node") })
  assert.equal(result.ok, false)
  assert.match(result.output, /Символьная ссылка/)
})

test("symbolic files and directories in src are refused before invoking the compiler", async t => {
  for (const directory of [false, true]) await t.test(directory ? "directory" : "file", async t => {
    const input = await fixture(t)
    await symlink(join(input.template, directory ? "src" : "src/main.tsx"), join(input.work, "src/link"), directory ? (process.platform === "win32" ? "junction" : "dir") : "file")
    const result = await buildDashboard({ ...input, node: join(input.work, "missing-node") })
    assert.equal(result.ok, false)
    assert.match(result.output, /Символьная ссылка/)
  })
})

test("a source file outside the allowed extensions is refused before invoking the compiler", async t => {
  const input = await fixture(t)
  await writeFile(join(input.work, "src/app.exe"), "synthetic executable")
  const result = await buildDashboard({ ...input, node: join(input.work, "missing-node") })
  assert.equal(result.ok, false)
  assert.match(result.output, /Недопустимый тип файла: src\/app\.exe/)
})

test("hidden names and literal backslashes in source paths are refused", async t => {
  for (const name of [".secret.ts", ...(process.platform === "win32" ? [] : ["a\\b.ts"])]) await t.test(name, async t => {
    const input = await fixture(t)
    await writeFile(join(input.work, "src", name), "export {}")
    const result = await buildDashboard({ ...input, node: join(input.work, "missing-node") })
    assert.equal(result.ok, false)
    assert.match(result.output, /Недопустимое имя/)
  })
})

test("src/main.tsx is required before invoking the compiler", async t => {
  const input = await fixture(t)
  await rm(join(input.work, "src/main.tsx"))
  const result = await buildDashboard({ ...input, node: join(input.work, "missing-node") })
  assert.equal(result.ok, false)
  assert.match(result.output, /Нет обязательного файла src\/main\.tsx/)
})

test("at most two hundred source files are accepted", async t => {
  const input = await fixture(t)
  await rm(join(input.work, "src"), { recursive: true })
  await mkdir(join(input.work, "src"))
  await writeFile(join(input.work, "src/main.tsx"), "export {}")
  await Promise.all(Array.from({ length: 200 }, (_, index) => writeFile(join(input.work, `src/f${index}.ts`), "export {}")))
  const result = await buildDashboard({ ...input, node: join(input.work, "missing-node") })
  assert.equal(result.ok, false)
  assert.match(result.output, /больше 200 файлов/)
  await rm(join(input.work, "src/f199.ts"))
  assert.equal((await sourceFiles(input.work)).files.length, 200)
})

test("source files are bounded to one MiB in bytes", async t => {
  const input = await fixture(t)
  await rm(join(input.work, "src"), { recursive: true })
  await mkdir(join(input.work, "src"))
  const source = join(input.work, "src/main.tsx")
  await writeFile(source, "x".repeat(1_048_577))
  const result = await buildDashboard({ ...input, node: join(input.work, "missing-node") })
  assert.equal(result.ok, false)
  assert.match(result.output, /больше 1 МБ/)
  await writeFile(source, "x".repeat(1_048_576))
  assert.deepEqual(await sourceFiles(input.work), { files: ["src/main.tsx"] })
})

test("timeout and cancellation return the specified build failure without a current hash", async t => {
  for (const cancelled of [false, true]) await t.test(cancelled ? "cancelled" : "timeout", async t => {
    const input = await fixture(t)
    const signal = AbortSignal.abort()
    const result = await buildDashboard({ ...input, ...(cancelled ? { signal } : { timeoutMs: 1 }) })
    assert.equal(result.ok, false)
    assert.match(result.output, cancelled ? /Сборка отменена/ : /Сборка прервана: превышено время 90 секунд/)
    await assert.rejects(readFile(join(input.out, "current")), { code: "ENOENT" })
    assert.deepEqual(await readdir(input.out), [])
  })
})

test("type errors reach the caller within the output budget and do not switch current", async t => {
  const input = await fixture(t)
  const before = await buildDashboard(input)
  assert.equal(before.ok, true, before.output)
  await writeFile(join(input.work, "src/main.tsx"), Array.from({ length: 1_000 }, (_, index) => `const x${index}: number = "a"`).join("\n"))
  const result = await buildDashboard(input)
  assert.equal(result.ok, false)
  assert.match(result.output, /error TS2322/)
  assert.ok(result.output.length <= 8_192)
  assert.doesNotMatch(result.output, /main\.tsx\(1000,/)
  assert.equal(await readFile(join(input.out, "current"), "utf8"), before.hash + "\n")
})

test("retention keeps current and previous across a repeated current build", async t => {
  const input = await fixture(t)
  const initial = await buildDashboard(input)
  assert.equal(initial.ok, true, initial.output)
  const main = join(input.work, "src/main.tsx")
  const variant = value => `import { onState } from "./loginom"; onState(() => { document.body.textContent = ${JSON.stringify(value)} })`
  await writeFile(main, variant("B"))
  const second = await buildDashboard(input)
  assert.equal(second.ok, true, second.output)
  assert.notEqual(initial.hash, second.hash)
  assert.equal((await buildDashboard(input)).hash, second.hash)
  assert.deepEqual((await readdir(input.out)).filter(name => /^[a-f0-9]{64}$/.test(name)).sort(), [initial.hash, second.hash].sort())
  await writeFile(main, variant("C"))
  const third = await buildDashboard(input)
  assert.equal(third.ok, true, third.output)
  assert.notEqual(second.hash, third.hash)
  assert.deepEqual((await readdir(input.out)).filter(name => /^[a-f0-9]{64}$/.test(name)).sort(), [second.hash, third.hash].sort())
  assert.equal(await readFile(join(input.out, "current"), "utf8"), third.hash + "\n")
})

test("simultaneous builds of the same output install one complete hash", async t => {
  const first = await fixture(t)
  const second = await fixture(t)
  const builds = await Promise.all([buildDashboard(first), buildDashboard({ ...second, out: first.out })])
  for (const build of builds) {
    assert.equal(build.ok, true, build.output)
    assert.ok((await readFile(join(build.dir, "index.html"), "utf8")).includes("Dashboard"))
  }
  assert.equal(builds[0].hash, builds[1].hash)
  assert.equal(await readFile(join(first.out, "current"), "utf8"), builds[0].hash + "\n")
  assert.deepEqual((await readdir(first.out)).filter(name => /^[a-f0-9]{64}$/.test(name)), [builds[0].hash])
})

test("the src root must be an ordinary directory", async t => {
  const input = await fixture(t)
  await rm(join(input.work, "src"), { recursive: true })
  await writeFile(join(input.work, "src"), "synthetic file")
  const result = await buildDashboard({ ...input, node: join(input.work, "missing-node") })
  assert.equal(result.ok, false)
  assert.match(result.output, /Каталог src должен быть обычной папкой/)
})

test("only platform config is used and the shared template kit stays untouched", async t => {
  const input = await fixture(t)
  await Promise.all([
    writeFile(join(input.work, "vite.config.ts"), 'throw new Error("work Vite config used")'),
    writeFile(join(input.work, "postcss.config.js"), 'throw new Error("work PostCSS config used")'),
    writeFile(join(input.work, "package.json"), JSON.stringify({ scripts: { build: "exit 1" } })),
    writeFile(join(input.work, "index.html"), "<title>User index</title>"),
  ])
  await mkdir(join(input.out, ".."), { recursive: true })
  await writeFile(join(input.out, "../postcss.config.cjs"), 'throw new Error("ancestor PostCSS config used")')
  const main = await readFile(join(input.work, "src/main.tsx"), "utf8")
  await writeFile(join(input.work, "src/main.tsx"), 'import "./style.css"\n' + main)
  await writeFile(join(input.work, "src/style.css"), "body { color: rebeccapurple }")
  const result = await buildDashboard(input)
  assert.equal(result.ok, true, result.output)
  assert.match(await readFile(join(result.dir, "index.html"), "utf8"), /<title>Dashboard<\/title>/)
  assert.ok((await readdir(join(result.dir, "assets"))).some(name => name.endsWith(".css")))
  for (const name of [".vite-temp", ".vite"]) await assert.rejects(readdir(join(input.template, "node_modules", name)), { code: "ENOENT" })
  assert.equal(JSON.parse(await readFile(join(input.template, "node_modules/typescript/package.json"), "utf8")).version, "5.8.2")
})

test("the template builds without a network namespace connection", async t => {
  if (process.platform !== "linux" || spawnSync("unshare", ["-rn", "true"], { stdio: "ignore" }).status !== 0)
    return t.skip("unshare -rn is unavailable on this platform")
  const input = await fixture(t)
  const runner = join(dirname(input.work), "offline.mjs")
  await writeFile(runner, `import { buildDashboard } from ${JSON.stringify(new URL("../../src/agent/build.ts", import.meta.url).href)};
const result = await buildDashboard(${JSON.stringify(input)});
if (!result.ok) throw Error(result.output);
process.stdout.write(JSON.stringify(result));
`)
  const result = JSON.parse(execFileSync("unshare", ["-rn", node, runner], { encoding: "utf8" }))
  assert.equal(result.ok, true)
  assert.equal(await readFile(join(input.out, "current"), "utf8"), result.hash + "\n")
})

test("build processes cannot write back into the source project", async t => {
  const input = await fixture(t)
  const main = join(input.work, "src/main.tsx")
  await writeFile(main, 'document.body.textContent = "before-capture"; export {}')
  const before = await buildDashboard(input)
  assert.equal(before.ok, true, before.output)
  const kit = join(dirname(input.work), "template-kit")
  await mkdir(kit)
  await Promise.all(PLATFORM_FILES.map(name => cp(join(input.template, name), join(kit, name))))
  await symlink(join(input.template, "node_modules"), join(kit, "node_modules"), process.platform === "win32" ? "junction" : "dir")
  await writeFile(join(kit, "vite.config.mjs"), `import { writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(main)}, 'document.body.textContent = "after-capture"; export {}');
export default { cacheDir: ".vite-cache", css: { postcss: { plugins: [] } } };
`)
  const result = await buildDashboard({ ...input, template: kit })
  assert.equal(result.ok, false)
  assert.match(result.output, /Access to this API has been restricted.*--allow-fs-write/)
  assert.match(await readFile(main, "utf8"), /before-capture/)
  assert.equal(await readFile(join(input.out, "current"), "utf8"), before.hash + "\n")
})

test("a work directory alias builds the same captured sources", async t => {
  const input = await fixture(t)
  const before = await buildDashboard(input)
  assert.equal(before.ok, true, before.output)
  const alias = join(dirname(input.work), "work-alias")
  await symlink(input.work, alias, process.platform === "win32" ? "junction" : "dir")
  const result = await buildDashboard({ ...input, work: alias })
  assert.equal(result.ok, true, result.output)
  assert.equal(result.hash, before.hash)
})

test("a missing src root reports the required main file without throwing", async t => {
  const input = await fixture(t)
  await rm(join(input.work, "src"), { recursive: true })
  assert.deepEqual(await sourceFiles(input.work), { error: "Нет обязательного файла src/main.tsx" })
  assert.deepEqual(await buildDashboard({ ...input, node: join(input.work, "missing-node") }), { ok: false, output: "Нет обязательного файла src/main.tsx" })
})

test("compiler diagnostics in Unicode stay within eight KiB of valid UTF-8", async t => {
  const input = await fixture(t)
  await writeFile(join(input.work, "src/main.tsx"), Array.from({ length: 500 }, (_, index) => "несуществующееИмя" + index).join("\n"))
  const result = await buildDashboard(input)
  assert.equal(result.ok, false)
  assert.match(result.output, /error TS2304/)
  assert.ok(Buffer.byteLength(result.output, "utf8") <= 8_192)
  assert.doesNotMatch(result.output, /\uFFFD/)
})

test("truncated diagnostics preserve the exact first bytes across output chunks", async t => {
  const input = await fixture(t)
  await Promise.all(PLATFORM_FILES.map(name => cp(join(input.template, name), join(input.work, name))))
  await writeFile(join(input.work, "src/main.tsx"), "z".repeat(27) + Array.from({ length: 3_000 }, (_, index) => "несуществующееИмя" + index).join("\n"))
  const full = spawnSync(node, [join(template, "node_modules/typescript/bin/tsc"), "--noEmit", "--pretty", "false", "-p", "tsconfig.json"], { cwd: input.work, encoding: "utf8" })
  assert.equal(full.status, 2)
  assert.equal(full.stderr, "")
  assert.ok(Buffer.byteLength(full.stdout, "utf8") > 8_192)
  const expected = new TextDecoder().decode(Buffer.from(full.stdout).subarray(0, 8_192), { stream: true })
  const result = await buildDashboard(input)
  assert.equal(result.ok, false)
  assert.equal(result.output, expected)
})

test("external reference paths are refused before TypeScript without a build result", async t => {
  const input = await fixture(t)
  const external = join(dirname(input.work), "external.d.ts")
  await writeFile(external, "declare const syntheticExternal: string")
  await writeFile(join(input.work, "src/main.tsx"), `/// <reference path="${external.replaceAll("\\", "/")}" />
export {}`)
  const result = await buildDashboard(input)
  assert.equal(result.ok, false, "external reference unexpectedly compiled")
  assert.match(result.output, /reference.*src\//)
  assert.doesNotMatch(result.output, /error TS/)
  assert.deepEqual(await readdir(input.out), [])
})

test("ambient type references are refused before TypeScript", async t => {
  const input = await fixture(t)
  await writeFile(join(input.work, "src/main.tsx"), '/// <reference types="node" />\nexport {}')
  const result = await buildDashboard(input)
  assert.equal(result.ok, false)
  assert.match(result.output, /reference types="node".*запрещён/)
  assert.doesNotMatch(result.output, /error TS/)
  assert.deepEqual(await readdir(input.out), [])
})

test("raw imports of owned external files are refused before TypeScript", async t => {
  const input = await fixture(t)
  const external = join(dirname(input.work), "external.txt")
  await writeFile(external, "synthetic external content")
  await writeFile(join(input.work, "src/main.tsx"), `import x from "${external.replaceAll("\\", "/")}?raw"; document.body.textContent = x`)
  const result = await buildDashboard(input)
  assert.equal(result.ok, false)
  assert.match(result.output, /с параметрами запрещён/)
  assert.doesNotMatch(result.output, /error TS/)
  assert.deepEqual(await readdir(input.out), [])
})

test("source glob imports are refused before TypeScript", async t => {
  const input = await fixture(t)
  await writeFile(join(input.work, "src/main.tsx"), 'import.meta.glob("/**"); export {}')
  const result = await buildDashboard(input)
  assert.equal(result.ok, false)
  assert.match(result.output, /import\.meta\.glob запрещён/)
  assert.doesNotMatch(result.output, /error TS/)
  assert.deepEqual(await readdir(input.out), [])
})

test("source URL assets cannot read an owned external file", async t => {
  const input = await fixture(t)
  const external = join(dirname(input.work), "external.txt")
  await writeFile(external, "synthetic external content")
  await writeFile(join(input.work, "src/main.tsx"), `document.body.textContent = new URL(${JSON.stringify(external.replaceAll("\\", "/"))}, import.meta.url).href`)
  const result = await buildDashboard(input)
  assert.equal(result.ok, false, result.output)
  assert.match(result.output, /new URL.*import\.meta\.url.*запрещён/)
  assert.doesNotMatch(result.output, /error TS/)
  assert.deepEqual(await readdir(input.out), [])
})

test("CSS URL assets must stay inside captured src", async t => {
  const input = await fixture(t)
  await mkdir(dirname(input.out), { recursive: true })
  await writeFile(join(dirname(input.out), "external.woff2"), Buffer.alloc(16, 1))
  await writeFile(join(input.work, "src/main.tsx"), 'import "./style.css"; export {}')
  await writeFile(join(input.work, "src/style.css"), '@font-face { font-family: synthetic; src: url(../../../external.woff2) }')
  const result = await buildDashboard(input)
  assert.equal(result.ok, false, result.output)
  assert.match(result.output, /CSS.*только на файл внутри src\//)
  assert.deepEqual(await readdir(input.out), [])
})

test("CSS imports cannot read an owned external stylesheet", async t => {
  const input = await fixture(t)
  const external = join(dirname(input.work), "external.css")
  await writeFile(external, "body { color: rebeccapurple }")
  await writeFile(join(input.work, "src/main.tsx"), 'import "./style.css"; export {}')
  await writeFile(join(input.work, "src/style.css"), `@import "${external.replaceAll("\\", "/")}";`)
  const result = await buildDashboard(input)
  assert.equal(result.ok, false, result.output)
  assert.match(result.output, /CSS.*только на файл внутри src\//)
  assert.deepEqual(await readdir(input.out), [])
})

test("quoted CSS URLs with a closing parenthesis still cannot escape src", async t => {
  const input = await fixture(t)
  await mkdir(dirname(input.out), { recursive: true })
  await writeFile(join(dirname(input.out), "external).woff2"), Buffer.alloc(16, 1))
  await writeFile(join(input.work, "src/main.tsx"), 'import "./style.css"; export {}')
  await writeFile(join(input.work, "src/style.css"), '@font-face { font-family: synthetic; src: url("../../../external).woff2") }')
  const result = await buildDashboard(input)
  assert.equal(result.ok, false, result.output)
  assert.match(result.output, /CSS.*только на файл внутри src\//)
  assert.deepEqual(await readdir(input.out), [])
})

test("module imports outside the dashboard contract are refused before TypeScript", async t => {
  for (const [specifier, message] of [
    ["./logo.png?url", /с параметрами запрещён/],
    ["lodash", /не входит в шаблон dashboard/],
    ["recharts/../../../../package.json", /не входит в шаблон dashboard/],
  ]) await t.test(specifier, async t => {
    const input = await fixture(t)
    await writeFile(join(input.work, "src/logo.png"), Buffer.from("synthetic image"))
    await writeFile(join(input.work, "src/main.tsx"), `import x from ${JSON.stringify(specifier)}; console.log(x)`)
    const result = await buildDashboard(input)
    assert.equal(result.ok, false, result.output)
    assert.match(result.output, message)
    assert.doesNotMatch(result.output, /error TS/)
    assert.deepEqual(await readdir(input.out), [])
  })
})

test("type-only imports cannot read an owned external module", async t => {
  const input = await fixture(t)
  const external = join(dirname(input.work), "external.ts")
  await writeFile(external, "export type X = string")
  await writeFile(join(input.work, "src/main.tsx"), `import type { X } from ${JSON.stringify(external.replaceAll("\\", "/"))}; const x: X = "synthetic"; console.log(x)`)
  const result = await buildDashboard(input)
  assert.equal(result.ok, false, result.output)
  assert.match(result.output, /по абсолютному пути или адресу запрещён/)
  assert.doesNotMatch(result.output, /error TS/)
  assert.deepEqual(await readdir(input.out), [])
})

test("nested CSS imports are checked before Vite can inline them", async t => {
  const input = await fixture(t)
  await mkdir(dirname(input.out), { recursive: true })
  await writeFile(join(dirname(input.out), "external.woff2"), Buffer.alloc(16, 1))
  await writeFile(join(input.work, "src/main.tsx"), 'import "./a.css"; export {}')
  await writeFile(join(input.work, "src/a.css"), '@import "./b.css";')
  await writeFile(join(input.work, "src/b.css"), '@font-face { font-family: synthetic; src: url(../../../external.woff2) }')
  const result = await buildDashboard(input)
  assert.equal(result.ok, false, result.output)
  assert.match(result.output, /b\.css:.*CSS.*только на файл внутри src\//)
  assert.doesNotMatch(result.output, /error TS/)
  assert.deepEqual(await readdir(input.out), [])
})

test("local font assets inside src build successfully", async t => {
  const input = await fixture(t)
  await writeFile(join(input.work, "src/main.tsx"), 'import "./style.css"; export {}')
  await writeFile(join(input.work, "src/font.woff2"), Buffer.alloc(16, 1))
  await writeFile(join(input.work, "src/style.css"), '@font-face { font-family: synthetic; src: url(./font.woff2) }')
  const result = await buildDashboard(input)
  assert.equal(result.ok, true, result.output)
  const assets = join(result.dir, "assets")
  const css = (await readdir(assets)).find(name => name.endsWith(".css"))
  assert.ok(css)
  assert.match(await readFile(join(assets, css), "utf8"), /@font-face/)
  assert.equal(await readFile(join(input.out, "current"), "utf8"), result.hash + "\n")
})

test("percent-encoded CSS paths cannot escape src after Vite decoding", async t => {
  const input = await fixture(t)
  await mkdir(dirname(input.out), { recursive: true })
  await writeFile(join(dirname(input.out), "encoded-external.woff2"), Buffer.alloc(16, 2))
  await writeFile(join(input.work, "src/main.tsx"), 'import "./style.css"; export {}')
  await writeFile(join(input.work, "src/style.css"), '@font-face { font-family: synthetic; src: url(%2e%2e/%2e%2e/%2e%2e/encoded-external.woff2) }')
  const result = await buildDashboard(input)
  assert.equal(result.ok, false, "encoded CSS escape unexpectedly built")
  assert.match(result.output, /CSS.*src\//)
  assert.deepEqual(await readdir(input.out), [])
})

test("relative directory imports cannot redirect TypeScript outside src", async t => {
  const input = await fixture(t)
  const external = join(dirname(input.work), "redirected-external.d.ts")
  await writeFile(external, "export type SyntheticExternal = string")
  await mkdir(join(input.work, "src/pkg"))
  await writeFile(join(input.work, "src/pkg/package.json"), JSON.stringify({ types: external.replaceAll("\\", "/") }))
  await writeFile(join(input.work, "src/main.tsx"), 'import type { SyntheticExternal } from "./pkg"; const value: SyntheticExternal = "synthetic"; console.log(value)')
  const result = await buildDashboard(input)
  assert.equal(result.ok, false, "package metadata redirect unexpectedly built")
  assert.match(result.output, /error TS2307: Cannot find module '\.\/pkg'/)
  assert.deepEqual(await readdir(input.out), [])
})

test("ordinary documentation strings naming import.meta.glob remain valid source", async t => {
  const input = await fixture(t)
  await writeFile(join(input.work, "src/main.tsx"), 'export const documentation = "Документация import.meta.glob"; const address = new URL(location.href); document.body.textContent = documentation + address.href; // import.meta.glob("/**")\n/* new URL("synthetic", import.meta.url) */')
  const result = await buildDashboard(input)
  assert.equal(result.ok, true, result.output)
  assert.equal(await readFile(join(input.out, "current"), "utf8"), result.hash + "\n")
})

test("missing CSS asset targets are refused instead of left for runtime", async t => {
  const input = await fixture(t)
  await writeFile(join(input.work, "src/main.tsx"), 'import "./style.css"; export {}')
  await writeFile(join(input.work, "src/style.css"), '@font-face { font-family: synthetic; src: url(./missing.woff2) }')
  const result = await buildDashboard(input)
  assert.equal(result.ok, false, result.output)
  assert.match(result.output, /missing\.woff2.*CSS.*src\//)
  assert.deepEqual(await readdir(input.out), [])
})

test("extensionless TS and CSS, local package metadata and encoded assets remain supported", async t => {
  const input = await fixture(t)
  await mkdir(join(input.work, "src/pkg"))
  await writeFile(join(input.work, "src/pkg/package.json"), JSON.stringify({ types: "./index.ts", main: "./index.ts" }))
  await writeFile(join(input.work, "src/pkg/index.ts"), 'export const label = "synthetic"')
  await writeFile(join(input.work, "src/helper.ts"), 'export const suffix = " local"')
  await writeFile(join(input.work, "src/main.tsx"), 'import { createElement } from "react"; import { label } from "./pkg"; import { suffix } from "./helper"; import "./style.css"; console.log(createElement("p", null, label + suffix))')
  await writeFile(join(input.work, "src/style.css"), '@import "./theme";')
  await writeFile(join(input.work, "src/theme.css"), '@font-face { font-family: synthetic; src: url("./encoded%20font.woff2") }')
  await writeFile(join(input.work, "src/encoded font.woff2"), Buffer.alloc(16, 3))
  const result = await buildDashboard(input)
  assert.equal(result.ok, true, result.output)
  assert.equal(await readFile(join(input.out, "current"), "utf8"), result.hash + "\n")
})

test("local type declarations cannot authorize an external runtime package entry", async t => {
  const input = await fixture(t)
  const external = join(dirname(input.work), "runtime-external.ts")
  await writeFile(external, 'export const label = "synthetic external runtime"')
  await mkdir(join(input.work, "src/pkg"))
  await writeFile(join(input.work, "src/pkg/package.json"), JSON.stringify({ types: "./index.d.ts", main: external.replaceAll("\\", "/") }))
  await writeFile(join(input.work, "src/pkg/index.d.ts"), 'export declare const label: string')
  await writeFile(join(input.work, "src/main.tsx"), 'import { label } from "./pkg"; document.body.textContent = label')
  const result = await buildDashboard(input)
  assert.equal(result.ok, false, result.output)
  assert.match(result.output, /pkg/)
  assert.deepEqual(await readdir(input.out), [])
})

test("nested URL arguments cannot hide the import.meta.url base", async t => {
  const input = await fixture(t)
  const external = join(dirname(input.work), "nested-external.txt")
  await writeFile(external, "synthetic")
  await writeFile(join(input.work, "src/main.tsx"), `document.body.textContent = new (URL)(String(${JSON.stringify(external.replaceAll("\\", "/"))}), (import.meta.url)).href`)
  const result = await buildDashboard(input)
  assert.equal(result.ok, false, result.output)
  assert.match(result.output, /new URL.*import\.meta\.url.*запрещён/)
  assert.doesNotMatch(result.output, /error TS/)
  assert.deepEqual(await readdir(input.out), [])
})

test("CSS package metadata cannot read a manifest outside captured sources", async t => {
  const input = await fixture(t)
  const external = join(dirname(input.work), "external-package")
  await mkdir(external)
  await writeFile(join(external, "package.json"), JSON.stringify({ style: "external.css" }))
  await writeFile(join(external, "external.css"), "body { color: rebeccapurple }")
  await mkdir(join(input.work, "src/csspkg"))
  await writeFile(join(input.work, "src/csspkg/package.json"), JSON.stringify({ style: external.replaceAll("\\", "/") }))
  await writeFile(join(input.work, "src/main.tsx"), 'import "./style.css"; export {}')
  await writeFile(join(input.work, "src/style.css"), '@import "./csspkg";')
  const result = await buildDashboard(input)
  assert.equal(result.ok, false, result.output)
  assert.match(result.output, /csspkg.*CSS.*src\//)
  assert.deepEqual(await readdir(input.out), [])
})

test("quoted image-set paths with closing parentheses cannot escape src", async t => {
  const input = await fixture(t)
  await mkdir(dirname(input.out), { recursive: true })
  await writeFile(join(dirname(input.out), "external).png"), Buffer.alloc(16, 4))
  await writeFile(join(input.work, "src/main.tsx"), 'import "./style.css"; export {}')
  await writeFile(join(input.work, "src/style.css"), 'body { background-image: image-set("../../../external).png" 1x) }')
  const result = await buildDashboard(input)
  assert.equal(result.ok, false, "quoted image-set escape unexpectedly built")
  assert.match(result.output, /CSS.*src\//)
  assert.deepEqual(await readdir(input.out), [])
})

test("an external editor cannot change the sources already captured for the build", async t => {
  if (process.platform === "win32") return t.skip("the external-editor launcher requires a POSIX shebang")
  const input = await fixture(t)
  const main = join(input.work, "src/main.tsx")
  await writeFile(main, 'document.body.textContent = "before-capture"; export {}')
  const before = await buildDashboard(input)
  assert.equal(before.ok, true, before.output)
  const launcher = join(dirname(input.work), "external-editor")
  await writeFile(launcher, `#!${node}
import { writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
writeFileSync(${JSON.stringify(main)}, 'document.body.textContent = "after-capture"; export {}');
const child = spawnSync(${JSON.stringify(node)}, process.argv.slice(2), { stdio: "inherit" });
if (child.error) throw child.error;
process.exit(child.status ?? 1);
`, { mode: 0o755 })
  const result = await buildDashboard({ ...input, node: launcher })
  assert.equal(result.ok, true, result.output)
  assert.equal(result.hash, before.hash)
  assert.match(await readFile(main, "utf8"), /after-capture/)
  assert.equal(await readFile(join(input.out, "current"), "utf8"), before.hash + "\n")
})

test("local image-set filenames preserve quoted parentheses and ignore type descriptors", async t => {
  const input = await fixture(t)
  await writeFile(join(input.work, "src/main.tsx"), 'import "./style.css"; export {}')
  await writeFile(join(input.work, "src/local).png"), Buffer.alloc(16, 5))
  await writeFile(join(input.work, "src/style.css"), 'body { background-image: image-set("./local).png" 1x type("image/png")) }')
  const result = await buildDashboard(input)
  assert.equal(result.ok, true, result.output)
  assert.equal(await readFile(join(input.out, "current"), "utf8"), result.hash + "\n")
})

test("spaced unquoted URL arguments preserve local font and stylesheet targets", async t => {
  const input = await fixture(t)
  await writeFile(join(input.work, "src/main.tsx"), 'import "./style.css"; export {}')
  await writeFile(join(input.work, "src/font.woff2"), Buffer.alloc(16, 6))
  await writeFile(join(input.work, "src/style.css"), '@import url( ./theme );')
  await writeFile(join(input.work, "src/theme.css"), '@font-face { font-family: synthetic; src: url( ./font.woff2 ) }')
  const result = await buildDashboard(input)
  assert.equal(result.ok, true, result.output)
  assert.equal(await readFile(join(input.out, "current"), "utf8"), result.hash + "\n")
})

test("spaced unquoted URL arguments cannot leave missing assets for runtime", async t => {
  const input = await fixture(t)
  await writeFile(join(input.work, "src/main.tsx"), 'import "./style.css"; export {}')
  await writeFile(join(input.work, "src/style.css"), '@font-face { font-family: synthetic; src: url( ./missing.woff2 ) }')
  const result = await buildDashboard(input)
  assert.equal(result.ok, false, result.output)
  assert.match(result.output, /missing\.woff2.*CSS.*src\//)
  assert.deepEqual(await readdir(input.out), [])
})

test("data CSS URLs are refused before compilation", async t => {
  const input = await fixture(t)
  await writeFile(join(input.work, "src/main.tsx"), 'import "./style.css"; export {}')
  await writeFile(join(input.work, "src/style.css"), "body { background: url(data:font/woff2;base64,AA) }")
  const result = await buildDashboard(input)
  assert.equal(result.ok, false, result.output)
  assert.match(result.output, /CSS.*только на файл внутри src\//)
  assert.doesNotMatch(result.output, /error TS/)
  assert.deepEqual(await readdir(input.out), [])
})

test("HTTP CSS URLs are refused before compilation", async t => {
  const input = await fixture(t)
  await writeFile(join(input.work, "src/main.tsx"), 'import "./style.css"; export {}')
  await writeFile(join(input.work, "src/style.css"), "body { background: url(http://synthetic.invalid/f) }")
  const result = await buildDashboard(input)
  assert.equal(result.ok, false, result.output)
  assert.match(result.output, /CSS.*только на файл внутри src\//)
  assert.doesNotMatch(result.output, /error TS/)
  assert.deepEqual(await readdir(input.out), [])
})

test("remote CSS imports are refused before compilation", async t => {
  const input = await fixture(t)
  await writeFile(join(input.work, "src/main.tsx"), 'import "./style.css"; export {}')
  await writeFile(join(input.work, "src/style.css"), "@import url(\"https://synthetic.invalid/a.css\");")
  const result = await buildDashboard(input)
  assert.equal(result.ok, false, result.output)
  assert.match(result.output, /CSS.*только на файл внутри src\//)
  assert.doesNotMatch(result.output, /error TS/)
  assert.deepEqual(await readdir(input.out), [])
})

test("CSS URL query strings are refused before compilation", async t => {
  const input = await fixture(t)
  await writeFile(join(input.work, "src/main.tsx"), 'import "./style.css"; export {}')
  await writeFile(join(input.work, "src/font.woff2"), Buffer.alloc(16, 7))
  await writeFile(join(input.work, "src/style.css"), "@font-face { src: url(./font.woff2?x) }")
  const result = await buildDashboard(input)
  assert.equal(result.ok, false, result.output)
  assert.match(result.output, /CSS.*только на файл внутри src\//)
  assert.doesNotMatch(result.output, /error TS/)
  assert.deepEqual(await readdir(input.out), [])
})

test("absolute CSS URLs cannot read an owned external asset", async t => {
  const input = await fixture(t)
  const external = join(dirname(input.work), "absolute-external.woff2")
  await writeFile(external, Buffer.alloc(16, 8))
  await writeFile(join(input.work, "src/main.tsx"), 'import "./style.css"; export {}')
  await writeFile(join(input.work, "src/style.css"), `@font-face { src: url("${external.replaceAll("\\", "/")}") }`)
  const result = await buildDashboard(input)
  assert.equal(result.ok, false, result.output)
  assert.match(result.output, /CSS.*только на файл внутри src\//)
  assert.deepEqual(await readdir(input.out), [])
})

test("local CSS references, comments and ordinary strings retain their meaning", async t => {
  const input = await fixture(t)
  await writeFile(join(input.work, "src/main.tsx"), 'import "./style.css"; export {}')
  await writeFile(join(input.work, "src/font.woff2"), Buffer.alloc(16, 9))
  await writeFile(join(input.work, "src/a.css"), "body { color: rebeccapurple }")
  await writeFile(join(input.work, "src/style.css"), `@import "./a.css";
/* @import url("https://synthetic.invalid/ignored.css"); url(data:ignored) */
@font-face { font-family: synthetic; src: url(font.woff2), url("./font.woff2") }
body::before { content: 'url(http://synthetic.invalid/documentation)' }
`)
  const result = await buildDashboard(input)
  assert.equal(result.ok, true, result.output)
  assert.equal(await readFile(join(input.out, "current"), "utf8"), result.hash + "\n")
})

test("image-set references without embedded parentheses must also remain inside src", async t => {
  const input = await fixture(t)
  await mkdir(dirname(input.out), { recursive: true })
  await writeFile(join(dirname(input.out), "external.png"), Buffer.alloc(16, 10))
  await writeFile(join(input.work, "src/main.tsx"), 'import "./style.css"; export {}')
  await writeFile(join(input.work, "src/style.css"), 'body { background-image: image-set("../../../external.png" 1x) }')
  const result = await buildDashboard(input)
  assert.equal(result.ok, false, result.output)
  assert.match(result.output, /CSS.*только на файл внутри src\//)
  assert.deepEqual(await readdir(input.out), [])
})

test("a missing second URL in a CSS comma list is refused", async t => {
  const input = await fixture(t)
  await writeFile(join(input.work, "src/main.tsx"), 'import "./style.css"; export {}')
  await writeFile(join(input.work, "src/first.png"), Buffer.alloc(16, 11))
  await writeFile(join(input.work, "src/style.css"), 'body { background-image: url("./first.png"),url("./missing.png") }')
  const result = await buildDashboard(input)
  assert.equal(result.ok, false, "missing second CSS URL unexpectedly built")
  assert.match(result.output, /missing\.png.*CSS.*src\//)
  assert.deepEqual(await readdir(input.out), [])
  await writeFile(join(input.work, "src/missing.png"), Buffer.alloc(16, 12))
  const repaired = await buildDashboard(input)
  assert.equal(repaired.ok, true, repaired.output)
  assert.equal(await readFile(join(input.out, "current"), "utf8"), repaired.hash + "\n")
})

test("TypeScript assertions cannot hide the import.meta.url base", async t => {
  const input = await fixture(t)
  await writeFile(join(input.work, "src/local.png"), Buffer.alloc(16, 13))
  await writeFile(join(input.work, "src/main.tsx"), 'document.body.textContent = new URL("./local.png", import.meta.url as string).href')
  const result = await buildDashboard(input)
  assert.equal(result.ok, false, "type-asserted URL base unexpectedly built")
  assert.match(result.output, /new URL.*import\.meta\.url.*запрещён/)
  assert.doesNotMatch(result.output, /error TS/)
  assert.deepEqual(await readdir(input.out), [])
})
