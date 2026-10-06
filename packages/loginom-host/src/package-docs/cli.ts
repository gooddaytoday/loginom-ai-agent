import { createHash, randomUUID } from "node:crypto"
import { lstat, mkdir, realpath, rename, unlink, writeFile } from "node:fs/promises"
import { basename, extname, isAbsolute, join } from "node:path"
import { pathToFileURL } from "node:url"
import { extractPackage } from "./extract"
import { renderSkeleton } from "./skeleton"
export { extractPackage } from "./extract"
export { renderSkeleton } from "./skeleton"
export { renderReport } from "./emit"

export async function runPackageDocs(input: { operation: "extract" | "skeleton"; lgp: string; directory: string }) {
  if (!isAbsolute(input.lgp) || !isAbsolute(input.directory)) throw Error("PACKAGE_DOCS_ABSOLUTE_PATH_REQUIRED")
  if (extname(input.lgp).toLowerCase() !== ".lgp") throw Error("PACKAGE_DOCS_LGP_REQUIRED")
  const lgp = await realpath(input.lgp)
  const directory = await realpath(input.directory)
  const structure = await extractPackage(lgp)
  const stem = basename(lgp, extname(lgp))
  const work = join(directory, ".work", "package-docs", stem + "-" + createHash("sha256").update(lgp).digest("hex").slice(0, 8))
  for (const path of [join(directory, ".work"), join(directory, ".work/package-docs"), work]) {
    await mkdir(path).catch((error: unknown) => { if (!isErrno(error, "EEXIST")) throw error })
    if (!(await lstat(path)).isDirectory()) throw Error("PACKAGE_DOCS_OUTPUT_ESCAPE")
  }
  const destination = join(work, "structure.json")
  const temporary = join(work, ".structure-" + randomUUID() + ".tmp")
  try {
    await writeFile(temporary, JSON.stringify(structure, null, 2) + "\n", { flag: "wx", mode: 0o600 })
    await rename(temporary, destination)
  } finally { await unlink(temporary).catch((error: unknown) => { if (!isErrno(error, "ENOENT")) throw error }) }
  if (input.operation === "extract") return { structure: destination }
  const report = join(work, "report.md")
  await writeFile(report, renderSkeleton(structure), { flag: "wx", mode: 0o600 }).catch(async (error: unknown) => {
    if (!isErrno(error, "EEXIST")) throw error
    if (!(await lstat(report)).isFile()) throw Error("PACKAGE_DOCS_OUTPUT_ESCAPE")
  })
  return { structure: destination, report }
}

async function main(argv: string[]) {
  const operation = argv[0]
  if (operation !== "extract" && operation !== "skeleton") throw Error("PACKAGE_DOCS_CLI_UNSUPPORTED")
  const options = new Map<string, string>()
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index], value = argv[index + 1]
    if (!["--lgp", "--directory"].includes(key) || options.has(key) || !value || value.startsWith("--"))
      throw Error("PACKAGE_DOCS_ARGUMENTS_INVALID")
    options.set(key, value)
  }
  const lgp = options.get("--lgp"), directory = options.get("--directory")
  if (!lgp || !directory) throw Error("PACKAGE_DOCS_ARGUMENTS_INVALID")
  process.stdout.write(JSON.stringify(await runPackageDocs({ operation, lgp, directory })) + "\n")
}

function isErrno(error: unknown, code: string) {
  return !!error && typeof error === "object" && "code" in error && error.code === code
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write((error instanceof Error && /^PACKAGE_DOCS_[A-Z_]+$/.test(error.message) ? error.message : "PACKAGE_DOCS_FAILED") + "\n")
    process.exitCode = 1
  })
}
