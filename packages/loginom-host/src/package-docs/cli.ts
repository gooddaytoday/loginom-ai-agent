import { createHash, randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { link, lstat, mkdir, open, realpath, rename, unlink, writeFile } from "node:fs/promises"
import { basename, extname, isAbsolute, join, relative } from "node:path"
import { pathToFileURL } from "node:url"
import { extractPackage } from "./extract"
import { renderSkeleton } from "./skeleton"
import { renderReport, validateReport } from "./emit"
export { extractPackage } from "./extract"
export { renderSkeleton } from "./skeleton"
export { renderReport } from "./emit"

export async function runPackageDocs(input: { operation: "extract" | "skeleton" | "emit"; lgp: string; directory: string; format?: string; output?: string }) {
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
  if (input.operation === "skeleton") {
    await writeFile(report, renderSkeleton(structure), { flag: "wx", mode: 0o600 }).catch(async (error: unknown) => {
      if (!isErrno(error, "EEXIST")) throw error
      if (!(await lstat(report)).isFile()) throw Error("PACKAGE_DOCS_OUTPUT_ESCAPE")
    })
    return { structure: destination, report }
  }
  const markdown = await readDraft(report)
  const requested = (input.format ?? "").trim().toLowerCase().replace(/^\./, "")
  const format = requested === "docx" || requested === "word" ? "docx" : requested === "md" || requested === "markdown" ? "md" : "pdf"
  validateReport(markdown, structure)
  const payload = await renderReport(markdown, format)
  let output = input.output ?? join(directory, `${stem}.lgp_report.${format}`)
  if (input.output) {
    const name = relative(directory, output), prefix = stem + ".lgp_report", suffix = "." + format
    const number = name.slice(prefix.length, -suffix.length)
    if (!isAbsolute(output) || !name.startsWith(prefix) || !name.endsWith(suffix) ||
        (number !== "" && !/^-(?:[2-9]|[1-9]\d+)$/.test(number))) throw Error("PACKAGE_DOCS_OUTPUT_ESCAPE")
  }
  const temporaryReport = join(directory, ".package-docs-" + randomUUID() + ".tmp")
  try {
    await writeFile(temporaryReport, payload, { flag: "wx", mode: 0o600 })
    // A hard link publishes the completed bytes exclusively, without overwriting.
    for (let suffix = 2; ; suffix++) {
      const published = await link(temporaryReport, output).then(() => true, (error: unknown) => {
        if (!isErrno(error, "EEXIST")) throw error
        if (input.output) throw Error("PACKAGE_DOCS_OUTPUT_COLLISION")
        return false
      })
      if (published) break
      output = join(directory, `${stem}.lgp_report-${suffix}.${format}`)
    }
  } finally { await unlink(temporaryReport).catch((error: unknown) => { if (!isErrno(error, "ENOENT")) throw error }) }
  return { structure: destination, report, output }
}

async function readDraft(path: string) {
  const draft = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    if (!(await draft.stat()).isFile()) throw Error("PACKAGE_DOCS_OUTPUT_ESCAPE")
    return await draft.readFile("utf8")
  } finally { await draft.close() }
}

async function main(argv: string[]) {
  const operation = argv[0]
  if (operation !== "extract" && operation !== "skeleton" && operation !== "emit") throw Error("PACKAGE_DOCS_CLI_UNSUPPORTED")
  const options = new Map<string, string>()
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index], value = argv[index + 1]
    if (!["--lgp", "--directory", ...(operation === "emit" ? ["--format", "--output"] : [])].includes(key) || options.has(key) || !value || value.startsWith("--"))
      throw Error("PACKAGE_DOCS_ARGUMENTS_INVALID")
    options.set(key, value)
  }
  const lgp = options.get("--lgp"), directory = options.get("--directory")
  if (!lgp || !directory) throw Error("PACKAGE_DOCS_ARGUMENTS_INVALID")
  process.stdout.write(JSON.stringify(await runPackageDocs({ operation, lgp, directory, format: options.get("--format"), output: options.get("--output") })) + "\n")
}

function isErrno(error: unknown, code: string) {
  return !!error && typeof error === "object" && "code" in error && error.code === code
}

// Node resolves module URLs through symlinks; argv retains the launch path.
// Keep this explicit: Bun lowers import.meta.main incorrectly for bundled ESM.
const entry = process.argv[1] && isAbsolute(process.argv[1])
  ? await realpath(process.argv[1]).catch(() => undefined)
  : undefined
if (entry && import.meta.url === pathToFileURL(entry).href) {
  await main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write((error instanceof Error && /^PACKAGE_DOCS_[A-Z_]+$/.test(error.message) ? error.message : "PACKAGE_DOCS_FAILED") + "\n")
    process.exitCode = 1
  })
}
