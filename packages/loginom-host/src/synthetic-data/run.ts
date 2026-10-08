import { createHash } from "node:crypto"
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises"
import { isAbsolute, join, relative } from "node:path"
import { applyDefects } from "./defects"
import { renderFiles, safeFileName } from "./files"
import { generateTables } from "./generate"
import { draftFromPackage } from "./inspect"
import { extractPackage } from "../package-docs/extract"
import { parseRetailParams, retailSpec } from "./presets/retail"
import { folderName, parseSpec } from "./spec"
import { defectsTable } from "./writers/text"

export type RunInput = {
  operation: "validate" | "generate" | "inspect"
  directory: string
  spec?: string
  preset?: string
  params?: string
  name?: string
  lgp?: string
}

export async function runSyntheticData(input: RunInput) {
  if (!isAbsolute(input.directory)) throw Error("SYNTHETIC_DATA_ABSOLUTE_PATH_REQUIRED")
  const directory = await realpath(input.directory)
  if (input.operation === "validate") return validate(input.spec)
  if (input.operation === "inspect") return inspect(input, directory)
  return generate(input, directory)
}

async function validate(specPath: string | undefined) {
  const loaded = await loadSpec(specPath)
  if (!loaded.ok) return loaded
  return summary(loaded.spec)
}

async function generate(input: RunInput, directory: string) {
  const loaded = input.preset ? presetSpec(input.preset, input.params) : await loadSpec(input.spec)
  if (!loaded.ok) return loaded
  const name = input.name && folderName(input.name)
  if (!name) throw Error("SYNTHETIC_DATA_ARGUMENTS_INVALID")
  const { rng, tables } = generateTables(loaded.spec)
  const defects = applyDefects(rng, tables, loaded.spec.defects)
  const rendered = await renderFiles(tables, defects).catch((error: unknown) => {
    if (error instanceof Error && (error.message === "SYNTHETIC_DATA_SPEC_INVALID" || error.message === "SYNTHETIC_DATA_LIMIT"))
      return error.message
    throw error
  })
  if (typeof rendered === "string") return { ok: false, errors: [rendered === "SYNTHETIC_DATA_LIMIT" ? "Слишком много файлов." : "Совпадающие имена файлов."] }
  const names = rendered.files.map((file) => safeFileName(file.filename))
  if (names.some((file) => !file || file === "defects.csv" || file === "manifest.json") || new Set(names).size !== names.length)
    return { ok: false, errors: ["Недопустимое имя выходного файла. defects.csv и manifest.json зарезервированы."] }
  const output = await prepare(directory, name)
  const payloads = [
    ...rendered.files.map((file) => ({ filename: file.filename, bytes: file.bytes, rows: file.rows, table: file.table })),
    { filename: "defects.csv", bytes: defectsTable(rendered.defects.map((defect) => ({ ...defect, row: defect.line }))), rows: rendered.defects.length, table: "defects" },
  ]
  const manifest = {
    schema_version: "synthetic_data.manifest.v1",
    name: loaded.spec.name,
    seed: loaded.spec.seed,
    directory: output,
    files: payloads.filter((file) => file.filename !== "defects.csv").map((file) => ({ path: file.filename, table: file.table, rows: file.rows, sha256: sha256(file.bytes) })),
    tables: loaded.spec.tables.map((table) => ({ name: table.name, rows: table.rows, columns: table.columns.map((column) => ({ name: column.name, type: column.type })) })),
    defects_file: "defects.csv",
    defect_count: rendered.defects.length,
  }
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2) + "\n")
  await writeOwned(output, [...payloads.map((file) => [file.filename, file.bytes] as const), ["manifest.json", manifestBytes]])
  return { directory: output, manifest: join(output, "manifest.json"), files: payloads.map((file) => join(output, file.filename)), defect_count: rendered.defects.length, ...summary(loaded.spec) }
}

async function inspect(input: RunInput, directory: string) {
  if (!input.lgp || !isAbsolute(input.lgp)) throw Error("SYNTHETIC_DATA_ABSOLUTE_PATH_REQUIRED")
  if (!input.lgp.toLowerCase().endsWith(".lgp")) throw Error("SYNTHETIC_DATA_LGP_REQUIRED")
  const name = input.name && folderName(input.name)
  if (!name) throw Error("SYNTHETIC_DATA_ARGUMENTS_INVALID")
  const draft = draftFromPackage(await extractPackage(await realpath(input.lgp)))
  const output = await prepare(directory, name)
  const specBytes = new TextEncoder().encode(JSON.stringify(draft.spec, null, 2) + "\n")
  const importsBytes = new TextEncoder().encode(JSON.stringify({ note: draft.note, imports: draft.imports }, null, 2) + "\n")
  await writeOwned(output, [["draft-spec.json", specBytes], ["imports.json", importsBytes]])
  return { ok: true, directory: output, draft: join(output, "draft-spec.json"), imports: join(output, "imports.json"), note: draft.note, count: draft.imports.length }
}

async function loadSpec(specPath: string | undefined) {
  if (!specPath || !isAbsolute(specPath)) throw Error("SYNTHETIC_DATA_ABSOLUTE_PATH_REQUIRED")
  const text = await readFile(specPath, "utf8").catch(() => { throw Error("SYNTHETIC_DATA_SPEC_MISSING") })
  const value = parseJson(text)
  if (value === undefined) return { ok: false as const, errors: ["Спецификация не является JSON."] }
  return parseSpec(value)
}

function presetSpec(preset: string, params: string | undefined) {
  if (preset !== "retail") return { ok: false as const, errors: ["Неизвестный пресет. Доступен retail."] }
  const value = params === undefined ? {} : parseJson(params)
  if (value === undefined) throw Error("SYNTHETIC_DATA_ARGUMENTS_INVALID")
  const parsed = parseRetailParams(value)
  if (!parsed.ok) return parsed
  return parseSpec(retailSpec(parsed.params))
}

function summary(spec: { name: string; seed: number; tables: Array<{ name: string; rows: number; columns: Array<{ name: string; type: string }> }>; defects: unknown[] }) {
  return { ok: true as const, name: spec.name, seed: spec.seed, tables: spec.tables.map((table) => ({ name: table.name, rows: table.rows, columns: table.columns.map((column) => column.name) })), defects: spec.defects.length }
}

async function prepare(directory: string, name: string) {
  const output = join(directory, "synthetic-data", name)
  const inside = relative(directory, output)
  if (inside.startsWith("..") || isAbsolute(inside)) throw Error("SYNTHETIC_DATA_OUTPUT_ESCAPE")
  await mkdir(join(directory, "synthetic-data")).catch((error: unknown) => { if (!isErrno(error, "EEXIST")) throw error })
  if (!(await lstat(join(directory, "synthetic-data"))).isDirectory()) throw Error("SYNTHETIC_DATA_OUTPUT_ESCAPE")
  await mkdir(output).catch((error: unknown) => {
    if (isErrno(error, "EEXIST")) throw Error("SYNTHETIC_DATA_OUTPUT_COLLISION")
    throw error
  })
  return output
}

async function writeOwned(directory: string, files: Array<readonly [string, Uint8Array]>) {
  for (const [name, bytes] of files) {
    const filename = safeFileName(name)
    const path = filename ? join(directory, filename) : ""
    if (!filename || relative(directory, path).startsWith("..")) throw Error("SYNTHETIC_DATA_OUTPUT_ESCAPE")
    await writeFile(path, bytes, { flag: "wx" })
  }
}

function parseJson(text: string) {
  try { return JSON.parse(text) as unknown }
  catch { return undefined }
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex")
}

function isErrno(error: unknown, code: string) {
  return !!error && typeof error === "object" && "code" in error && error.code === code
}
