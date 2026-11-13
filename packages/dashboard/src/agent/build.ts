import { spawn } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { existsSync } from "node:fs"
import { cp, lstat, mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, symlink, unlink, writeFile } from "node:fs/promises"
import { dirname, extname, join, relative, sep } from "node:path"
import type { TableSample } from "../contract/snapshot.ts"

export const PLATFORM_FILES = ["index.html", "tsconfig.json", "env.d.ts", "vite.config.mjs", "resolver.mjs", "scan.mjs"]
let commits = Promise.resolve()
const OUTPUT = 8_192
const TYPES = new Set([".ts", ".tsx", ".css", ".json", ".svg", ".png", ".jpg", ".webp", ".woff2"])
export type Build = { ok: true; hash: string; dir: string; output: string } | { ok: false; output: string }

export async function sourceFiles(work: string): Promise<{ files: string[] } | { error: string }> {
  const base = await realpath(work)
  const root = await lstat(join(base, "src")).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return
    throw error
  })
  if (!root) return { error: "Нет обязательного файла src/main.tsx" }
  if (root.isSymbolicLink()) return { error: "Символьная ссылка запрещена: src" }
  if (!root.isDirectory()) return { error: "Каталог src должен быть обычной папкой" }
  const entries = await readdir(join(base, "src"), { recursive: true, withFileTypes: true })
  const invalid = entries.map(entry => relative(base, join(entry.parentPath, entry.name)).split(sep).join("/"))
    .find(path => path.includes("\\") || path.split("/").some(part => part.startsWith(".")))
  if (invalid) return { error: "Недопустимое имя: " + invalid }
  const link = entries.find(entry => entry.isSymbolicLink())
  if (link) return { error: "Символьная ссылка запрещена: " + relative(base, join(link.parentPath, link.name)) }
  const forbidden = entries.find(entry => !entry.isDirectory() && (!entry.isFile() || !TYPES.has(extname(entry.name).toLowerCase())))
  if (forbidden) return { error: "Недопустимый тип файла: " + relative(base, join(forbidden.parentPath, forbidden.name)).split(sep).join("/") }
  const files = entries
    .filter(entry => entry.isFile())
    .map(entry => relative(base, join(entry.parentPath, entry.name)).split(sep).join("/"))
    .toSorted()
  if (!files.includes("src/main.tsx")) return { error: "Нет обязательного файла src/main.tsx" }
  if (files.length > 200) return { error: "В src/ больше 200 файлов" }
  const sizes = await Promise.all(files.map(async file => (await lstat(join(base, file))).size))
  if (sizes.reduce((sum, size) => sum + size, 0) > 1_048_576) return { error: "Исходники в src/ больше 1 МБ" }
  return { files }
}

export async function buildDashboard(input: {
  work: string
  template: string
  node: string
  out: string
  timeoutMs?: number
  signal?: AbortSignal
  publication?: { operation: string; sample: Pick<typeof TableSample.Type, "rows"> }
}): Promise<Build> {
  const work = await realpath(input.work)
  const listed = await sourceFiles(work)
  if ("error" in listed) return { ok: false, output: listed.error }
  await mkdir(input.out, { recursive: true, mode: 0o700 })
  const staging = await mkdtemp(join(input.out, ".build-"))
  const signal = AbortSignal.any([AbortSignal.timeout(input.timeoutMs ?? 90_000), ...(input.signal ? [input.signal] : [])])
  try {
    for (const name of PLATFORM_FILES) await cp(join(input.template, name), join(staging, name))
    const kit = await realpath(join(input.template, "node_modules"))
    await symlink(kit, join(staging, "node_modules"), process.platform === "win32" ? "junction" : "dir")
    await cp(join(work, "src"), join(staging, "src"), { recursive: true })
    const copied = await sourceFiles(staging)
    if ("error" in copied) return { ok: false, output: copied.error }
    if (input.publication) {
      const files = await Promise.all(copied.files.map(file => readFile(join(staging, file))))
      const found = embeddedValues(input.publication.sample, files)
      if (found.length) return {
        ok: false,
        output: outputText(Buffer.from("Опубликованная сборка будет публичной. Удалите из src/ данные образца: " + found.slice(0, 5).join(", "))),
      }
    }
    let output = Buffer.alloc(0)
    const add = (chunk: string) => {
      if (output.length === OUTPUT) return
      output = Buffer.concat([output, Buffer.from(chunk).subarray(0, OUTPUT - output.length)])
    }
    const root = await realpath(staging)
    const permissions = ["--permission", `--allow-fs-read=${root}`, `--allow-fs-read=${kit}`, `--allow-fs-write=${root}`]
    // Only trusted Rollup/esbuild need grants; their flag warnings must not consume compiler diagnostics.
    for (const args of [
      [...permissions, "--allow-addons", "--disable-warning=SecurityWarning", "scan.mjs"],
      [...permissions, "node_modules/typescript/bin/tsc", "--noEmit", "--pretty", "false", "-p", "tsconfig.json"],
      [...permissions, "--allow-addons", "--allow-child-process", "--disable-warning=SecurityWarning", "node_modules/vite/bin/vite.js", "build", "--configLoader", "native", "--base", "./", "--outDir", "dist", "--emptyOutDir", "--logLevel", "warn"],
    ]) {
      const code = await execute(input.node, args, staging, signal, add)
      if (code !== 0) {
        const reason = input.signal?.aborted ? "Сборка отменена.\n" : signal.aborted ? "Сборка прервана: превышено время 90 секунд.\n" : ""
        return { ok: false, output: outputText(Buffer.concat([Buffer.from(reason), output])) }
      }
    }
    const hash = await treeHash(join(staging, "dist"))
    const retained = input.publication && join(input.publication.operation, "dist")
    if (retained) await cp(join(staging, "dist"), retained, { recursive: true })
    const installed = commits.then(async () => {
      const dir = join(input.out, hash)
      if (!existsSync(dir)) await rename(join(staging, "dist"), dir)
      const current = join(input.out, "current")
      const previous = existsSync(current) ? (await readFile(current, "utf8")).trim() : undefined
      const temporary = `${current}.${randomUUID()}.tmp`
      try {
        await writeFile(temporary, hash + "\n")
        await rename(temporary, current)
      } finally {
        await rm(temporary, { force: true })
      }
      if (previous !== hash) await Promise.all((await readdir(input.out))
        .filter(name => /^[a-f0-9]{64}$/.test(name) && name !== hash && name !== previous)
        .map(name => rm(join(input.out, name), { recursive: true, force: true })))
      return { ok: true as const, hash, dir: retained ?? dir, output: outputText(output) }
    })
    commits = installed.then(() => undefined, () => undefined)
    return await installed
  } finally {
    await unlink(join(staging, "node_modules")).catch(() => undefined)
    await rm(staging, { recursive: true, force: true })
  }
}

function execute(node: string, args: string[], cwd: string, signal: AbortSignal, add: (chunk: string) => void) {
  return new Promise<number | null>(resolve => {
    const env = { PATH: dirname(node), LANG: "C.UTF-8", TMPDIR: cwd, TEMP: cwd, TMP: cwd, ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}) }
    const child = spawn(node, args, { cwd, env, signal, stdio: ["ignore", "pipe", "pipe"] })
    child.stdout.setEncoding("utf8").on("data", add)
    child.stderr.setEncoding("utf8").on("data", add)
    child.on("error", error => add(error.message))
    child.on("close", resolve)
  })
}

export function outputText(bytes: Buffer) {
  return new TextDecoder().decode(bytes.subarray(0, OUTPUT), { stream: true })
}

async function treeHash(dir: string) {
  const files = (await readdir(dir, { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile())
    .map(entry => relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"))
    .toSorted()
  const sha = createHash("sha256")
  for (const file of files) {
    const bytes = await readFile(join(dir, file))
    sha.update(file).update("\0").update(String(bytes.length)).update("\0").update(bytes)
  }
  return sha.digest("hex")
}

export function embeddedValues(sample: { rows: readonly (readonly unknown[])[] }, files: Buffer[]) {
  const values = new Set(sample.rows.flat().filter(cell => cell != null).map(String))
  return [...values].filter(value => [...value].length >= 6 && files.some(file => file.includes(value)))
}
