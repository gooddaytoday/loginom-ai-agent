export const LIMITS = { tables: 40, columns: 80, rows: 100_000, totalRows: 200_000, files: 200 }

const namePattern = /^[\p{L}_][\p{L}\p{N}_ ]{0,63}$/u
const folderPattern = /^[\p{L}\p{N}_-]{1,64}$/u
const distributions = ["uniform", "normal", "lognormal", "poisson"] as const
const formats = ["csv", "tsv", "txt", "xlsx", "json", "jsonl", "xml"] as const

export type Distribution = (typeof distributions)[number]
export type Format = (typeof formats)[number]

export type Output = {
  format: Format
  file?: string
  delimiter: string
  quote: string
  encoding: "utf-8" | "cp1251"
  bom: boolean
  decimal: "." | ","
  dateFormat: string
  newline: "\n" | "\r\n"
  header: boolean
  sheet: string
}

type Trend = { date: string; slope: number }
type Season = { date: string; amplitude: number; period: number }

export type Column =
  | { name: string; type: "sequence"; start: number; step: number; prefix: string; width: number }
  | {
      name: string
      type: "int" | "float" | "decimal"
      scale?: number
      min: number
      max: number
      distribution: Distribution
      mean: number
      sd: number
      lambda: number
      mu: number
      sigma: number
      trend?: Trend
      season?: Season
    }
  | { name: string; type: "string"; length: number; pattern: string }
  | { name: string; type: "category"; values: string[]; weights: number[] }
  | { name: string; type: "date" | "datetime"; from: string; to: string; format: string }
  | { name: string; type: "bool"; probability: number }
  | { name: string; type: "dictionary" | "text"; dictionary: "fio" | "cities" | "products" | "organizations" | "text" }
  | { name: string; type: "ref"; table: string; column: string; distribution: "uniform" | "zipf"; zipf: number; unique: boolean }
  | { name: string; type: "lookup"; table: string; column: string; match: string }
  | { name: string; type: "expr"; expr: string }

export type When = { column: string; equals?: string; above?: number }

export type Defect =
  | { table: string; column: string; kind: "missing"; rate: number; as: "null" | "empty" | "sentinel"; sentinel: string; mechanism: "mcar" | "depends" | "block"; when?: When; length: number }
  | { table: string; column: string; kind: "outlier"; rate: number; method: "multiplier" | "zscore" | "iqr"; factor: number; direction: "high" | "low" | "both"; force?: "negative" | "zero" }
  | { table: string; column: string; kind: "noise"; rate: number; noise: "gaussian" | "typo" | "case" | "spaces" | "date_format" | "decimal" | "synonym"; sd?: number; synonyms: Record<string, string[]> }
  | { table: string; kind: "duplicate"; rate: number; mode: "exact" | "fuzzy" }
  | { table: string; column: string; kind: "text_in_number"; rate: number; token: string }
  | { table: string; column: string; kind: "out_of_range"; rate: number; direction: "high" | "low" | "both" }
  | { table: string; column: string; kind: "orphan"; rate: number }
  | { table: string; column: string; kind: "inconsistent"; rate: number; factor: number }
  | { table: string; kind: "broken_row"; rate: number }

export type Table = {
  name: string
  rows: number
  columns: Column[]
  output: Output
  split?: { by: string; file: string }
}

export type Spec = { name: string; seed: number; tables: Table[]; defects: Defect[] }

export function folderName(value: string) {
  const cleaned = value.trim().replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 64)
  if (!folderPattern.test(cleaned)) return undefined
  return cleaned
}

export function parseSpec(value: unknown): { ok: true; spec: Spec } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const root = record(value)
  if (!root) return { ok: false, errors: ["Спецификация должна быть объектом JSON."] }
  const name = typeof root.name === "string" && root.name.trim() ? root.name.trim() : ""
  if (!name || name.length > 64 || name.includes("/") || name.includes("\\")) errors.push("Поле name: непустая строка до 64 символов без разделителей пути.")
  const seed = root.seed === undefined ? 1 : finite(root.seed)
  if (seed === undefined || seed < 0 || seed > 0xffffffff || !Number.isInteger(seed)) errors.push("Поле seed: целое от 0 до 4294967295.")
  const tablesValue = Array.isArray(root.tables) ? root.tables : undefined
  if (!tablesValue || tablesValue.length === 0 || tablesValue.length > LIMITS.tables) errors.push(`Поле tables: от 1 до ${LIMITS.tables} таблиц.`)
  const tables = (tablesValue ?? []).flatMap((item, index) => {
    const table = parseTable(item, index, errors)
    return table ? [table] : []
  })
  if (new Set(tables.map((table) => table.name)).size !== tables.length) errors.push("Имена таблиц должны быть уникальными.")
  const known = new Set(tables.map((table) => table.name))
  for (const table of tables) {
    for (const column of table.columns) {
      if ((column.type === "ref" || column.type === "lookup") && column.table === table.name)
        errors.push(`Таблица ${table.name}: колонка ${column.name} не может ссылаться на свою таблицу.`)
      if ((column.type === "ref" || column.type === "lookup") && !known.has(column.table))
        errors.push(`Таблица ${table.name}: ссылка на неизвестную таблицу ${column.table}.`)
      if (column.type === "ref" && column.unique && tables.find((item) => item.name === column.table) && table.rows > (tables.find((item) => item.name === column.table)?.rows ?? 0))
        errors.push(`Таблица ${table.name}: уникальная ссылка ${column.name} требует не больше строк, чем в ${column.table}.`)
      if ((column.type === "int" || column.type === "float" || column.type === "decimal") && (column.trend || column.season)) {
        const date = column.trend?.date ?? column.season?.date
        if (!table.columns.some((item) => item.name === date && (item.type === "date" || item.type === "datetime") && table.columns.indexOf(item) < table.columns.indexOf(column)))
          errors.push(`Таблица ${table.name}: тренд колонки ${column.name} ссылается на более раннюю колонку даты.`)
      }
    }
    if (table.split && !table.columns.some((column) => column.name === table.split?.by))
      errors.push(`Таблица ${table.name}: split.by указывает на неизвестную колонку.`)
  }
  if (cycle(tables)) errors.push("Ссылки между таблицами образуют цикл.")
  const total = tables.reduce((sum, table) => sum + table.rows, 0)
  if (total > LIMITS.totalRows) errors.push(`Суммарное число строк ${total} больше ${LIMITS.totalRows}.`)
  const defects = Array.isArray(root.defects) ? root.defects.flatMap((item, index) => parseDefect(item, index, tables, errors)) : []
  if (root.defects !== undefined && !Array.isArray(root.defects)) errors.push("Поле defects должно быть массивом.")
  if (errors.length || seed === undefined) return { ok: false, errors }
  return { ok: true, spec: { name, seed, tables: order(tables), defects } }
}

function parseTable(value: unknown, index: number, errors: string[]) {
  const root = record(value)
  if (!root) {
    errors.push(`Таблица ${index + 1} должна быть объектом.`)
    return
  }
  const name = typeof root.name === "string" ? root.name.trim() : ""
  if (!namePattern.test(name)) errors.push(`Таблица ${index + 1}: name должно начинаться с буквы и содержать только буквы, цифры, пробел и _.`)
  const rows = finite(root.rows)
  if (rows === undefined || !Number.isInteger(rows) || rows < 1 || rows > LIMITS.rows) errors.push(`Таблица ${name || index + 1}: rows — целое от 1 до ${LIMITS.rows}.`)
  const columnsValue = Array.isArray(root.columns) ? root.columns : undefined
  if (!columnsValue || columnsValue.length === 0 || columnsValue.length > LIMITS.columns) errors.push(`Таблица ${name || index + 1}: от 1 до ${LIMITS.columns} колонок.`)
  const columns = (columnsValue ?? []).flatMap((item, columnIndex) => {
    const column = parseColumn(item, name || String(index + 1), columnIndex, errors)
    return column ? [column] : []
  })
  if (new Set(columns.map((column) => column.name)).size !== columns.length) errors.push(`Таблица ${name}: имена колонок должны быть уникальными.`)
  for (const column of columns) {
    if (column.type !== "expr") continue
    const earlier = columns.slice(0, columns.indexOf(column)).map((item) => item.name)
    for (const ident of identifiers(column.expr)) {
      if (!earlier.includes(ident)) errors.push(`Таблица ${name}: выражение ${column.name} использует ещё не созданную колонку ${ident}.`)
    }
  }
  const output = parseOutput(root.output, name, errors)
  const splitRoot = record(root.split)
  const split = splitRoot && typeof splitRoot.by === "string" && typeof splitRoot.file === "string"
    ? { by: splitRoot.by, file: splitRoot.file }
    : undefined
  if (root.split !== undefined && !split) errors.push(`Таблица ${name}: split задаётся полями by и file.`)
  if (split && (split.file.includes("/") || split.file.includes("\\") || split.file.includes("..") || !split.file.includes("{value}")))
    errors.push(`Таблица ${name}: split.file — имя файла с шаблоном {value} без пути.`)
  if (!output || rows === undefined) return
  return { name, rows, columns, output, split }
}

function parseColumn(value: unknown, table: string, index: number, errors: string[]): Column | undefined {
  const root = record(value)
  const where = `Таблица ${table}, колонка ${index + 1}`
  if (!root) {
    errors.push(`${where} должна быть объектом.`)
    return
  }
  const name = typeof root.name === "string" ? root.name.trim() : ""
  if (!namePattern.test(name)) errors.push(`${where}: некорректное name.`)
  const type = root.type === "id" ? "sequence" : root.type
  if (type === "sequence") {
    const start = numberOr(root.start, 1)
    const step = numberOr(root.step, 1)
    const width = numberOr(root.width, 0)
    if (!Number.isInteger(start) || !Number.isInteger(step) || !Number.isInteger(width) || width < 0 || width > 12) errors.push(`${where}: sequence принимает целые start, step и width 0..12.`)
    return { name, type, start, step, prefix: typeof root.prefix === "string" ? root.prefix : "", width }
  }
  if (type === "int" || type === "float" || type === "decimal") return parseNumeric(root, name, type, where, errors)
  if (type === "string") {
    const length = numberOr(root.length, 8)
    if (!Number.isInteger(length) || length < 1 || length > 200) errors.push(`${where}: length строки от 1 до 200.`)
    return { name, type, length, pattern: typeof root.pattern === "string" ? root.pattern : "" }
  }
  if (type === "category") {
    const values = Array.isArray(root.values) ? root.values.filter((item): item is string => typeof item === "string" && item.length > 0) : []
    if (!values.length || values.length !== (Array.isArray(root.values) ? root.values.length : 0)) errors.push(`${where}: category требует непустой список строковых values.`)
    const weights = Array.isArray(root.weights) ? root.weights.map((item) => finite(item)) : values.map(() => 1)
    if (weights.some((item) => item === undefined || item < 0) || weights.length !== values.length) errors.push(`${where}: weights должны совпадать по длине с values и быть неотрицательными.`)
    return { name, type, values, weights: weights.map((item) => item ?? 1) }
  }
  if (type === "date" || type === "datetime") {
    const from = typeof root.from === "string" ? root.from : ""
    const to = typeof root.to === "string" ? root.to : ""
    if (!iso(from) || !iso(to) || from > to) errors.push(`${where}: date требует from и to в формате YYYY-MM-DD, from не позже to.`)
    return { name, type, from: from.slice(0, 10), to: to.slice(0, 10), format: typeof root.format === "string" ? root.format : type === "date" ? "YYYY-MM-DD" : "YYYY-MM-DD HH:mm:ss" }
  }
  if (type === "bool") {
    const probability = numberOr(root.probability, 0.5)
    if (probability < 0 || probability > 1) errors.push(`${where}: probability от 0 до 1.`)
    return { name, type, probability }
  }
  if (type === "dictionary" || type === "text") {
    const dictionary = type === "text" ? "text" : root.dictionary
    if (dictionary !== "fio" && dictionary !== "cities" && dictionary !== "products" && dictionary !== "organizations" && dictionary !== "text")
      errors.push(`${where}: dictionary — fio, cities, products или organizations.`)
    return { name, type, dictionary: dictionary === "fio" || dictionary === "cities" || dictionary === "products" || dictionary === "organizations" || dictionary === "text" ? dictionary : "text" }
  }
  if (type === "ref" || type === "lookup") {
    if (typeof root.table !== "string" || typeof root.column !== "string") errors.push(`${where}: ${type} требует table и column.`)
    if (type === "lookup" && typeof root.match !== "string") errors.push(`${where}: lookup требует match — колонку текущей строки.`)
    if (type === "lookup") return { name, type, table: String(root.table ?? ""), column: String(root.column ?? ""), match: String(root.match ?? "") }
    const distribution = root.distribution === "zipf" ? "zipf" : "uniform"
    return { name, type: "ref", table: String(root.table ?? ""), column: String(root.column ?? ""), distribution, zipf: numberOr(root.zipf, 1), unique: root.unique === true }
  }
  if (type === "expr") {
    if (typeof root.expr !== "string" || !root.expr.trim()) errors.push(`${where}: expr требует выражение.`)
    return { name, type, expr: String(root.expr ?? "") }
  }
  errors.push(`${where}: неизвестный type.`)
}

function parseNumeric(root: Record<string, unknown>, name: string, type: "int" | "float" | "decimal", where: string, errors: string[]): Column | undefined {
  const min = numberOr(root.min, 0)
  const max = numberOr(root.max, 100)
  if (min > max) errors.push(`${where}: min не может быть больше max.`)
  const distribution = distributions.find((item) => item === root.distribution) ?? "uniform"
  if (root.distribution !== undefined && !distributions.some((item) => item === root.distribution)) errors.push(`${where}: неизвестное distribution.`)
  const scale = type === "int" ? 0 : type === "decimal" ? numberOr(root.scale, 2) : undefined
  if (scale !== undefined && (!Number.isInteger(scale) || scale < 0 || scale > 8)) errors.push(`${where}: scale от 0 до 8.`)
  const trend = trendOf(root.trend, where, errors)
  const season = seasonOf(root.season, where, errors)
  return { name, type, scale, min, max, distribution, mean: numberOr(root.mean, (min + max) / 2), sd: numberOr(root.sd, (max - min) / 6 || 1), lambda: numberOr(root.lambda, 1), mu: numberOr(root.mu, 0), sigma: numberOr(root.sigma, 0.5), trend, season }
}

function parseOutput(value: unknown, table: string, errors: string[]): Output | undefined {
  const root = record(value) ?? {}
  if (value !== undefined && !record(value)) errors.push(`Таблица ${table}: output должен быть объектом.`)
  const format = formats.find((item) => item === root.format) ?? "csv"
  if (root.format !== undefined && !formats.some((item) => item === root.format)) errors.push(`Таблица ${table}: неизвестный format.`)
  const file = typeof root.file === "string" ? root.file : undefined
  if (file && (file.includes("/") || file.includes("\\") || file.includes(".."))) errors.push(`Таблица ${table}: output.file — имя файла без пути.`)
  const delimiter = typeof root.delimiter === "string" ? root.delimiter : format === "tsv" ? "\t" : format === "txt" ? ";" : ","
  if (delimiter.length !== 1) errors.push(`Таблица ${table}: delimiter — один символ.`)
  const quote = typeof root.quote === "string" ? root.quote : "\""
  if (quote.length !== 1) errors.push(`Таблица ${table}: quote — один символ.`)
  const encoding = root.encoding === "cp1251" ? "cp1251" : "utf-8"
  if (root.encoding !== undefined && root.encoding !== "utf-8" && root.encoding !== "cp1251") errors.push(`Таблица ${table}: encoding — utf-8 или cp1251.`)
  const decimal = root.decimal === "," ? "," : "."
  if (root.decimal !== undefined && root.decimal !== "." && root.decimal !== ",") errors.push(`Таблица ${table}: decimal — точка или запятая.`)
  const newline = root.newline === "crlf" ? "\r\n" : "\n"
  if (root.newline !== undefined && root.newline !== "lf" && root.newline !== "crlf") errors.push(`Таблица ${table}: newline — lf или crlf.`)
  return { format, file, delimiter, quote, encoding, bom: root.bom === true, decimal, dateFormat: typeof root.dateFormat === "string" ? root.dateFormat : "YYYY-MM-DD", newline, header: root.header !== false, sheet: typeof root.sheet === "string" && root.sheet.trim() ? root.sheet.trim() : table }
}

function parseDefect(value: unknown, index: number, tables: Table[], errors: string[]): Defect[] {
  const root = record(value)
  const where = `Дефект ${index + 1}`
  if (!root || typeof root.kind !== "string" || typeof root.table !== "string") {
    errors.push(`${where}: нужны kind и table.`)
    return []
  }
  const table = tables.find((item) => item.name === root.table)
  if (!table) errors.push(`${where}: неизвестная таблица ${root.table}.`)
  const rate = finite(root.rate)
  if (rate === undefined || rate < 0 || rate > 1) errors.push(`${where}: rate от 0 до 1.`)
  const column = typeof root.column === "string" ? table?.columns.find((item) => item.name === root.column) : undefined
  if (typeof root.column === "string" && !column) errors.push(`${where}: неизвестная колонка ${root.column}.`)
  const safeRate = rate ?? 0
  if (root.kind === "duplicate") return [{ table: root.table, kind: "duplicate", rate: safeRate, mode: root.mode === "fuzzy" ? "fuzzy" : "exact" }]
  if (root.kind === "broken_row") {
    if (table && !["csv", "tsv", "txt"].includes(table.output.format)) errors.push(`${where}: broken_row поддерживается для csv, tsv и txt.`)
    return [{ table: root.table, kind: "broken_row", rate: safeRate }]
  }
  if (!column || typeof root.column !== "string") {
    errors.push(`${where}: колонка обязательна для ${root.kind}.`)
    return []
  }
  if (root.kind === "missing") {
    const as = root.as === "empty" || root.as === "sentinel" ? root.as : "null"
    const mechanism = root.mechanism === "depends" || root.mechanism === "block" ? root.mechanism : "mcar"
    const when = whenOf(root.when, table, where, errors)
    if (mechanism === "depends" && !when) errors.push(`${where}: depends требует when.`)
    const length = numberOr(root.length, 3)
    return [{ table: root.table, column: column.name, kind: "missing", rate: safeRate, as, sentinel: typeof root.sentinel === "string" ? root.sentinel : defaultSentinel(column), mechanism, when, length: Number.isInteger(length) && length > 0 && length <= 1000 ? length : 3 }]
  }
  if (root.kind === "outlier") {
    if (!numericLike(column)) errors.push(`${where}: outlier применяется к числовой колонке.`)
    const method = root.method === "zscore" || root.method === "iqr" ? root.method : "multiplier"
    const direction = root.direction === "low" || root.direction === "both" ? root.direction : "high"
    const force = root.force === "negative" || root.force === "zero" ? root.force : undefined
    return [{ table: root.table, column: column.name, kind: "outlier", rate: safeRate, method, factor: numberOr(root.factor, method === "multiplier" ? 20 : method === "zscore" ? 6 : 3), direction, force }]
  }
  if (root.kind === "noise") return [parseNoise(root, root.table, column, safeRate, where, errors)]
  if (root.kind === "text_in_number") {
    if (!numericLike(column)) errors.push(`${where}: text_in_number применяется к числовой колонке.`)
    return [{ table: root.table, column: column.name, kind: "text_in_number", rate: safeRate, token: typeof root.token === "string" ? root.token : "н/д" }]
  }
  if (root.kind === "out_of_range") {
    if (!numeric(column)) errors.push(`${where}: out_of_range применяется к числовой колонке.`)
    return [{ table: root.table, column: column.name, kind: "out_of_range", rate: safeRate, direction: root.direction === "low" || root.direction === "both" ? root.direction : "high" }]
  }
  if (root.kind === "orphan") {
    if (column.type !== "ref" && column.type !== "lookup") errors.push(`${where}: orphan применяется к ref или lookup.`)
    return [{ table: root.table, column: column.name, kind: "orphan", rate: safeRate }]
  }
  if (root.kind === "inconsistent") {
    if (column.type !== "expr") errors.push(`${where}: inconsistent применяется к expr.`)
    return [{ table: root.table, column: column.name, kind: "inconsistent", rate: safeRate, factor: numberOr(root.factor, 3) }]
  }
  errors.push(`${where}: неизвестный kind.`)
  return []
}

function parseNoise(root: Record<string, unknown>, table: string, column: Column, rate: number, where: string, errors: string[]): Defect {
  const noises = ["gaussian", "typo", "case", "spaces", "date_format", "decimal", "synonym"] as const
  const noise = noises.find((item) => item === root.noise) ?? "typo"
  if (root.noise !== undefined && !noises.some((item) => item === root.noise)) errors.push(`${where}: неизвестный noise.`)
  if (noise === "gaussian" && !numericLike(column)) errors.push(`${where}: gaussian применяется к числу.`)
  if (noise === "decimal" && !numericLike(column)) errors.push(`${where}: decimal применяется к числу.`)
  if (noise === "date_format" && column.type !== "date" && column.type !== "datetime") errors.push(`${where}: date_format применяется к дате.`)
  if ((noise === "typo" || noise === "case" || noise === "spaces" || noise === "synonym") && numeric(column)) errors.push(`${where}: ${noise} применяется к тексту.`)
  const synonyms = record(root.synonyms) ?? {}
  const lists = Object.fromEntries(Object.entries(synonyms).flatMap(([key, item]) => Array.isArray(item) && item.every((value) => typeof value === "string") ? [[key, item]] : []))
  if (noise === "synonym" && !Object.keys(lists).length) errors.push(`${where}: synonym требует synonyms.`)
  return { table, column: column.name, kind: "noise", rate, noise, sd: finite(root.sd), synonyms: lists }
}

function whenOf(value: unknown, table: Table | undefined, where: string, errors: string[]) {
  if (value === undefined) return
  const root = record(value)
  if (!root || typeof root.column !== "string" || !table?.columns.some((column) => column.name === root.column)) {
    errors.push(`${where}: when.column не найдена.`)
    return
  }
  if (root.equals === undefined && finite(root.above) === undefined) errors.push(`${where}: when требует equals или above.`)
  return { column: root.column, equals: typeof root.equals === "string" ? root.equals : undefined, above: finite(root.above) }
}

function trendOf(value: unknown, where: string, errors: string[]) {
  if (value === undefined) return
  const root = record(value)
  if (!root || typeof root.date !== "string" || finite(root.slope) === undefined) errors.push(`${where}: trend требует date и slope.`)
  if (!root || typeof root.date !== "string") return
  return { date: root.date, slope: finite(root.slope) ?? 0 }
}

function seasonOf(value: unknown, where: string, errors: string[]) {
  if (value === undefined) return
  const root = record(value)
  const period = root ? finite(root.period) : undefined
  if (!root || typeof root.date !== "string" || finite(root.amplitude) === undefined || period === undefined || period <= 0) errors.push(`${where}: season требует date, amplitude и period > 0.`)
  if (!root || typeof root.date !== "string") return
  return { date: root.date, amplitude: finite(root.amplitude) ?? 0, period: period ?? 365 }
}

function order(tables: Table[]) {
  const pending = [...tables]
  const ordered: Table[] = []
  while (pending.length) {
    const index = pending.findIndex((table) => table.columns.every((column) => column.type !== "ref" && column.type !== "lookup" || ordered.some((item) => item.name === column.table)))
    if (index < 0) return tables
    const [table] = pending.splice(index, 1)
    if (table) ordered.push(table)
  }
  return ordered
}

function cycle(tables: Table[]) {
  const names = new Set(tables.map((table) => table.name))
  const deps = new Map(tables.map((table) => [table.name, new Set(table.columns.flatMap((column) => column.type === "ref" || column.type === "lookup" ? [column.table] : []).filter((name) => names.has(name) && name !== table.name))]))
  const pending = [...tables]
  const done = new Set<string>()
  while (pending.length) {
    const index = pending.findIndex((table) => [...(deps.get(table.name) ?? [])].every((name) => done.has(name)))
    if (index < 0) return true
    const [table] = pending.splice(index, 1)
    if (table) done.add(table.name)
  }
  return false
}

function numeric(column: Column) {
  return column.type === "int" || column.type === "float" || column.type === "decimal"
}

function numericLike(column: Column) {
  return numeric(column) || column.type === "expr"
}

function identifiers(expr: string) {
  const names: string[] = []
  for (const match of expr.matchAll(/\{([^}]+)\}|(?<![\p{L}\p{N}_])(\p{L}[\p{L}\p{N}_]*)/gu)) names.push(match[1] ?? match[2] ?? "")
  return names.filter((name) => name && !/^\d/.test(name))
}

function defaultSentinel(column: Column) {
  if (column.type === "date" || column.type === "datetime") return "1900-01-01"
  if (numeric(column)) return "-999"
  return "N/A"
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return
  return value as Record<string, unknown>
}

function finite(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return
  return value
}

function numberOr(value: unknown, fallback: number) {
  return finite(value) ?? fallback
}

function iso(value: string) {
  return /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value.slice(0, 10) + "T00:00:00Z"))
}
