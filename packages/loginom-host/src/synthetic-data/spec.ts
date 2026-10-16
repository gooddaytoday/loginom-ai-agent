export const LIMITS = { tables: 40, columns: 80, rows: 100_000, totalRows: 200_000, files: 200, tuples: 5000, rules: 50, groupSize: 1000, series: 500 }

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
type ColumnFlags = { optional?: number; hidden?: boolean; limits?: { min?: number; max?: number } }

export type LinkLevel = { values?: string[]; count?: number; prefix?: string; fanout: number; share: number }
export type Link = { name: string; columns: string[]; rows?: string[][]; generate?: LinkLevel[]; distribution: "uniform" | "zipf"; zipf: number; weights?: number[] }
export type Groups = { keys: string[]; shared: string[]; size: { min: number; max: number }; sortBy: string[] }
export type SeriesSpec = { by: string[]; date: string; step: "day"; weekdays: "all" | "mon-fri" }
export type Condition = { column: string; in?: string[]; notIn?: string[]; empty?: boolean; notEmpty?: boolean }
export type Rule =
  | { name: string; severity: "strict" | "soft"; never: Condition[] }
  | { name: string; severity: "strict" | "soft"; compare: { left: string; op: "<" | "<=" | "=" | ">=" | ">"; right: string } }
export type Realism = { oneDefectPerCell: boolean; maxDefectsPerRow: number; respectLimits: boolean }

export type Column = ColumnFlags & (
  | { name: string; type: "sequence"; start: number; step: number; prefix: string; width: number; per?: string[]; unit?: "group" | "row" }
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
  | { name: string; type: "expr"; expr: string; scale?: number }
  | { name: string; type: "linked"; link: string; field?: string }
  | { name: string; type: "offset"; from: string; unit: "minutes" | "hours" | "days"; min: number; max: number; distribution: "uniform" | "lognormal"; cumulative: boolean }
  | { name: string; type: "walk"; model: "gbm" | "arithmetic" | "ar1"; start: number | { min: number; max: number }; drift: number; volatility: number; floor?: number; mean?: number; speed?: number; scale: number }
)

export type When = { column: string; equals?: string; above?: number; in?: string[] }

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
  | { table: string; kind: "rule_violation"; rate: number; rule: string }
  | { table: string; kind: "drop"; rate: number }

export type Table = {
  name: string
  rows: number
  columns: Column[]
  output: Output
  split?: { by: string; file: string }
  links: Link[]
  rules: Rule[]
  groups?: Groups
  series?: SeriesSpec
  enumerate?: string
}

export type Spec = { name: string; seed: number; tables: Table[]; defects: Defect[]; realism?: Realism; entities: Link[] }

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
    validateStructure(table, errors)
  }
  const entities = parseEntities(root.entities, errors)
  resolveEnumerate(tables, entities, errors)
  validateEntities(tables, entities, errors)
  if (cycle(tables)) errors.push("Ссылки между таблицами образуют цикл.")
  const total = tables.reduce((sum, table) => sum + table.rows, 0)
  if (total > LIMITS.totalRows) errors.push(`Суммарное число строк ${total} больше ${LIMITS.totalRows}.`)
  const defects = Array.isArray(root.defects) ? root.defects.flatMap((item, index) => parseDefect(item, index, tables, entities, errors)) : []
  if (root.defects !== undefined && !Array.isArray(root.defects)) errors.push("Поле defects должно быть массивом.")
  const realism = parseRealism(root.realism, errors)
  if (errors.length || seed === undefined) return { ok: false, errors }
  return { ok: true, spec: { name, seed, tables: order(tables), defects, realism, entities } }
}

function parseTable(value: unknown, index: number, errors: string[]) {
  const root = record(value)
  if (!root) {
    errors.push(`Таблица ${index + 1} должна быть объектом.`)
    return
  }
  const name = typeof root.name === "string" ? root.name.trim() : ""
  if (!namePattern.test(name)) errors.push(`Таблица ${index + 1}: name должно начинаться с буквы и содержать только буквы, цифры, пробел и _.`)
  const rowsValue = root.rows === undefined ? undefined : finite(root.rows)
  if (root.rows !== undefined && (rowsValue === undefined || !Number.isInteger(rowsValue) || rowsValue < 1 || rowsValue > LIMITS.rows))
    errors.push(`Таблица ${name || index + 1}: rows — целое от 1 до ${LIMITS.rows}.`)
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
  const links = parseLinks(root.links, name, columns, errors)
  const groups = parseGroups(root.groups, name, columns, errors)
  const series = parseSeries(root.series, name, columns, errors)
  const rules = parseRules(root.rules, name, columns, errors)
  const enumerate = typeof root.enumerate === "string" ? root.enumerate.trim() : undefined
  if (root.enumerate !== undefined && !enumerate) errors.push(`Таблица ${name}: enumerate — имя сущности.`)
  const counted = series ? seriesRows(series, columns) : rowsValue
  if (series && rowsValue !== undefined && counted !== undefined && rowsValue !== counted)
    errors.push(`Таблица ${name}: rows должно совпасть с сеткой ряда (${counted}).`)
  const pending = Boolean(enumerate) && rowsValue === undefined && !series
  if (!series && rowsValue === undefined && !pending) errors.push(`Таблица ${name || index + 1}: rows — целое от 1 до ${LIMITS.rows}.`)
  const rows = counted ?? (pending ? 0 : undefined)
  if (!output || rows === undefined || !Number.isInteger(rows) || rows < 0 || rows > LIMITS.rows || (rows < 1 && !pending)) return
  return { name, rows, columns, output, split, links, rules, groups, series, enumerate }
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
    const per = Array.isArray(root.per) ? root.per.filter((item): item is string => typeof item === "string") : undefined
    const unit = root.unit === "row" ? "row" : root.unit === "group" ? "group" : undefined
    if (per && !unit) errors.push(`${where}: sequence с per требует unit group или row.`)
    return applyFlags({ name, type, start, step, prefix: typeof root.prefix === "string" ? root.prefix : "", width, per, unit }, root, where, errors)
  }
  if (type === "int" || type === "float" || type === "decimal") {
    const column = parseNumeric(root, name, type, where, errors)
    return column ? applyFlags(column, root, where, errors) : undefined
  }
  if (type === "string") {
    const length = numberOr(root.length, 8)
    if (!Number.isInteger(length) || length < 1 || length > 200) errors.push(`${where}: length строки от 1 до 200.`)
    return applyFlags({ name, type, length, pattern: typeof root.pattern === "string" ? root.pattern : "" }, root, where, errors)
  }
  if (type === "category") {
    const values = Array.isArray(root.values) ? root.values.filter((item): item is string => typeof item === "string" && item.length > 0) : []
    if (!values.length || values.length !== (Array.isArray(root.values) ? root.values.length : 0)) errors.push(`${where}: category требует непустой список строковых values.`)
    const weights = Array.isArray(root.weights) ? root.weights.map((item) => finite(item)) : values.map(() => 1)
    if (weights.some((item) => item === undefined || item < 0) || weights.length !== values.length) errors.push(`${where}: weights должны совпадать по длине с values и быть неотрицательными.`)
    return applyFlags({ name, type, values, weights: weights.map((item) => item ?? 1) }, root, where, errors)
  }
  if (type === "date" || type === "datetime") {
    const from = typeof root.from === "string" ? root.from : ""
    const to = typeof root.to === "string" ? root.to : ""
    if (!iso(from) || !iso(to) || from > to) errors.push(`${where}: date требует from и to в формате YYYY-MM-DD, from не позже to.`)
    return applyFlags({ name, type, from: from.slice(0, 10), to: to.slice(0, 10), format: typeof root.format === "string" ? root.format : type === "date" ? "YYYY-MM-DD" : "YYYY-MM-DD HH:mm:ss" }, root, where, errors)
  }
  if (type === "bool") {
    const probability = numberOr(root.probability, 0.5)
    if (probability < 0 || probability > 1) errors.push(`${where}: probability от 0 до 1.`)
    return applyFlags({ name, type, probability }, root, where, errors)
  }
  if (type === "dictionary" || type === "text") {
    const dictionary = type === "text" ? "text" : root.dictionary
    if (dictionary !== "fio" && dictionary !== "cities" && dictionary !== "products" && dictionary !== "organizations" && dictionary !== "text")
      errors.push(`${where}: dictionary — fio, cities, products или organizations.`)
    return applyFlags({ name, type, dictionary: dictionary === "fio" || dictionary === "cities" || dictionary === "products" || dictionary === "organizations" || dictionary === "text" ? dictionary : "text" }, root, where, errors)
  }
  if (type === "ref" || type === "lookup") {
    if (typeof root.table !== "string" || typeof root.column !== "string") errors.push(`${where}: ${type} требует table и column.`)
    if (type === "lookup" && typeof root.match !== "string") errors.push(`${where}: lookup требует match — колонку текущей строки.`)
    if (type === "lookup") return applyFlags({ name, type, table: String(root.table ?? ""), column: String(root.column ?? ""), match: String(root.match ?? "") }, root, where, errors)
    const distribution = root.distribution === "zipf" ? "zipf" : "uniform"
    return applyFlags({ name, type: "ref", table: String(root.table ?? ""), column: String(root.column ?? ""), distribution, zipf: numberOr(root.zipf, 1), unique: root.unique === true }, root, where, errors)
  }
  if (type === "expr") {
    if (typeof root.expr !== "string" || !root.expr.trim()) errors.push(`${where}: expr требует выражение.`)
    const scale = root.scale === undefined ? undefined : numberOr(root.scale, 2)
    if (scale !== undefined && (!Number.isInteger(scale) || scale < 0 || scale > 8)) errors.push(`${where}: scale от 0 до 8.`)
    return applyFlags({ name, type, expr: String(root.expr ?? ""), scale }, root, where, errors)
  }
  if (type === "linked") {
    if (typeof root.link !== "string" || !root.link.trim()) errors.push(`${where}: linked требует link.`)
    const field = typeof root.field === "string" && root.field.trim() ? root.field.trim() : undefined
    return applyFlags({ name, type, link: String(root.link ?? ""), field }, root, where, errors)
  }
  if (type === "offset") {
    const unit = root.unit === "hours" || root.unit === "days" ? root.unit : "minutes"
    if (root.unit !== undefined && root.unit !== "minutes" && root.unit !== "hours" && root.unit !== "days") errors.push(`${where}: unit — minutes, hours или days.`)
    const distribution = root.distribution === "lognormal" ? "lognormal" : "uniform"
    return applyFlags({ name, type, from: typeof root.from === "string" ? root.from : "", unit, min: numberOr(root.min, 0), max: numberOr(root.max, 1), distribution, cumulative: root.cumulative === true }, root, where, errors)
  }
  if (type === "walk") {
    const model = root.model === "arithmetic" || root.model === "ar1" ? root.model : "gbm"
    if (root.model !== undefined && root.model !== "gbm" && root.model !== "arithmetic" && root.model !== "ar1") errors.push(`${where}: model — gbm, arithmetic или ar1.`)
    const startRoot = record(root.start)
    const start = startRoot ? { min: numberOr(startRoot.min, 1), max: numberOr(startRoot.max, 100) } : numberOr(root.start, 100)
    const scale = numberOr(root.scale, 2)
    if (!Number.isInteger(scale) || scale < 0 || scale > 8) errors.push(`${where}: scale от 0 до 8.`)
    return applyFlags({ name, type, model, start, drift: numberOr(root.drift, 0), volatility: numberOr(root.volatility, 0.01), floor: finite(root.floor), mean: finite(root.mean), speed: finite(root.speed), scale }, root, where, errors)
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

function parseDefect(value: unknown, index: number, tables: Table[], entities: Link[], errors: string[]): Defect[] {
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
  if (root.kind === "rule_violation") {
    if (typeof root.rule !== "string" || !table?.rules.some((rule) => rule.name === root.rule)) errors.push(`${where}: rule_violation требует имя мягкого правила.`)
    if (table?.rules.some((rule) => rule.name === root.rule && rule.severity !== "soft")) errors.push(`${where}: rule_violation применяется только к правилу severity soft.`)
    return [{ table: root.table, kind: "rule_violation", rate: safeRate, rule: typeof root.rule === "string" ? root.rule : "" }]
  }
  if (root.kind === "drop") return [{ table: root.table, kind: "drop", rate: safeRate }]
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
    const entity = entities.find((item) => column?.type === "linked" && item.name === column.link)
    const key = entity?.columns[0] === (column?.type === "linked" ? column.field ?? column.name : "")
    if (column?.type !== "ref" && column?.type !== "lookup" && !key) errors.push(`${where}: orphan применяется к ref, lookup или ключу сущности.`)
    return [{ table: root.table, column: column?.name ?? "", kind: "orphan", rate: safeRate }]
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
  const listed = Array.isArray(root.in) ? root.in.filter((item): item is string => typeof item === "string") : undefined
  if (root.equals === undefined && finite(root.above) === undefined && !listed?.length) errors.push(`${where}: when требует equals, above или in.`)
  return { column: root.column, equals: typeof root.equals === "string" ? root.equals : undefined, above: finite(root.above), in: listed }
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

function validateStructure(table: Table, errors: string[]) {
  if (table.groups && table.series) errors.push(`Таблица ${table.name}: groups и series вместе не задаются.`)
  if (table.series && table.series.by.length > LIMITS.series) errors.push(`Таблица ${table.name}: не больше ${LIMITS.series} рядов.`)
  for (const link of table.links) {
    if (link.columns.some((name) => !table.columns.some((column) => column.name === name && column.type === "linked" && column.link === link.name)))
      errors.push(`Таблица ${table.name}: связь ${link.name} требует колонки linked в том же порядке.`)
  }
  for (const column of table.columns) {
    if (column.type === "linked") {
      const link = table.links.find((item) => item.name === column.link)
      const field = column.field ?? column.name
      if (link && !link.columns.includes(field)) errors.push(`Таблица ${table.name}: поле ${field} отсутствует в связи ${link.name}.`)
    }
    if (column.type === "sequence" && column.per?.some((name) => !table.columns.some((item) => item.name === name && !(item.type === "sequence" && item.per?.length))))
      errors.push(`Таблица ${table.name}: per колонки ${column.name} указывает на неизвестное поле.`)
    if (column.type === "offset") {
      const source = table.columns.find((item) => item.name === column.from)
      if (!source || (source.type !== "date" && source.type !== "datetime" && source.type !== "offset") || table.columns.indexOf(source) > table.columns.indexOf(column))
        errors.push(`Таблица ${table.name}: offset ${column.name} требует более раннюю дату ${column.from}.`)
    }
    if (column.type === "expr") {
      for (const ident of identifiers(column.expr)) {
        const source = table.columns.find((item) => item.name === ident)
        if (source?.type === "sequence" && source.per) errors.push(`Таблица ${table.name}: выражение не использует счётчик ${ident}.`)
      }
    }
  }
  for (const rule of table.rules) {
    const names = "never" in rule ? rule.never.map((item) => item.column) : [rule.compare.left, rule.compare.right]
    if (names.some((name) => !table.columns.some((column) => column.name === name)))
      errors.push(`Таблица ${table.name}: правило ${rule.name} ссылается на неизвестную колонку.`)
    if (names.some((name) => table.columns.some((column) => column.name === name && column.type === "sequence" && column.per)))
      errors.push(`Таблица ${table.name}: правило ${rule.name} не использует счётчик.`)
  }
  const anchor = table.groups?.shared ?? table.series?.by
  if (table.split && anchor && !anchor.includes(table.split.by))
    errors.push(`Таблица ${table.name}: split.by должен входить в общие поля группы или ключ ряда.`)
  if (table.enumerate && (table.groups || table.series)) errors.push(`Таблица ${table.name}: enumerate не сочетается с groups и series.`)
}

function parseEntities(value: unknown, errors: string[]) {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    errors.push("Поле entities должно быть массивом.")
    return []
  }
  return parseLinkList(value, "Сущность", errors)
}

function resolveEnumerate(tables: Table[], entities: Link[], errors: string[]) {
  for (const table of tables) {
    if (!table.enumerate) continue
    const entity = entities.find((item) => item.name === table.enumerate)
    if (!entity) {
      errors.push(`Таблица ${table.name}: неизвестная сущность ${table.enumerate}.`)
      continue
    }
    const known = entity.rows?.length
    if (!known) continue
    if (table.rows !== 0 && table.rows !== known) errors.push(`Таблица ${table.name}: rows должно совпасть с числом элементов (${known}).`)
    table.rows = known
  }
}

function validateEntities(tables: Table[], entities: Link[], errors: string[]) {
  if (new Set(entities.map((entity) => entity.name)).size !== entities.length) errors.push("Имена сущностей должны быть уникальными.")
  for (const entity of entities) {
    const key = entity.columns[0] ?? ""
    const keys = entity.rows?.map((row) => row[0] ?? "")
    if (keys && new Set(keys).size !== keys.length) errors.push(`Сущность ${entity.name}: ключ ${key} повторяется.`)
    for (const table of tables) {
      if (table.links.some((link) => link.name === entity.name)) errors.push(`Сущность ${entity.name} совпадает со связью таблицы ${table.name}.`)
      const used = table.columns.filter((column) => column.type === "linked" && column.link === entity.name)
      if (!used.length) continue
      if (!used.some((column) => column.type === "linked" && (column.field ?? column.name) === key))
        errors.push(`Таблица ${table.name}: сущность ${entity.name} требует ключевое поле ${key}.`)
      for (const column of used) {
        if (column.type !== "linked") continue
        const field = column.field ?? column.name
        if (!entity.columns.includes(field)) errors.push(`Таблица ${table.name}: поле ${field} отсутствует в сущности ${entity.name}.`)
      }
    }
  }
  for (const table of tables) {
    for (const column of table.columns) {
      if (column.type === "linked" && !table.links.some((link) => link.name === column.link) && !entities.some((entity) => entity.name === column.link))
        errors.push(`Таблица ${table.name}: колонка ${column.name} ссылается на неизвестную связь.`)
      if (column.type !== "ref") continue
      const parent = tables.find((item) => item.name === column.table)
      if (!parent) continue
      for (const attr of parent.columns) {
        if (attr.name === column.column) continue
        const local = table.columns.find((item) => item.name === attr.name)
        if (!local || local.type === "lookup" || local.type === "linked" || local.type === "ref") continue
        errors.push(`Таблица ${table.name}: колонка ${local.name} повторяет атрибут ${parent.name}.${attr.name}. Используйте lookup, linked или другое имя.`)
      }
    }
  }
}

function parseLinks(value: unknown, table: string, columns: Column[], errors: string[]): Link[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    errors.push(`Таблица ${table}: links должен быть массивом.`)
    return []
  }
  void columns
  return parseLinkList(value, `Таблица ${table}, связь`, errors)
}

function parseLinkList(value: unknown[], wherePrefix: string, errors: string[]): Link[] {
  return value.flatMap((item, index) => {
    const root = record(item)
    const where = `${wherePrefix} ${index + 1}`
    if (!root || typeof root.name !== "string") {
      errors.push(`${where} требует name.`)
      return []
    }
    const names = Array.isArray(root.columns) ? root.columns.filter((column): column is string => typeof column === "string") : []
    if (names.length < 2) errors.push(`${where}: columns — не меньше двух колонок.`)
    const rows = Array.isArray(root.rows) ? root.rows.flatMap((row) => Array.isArray(row) && row.length === names.length && row.every((cell) => typeof cell === "string") ? [row] : []) : undefined
    if (Array.isArray(root.rows) && rows?.length !== root.rows.length) errors.push(`${where}: каждая строка rows должна совпасть с columns.`)
    if (rows && rows.length > LIMITS.tuples) errors.push(`${where}: не больше ${LIMITS.tuples} кортежей.`)
    const generate = Array.isArray(root.generate) ? root.generate.flatMap((level) => parseLevel(level, where, errors)) : undefined
    if (!rows?.length && !generate?.length) errors.push(`${where}: нужны rows или generate.`)
    const weights = Array.isArray(root.weights) ? root.weights.map((weight) => finite(weight)) : undefined
    if (weights && (weights.some((weight) => weight === undefined || weight < 0) || weights.length !== rows?.length)) errors.push(`${where}: weights совпадают с rows.`)
    const distribution = root.distribution === "zipf" ? "zipf" : "uniform"
    const ready = weights?.every((weight) => weight !== undefined) ? weights.flatMap((weight) => weight === undefined ? [] : [weight]) : undefined
    return [{ name: root.name, columns: names, rows, generate, distribution, zipf: numberOr(root.zipf, 1), weights: ready }]
  })
}

function parseLevel(value: unknown, where: string, errors: string[]): LinkLevel[] {
  const root = record(value)
  if (!root) {
    errors.push(`${where}: уровень generate должен быть объектом.`)
    return []
  }
  const values = Array.isArray(root.values) ? root.values.filter((item): item is string => typeof item === "string" && item.length > 0) : undefined
  const count = finite(root.count)
  if (!values?.length && (count === undefined || !Number.isInteger(count) || count < 1)) errors.push(`${where}: уровень требует values или count.`)
  return [{ values, count: count === undefined ? undefined : count, prefix: typeof root.prefix === "string" ? root.prefix : "", fanout: Math.max(1, Math.trunc(numberOr(root.fanout, 1))), share: Math.min(1, Math.max(0, numberOr(root.share, 0))) }]
}

function parseGroups(value: unknown, table: string, columns: Column[], errors: string[]) {
  if (value === undefined) return
  const root = record(value)
  if (!root) {
    errors.push(`Таблица ${table}: groups должен быть объектом.`)
    return
  }
  const keys = stringList(root.keys)
  const shared = stringList(root.shared)
  const sortBy = stringList(root.sortBy)
  const size = record(root.size)
  const min = size ? finite(size.min) : undefined
  const max = size ? finite(size.max) : undefined
  if (!shared.length || min === undefined || max === undefined || !Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min || max > LIMITS.groupSize)
    errors.push(`Таблица ${table}: groups.size — целые min..max от 1 до ${LIMITS.groupSize}, shared не пуст.`)
  for (const name of [...keys, ...shared, ...sortBy]) {
    if (!columns.some((column) => column.name === name)) errors.push(`Таблица ${table}: groups ссылается на неизвестную колонку ${name}.`)
  }
  return { keys, shared, size: { min: min ?? 1, max: max ?? 1 }, sortBy }
}

function parseSeries(value: unknown, table: string, columns: Column[], errors: string[]) {
  if (value === undefined) return
  const root = record(value)
  if (!root || !Array.isArray(root.by) || typeof root.date !== "string") {
    errors.push(`Таблица ${table}: series требует by и date.`)
    return
  }
  const by = root.by.filter((item): item is string => typeof item === "string")
  const date = columns.find((column) => column.name === root.date)
  if (!date || (date.type !== "date" && date.type !== "datetime")) errors.push(`Таблица ${table}: series.date — колонка date или datetime.`)
  for (const name of by) {
    const column = columns.find((item) => item.name === name)
    if (!column || column.type !== "category") errors.push(`Таблица ${table}: ключ ряда ${name} должен быть category.`)
  }
  const weekdays = root.weekdays === "mon-fri" ? "mon-fri" as const : "all" as const
  if (root.step !== undefined && root.step !== "day") errors.push(`Таблица ${table}: series.step пока поддерживает day.`)
  return { by, date: root.date, step: "day" as const, weekdays }
}

function seriesRows(series: SeriesSpec, columns: Column[]) {
  const date = columns.find((column) => column.name === series.date && (column.type === "date" || column.type === "datetime"))
  if (!date || (date.type !== "date" && date.type !== "datetime")) return
  const lists = series.by.map((name) => {
    const column = columns.find((item) => item.name === name && item.type === "category")
    return column && column.type === "category" ? column.values.length : 0
  })
  if (lists.some((count) => count === 0)) return
  const days = periodsBetween(date.from, date.to, series.weekdays)
  const rows = days * lists.reduce((product, count) => product * count, 1)
  return rows
}

function periodsBetween(from: string, to: string, weekdays: SeriesSpec["weekdays"]) {
  let count = 0
  let cursor = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  while (cursor <= end && count < LIMITS.rows) {
    const day = new Date(cursor).getUTCDay()
    if (weekdays === "all" || (day !== 0 && day !== 6)) count += 1
    cursor += 86_400_000
  }
  return count
}

function parseRules(value: unknown, table: string, columns: Column[], errors: string[]): Rule[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    errors.push(`Таблица ${table}: rules должен быть массивом.`)
    return []
  }
  if (value.length > LIMITS.rules) errors.push(`Таблица ${table}: не больше ${LIMITS.rules} правил.`)
  return value.flatMap((item, index): Rule[] => {
    const root = record(item)
    const where = `Таблица ${table}, правило ${index + 1}`
    if (!root || typeof root.name !== "string") {
      errors.push(`${where} требует name.`)
      return []
    }
    const severity = root.severity === "soft" ? "soft" : "strict"
    if (Array.isArray(root.never)) {
      const never = root.never.flatMap((condition) => parseCondition(condition, where, columns, errors))
      if (never.length < 2) errors.push(`${where}: never содержит два условия.`)
      return [{ name: root.name, severity, never }]
    }
    const compare = record(root.compare)
    const op = compare?.op
    if (!compare || typeof compare.left !== "string" || typeof compare.right !== "string" || (op !== "<" && op !== "<=" && op !== "=" && op !== ">=" && op !== ">")) {
      errors.push(`${where}: нужно never или compare с left, op и right.`)
      return []
    }
    return [{ name: root.name, severity, compare: { left: compare.left, op, right: compare.right } }]
  })
}

function parseCondition(value: unknown, where: string, columns: Column[], errors: string[]): Condition[] {
  const root = record(value)
  if (!root || typeof root.column !== "string" || !columns.some((column) => column.name === root.column)) {
    errors.push(`${where}: условие ссылается на неизвестную колонку.`)
    return []
  }
  const listed = (key: string) => Array.isArray(root[key]) ? root[key].filter((item): item is string => typeof item === "string") : undefined
  const condition = { column: root.column, in: listed("in"), notIn: listed("notIn"), empty: root.empty === true ? true : undefined, notEmpty: root.notEmpty === true ? true : undefined }
  if (!condition.in?.length && !condition.notIn?.length && !condition.empty && !condition.notEmpty) errors.push(`${where}: условие требует in, notIn, empty или notEmpty.`)
  return [condition]
}

function parseRealism(value: unknown, errors: string[]) {
  if (value === undefined) return
  const root = record(value)
  if (!root) {
    errors.push("Поле realism должно быть объектом.")
    return
  }
  const maxDefectsPerRow = numberOr(root.maxDefectsPerRow, 2)
  if (!Number.isInteger(maxDefectsPerRow) || maxDefectsPerRow < 1 || maxDefectsPerRow > 20) errors.push("realism.maxDefectsPerRow — целое от 1 до 20.")
  return { oneDefectPerCell: root.oneDefectPerCell !== false, maxDefectsPerRow, respectLimits: root.respectLimits !== false }
}

function applyFlags(column: Column, root: Record<string, unknown>, where: string, errors: string[]) {
  if (root.optional !== undefined) {
    const optional = finite(root.optional)
    if (optional === undefined || optional < 0 || optional > 1) errors.push(`${where}: optional от 0 до 1.`)
    else column.optional = optional
  }
  if (root.hidden === true) column.hidden = true
  if (root.limits !== undefined) {
    const limits = record(root.limits)
    const min = limits ? finite(limits.min) : undefined
    const max = limits ? finite(limits.max) : undefined
    if (!limits || (min === undefined && max === undefined) || (min !== undefined && max !== undefined && min > max)) errors.push(`${where}: limits требует min и/или max.`)
    else column.limits = { min, max }
  }
  return column
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
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
  const reserved = new Set(["min", "max", "abs"])
  return names.filter((name) => name && !/^\d/.test(name) && !reserved.has(name))
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
