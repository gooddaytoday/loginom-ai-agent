import { createHash, randomUUID } from "node:crypto"
import { createReadStream } from "node:fs"
import { mkdir, open, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises"
import { posix, join, resolve } from "node:path"
import { Parser } from "htmlparser2"
import { ZipReader, ZipWriter, TextReader, type Entry } from "@zip.js/zip.js"

const MiB = 1024 * 1024
const CELL = MiB
const QUICK = 8 * MiB
const MAX_XML = 4 * 1024 * MiB
const LIMIT = "LOGINOM_FILE_XLSX_LIMIT"
type Handle = Awaited<ReturnType<typeof open>>
type Kind = "string" | "integer" | "real" | "datetime" | "boolean"
type Identity = { canonical_path: string; size: number; mtime: number; ctime: number; file_id: string }
type Cell = { col: number; type: string; style: number; value: string; formula: boolean; cached: boolean }
type Row = { number: number; cells: Cell[] }
type Sheet = { name: string; visibility: string; path: string }
type Style = { numFmtId: number; formatCode?: string }
type Column = {
  name: string
  technical_name: string
  label: string
  type: Kind
  data_kind: string
  observations: number
  nulls: number
  null_fraction: number
  examples: string[]
}
type Violation = {
  sheet: string
  row: number
  logical_record: number
  physical_line: number
  byte_offset: number
  column: number
  expected_type: string
  example: string
}
type Scan = {
  status: "partial" | "exact"
  records?: number
  records_observed: number
  bytes_read: number
  elapsed_ms: number
  sha256?: string
  first_violation?: Violation
  index?: string
  formulas: number
  missing_cached_values: number
  observed_dimension: string
}
type Stored = {
  format: "xlsx"
  profile_id: string
  source: string
  identity: Identity
  sheets: Sheet[]
  sheet: Sheet
  date_system: "1900" | "1904"
  declared_dimension: string
  observed_dimension: string
  first_row: number
  last_row: number
  header_rows: number
  blank_rows: "import" | "skip"
  columns: Column[]
  quick_records: number
  first_rows: { row: number; values: (string | null)[] }[]
  formulas: number
  missing_cached_values: number
  shared_strings_complete: boolean
  coverage: { bytes_read: number; observed_records: number; elapsed_ms: number; eof: boolean }
  scan?: Scan
}
export type XlsxOptions = {
  sheet_name?: string
  header_rows?: number
  blank_rows?: "import" | "skip"
  first_line_as_title?: boolean
  rows_to_skip?: number
  signal?: AbortSignal
  authorized_path?: string
}

function fail(code: string, detail: string): never {
  throw Error(`${code}: ${detail}`)
}
function invalid(detail: string): never {
  return fail("LOGINOM_FILE_XLSX_UNSUPPORTED", detail)
}
const local = (name: string) => name.split(":").at(-1)!
const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
const relationshipNS = "http://schemas.openxmlformats.org/package/2006/relationships"

async function identity(path: string): Promise<Identity> {
  const canonical_path = await realpath(path)
  const s = await stat(canonical_path)
  if (!s.isFile()) fail("LOGINOM_FILE_NOT_REGULAR", path)
  return { canonical_path, size: s.size, mtime: s.mtimeMs, ctime: s.ctimeMs, file_id: `${s.dev}:${s.ino}` }
}
async function unchanged(p: Pick<Stored, "source" | "identity">, handle?: Handle) {
  const current = await identity(p.source).catch(() => undefined)
  const s = await handle?.stat()
  if (
    JSON.stringify(current) !== JSON.stringify(p.identity) ||
    (s &&
      (`${s.dev}:${s.ino}` !== p.identity.file_id ||
        s.size !== p.identity.size ||
        s.mtimeMs !== p.identity.mtime ||
        s.ctimeMs !== p.identity.ctime))
  )
    fail("LOGINOM_FILE_CHANGED", p.source)
}
function profilePath(dir: string, id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) invalid("unknown session profile_id")
  return join(dir, `${id}.json`)
}
async function save(p: Stored, dir: string) {
  const target = profilePath(dir, p.profile_id),
    temp = `${target}.${randomUUID()}.tmp`
  await writeFile(temp, JSON.stringify(p), { mode: 0o600 })
  await rename(temp, target)
}
async function load(id: string, dir: string): Promise<Stored> {
  return JSON.parse(await readFile(profilePath(dir, id), "utf8"))
}

class FileReader {
  constructor(
    private handle: Handle,
    readonly size: number,
  ) {}
  // zip.js supports a custom range reader + readable stream. Bound compressed
  // pulls independently of its global codec configuration: a highly compressed
  // member must not enqueue a workbook-sized decompressed chunk.
  get readable() {
    let read = 0
    const stream: ReadableStream<Uint8Array> & { offset?: number; size?: number } = new ReadableStream({
      pull: async (controller) => {
        const size = stream.size ?? this.size
        if (read >= size) {
          controller.close()
          return
        }
        const length = Math.min(16384, size - read)
        controller.enqueue(await this.readUint8Array((stream.offset ?? 0) + read, length))
        read += length
      },
    })
    return stream
  }
  async readUint8Array(offset: number, length: number) {
    if (length > QUICK) fail(LIMIT, "ZIP directory/read >8 MiB")
    const b = Buffer.alloc(length)
    const { bytesRead } = await this.handle.read(b, 0, length, offset)
    if (bytesRead !== length) fail("LOGINOM_FILE_CHANGED", "truncated ZIP")
    // zip.js slices readers' arrays and constructs DataView(array.buffer).
    // Buffer.slice is a view, so returning Buffer corrupts ZIP offsets.
    return new Uint8Array(b)
  }
}

// htmlparser2 runs in XML mode, with explicit bounds even for unfinished text,
// attributes, nesting and DTDs. Only one decompressed ZIP chunk is queued.
async function xml(
  entry: Entry | undefined,
  callbacks: {
    open?: (tag: string, attrs: Record<string, string>) => void
    text?: (text: string) => void
    close?: (tag: string) => void
    flush?: () => Promise<void>
  },
  budget: { bytes: number; stop?: number; deadline?: number },
  signal?: AbortSignal,
) {
  if (!entry || entry.directory || !entry.getData) invalid("required workbook part is missing")
  const stack: string[] = []
  let pending = 0,
    fragment = "",
    fragmentStart = 0,
    previousChar = ""
  const parser = new Parser(
    {
      onopentag(name, attrs) {
        if (stack.length >= 64) fail(LIMIT, "XML depth >64")
        if (Object.keys(attrs).length > 64 || Object.values(attrs).some((v) => v.length > CELL))
          fail(LIMIT, "XML attributes")
        stack.push(name)
        callbacks.open?.(local(name), attrs)
        pending = 0
      },
      ontext(text) {
        callbacks.text?.(text)
        pending += text.length
        if (pending > CELL) fail(LIMIT, "XML text >1 MiB")
      },
      onclosetag(name, implied) {
        if (implied && fragment[parser.endIndex - fragmentStart - 1] !== "/") invalid("unbalanced XML")
        if (stack.pop() !== name) invalid("unbalanced XML")
        callbacks.close?.(local(name))
        pending = 0
      },
      onprocessinginstruction(name) {
        if (name.toLowerCase() !== "?xml") invalid("DTD/entities are unsupported")
      },
      onerror(error) {
        throw error
      },
    },
    { xmlMode: true, decodeEntities: true, recognizeSelfClosing: true },
  )
  const decoder = new TextDecoder("utf-8", { fatal: true })
  const stop = new AbortController()
  let limited = false,
    bytes = 0,
    parsedChars = 0
  let callbackError: unknown
  try {
    await entry.getData(
      new WritableStream<Uint8Array>({
        async write(chunk) {
          try {
            for (let offset = 0; offset < chunk.length; offset += 65536) {
              signal?.throwIfAborted()
              const end = Math.min(
                chunk.length,
                offset + 65536,
                budget.stop ? offset + Math.max(0, budget.stop - budget.bytes) : Infinity,
              )
              const input = chunk.subarray(offset, end)
              bytes += input.length
              budget.bytes += input.length
              if (bytes > MAX_XML || budget.bytes > 8 * 1024 * MiB) fail(LIMIT, "decompressed XML size")
              const text = decoder.decode(input, { stream: true })
              fragment = previousChar + text
              fragmentStart = parsedChars - previousChar.length
              previousChar = text.at(-1) ?? previousChar
              parsedChars += text.length
              parser.write(text)
              if (parsedChars - parser.startIndex > CELL) fail(LIMIT, "XML token >1 MiB")
              await callbacks.flush?.()
              if (
                (budget.stop && budget.bytes >= budget.stop) ||
                (budget.deadline && performance.now() >= budget.deadline)
              ) {
                limited = true
                stop.abort()
                break
              }
            }
          } catch (error) {
            callbackError = error
            throw error
          }
        },
      }),
      {
        signal: AbortSignal.any([stop.signal, ...(signal ? [signal] : [])]),
        useWebWorkers: false,
        checkSignature: true,
      },
    )
    // Some stream implementations resolve getData after an acknowledged abort.
    // Never let parser.end() synthesize closing tags and promote a prefix to EOF.
    if (limited) return false
    if (stack.length) invalid("truncated XML")
    parser.end(decoder.decode())
    await callbacks.flush?.()
    if (stack.length) invalid("truncated XML")
    return true
  } catch (error) {
    signal?.throwIfAborted()
    if (callbackError) throw callbackError
    if (limited) return false
    throw error
  }
}

function target(base: string, value: string) {
  if (/[\\?#]/.test(value) || /^[a-z]+:/i.test(value)) invalid("unsupported relationship target")
  const path = posix.normalize(value.startsWith("/") ? value.slice(1) : posix.join(posix.dirname(base), value))
  if (path.startsWith("../")) invalid("relationship outside container")
  return path
}
function letters(n: number): string {
  return n ? letters(Math.floor((n - 1) / 26)) + String.fromCharCode(65 + ((n - 1) % 26)) : ""
}
function coordinate(ref: string) {
  const m = /^([A-Z]{1,3})([1-9]\d*)$/.exec(ref)
  if (!m) invalid(`invalid cell reference ${ref.slice(0, 50)}`)
  const col = [...m[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0),
    row = Number(m[2])
  if (col > 16384 || row > 1048576) invalid("worksheet exceeds Excel dimensions")
  return { col, row }
}
function dateStyle(format: string) {
  return /[ymdhis]/i.test(format.replace(/"[^"]*"|\\.|\[(?!h+\]|m+\]|s+\])[^\]]*\]/gi, ""))
}

class Strings {
  private data!: Handle
  private index!: Handle
  private offset = 0
  private count = 0
  private cache = new Map<number, string>()
  private cacheBytes = 0
  constructor(private dir: string) {}
  async init() {
    await mkdir(this.dir, { mode: 0o700 })
    this.data = await open(join(this.dir, "sst"), "wx+", 0o600)
    this.index = await open(join(this.dir, "index"), "wx+", 0o600)
  }
  async append(values: string[]) {
    if (!values.length) return
    const buffers = values.map((v) => Buffer.from(v)),
      indices = Buffer.alloc(values.length * 16)
    for (const [i, b] of buffers.entries()) {
      if (b.length > CELL) fail(LIMIT, "shared string >1 MiB")
      indices.writeDoubleLE(this.offset, i * 16)
      indices.writeDoubleLE(b.length, i * 16 + 8)
      this.offset += b.length
      this.count++
    }
    await this.data.write(Buffer.concat(buffers))
    await this.index.write(indices)
  }
  async get(id: number) {
    if (!Number.isSafeInteger(id) || id < 0) invalid("invalid shared string index")
    if (id >= this.count) return undefined
    const hit = this.cache.get(id)
    if (hit !== undefined) return hit
    const index = Buffer.alloc(16)
    await this.index.read(index, 0, 16, id * 16)
    const b = Buffer.alloc(index.readDoubleLE(8))
    if (b.length) await this.data.read(b, 0, b.length, index.readDoubleLE(0))
    const value = b.toString("utf8")
    while (this.cache.size >= 1024 || this.cacheBytes + b.length > 4 * MiB) {
      const key = this.cache.keys().next().value!
      this.cacheBytes -= Buffer.byteLength(this.cache.get(key)!)
      this.cache.delete(key)
    }
    this.cache.set(id, value)
    this.cacheBytes += b.length
    return value
  }
  async close() {
    await this.data?.close()
    await this.index?.close()
    await rm(this.dir, { recursive: true, force: true })
  }
}

class Workbook {
  private handle!: Handle
  private zip!: ZipReader<Handle>
  private entries = new Map<string, Entry>()
  readonly strings: Strings
  sheets: Sheet[] = []
  styles: Style[] = []
  dateSystem: "1900" | "1904" = "1900"
  sstComplete = true
  constructor(
    private p: Pick<Stored, "source" | "identity">,
    dir: string,
    private budget: { bytes: number; stop?: number; deadline?: number },
    private signal?: AbortSignal,
  ) {
    this.strings = new Strings(join(dir, `.xlsx-${randomUUID()}`))
  }
  async init() {
    this.handle = await open(this.p.identity.canonical_path, "r")
    await unchanged(this.p, this.handle)
    this.zip = new ZipReader(new FileReader(this.handle, this.p.identity.size), { useWebWorkers: false })
    await this.strings.init()
    let total = 0
    for await (const entry of this.zip.getEntriesGenerator()) {
      this.signal?.throwIfAborted()
      if (this.entries.size >= 4096 || entry.filename.length > 1024) fail(LIMIT, "ZIP directory")
      total += entry.uncompressedSize
      if (entry.encrypted) invalid("encrypted workbook")
      if (
        entry.uncompressedSize > MAX_XML ||
        total > 8 * 1024 * MiB ||
        (entry.uncompressedSize > QUICK && entry.uncompressedSize / Math.max(1, entry.compressedSize) > 200)
      )
        fail(LIMIT, "ZIP expansion")
      if (this.entries.has(entry.filename)) invalid("duplicate ZIP part")
      this.entries.set(entry.filename, entry)
    }
    const metadata = { bytes: 0, stop: QUICK }
    const rels = async (part: string) => {
      const result: { id: string; type: string; path: string }[] = []
      const eof = await xml(
        this.entries.get(part),
        {
          open(tag, a) {
            if (tag !== "Relationship" || a.TargetMode === "External") return
            if (result.length >= 4096) fail(LIMIT, "relationships")
            result.push({ id: a.Id, type: a.Type, path: a.Target })
          },
        },
        metadata,
        this.signal,
      )
      if (!eof) fail(LIMIT, "workbook metadata >8 MiB")
      return result
    }
    const office = (await rels("_rels/.rels")).find((r) => /\/officeDocument$/.test(r.type))
    if (!office) invalid("ZIP has no workbook relationship")
    const workbook = target("", office.path)
    const relationships = await rels(posix.join(posix.dirname(workbook), "_rels", posix.basename(workbook) + ".rels"))
    const eof = await xml(
      this.entries.get(workbook),
      {
        open: (tag, a) => {
          if (tag === "workbookPr") this.dateSystem = ["1", "true"].includes(a.date1904) ? "1904" : "1900"
          if (tag !== "sheet") return
          const rel = relationships.find(
            (r) => r.id === (a["r:id"] ?? Object.entries(a).find(([k]) => k.endsWith(":id"))?.[1]),
          )
          if (!rel || !/\/worksheet$/.test(rel.type)) invalid("unsupported sheet relationship")
          if (this.sheets.length >= 256 || !a.name || a.name.length > 120) fail(LIMIT, "sheet metadata")
          this.sheets.push({ name: a.name, visibility: a.state ?? "visible", path: target(workbook, rel.path) })
        },
      },
      metadata,
      this.signal,
    )
    if (!eof || !this.sheets.length) invalid("missing/oversized workbook sheets")
    const styles = relationships.find((r) => /\/styles$/.test(r.type))
    if (styles) {
      const formats = new Map<number, string>()
      let xfs = false
      const eof = await xml(
        this.entries.get(target(workbook, styles.path)),
        {
          open: (tag, a) => {
            if (tag === "numFmt") {
              if (formats.size >= 65536) fail(LIMIT, "number formats")
              formats.set(Number(a.numFmtId), a.formatCode)
            }
            if (tag === "cellXfs") xfs = true
            if (tag !== "xf" || !xfs) return
            if (this.styles.length >= 65536) fail(LIMIT, "styles")
            const n = Number(a.numFmtId ?? 0)
            this.styles.push({ numFmtId: n, ...(formats.has(n) ? { formatCode: formats.get(n) } : {}) })
          },
          close(tag) {
            if (tag === "cellXfs") xfs = false
          },
        },
        metadata,
        this.signal,
      )
      if (!eof) fail(LIMIT, "styles metadata")
    }
    this.budget.bytes += metadata.bytes
    const sst = relationships.find((r) => /\/sharedStrings$/.test(r.type))
    if (!sst) return
    let value = "",
      inside = false,
      text = false,
      phonetic = false
    let values: string[] = []
    const stringsBudget = { ...this.budget, ...(this.budget.stop ? { stop: Math.min(this.budget.stop, 4 * MiB) } : {}) }
    this.sstComplete = await xml(
      this.entries.get(target(workbook, sst.path)),
      {
        open(tag) {
          if (tag === "si") {
            inside = true
            value = ""
          }
          if (tag === "rPh") phonetic = true
          if (tag === "t") text = true
        },
        text(v) {
          if (inside && text && !phonetic) {
            value += v
            if (value.length > CELL) fail(LIMIT, "shared string >1 MiB")
          }
        },
        close(tag) {
          if (tag === "t") text = false
          if (tag === "rPh") phonetic = false
          if (tag === "si") {
            values.push(value)
            inside = false
          }
        },
        flush: async () => {
          await this.strings.append(values)
          values = []
        },
      },
      stringsBudget,
      this.signal,
    )
    this.budget.bytes = stringsBudget.bytes
  }
  async rows(sheet: Sheet, visit: (row: Row) => Promise<void>, dimension: (ref: string) => void) {
    let row: Row | undefined,
      cell: Cell | undefined,
      field = "",
      phonetic = false,
      previous = 0
    let rows: Row[] = []
    return xml(
      this.entries.get(sheet.path),
      {
        open(tag, a) {
          if (tag === "dimension") dimension(a.ref)
          if (tag === "mergeCell") invalid("merged cells are unsupported for exact tabular import")
          if (tag === "row") {
            const number = a.r ? Number(a.r) : previous + 1
            if (!Number.isInteger(number) || number <= previous || number > 1048576)
              invalid("unordered/invalid worksheet rows")
            previous = number
            row = { number, cells: [] }
          }
          if (tag === "c") {
            if (!row || cell) invalid("cell outside row")
            const col = a.r ? coordinate(a.r) : { col: (row.cells.at(-1)?.col ?? 0) + 1, row: row.number }
            if (col.row !== row.number || col.col <= (row.cells.at(-1)?.col ?? 0)) invalid("unordered cell reference")
            cell = { col: col.col, type: a.t ?? "n", style: Number(a.s ?? 0), value: "", formula: false, cached: false }
          }
          if (tag === "rPh") phonetic = true
          if (cell && ["v", "t", "f"].includes(tag)) {
            field = tag
            if (tag === "f") cell.formula = true
            if (tag === "v") cell.cached = true
          }
        },
        text(v) {
          if (cell && ["v", "t"].includes(field) && !phonetic) {
            cell.value += v
            if (cell.value.length > CELL) fail(LIMIT, "cell >1 MiB")
          }
        },
        close(tag) {
          if (tag === "rPh") phonetic = false
          if (tag === field) field = ""
          if (tag === "c" && row && cell) {
            if (cell.formula && cell.type !== "str" && !cell.value) cell.cached = false
            if (Buffer.byteLength(cell.value) > CELL) fail(LIMIT, "cell >1 MiB")
            row.cells.push(cell)
            cell = undefined
          }
          if (tag === "row" && row) {
            rows.push(row)
            row = undefined
          }
        },
        flush: async () => {
          for (const r of rows) {
            this.signal?.throwIfAborted()
            await visit(r)
          }
          rows = []
        },
      },
      this.budget,
      this.signal,
    )
  }
  async value(c: Cell) {
    if (c.formula && !c.cached) return undefined
    if (c.type === "s") {
      if (!/^\d+$/.test(c.value)) invalid("invalid SST reference")
      const value = await this.strings.get(Number(c.value))
      if (value === undefined && this.sstComplete) invalid("missing shared string")
      return value
    }
    return c.value
  }
  kind(c: Cell, value: string): Kind {
    if (!Number.isInteger(c.style) || c.style < 0 || (c.style && !this.styles[c.style])) invalid("invalid cell style")
    if (["s", "str", "inlineStr", "e"].includes(c.type)) return "string"
    if (c.type === "b") return "boolean"
    const style = this.styles[c.style],
      n = style?.numFmtId ?? 0
    if (
      c.type === "d" ||
      (style?.formatCode
        ? dateStyle(style.formatCode)
        : (n >= 14 && n <= 22) || (n >= 27 && n <= 36) || (n >= 45 && n <= 47) || (n >= 50 && n <= 58))
    )
      return "datetime"
    if (c.type !== "n") invalid(`unsupported cell type ${c.type}`)
    if (!Number.isFinite(Number(value))) invalid("non-numeric Excel number")
    return Number.isInteger(Number(value)) ? "integer" : "real"
  }
  async close() {
    await this.zip?.close()
    await this.handle?.close()
    await this.strings.close()
  }
  async check() {
    await unchanged(this.p, this.handle)
  }
}

function violation(p: Stored, r: Row, logical: number, column: number, expected: string, example: string): Violation {
  return {
    sheet: p.sheet.name,
    row: r.number,
    logical_record: logical,
    physical_line: r.number,
    byte_offset: 0,
    column,
    expected_type: expected,
    example: example.slice(0, 80),
  }
}
function dimension(first: number, last: number, width: number) {
  return first ? `A${first}:${letters(width || 1)}${last}` : ""
}

export async function profileXlsx(path: string, dir: string, options: XlsxOptions = {}) {
  const started = performance.now(),
    source = resolve(path),
    original = await identity(source)
  if (options.authorized_path && original.canonical_path !== options.authorized_path) fail("LOGINOM_FILE_CHANGED", path)
  if (options.rows_to_skip) invalid("Excel runtime has no rows_to_skip; select a tabular sheet")
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const budget = { bytes: 0, stop: QUICK, deadline: started + 4800 }
  const book = new Workbook({ source, identity: original }, dir, budget, options.signal)
  try {
    await book.init()
    const sheet = options.sheet_name ? book.sheets.find((s) => s.name === options.sheet_name) : book.sheets[0]
    if (!sheet) invalid("unknown sheet_name")
    const p: Stored = {
      format: "xlsx",
      profile_id: randomUUID(),
      source,
      identity: original,
      sheets: book.sheets,
      sheet,
      date_system: book.dateSystem,
      declared_dimension: "",
      observed_dimension: "",
      first_row: 0,
      last_row: 0,
      header_rows: options.header_rows ?? (options.first_line_as_title === false ? 0 : 1),
      blank_rows: options.blank_rows ?? "import",
      columns: [],
      quick_records: 0,
      first_rows: [],
      formulas: 0,
      missing_cached_values: 0,
      shared_strings_complete: book.sstComplete,
      coverage: { bytes_read: 0, observed_records: 0, elapsed_ms: 0, eof: false },
    }
    if (!Number.isInteger(p.header_rows) || p.header_rows < 0 || p.header_rows > 10)
      invalid("header_rows must be 0..10")
    let previous = 0,
      width = 0
    const eof = await book.rows(
      sheet,
      async (r) => {
        // Used range starts at the first actual cell, not the declared dimension.
        if (!r.cells.length && !p.first_row) return
        if (!p.first_row) p.first_row = r.number
        width = Math.max(width, r.cells.at(-1)?.col ?? 0)
        p.last_row = r.number
        const values = new Map<number, { value: string; kind: Kind }>()
        for (const c of r.cells) {
          if (c.formula) p.formulas++
          if (c.formula && !c.cached) p.missing_cached_values++
          const value = await book.value(c)
          if (value !== undefined && value !== "") values.set(c.col, { value, kind: book.kind(c, value) })
        }
        if (p.first_rows.length < 5)
          p.first_rows.push({
            row: r.number,
            values: Array.from(
              { length: Math.min(width, 16) },
              (_, i) => values.get(i + 1)?.value.slice(0, 80) ?? null,
            ),
          })
        for (let i = p.columns.length; i < width; i++) {
          const name = p.header_rows ? (values.get(i + 1)?.value ?? `Column${i + 1}`) : `Column${i + 1}`
          const technical =
            /^[A-Za-z_][A-Za-z0-9_]{0,99}$/.test(name) && !p.columns.some((c) => c.technical_name === name)
              ? name
              : `Column${i + 1}`
          p.columns.push({
            name,
            label: name,
            technical_name: technical,
            type: "string",
            data_kind: "Дискретный",
            observations: 0,
            nulls: 0,
            null_fraction: 0,
            examples: [],
          })
        }
        const headerEnd = p.first_row + p.header_rows
        if (r.number >= headerEnd) {
          const blanks = p.blank_rows === "import" ? Math.max(0, r.number - Math.max(previous + 1, headerEnd)) : 0
          const count = p.blank_rows === "import" || values.size ? 1 : 0
          p.quick_records += blanks + count
          for (const [i, col] of p.columns.entries()) {
            const v = values.get(i + 1)
            col.observations += blanks + count
            col.nulls += blanks + (v ? 0 : count)
            if (!v) continue
            if (col.observations - col.nulls === 1) col.type = v.kind
            if (col.type === "integer" && v.kind === "real") col.type = "real"
            col.data_kind = ["integer", "real", "datetime"].includes(col.type) ? "Непрерывный" : "Дискретный"
            if (col.examples.length < 3 && !col.examples.includes(v.value.slice(0, 60)))
              col.examples.push(v.value.slice(0, 60))
          }
        }
        previous = r.number
      },
      (ref) => {
        if (ref && !/^[A-Z]{1,3}[1-9]\d*(?::[A-Z]{1,3}[1-9]\d*)?$/.test(ref)) invalid("invalid declared dimension")
        p.declared_dimension = ref ?? ""
      },
    )
    p.observed_dimension = dimension(p.first_row, p.last_row, width)
    p.coverage = {
      bytes_read: budget.bytes,
      observed_records: p.quick_records,
      elapsed_ms: Math.round(performance.now() - started),
      eof,
    }
    for (const c of p.columns) c.null_fraction = c.nulls / Math.max(1, c.observations)
    await book.check()
    await save(p, dir)
    return xlsxReply(p)
  } finally {
    await book.close()
  }
}

function xlsxReply(p: Stored, cursor = 0) {
  const reasons = [
    ...(p.columns.length < 1 || p.columns.length > 8 ? ["Excel runtime supports 1–8 columns"] : []),
    ...(p.header_rows < 1 ? ["Excel runtime requires 1–10 header rows"] : []),
    ...(p.blank_rows !== "import" ? ["Excel runtime imports blank rows; blank_rows=skip cannot be applied"] : []),
    ...(!p.shared_strings_complete ? ["Shared strings quick budget reached; exact scan required"] : []),
    ...((p.scan?.missing_cached_values ?? p.missing_cached_values)
      ? ["Formulas without cached values; no formula evaluation"]
      : []),
    ...(p.columns.some((c) => c.type === "boolean") ? ["Excel runtime does not support boolean column type"] : []),
    ...(new Set(p.columns.map((c) => c.name)).size !== p.columns.length ? ["Duplicate source headers"] : []),
    ...(p.columns.some((c) => !c.name || c.name.length > 120 || /[\x00-\x1f]/.test(c.name))
      ? ["Excel headers must be 1–120 characters without controls"]
      : []),
  ]
  const result = {
    format: "xlsx" as const,
    profile_id: p.profile_id,
    identity: p.identity,
    status: p.scan?.status ?? (p.coverage.eof ? "sampled" : "partial"),
    coverage: p.coverage,
    confidence: "medium",
    sheets: p.sheets.map(({ name, visibility }) => ({ name, visibility })),
    sheet_name: p.sheet.name,
    date_system: p.date_system,
    declared_dimension: p.declared_dimension,
    observed_dimension: p.scan?.observed_dimension ?? p.observed_dimension,
    dimension_complete: p.scan?.status === "exact" || p.coverage.eof,
    header_rows: p.header_rows,
    blank_rows: p.blank_rows,
    formulas: p.scan?.formulas ?? p.formulas,
    missing_cached_values: p.scan?.missing_cached_values ?? p.missing_cached_values,
    record_estimate: {
      value: p.quick_records,
      method: "observed prefix only; declared dimension is not a record count",
    },
    first_rows: cursor === 0 ? p.first_rows : [],
    anomalies: reasons,
    scan: p.scan ? { ...p.scan, index: undefined } : undefined,
    columns: [] as Omit<Column, "nulls">[],
    columns_total: p.columns.length,
    settings: {
      source: { artifact_id: "", upload_operation_id: "" },
      excel: {
        source_path: "",
        sheet_name: p.sheet.name,
        header_rows: p.header_rows,
        columns: [] as { name: string; source_name: string; label: string; type: Kind; data_kind: string }[],
      },
    },
    settings_complete: false,
    settings_incomplete_reason: reasons.join("; "),
    continuation: null as string | null,
  }
  // Sheet inventory and first rows also count toward the reply budget.
  while (Buffer.byteLength(JSON.stringify(result)) > 4500 && result.first_rows.length) result.first_rows.pop()
  if (Buffer.byteLength(JSON.stringify(result)) > 6500) {
    result.sheets = result.sheets.slice(0, 10)
    result.anomalies.push("Sheet inventory truncated; select sheet_name explicitly")
  }
  for (let i = cursor; i < p.columns.length; i++) {
    const { nulls, ...c } = p.columns[i]
    result.columns.push({ ...c, name: c.name.slice(0, 120), label: c.label.slice(0, 120) })
    result.settings.excel.columns.push({
      name: c.technical_name,
      source_name: c.name,
      label: c.label,
      type: c.type,
      data_kind: c.data_kind,
    })
    if (Buffer.byteLength(JSON.stringify(result)) > 7900) {
      result.columns.pop()
      result.settings.excel.columns.pop()
      result.continuation = String(i)
      break
    }
  }
  if (result.continuation === String(cursor)) invalid("column metadata exceeds reply limit")
  result.settings_complete = !reasons.length && cursor === 0 && !result.continuation
  return result
}
export async function pageXlsx(id: string, dir: string, continuation = "0") {
  const p = await load(id, dir)
  await unchanged(p)
  if (!/^\d+$/.test(continuation) || Number(continuation) >= p.columns.length) invalid("invalid continuation")
  return xlsxReply(p, Number(continuation))
}

export async function scanXlsx(id: string, dir: string, options: { signal?: AbortSignal } = {}) {
  const p = await load(id, dir)
  await unchanged(p)
  const lock = await open(join(dir, `${id}.lock`), "wx", 0o600)
  const started = performance.now(),
    budget = { bytes: 0 },
    book = new Workbook(p, dir, budget, options.signal)
  p.scan = {
    status: "partial",
    records_observed: 0,
    bytes_read: 0,
    elapsed_ms: 0,
    formulas: 0,
    missing_cached_values: 0,
    observed_dimension: "",
  }
  await save(p, dir)
  let complete = false
  try {
    await book.init()
    const incompleteStrings = !p.shared_strings_complete
    p.shared_strings_complete = book.sstComplete
    let previous = 0,
      first = 0,
      width = 0
    await book.rows(
      p.sheet,
      async (r) => {
        if (!first && !r.cells.length) return
        first ||= r.number
        width = Math.max(width, r.cells.at(-1)?.col ?? 0)
        const headerEnd = first + p.header_rows
        if (r.number < headerEnd) {
          if (incompleteStrings && r.number === first)
            for (const c of r.cells) {
              const name = await book.value(c)
              if (!name || !p.columns[c.col - 1]) continue
              p.columns[c.col - 1].name = name
              p.columns[c.col - 1].label = name
            }
          previous = r.number
          return
        }
        const nonempty = r.cells.some((c) => c.value !== "" || c.formula)
        if (p.blank_rows === "import")
          p.scan!.records_observed += Math.max(0, r.number - Math.max(previous + 1, headerEnd)) + 1
        if (p.blank_rows === "skip" && nonempty) p.scan!.records_observed++
        for (const c of r.cells) {
          if (c.formula) p.scan!.formulas++
          if (c.formula && !c.cached) {
            p.scan!.missing_cached_values++
            p.scan!.first_violation ??= violation(
              p,
              r,
              p.scan!.records_observed,
              c.col,
              "cached value",
              "formula has no cached value",
            )
            continue
          }
          const value = await book.value(c)
          if (value === undefined || value === "") continue
          if (
            incompleteStrings &&
            p.columns[c.col - 1] &&
            p.columns[c.col - 1].observations === p.columns[c.col - 1].nulls
          ) {
            p.columns[c.col - 1].type = book.kind(c, value)
            p.columns[c.col - 1].observations++
            p.columns[c.col - 1].data_kind = ["integer", "real", "datetime"].includes(p.columns[c.col - 1].type)
              ? "Непрерывный"
              : "Дискретный"
          }
          const expected = p.columns[c.col - 1]?.type
          const actual = book.kind(c, value)
          if (
            expected === undefined ||
            (expected !== "string" && actual !== expected && !(expected === "real" && actual === "integer"))
          )
            p.scan!.first_violation ??= violation(
              p,
              r,
              p.scan!.records_observed,
              c.col,
              expected ?? `${p.columns.length} columns`,
              value,
            )
        }
        previous = r.number
      },
      () => {},
    )
    const hash = createHash("sha256")
    for await (const b of createReadStream(p.identity.canonical_path)) {
      options.signal?.throwIfAborted()
      hash.update(b)
    }
    await book.check()
    p.scan.observed_dimension = dimension(first, previous, width)
    p.scan.status = "exact"
    p.scan.records = p.scan.records_observed
    p.scan.sha256 = hash.digest("hex")
    complete = true
    return p.scan
  } catch (error) {
    if (!options.signal?.aborted) throw error
    return p.scan
  } finally {
    p.scan.bytes_read = budget.bytes
    p.scan.elapsed_ms = Math.round(performance.now() - started)
    if (!complete) {
      p.scan.status = "partial"
      delete p.scan.records
      delete p.scan.sha256
    }
    await book.close()
    await save(p, dir)
    await lock.close()
    await rm(join(dir, `${id}.lock`))
  }
}

export async function sampleXlsx(
  id: string,
  dir: string,
  options: { seed?: number; max_records?: number; max_bytes?: number; signal?: AbortSignal } = {},
) {
  const p = await load(id, dir)
  await unchanged(p)
  const limit = Math.max(1, Math.min(QUICK, options.max_bytes ?? QUICK)),
    capacity = Math.max(1, Math.min(100000, options.max_records ?? 1000))
  const seed = options.seed ?? 1,
    exact = p.scan?.status === "exact"
  let state = (((seed % 2147483646) + 2147483646) % 2147483646) + 1
  const random = () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
  const budget = { bytes: 0, ...(!exact ? { stop: QUICK } : {}) },
    book = new Workbook(p, dir, budget, options.signal)
  // Keep at most the output budget of rows, even when each cell is large.
  const head: Row[] = [],
    reservoir: Row[] = [],
    headers: Row[] = []
  const headSize = exact ? Math.max(1, Math.ceil(capacity / 4)) : capacity
  let retainedBytes = 0,
    seen = 0,
    first = 0,
    previous = 0
  const weight = (r: Row) => Buffer.byteLength(JSON.stringify(r)) + 256
  const add = (r: Row) => {
    const n = weight(r)
    if (n > limit) fail("LOGINOM_FILE_TOO_LARGE", "one XLSX sample row exceeds byte budget")
    if (head.length < headSize) {
      if (retainedBytes + n <= limit) {
        head.push(r)
        retainedBytes += n
      }
      return
    }
    if (!exact) return
    seen++
    const cap = capacity - head.length
    const i = reservoir.length < cap ? reservoir.length : Math.floor(random() * seen)
    if (i >= cap) return
    const old = reservoir[i] ? weight(reservoir[i]) : 0
    if (retainedBytes - old + n > limit) return
    retainedBytes += n - old
    reservoir[i] = r
  }
  try {
    await book.init()
    if (!book.sstComplete) invalid("shared string index incomplete; run exact scan before sampling")
    await book.rows(
      p.sheet,
      async (r) => {
        if (!first && !r.cells.length) return
        first ||= r.number
        for (const c of r.cells) {
          if (c.formula && !c.cached)
            invalid(`formula without cached value: ${p.sheet.name}!${letters(c.col)}${r.number}`)
          if (c.type === "s") {
            c.value = (await book.value(c))!
            c.type = "inlineStr"
          }
        }
        if (r.number < first + p.header_rows) {
          headers.push(r)
          retainedBytes += weight(r)
          previous = r.number
          return
        }
        if (p.blank_rows === "import")
          for (let number = Math.max(previous + 1, first + p.header_rows); number < r.number; number++)
            add({ number, cells: [] })
        if (p.blank_rows === "import" || r.cells.some((c) => c.value !== "")) add(r)
        previous = r.number
      },
      () => {},
    )
    await book.check()
    const selected = [...head, ...reservoir].sort((a, b) => a.number - b.number)
    if (!selected.length) invalid("no complete data rows fit the XLSX sample budget")
    const target = join(dir, `sample-${id}-${randomUUID()}.xlsx`)
    // A bounded small workbook uses inline strings, so all original SST indices
    // are rewritten and the sample has no dependency on the original SST.
    const make = async (rows: Row[]) => {
      const parts: Uint8Array[] = []
      let bytes = 0
      const zip = new ZipWriter(
        new WritableStream<Uint8Array>({
          write(b) {
            bytes += b.length
            if (bytes > limit) fail("LOGINOM_FILE_TOO_LARGE", "XLSX output exceeds sample byte budget")
            parts.push(new Uint8Array(b))
          },
        }),
        { level: 0, lastModDate: new Date(2020, 0, 1) },
      )
      const addPart = (name: string, text: string) => zip.add(name, new TextReader(text), { useWebWorkers: false })
      await addPart(
        "[Content_Types].xml",
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
      )
      await addPart(
        "_rels/.rels",
        `<Relationships xmlns="${relationshipNS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      )
      await addPart(
        "xl/workbook.xml",
        `<workbook xmlns="${namespace}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr date1904="${p.date_system === "1904" ? 1 : 0}"/><sheets><sheet name="${escape(p.sheet.name)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      )
      await addPart(
        "xl/_rels/workbook.xml.rels",
        `<Relationships xmlns="${relationshipNS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      )
      // Only number formats matter for values-only import; preserve each xf's
      // format exactly and retain original style indices.
      const formats = [
        ...new Map(
          book.styles.filter((s) => s.formatCode !== undefined).map((s) => [s.numFmtId, s.formatCode!]),
        ).entries(),
      ]
      await addPart(
        "xl/styles.xml",
        `<styleSheet xmlns="${namespace}"><numFmts count="${formats.length}">${formats.map(([id, code]) => `<numFmt numFmtId="${id}" formatCode="${escape(code)}"/>`).join("")}</numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="${Math.max(1, book.styles.length)}">${(book.styles.length ? book.styles : [{ numFmtId: 0 }]).map((s) => `<xf numFmtId="${s.numFmtId}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`).join("")}</cellXfs></styleSheet>`,
      )
      const sheet = `<worksheet xmlns="${namespace}"><dimension ref="A1:${letters(p.columns.length)}${headers.length + rows.length}"/><sheetData>${[
        ...headers,
        ...rows,
      ]
        .map(
          (r, i) =>
            `<row r="${i + 1}">${r.cells
              .map((c) => {
                const ref = `${letters(c.col)}${i + 1}`,
                  style = ` s="${c.style}"`
                if (["inlineStr", "str"].includes(c.type))
                  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escape(c.value)}</t></is></c>`
                return `<c r="${ref}"${style} t="${escape(c.type)}">${c.cached || c.value ? `<v>${escape(c.value)}</v>` : ""}</c>`
              })
              .join("")}</row>`,
        )
        .join("")}</sheetData></worksheet>`
      if (Buffer.byteLength(sheet) + bytes > limit)
        fail("LOGINOM_FILE_TOO_LARGE", "XLSX XML exceeds sample byte budget")
      await addPart("xl/worksheets/sheet1.xml", sheet)
      await zip.close()
      return Buffer.concat(parts)
    }
    // The conservative in-memory row bound precedes XML escaping/ZIP overhead.
    // Trim whole rows only and retry when that overhead crosses the byte cap.
    let bytes: Buffer
    while (true) {
      try {
        bytes = await make(selected)
        break
      } catch (error) {
        if (!String(error).includes("LOGINOM_FILE_TOO_LARGE") || selected.length <= 1) throw error
        selected.splice(Math.max(1, Math.floor(selected.length * 0.8)))
      }
    }
    await book.check()
    await writeFile(target, bytes, { flag: "wx", mode: 0o600 })
    const manifest = {
      profile_id: id,
      identity: p.identity,
      format: "xlsx",
      sheet_name: p.sheet.name,
      date_system: p.date_system,
      seed,
      method: exact ? "head+reservoir" : "confirmed-head",
      records: selected.length,
      bytes: bytes.length,
      offsets: selected.map((r) => ({ start: r.number, end: r.number, line: r.number })),
      offset_unit: "source worksheet row",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      formulas_as_cached_values: [...headers, ...selected].reduce(
        (n, r) => n + r.cells.filter((c) => c.formula).length,
        0,
      ),
      shared_strings: "rewritten as inline strings",
      header_rows: p.header_rows,
      blank_rows: p.blank_rows,
      full_file_scanned: exact,
      full_file_validated: exact && !p.scan?.first_violation,
      full_file_type_violation: p.scan?.first_violation,
    }
    try {
      await writeFile(`${target}.manifest.json`, JSON.stringify(manifest), { mode: 0o600 })
    } catch (error) {
      await rm(target, { force: true })
      throw error
    }
    return { path: target, manifest }
  } finally {
    await book.close()
  }
}
