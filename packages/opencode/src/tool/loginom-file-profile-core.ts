import { createHash, randomUUID } from "node:crypto"
import { createReadStream } from "node:fs"
import { mkdir, open, readFile, readdir, realpath, rename, stat, unlink, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { resolveTextImportEncoding } from "../../../loginom-runtime/client/lib/text-import-encoding.mjs"
import type { XlsxOptions } from "./loginom-file-xlsx"

const MiB = 1024 * 1024
const MAX_BYTES = 8 * MiB
const BLOCK = 256 * 1024
// Bun does not ship ICU's windows-1251 decoder; keep the same strict mapping
// in source and in the Node standalone bundle (0x98 is undefined).
const CP1251 =
  "ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђ‘’“”•–—\ufffd™љ›њќћџ ЎўЈ¤Ґ¦§Ё©Є«¬­®Ї°±Ііґµ¶·ё№є»јЅѕїАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя"
type Encoding = "utf-8" | "utf-16le" | "utf-16be" | "windows-1251" | "windows-1252"
type Kind = "integer" | "real" | "string" | "boolean" | "datetime"
type Boundary = { start: number; end: number; line: number }
type RecordBytes = Boundary & { bytes: Buffer }
type Violation = {
  logical_record: number
  physical_line: number
  byte_offset: number
  column: number
  expected_type: string
  example: string
}
type Column = {
  name: string
  technical_name: string
  label: string
  type: Kind
  data_kind: string
  date_format?: string
  null_fraction: number
  examples: string[]
  observations: number
  first_mismatch?: Violation
  nulls: number
}
export type ProfileOptions = XlsxOptions & {
  encoding?: string
  delimiter?: string
  text_qualifier?: string
  first_line_as_title?: boolean
  rows_to_skip?: number
  decimal_separator?: string
  null_marker?: string
  signal?: AbortSignal
  authorized_path?: string
}
type Identity = { canonical_path: string; size: number; mtime: number; ctime: number; file_id: string }
type Stored = {
  format?: "csv" | "xlsx"
  sheet?: { name: string }
  sheets?: { name: string }[]
  header_rows?: number
  blank_rows?: "import" | "skip"
  profile_id: string
  source: string
  identity: Identity
  encoding: { name: Encoding; bom_bytes: number; ambiguity?: string }
  dialect: {
    delimiter: string
    text_qualifier: string
    decimal_separator: string
    null_marker: string
    line_endings: string[]
  }
  rows_to_skip: number
  first_line_as_title: boolean
  columns: Column[]
  anomalies: string[]
  confidence: string
  coverage: {
    bytes_read: number
    confirmed_bytes: number
    observed_records: number
    elapsed_ms: number
    windows: { offset: number; bytes: number; boundaries_confirmed: boolean }[]
  }
  prefix: Boundary[]
  rare: Boundary[]
  quick_records: number
  quick_index: string
  scan?: {
    status: "exact" | "partial"
    records?: number
    records_observed: number
    bytes_read: number
    sha256?: string
    first_violation?: Violation
    elapsed_ms: number
    index?: string
  }
}

function failure(code: string, detail: string): never {
  throw Error(`${code}: ${detail}`)
}

async function identity(path: string): Promise<Identity> {
  const canonical = await realpath(path)
  const s = await stat(canonical)
  if (!s.isFile()) failure("LOGINOM_FILE_NOT_REGULAR", path)
  if (!Number.isSafeInteger(s.size)) failure("LOGINOM_FILE_TOO_LARGE", "unsafe file size")
  return { canonical_path: canonical, size: s.size, mtime: s.mtimeMs, ctime: s.ctimeMs, file_id: `${s.dev}:${s.ino}` }
}

async function unchanged(p: Stored) {
  const current = await identity(p.source).catch(() => undefined)
  if (JSON.stringify(current) !== JSON.stringify(p.identity)) failure("LOGINOM_FILE_CHANGED", p.source)
}

async function checkHandle(handle: Awaited<ReturnType<typeof open>>, expected: Identity) {
  const s = await handle.stat()
  if (
    !s.isFile() ||
    `${s.dev}:${s.ino}` !== expected.file_id ||
    s.size !== expected.size ||
    s.mtimeMs !== expected.mtime ||
    s.ctimeMs !== expected.ctime
  )
    failure("LOGINOM_FILE_CHANGED", expected.canonical_path)
}

function profilePath(dir: string, id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) failure("LOGINOM_FILE_FORMAT_AMBIGUOUS", "unknown profile_id in this session")
  return join(dir, `${id}.json`)
}

async function save(p: Stored, dir: string) {
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const file = profilePath(dir, p.profile_id)
  const temp = `${file}.${randomUUID()}.tmp`
  await writeFile(temp, JSON.stringify(p), { mode: 0o600 })
  await rename(temp, file)
}

export async function loadProfile(id: string, dir: string): Promise<Stored> {
  return JSON.parse(await readFile(profilePath(dir, id), "utf8"))
}

// Private backend receipt: the model supplies only an ID, never a row count.
export async function exactScanReceipt(id: string, dir: string) {
  const p = await loadProfile(id, dir)
  await unchanged(p)
  if (p.scan?.status !== "exact" || p.scan.first_violation || !Number.isSafeInteger(p.scan.records)
    || p.scan.records! < 0 || !/^[a-f0-9]{64}$/.test(p.scan.sha256 ?? "")) return undefined
  return { profile_id: p.profile_id, records: p.scan.records!, sha256: p.scan.sha256!,
    bytes: p.identity.size, identity: p.identity, basis: "backend_exact_scan" as const,
    ...(p.format === "xlsx" ? { xlsx: { sheet_name: p.sheet!.name, sheet_index: p.sheets!.findIndex(s => s.name === p.sheet!.name) + 1,
      header_rows: p.header_rows!, blank_rows: p.blank_rows! } } : {}) }
}

// Only exact scans for this original identity constrain full-file staging.
// Neither the model nor a quick profile can supply a trusted full-file digest.
export async function exactFileDigest(expected: Identity, dir: string) {
  const names = await readdir(dir).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return []
    throw error
  })
  const digests = new Set<string>()
  for (const name of names) {
    if (!/^[a-f0-9-]{36}\.json$/.test(name)) continue
    const profile = await loadProfile(name.slice(0, -5), dir)
    if (
      !["canonical_path", "size", "mtime", "ctime", "file_id"].every(
        (key) => profile.identity[key as keyof Identity] === expected[key as keyof Identity],
      )
    )
      continue
    if (profile.scan?.status !== "exact") continue
    if (!/^[a-f0-9]{64}$/.test(profile.scan.sha256 ?? "")) throw Error("LOGINOM_FILE_CHANGED")
    digests.add(profile.scan.sha256!)
  }
  if (digests.size > 1) throw Error("LOGINOM_FILE_CHANGED")
  return digests.values().next().value
}

function decode(bytes: Buffer, encoding: Encoding, partial = false) {
  try {
    const text =
      encoding === "windows-1251"
        ? bytes.toString("latin1").replace(/[\x80-\xff]/g, (c) => CP1251[c.charCodeAt(0) - 128])
        : new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(bytes, { stream: partial })
    if (text.includes("\ufffd"))
      failure("LOGINOM_FILE_FORMAT_AMBIGUOUS", "replacement character in source; specify encoding")
    return text
  } catch {
    return failure("LOGINOM_FILE_FORMAT_AMBIGUOUS", `invalid ${encoding} bytes; specify encoding`)
  }
}

function detectEncoding(bytes: Buffer, explicit?: string): Stored["encoding"] {
  const bom = bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191]))
    ? { name: "utf-8", bom_bytes: 3 }
    : bytes[0] === 255 && bytes[1] === 254
      ? { name: "utf-16le", bom_bytes: 2 }
      : bytes[0] === 254 && bytes[1] === 255
        ? { name: "utf-16be", bom_bytes: 2 }
        : undefined
  const names: Record<string, Encoding> = {
    "65001": "utf-8",
    "1200": "utf-16le",
    "1201": "utf-16be",
    "1251": "windows-1251",
    "1252": "windows-1252",
  }
  if (explicit) {
    const name = names[resolveTextImportEncoding(explicit).code]
    if (bom && bom.name !== name) failure("LOGINOM_FILE_FORMAT_AMBIGUOUS", "encoding conflicts with BOM")
    decode(bytes.subarray(bom?.bom_bytes ?? 0), name, true)
    return { name, bom_bytes: bom?.bom_bytes ?? 0 }
  }
  if (bom) {
    decode(bytes.subarray(bom.bom_bytes), bom.name as Encoding, true)
    return bom as Stored["encoding"]
  }
  // NUL-rich UTF-16 is valid UTF-8 byte syntax, but not plausible UTF-8 text.
  const even = bytes.filter((c, i) => i % 2 === 0 && c === 0).length
  const odd = bytes.filter((c, i) => i % 2 === 1 && c === 0).length
  if (Math.max(even, odd) > bytes.length / 8) {
    const name = odd > even ? "utf-16le" : "utf-16be"
    decode(bytes, name, true)
    return { name, bom_bytes: 0 }
  }
  try {
    decode(bytes, "utf-8", true)
    return {
      name: "utf-8",
      bom_bytes: 0,
      ...(bytes.every((b) => b < 128)
        ? { ambiguity: "ASCII: UTF-8, cp1251 and cp1252 are indistinguishable; UTF-8 chosen" }
        : {}),
    }
  } catch {
    const cyrillic = decode(bytes, "windows-1251", true)
    const western = decode(bytes, "windows-1252", true)
    const runs = cyrillic.match(/[А-Яа-яЁё]{3,}/g)?.join("").length ?? 0
    const accents = western.match(/[A-Za-z][À-ÿ]|[À-ÿ][A-Za-z]/g)?.length ?? 0
    if (runs > accents * 2) return { name: "windows-1251", bom_bytes: 0 }
    if (accents > 0) return { name: "windows-1252", bom_bytes: 0 }
    failure("LOGINOM_FILE_FORMAT_AMBIGUOUS", "cp1251/cp1252 scores are close; specify encoding")
  }
}

// A stateful byte parser: only an offset reached from the beginning is trusted.
// It never initializes quote state from the first LF of an arbitrary seek window.
class Records {
  private offset: number
  private start: number
  private line = 1
  private startLine = 1
  private quoted = false
  private quotePending = false
  private fieldStart = true
  private afterQuote = false
  private cr = false
  private lastCR = false
  private pieces: Buffer[] = []
  private carry: Buffer = Buffer.alloc(0)
  readonly step: number
  constructor(
    private encoding: Encoding,
    private delimiter: string,
    private qualifier: string,
    start: number,
  ) {
    this.offset = this.start = start
    this.step = encoding.startsWith("utf-16") ? 2 : 1
  }
  feed(input: Buffer, eof = false): RecordBytes[] {
    const buffer = this.carry.length ? Buffer.concat([this.carry, input]) : input
    const limit = buffer.length - (buffer.length % this.step)
    this.carry = buffer.subarray(limit)
    const records: RecordBytes[] = []
    let segment = 0
    const emit = (end: number) => {
      if (this.offset + end - this.start > MAX_BYTES)
        failure("LOGINOM_FILE_INVALID_RECORD", `record > 8 MiB at byte ${this.start}`)
      const pieces = [...this.pieces, buffer.subarray(segment, end)]
      const bytes = pieces.length === 1 ? pieces[0] : Buffer.concat(pieces)
      const byteEnd = this.offset + end
      records.push({ start: this.start, end: byteEnd, line: this.startLine, bytes })
      this.pieces = []
      segment = end
      this.start = byteEnd
      this.startLine = this.line
      this.fieldStart = true
      this.afterQuote = false
    }
    for (let i = 0; i < limit; i += this.step) {
      const c =
        this.step === 1 ? buffer[i] : this.encoding === "utf-16le" ? buffer.readUInt16LE(i) : buffer.readUInt16BE(i)
      if (this.cr) {
        this.cr = false
        if (c === 10) {
          emit(i + this.step)
          this.lastCR = false
          continue
        }
        emit(i)
      }
      if (this.offset + i + this.step - this.start > MAX_BYTES)
        failure("LOGINOM_FILE_INVALID_RECORD", `record > 8 MiB at byte ${this.start}`)
      if (c === 13 || (c === 10 && !this.lastCR)) this.line++
      this.lastCR = c === 13
      if (this.quoted) {
        if (!this.quotePending) {
          if (c === this.qualifier.charCodeAt(0)) this.quotePending = true
          continue
        }
        this.quotePending = false
        if (c === this.qualifier.charCodeAt(0)) continue
        this.quoted = false
        this.afterQuote = true
      }
      if (c === 13) {
        this.cr = true
        continue
      }
      if (c === 10) {
        emit(i + this.step)
        continue
      }
      if (c === this.delimiter.charCodeAt(0)) {
        this.fieldStart = true
        this.afterQuote = false
        continue
      }
      if (this.fieldStart && this.qualifier && c === this.qualifier.charCodeAt(0)) {
        this.quoted = true
        this.fieldStart = false
        continue
      }
      if (this.afterQuote || (this.qualifier && c === this.qualifier.charCodeAt(0)))
        failure("LOGINOM_FILE_INVALID_RECORD", `unexpected quote/text at byte ${this.offset + i}`)
      this.fieldStart = false
    }
    if (segment < limit) this.pieces.push(buffer.subarray(segment, limit))
    this.offset += limit
    if (eof) {
      if (this.carry.length) failure("LOGINOM_FILE_INVALID_RECORD", "incomplete UTF-16 code unit")
      if (this.quoted && !this.quotePending)
        failure("LOGINOM_FILE_INVALID_RECORD", `unclosed quote at byte ${this.start}`)
      if (this.offset > this.start) {
        records.push({ start: this.start, end: this.offset, line: this.startLine, bytes: Buffer.concat(this.pieces) })
        this.start = this.offset
        this.pieces = []
      }
    }
    return records
  }
}

function fields(record: RecordBytes, encoding: Encoding, delimiter: string, qualifier: string) {
  const text = decode(record.bytes, encoding).replace(/(?:\r\n|\r|\n)$/, "")
  const values: string[] = []
  let value = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === qualifier && qualifier) {
      if (quoted && text[i + 1] === qualifier) {
        value += c
        i++
        continue
      }
      quoted = !quoted
      continue
    }
    if (!quoted && c === delimiter) {
      values.push(value)
      value = ""
      continue
    }
    value += c
  }
  values.push(value)
  return values
}

function kind(value: string, decimal: string): Kind {
  if (/^[+-]?\d+$/.test(value)) return "integer"
  if (
    (decimal === ","
      ? /^[+-]?(?:\d+(?:,\d*)?|,\d+)(?:[eE][+-]?\d+)?$/
      : /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/
    ).test(value)
  )
    return "real"
  if (/^(true|false)$/i.test(value)) return "boolean"
  if (dateInfo(value)) return "datetime"
  return "string"
}

function dateInfo(value: string) {
  const iso = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(value)
  if (iso && !Number.isNaN(Date.parse(value))) return { format: "yyyy/mm/dd", separator: "-" }
  const parts = /^(\d{1,2})([./-])(\d{1,2})\2(\d{4})$/.exec(value)
  if (!parts) return undefined
  const a = Number(parts[1]),
    b = Number(parts[3]),
    year = Number(parts[4])
  if (a <= 12 && b <= 12) return undefined // ambiguous day/month order
  const day = a > 12 ? a : b,
    month = a > 12 ? b : a
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined
  return { format: a > 12 ? "dd/mm/yyyy" : "mm/dd/yyyy", separator: parts[2] }
}

function infer(bytes: Buffer, encoding: Stored["encoding"], options: ProfileOptions, eof: boolean) {
  const candidates = (options.delimiter ? [options.delimiter] : [";", "\t", ",", "|"])
    .flatMap((delimiter) =>
      (options.text_qualifier !== undefined ? [options.text_qualifier] : ['"', "'"]).map((qualifier) => ({
        delimiter,
        qualifier,
      })),
    )
    .flatMap(({ delimiter, qualifier }) => {
      try {
        const parser = new Records(encoding.name, delimiter, qualifier, encoding.bom_bytes)
        const rows = parser.feed(bytes.subarray(encoding.bom_bytes), false).slice(0, 1000)
        if (eof) {
          // Keep complete initial records for dialect detection even when the
          // final record is malformed; the production pass reports that error.
          try {
            rows.push(...parser.feed(Buffer.alloc(0), true).slice(0, 1000 - rows.length))
          } catch {
            /* reported below */
          }
        }
        const values = rows.map((r) => fields(r, encoding.name, delimiter, qualifier))
        const widths = new Map<number, number>()
        for (const row of values.slice(options.rows_to_skip ?? 0))
          widths.set(row.length, (widths.get(row.length) ?? 0) + 1)
        const [width, count] = [...widths].sort((a, b) => (b[0] > 1 ? b[1] : 0) - (a[0] > 1 ? a[1] : 0))[0] ?? [1, 0]
        return [{ delimiter, qualifier, values, score: width > 1 ? count / Math.max(1, values.length) : 0, width }]
      } catch {
        return []
      }
    })
    .sort((a, b) => b.score - a.score)
  const best = candidates[0]
  if (!best || (!options.delimiter && best.score === 0))
    failure("LOGINOM_FILE_FORMAT_AMBIGUOUS", "specify delimiter; no stable multi-column records")
  if (
    !options.delimiter &&
    candidates.some((c) => c.delimiter !== best.delimiter && c.score === best.score && c.width > 1)
  )
    failure("LOGINOM_FILE_FORMAT_AMBIGUOUS", "delimiter scores tied; specify delimiter")
  const skip =
    options.rows_to_skip ??
    Math.max(
      0,
      best.values.findIndex((v) => v.length === best.width),
    )
  const rows = best.values.slice(skip)
  const decimal =
    options.decimal_separator ??
    (best.delimiter !== "," && rows.slice(1).some((r) => r.some((v) => /^[+-]?\d+,\d+$/.test(v))) ? "," : ".")
  const first = rows[0] ?? []
  const header =
    options.first_line_as_title ??
    (first.length > 0 &&
      first.every((v) => kind(v, decimal) === "string" && !!v) &&
      rows.slice(1).some((r) => r.some((v, i) => kind(v, decimal) !== kind(first[i] ?? "", decimal))))
  const nullCounts = ["", "NULL", "NA", "N/A", "\\N"].map((v) => ({
    v,
    n: rows
      .slice(header ? 1 : 0)
      .flat()
      .filter((c) => c === v).length,
  }))
  const nullMarker = options.null_marker ?? nullCounts.sort((a, b) => b.n - a.n)[0].v
  return {
    delimiter: best.delimiter,
    qualifier: best.qualifier,
    skip,
    decimal,
    header,
    names: header ? first : Array.from({ length: best.width }, (_, i) => `Column${i + 1}`),
    nullMarker,
    ambiguousHeader:
      options.first_line_as_title === undefined && !header && first.some((v) => kind(v, decimal) === "string"),
  }
}

function mismatch(p: Stored, record: RecordBytes, values: string[], logical: number): Violation | undefined {
  const base = { logical_record: logical, physical_line: record.line, byte_offset: record.start }
  if (values.length !== p.columns.length)
    return {
      ...base,
      column: Math.min(values.length, p.columns.length) + 1,
      expected_type: `${p.columns.length} fields`,
      example: `${values.length} fields`,
    }
  for (let i = 0; i < values.length; i++) {
    if (values[i] === p.dialect.null_marker || p.columns[i].type === "string") continue
    const actual = kind(values[i], p.dialect.decimal_separator)
    if (
      (actual === p.columns[i].type &&
        (actual !== "datetime" || dateInfo(values[i])?.format === p.columns[i].date_format)) ||
      (p.columns[i].type === "real" && actual === "integer")
    )
      continue
    return { ...base, column: i + 1, expected_type: p.columns[i].type, example: values[i].slice(0, 80) }
  }
}

function boundaryBytes(r: Boundary) {
  const bytes = Buffer.allocUnsafe(24)
  bytes.writeDoubleLE(r.start, 0)
  bytes.writeDoubleLE(r.end, 8)
  bytes.writeDoubleLE(r.line, 16)
  return bytes
}

async function* boundaries(path: string) {
  let carry: Buffer = Buffer.alloc(0)
  for await (const input of createReadStream(path, { highWaterMark: BLOCK })) {
    const bytes = carry.length ? Buffer.concat([carry, input]) : (input as Buffer)
    const end = bytes.length - (bytes.length % 24)
    for (let i = 0; i < end; i += 24)
      yield { start: bytes.readDoubleLE(i), end: bytes.readDoubleLE(i + 8), line: bytes.readDoubleLE(i + 16) }
    carry = bytes.subarray(end)
  }
  if (carry.length) failure("LOGINOM_FILE_INVALID_RECORD", "incomplete local boundary index")
}

export async function profileFile(path: string, dir: string, options: ProfileOptions = {}) {
  const detected = await identity(resolve(path))
  if (options.authorized_path && options.authorized_path !== detected.canonical_path)
    failure("LOGINOM_FILE_CHANGED", path)
  const magic = await open(detected.canonical_path, "r")
  try {
    await checkHandle(magic, detected)
    const bytes = Buffer.alloc(4)
    await magic.read(bytes, 0, 4, 0)
    if ([0x04034b50, 0x06054b50, 0x08074b50].includes(bytes.readUInt32LE(0))) {
      const { profileXlsx } = await import("./loginom-file-xlsx")
      return await profileXlsx(path, dir, options)
    }
    if (bytes.equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])))
      failure("LOGINOM_FILE_XLSX_UNSUPPORTED", "encrypted XLSX / legacy OLE workbook")
  } finally {
    await magic.close()
  }
  const started = performance.now()
  const source = resolve(path)
  const original = await identity(source)
  if (options.authorized_path && options.authorized_path !== original.canonical_path)
    failure("LOGINOM_FILE_CHANGED", source)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const handle = await open(original.canonical_path, "r")
  const id = randomUUID()
  const indexPath = join(dir, `${id}.quick.idx`)
  const index = await open(indexPath, "wx", 0o600)
  try {
    await checkHandle(handle, original)
    const first = Buffer.alloc(Math.min(BLOCK, original.size))
    const got = await handle.read(first, 0, first.length, 0)
    const initial = first.subarray(0, got.bytesRead)
    const encoding = detectEncoding(initial, options.encoding)
    const inferred = infer(initial, encoding, options, got.bytesRead === original.size)
    const names = new Set<string>()
    const p: Stored = {
      profile_id: id,
      source,
      identity: original,
      encoding,
      dialect: {
        delimiter: inferred.delimiter,
        text_qualifier: inferred.qualifier,
        decimal_separator: inferred.decimal,
        null_marker: inferred.nullMarker,
        line_endings: [],
      },
      rows_to_skip: inferred.skip,
      first_line_as_title: inferred.header,
      columns: inferred.names.map((label, i) => {
        const base = /^[A-Za-z_][A-Za-z0-9_]{0,99}$/.test(label) ? label : `Column${i + 1}`
        const name = names.has(base) ? `${base}_${i + 1}` : base
        names.add(name)
        return {
          name: label,
          technical_name: name,
          label,
          type: "string",
          data_kind: "Дискретный",
          null_fraction: 0,
          nulls: 0,
          observations: 0,
          examples: [],
        }
      }),
      anomalies: [],
      confidence: inferred.ambiguousHeader ? "low" : "medium",
      prefix: [],
      rare: [],
      quick_records: 0,
      quick_index: indexPath,
      coverage: { bytes_read: 0, confirmed_bytes: encoding.bom_bytes, observed_records: 0, elapsed_ms: 0, windows: [] },
    }
    if (encoding.ambiguity) p.anomalies.push(encoding.ambiguity)
    if (inferred.ambiguousHeader)
      p.anomalies.push("Header is ambiguous; first_line_as_title=false. Confirm before import.")
    const parser = new Records(encoding.name, inferred.delimiter, p.dialect.text_qualifier, encoding.bom_bytes)
    const prefixLimit = Math.min(4 * MiB, original.size)
    let offset = 0
    let logical = 0
    let records = 0
    while (offset < prefixLimit && performance.now() - started < 4400) {
      options.signal?.throwIfAborted()
      const bytes = offset === 0 ? initial : Buffer.alloc(Math.min(BLOCK, prefixLimit - offset))
      const length = offset === 0 ? bytes.length : (await handle.read(bytes, 0, bytes.length, offset)).bytesRead
      if (!length) break
      const data = bytes.subarray(offset === 0 ? encoding.bom_bytes : 0, length)
      offset += length
      p.coverage.bytes_read += length
      const batch = parser.feed(data, offset === original.size)
      const indices: Buffer[] = []
      for (const r of batch) {
        records++
        p.coverage.confirmed_bytes = r.end
        if (records <= p.rows_to_skip + Number(p.first_line_as_title)) {
          p.prefix.push({ start: r.start, end: r.end, line: r.line })
          continue
        }
        logical++
        const values = fields(r, encoding.name, p.dialect.delimiter, p.dialect.text_qualifier)
        if (values.length !== p.columns.length && !p.anomalies.includes("Inconsistent field count"))
          p.anomalies.push("Inconsistent field count")
        for (let i = 0; i < p.columns.length; i++) {
          const c = p.columns[i],
            v = values[i] ?? p.dialect.null_marker
          c.observations++
          if (v === p.dialect.null_marker) {
            c.nulls++
            continue
          }
          const type = kind(v, p.dialect.decimal_separator)
          if (c.observations - c.nulls === 1) c.type = type
          if (c.type === "integer" && type === "real") c.type = "real"
          if (c.examples.length < 3 && !c.examples.includes(v.slice(0, 60))) c.examples.push(v.slice(0, 60))
          c.data_kind = ["integer", "real", "datetime"].includes(c.type) ? "Непрерывный" : "Дискретный"
          if (c.type === "datetime") c.date_format ??= dateInfo(v)?.format
        }
        const violation = mismatch(p, r, values, logical)
        if (violation && p.columns[violation.column - 1] && !p.columns[violation.column - 1].first_mismatch) {
          p.columns[violation.column - 1].first_mismatch = violation
          p.rare.push({ start: r.start, end: r.end, line: r.line })
        }
        indices.push(boundaryBytes(r))
        const unit = (at: number) =>
          at < 0
            ? -1
            : parser.step === 1
              ? r.bytes[at]
              : encoding.name === "utf-16le"
                ? r.bytes.readUInt16LE(at)
                : r.bytes.readUInt16BE(at)
        const last = unit(r.bytes.length - parser.step),
          previous = unit(r.bytes.length - parser.step * 2)
        const eol = last === 10 && previous === 13 ? "CRLF" : last === 13 ? "CR" : last === 10 ? "LF" : "none"
        if (!p.dialect.line_endings.includes(eol)) p.dialect.line_endings.push(eol)
      }
      if (indices.length) await index.write(Buffer.concat(indices))
    }
    p.quick_records = logical
    p.coverage.observed_records = logical
    p.coverage.windows.push({ offset: 0, bytes: p.coverage.confirmed_bytes, boundaries_confirmed: true })
    if (offset > p.coverage.confirmed_bytes)
      p.coverage.windows.push({
        offset: p.coverage.confirmed_bytes,
        bytes: offset - p.coverage.confirmed_bytes,
        boundaries_confirmed: false,
      })
    // Seek windows carry byte coverage only. They cannot contribute typed rows.
    if (offset < original.size) {
      for (const position of [0.27, 0.53, 0.79, 1]) {
        if (performance.now() - started >= 4800) break
        const start = Math.max(offset, Math.floor((original.size - MiB) * position))
        const size = Math.min(MiB, original.size - start, MAX_BYTES - p.coverage.bytes_read)
        if (size <= 0) continue
        const buffer = Buffer.alloc(Math.min(BLOCK, size))
        let read = 0
        while (read < size && performance.now() - started < 4800) {
          const n = (await handle.read(buffer, 0, Math.min(buffer.length, size - read), start + read)).bytesRead
          if (!n) break
          read += n
        }
        p.coverage.bytes_read += read
        p.coverage.windows.push({ offset: start, bytes: read, boundaries_confirmed: false })
      }
      p.anomalies.push(
        "Seek windows have unconfirmed quote state; types and samples use confirmed prefix only. Exact scan is required to detect rare type changes.",
      )
    }
    for (const c of p.columns) c.null_fraction = c.nulls / Math.max(1, c.observations)
    p.coverage.elapsed_ms = Math.round(performance.now() - started)
    await unchanged(p)
    await checkHandle(handle, original)
    await save(p, dir)
    return reply(p)
  } finally {
    await handle.close()
    await index.close()
  }
}

function reply(p: Stored, cursor = 0) {
  const observed = p.coverage.observed_records
  const ratio = p.identity.size / Math.max(1, p.coverage.confirmed_bytes)
  const estimate = Math.round(observed * ratio)
  const result = {
    format: "csv" as const,
    profile_id: p.profile_id,
    identity: p.identity,
    status: p.scan?.status ?? (p.coverage.confirmed_bytes === p.identity.size ? "sampled" : "partial"),
    coverage: p.coverage,
    confidence: p.confidence,
    encoding: p.encoding,
    dialect: p.dialect,
    record_estimate: {
      value: estimate,
      interval: [Math.max(observed, Math.floor(estimate * 0.5)), Math.ceil(estimate * 1.5)],
      method: "confirmed prefix byte density; heuristic interval, not a statistical guarantee",
    },
    anomalies: p.anomalies,
    scan: p.scan ? { ...p.scan, index: undefined } : undefined,
    columns: [] as Omit<Column, "nulls">[],
    settings: {
      source: {
        source_path: "",
        encoding: resolveTextImportEncoding(
          { "utf-8": "65001", "utf-16le": "1200", "utf-16be": "1201", "windows-1251": "1251", "windows-1252": "1252" }[
            p.encoding.name
          ],
        ).label,
        rows_to_skip: p.rows_to_skip,
        first_line_as_title: p.first_line_as_title,
      },
      format: {
        delimiter: p.dialect.delimiter,
        decimal_separator: p.dialect.decimal_separator,
        null_marker: p.dialect.null_marker,
        text_qualifier: p.dialect.text_qualifier,
        ...(() => {
          const c = p.columns.find((c) => c.type === "datetime")
          const date = c?.examples.map(dateInfo).find(Boolean)
          return date ? { date_format: date.format, date_separator: date.separator } : {}
        })(),
      },
      columns: [] as {
        name: string
        label: string
        source_name: string
        type: Kind
        data_kind: string
        used: boolean
      }[],
    },
    settings_complete: false,
    columns_total: p.columns.length,
    continuation: null as string | null,
  }
  for (let i = cursor; i < p.columns.length; i++) {
    const { nulls, ...c } = p.columns[i]
    result.columns.push(c)
    result.settings.columns.push({
      name: c.technical_name,
      source_name: c.name,
      label: c.label,
      type: c.type,
      data_kind: c.data_kind,
      used: true,
    })
    if (Buffer.byteLength(JSON.stringify(result)) > 7900) {
      result.columns.pop()
      result.settings.columns.pop()
      result.continuation = String(i)
      break
    }
  }
  if (!result.settings.columns.length && p.columns.length)
    failure("LOGINOM_FILE_FORMAT_AMBIGUOUS", "column metadata exceeds response limit; shorten header or supply schema")
  result.settings_complete = cursor === 0 && !result.continuation
  return result
}

export async function profilePage(id: string, dir: string, continuation = "0") {
  const p = await loadProfile(id, dir)
  if (p.format === "xlsx") {
    const { pageXlsx } = await import("./loginom-file-xlsx")
    return pageXlsx(id, dir, continuation)
  }
  await unchanged(p)
  if (!/^\d+$/.test(continuation) || Number(continuation) >= p.columns.length)
    failure("LOGINOM_FILE_FORMAT_AMBIGUOUS", "invalid continuation")
  return reply(p, Number(continuation))
}

export async function scanFile(id: string, dir: string, options: { signal?: AbortSignal; chunk_bytes?: number } = {}) {
  const p = await loadProfile(id, dir)
  if (p.format === "xlsx") {
    const { scanXlsx } = await import("./loginom-file-xlsx")
    return scanXlsx(id, dir, options)
  }
  await unchanged(p)
  const lock = await open(join(dir, `${id}.lock`), "wx", 0o600)
  const started = performance.now()
  const indexPath = join(dir, `${id}.${randomUUID()}.idx`)
  const index = await open(indexPath, "wx", 0o600)
  const input = await open(p.identity.canonical_path, "r")
  p.scan = { status: "partial", records_observed: 0, bytes_read: 0, elapsed_ms: 0 }
  await save(p, dir)
  let row = 0
  let complete = false
  const digest = createHash("sha256")
  const parser = new Records(p.encoding.name, p.dialect.delimiter, p.dialect.text_qualifier, p.encoding.bom_bytes)
  let bom = p.encoding.bom_bytes
  try {
    await checkHandle(input, p.identity)
    while (p.scan.bytes_read < p.identity.size) {
      if (options.signal?.aborted) break
      const buffer = Buffer.alloc(Math.min(options.chunk_bytes ?? BLOCK, p.identity.size - p.scan.bytes_read))
      const length = (await input.read(buffer, 0, buffer.length, p.scan.bytes_read)).bytesRead
      if (!length) break
      const bytes = buffer.subarray(0, length)
      digest.update(bytes)
      p.scan.bytes_read += bytes.length
      const skip = Math.min(bom, bytes.length)
      bom -= skip
      const batch = parser.feed(bytes.subarray(skip), p.scan.bytes_read === p.identity.size)
      const indices: Buffer[] = []
      for (const r of batch) {
        row++
        if (row <= p.rows_to_skip + Number(p.first_line_as_title)) continue
        p.scan.records_observed++
        const values = fields(r, p.encoding.name, p.dialect.delimiter, p.dialect.text_qualifier)
        const violation = mismatch(p, r, values, p.scan.records_observed)
        p.scan.first_violation ??= violation
        indices.push(boundaryBytes(r))
      }
      if (indices.length) await index.write(Buffer.concat(indices))
    }
    complete = !options.signal?.aborted && p.scan.bytes_read === p.identity.size
    await unchanged(p)
    await checkHandle(input, p.identity)
    if (complete) {
      p.scan.status = "exact"
      p.scan.records = p.scan.records_observed
      p.scan.sha256 = digest.digest("hex")
      p.scan.index = indexPath
    }
    return p.scan
  } finally {
    p.scan.elapsed_ms = Math.round(performance.now() - started)
    await index.close()
    await input.close()
    if (!complete) {
      p.scan.status = "partial"
      delete p.scan.records
      delete p.scan.sha256
      delete p.scan.index
      await unlink(indexPath)
    }
    await save(p, dir)
    await lock.close()
    await unlink(join(dir, `${id}.lock`))
  }
}

export async function sampleFile(
  id: string,
  dir: string,
  options: { seed?: number; max_records?: number; max_bytes?: number; signal?: AbortSignal } = {},
) {
  const p = await loadProfile(id, dir)
  if (p.format === "xlsx") {
    const { sampleXlsx } = await import("./loginom-file-xlsx")
    return sampleXlsx(id, dir, options)
  }
  await unchanged(p)
  const maxRecords = Math.max(1, Math.min(100000, options.max_records ?? 1000))
  const limit = Math.max(1, Math.min(MAX_BYTES, options.max_bytes ?? MAX_BYTES))
  const seed = options.seed ?? 1
  let state = (((seed % 2147483646) + 2147483646) % 2147483646) + 1
  const random = () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
  const exact = p.scan?.status === "exact" && p.scan.index
  const headSize = exact ? Math.max(1, Math.ceil(maxRecords / 4)) : maxRecords
  const head: Boundary[] = []
  const reservoir: Boundary[] = []
  let seen = 0
  for await (const r of boundaries(exact || p.quick_index)) {
    options.signal?.throwIfAborted()
    if (head.length < headSize) {
      head.push(r)
      continue
    }
    if (!exact) break
    seen++
    const capacity = maxRecords - headSize
    if (reservoir.length < capacity) reservoir.push(r)
    else {
      const i = Math.floor(random() * seen)
      if (i < capacity) reservoir[i] = r
    }
  }
  const preamble: Boundary[] = [
    ...(p.encoding.bom_bytes ? [{ start: 0, end: p.encoding.bom_bytes, line: 1 }] : []),
    ...p.prefix,
  ]
  let size = preamble.reduce((n, r) => n + r.end - r.start, 0)
  if (size >= limit) failure("LOGINOM_FILE_TOO_LARGE", "sample header/preamble exceeds byte limit")
  const selected: Boundary[] = []
  const candidates = [...head.slice(0, 1), ...(p.rare ?? []), ...head.slice(1), ...reservoir]
  const used = new Set<number>()
  for (const r of candidates) {
    if (used.has(r.start) || selected.length >= maxRecords) continue
    used.add(r.start)
    if (size + r.end - r.start > limit) continue
    selected.push(r)
    size += r.end - r.start
  }
  if (!selected.length)
    failure("LOGINOM_FILE_TOO_LARGE", "no whole record fits sample byte limit; run exact scan if prefix is incomplete")
  const offsets = [...preamble, ...selected.sort((a, b) => a.start - b.start)]
  const target = join(dir, `sample-${id}-${randomUUID()}.csv`)
  const input = await open(p.identity.canonical_path, "r")
  const output = await open(target, "wx", 0o600)
  const digest = createHash("sha256")
  try {
    await checkHandle(input, p.identity)
    const buffer = Buffer.alloc(BLOCK)
    for (const r of offsets) {
      for (let offset = r.start; offset < r.end; ) {
        options.signal?.throwIfAborted()
        const n = (await input.read(buffer, 0, Math.min(buffer.length, r.end - offset), offset)).bytesRead
        if (!n) failure("LOGINOM_FILE_CHANGED", p.source)
        await output.write(buffer.subarray(0, n))
        digest.update(buffer.subarray(0, n))
        offset += n
      }
    }
    await unchanged(p)
    await checkHandle(input, p.identity)
    const manifest = {
      profile_id: id,
      identity: p.identity,
      seed,
      method: exact ? "head+reservoir" : "confirmed-head",
      offsets,
      records: selected.length,
      bytes: size,
      sha256: digest.digest("hex"),
      encoding: p.encoding,
      full_file_scanned: Boolean(exact),
      full_file_validated: Boolean(exact) && !p.scan?.first_violation,
      full_file_type_violation: p.scan?.first_violation,
    }
    await writeFile(`${target}.manifest.json`, JSON.stringify(manifest), { mode: 0o600 })
    return { path: target, manifest }
  } catch (error) {
    await unlink(target)
    throw error
  } finally {
    await input.close()
    await output.close()
  }
}
