import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import test from "node:test"
import { buildDashboard, PLATFORM_FILES, sourceFiles } from "../../src/agent/build.ts"

const template = resolve(import.meta.dirname, "../../template")
const node = process.env.LOGINOM_AI_AGENT_TEST_NODE ?? process.execPath

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "dashboard-build-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const work = join(root, "work")
  await cp(join(template, "src"), join(work, "src"), { recursive: true })
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

test("both compiler steps consume the captured sources when the work project changes", async t => {
  const input = await fixture(t)
  const main = join(input.work, "src/main.tsx")
  await writeFile(main, 'document.body.textContent = "before-capture"; export {}')
  const kit = join(dirname(input.work), "template-kit")
  await mkdir(kit)
  await Promise.all(PLATFORM_FILES.map(name => cp(join(input.template, name), join(kit, name))))
  await symlink(join(input.template, "node_modules"), join(kit, "node_modules"), process.platform === "win32" ? "junction" : "dir")
  await writeFile(join(kit, "vite.config.mjs"), `import { writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(main)}, 'document.body.textContent = "after-capture"; export {}');
export default { cacheDir: ".vite-cache", css: { postcss: { plugins: [] } } };
`)
  const result = await buildDashboard({ ...input, template: kit })
  assert.equal(result.ok, true, result.output)
  assert.match(await readFile(main, "utf8"), /after-capture/)
  const files = (await readdir(join(result.dir, "assets"))).filter(name => name.endsWith(".js"))
  const code = (await Promise.all(files.map(name => readFile(join(result.dir, "assets", name), "utf8")))).join("\n")
  assert.match(code, /before-capture/)
  assert.doesNotMatch(code, /after-capture/)
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
