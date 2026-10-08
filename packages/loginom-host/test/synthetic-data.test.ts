import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Uint8ArrayReader, TextWriter, ZipReader } from "@zip.js/zip.js"
import { runSyntheticData } from "../src/synthetic-data/run"

const fixture = join(import.meta.dir, "fixtures/package-docs/demo.lgp")

test("one seed writes the same bytes twice", async () => {
  const root = await mkdtemp(join(tmpdir(), "synthetic-data-"))
  try {
    const first = await runSyntheticData({ operation: "generate", directory: root, preset: "retail", params: JSON.stringify({ stores: 3, products: 8, salesPerStore: 15, seed: 11, defects: true }), name: "one" })
    const second = await runSyntheticData({ operation: "generate", directory: root, preset: "retail", params: JSON.stringify({ stores: 3, products: 8, salesPerStore: 15, seed: 11, defects: true }), name: "two" })
    const leftRun = requireGenerated(first)
    const rightRun = requireGenerated(second)
    const left = await Bun.file(leftRun.manifest).json()
    const right = await Bun.file(rightRun.manifest).json()
    expect(left.files.map((file: { sha256: string }) => file.sha256)).toEqual(right.files.map((file: { sha256: string }) => file.sha256))
    expect(await readFile(join(leftRun.directory, "defects.csv"))).toEqual(await readFile(join(rightRun.directory, "defects.csv")))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("retail preset links stores, products, warehouse and logistics", async () => {
  const root = await mkdtemp(join(tmpdir(), "synthetic-retail-"))
  try {
    const result = await runSyntheticData({ operation: "generate", directory: root, preset: "retail", params: JSON.stringify({ stores: 3, products: 12, salesPerStore: 20, seed: 4, defects: false }), name: "retail" })
    const directory = requireGenerated(result).directory
    const manifest = await Bun.file(join(directory, "manifest.json")).json()
    const names = manifest.files.map((file: { path: string }) => file.path).toSorted()
    expect(names.filter((name: string) => name.startsWith("sales-"))).toHaveLength(3)
    expect(names).toContain("products.csv")
    expect(names).toContain("warehouse.csv")
    expect(names).toContain("logistics.csv")
    const products = await readTable(join(directory, "products.csv"))
    const skus = new Set(products.map((row) => row.sku))
    expect(skus.size).toBe(12)
    const sales = (await Promise.all(names.filter((name: string) => name.startsWith("sales-")).map((name: string) => readTable(join(directory, name))))).flat()
    expect(sales).toHaveLength(60)
    const prices = new Map(products.map((row) => [row.sku, row.price]))
    for (const row of sales) {
      expect(skus.has(row.sku)).toBe(true)
      expect(row.price).toBe(prices.get(row.sku))
      expect(Number(row.amount)).toBeCloseTo(Number(row.qty) * Number(row.price), 2)
    }
    const stock = await readTable(join(directory, "warehouse.csv"))
    expect(new Set(stock.map((row) => row.sku))).toEqual(skus)
    const logistics = await readTable(join(directory, "logistics.csv"))
    expect(logistics.every((row) => skus.has(row.sku) && row.warehouse === "Склад")).toBe(true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("missing values stay near the requested rate and are listed", async () => {
  const root = await mkdtemp(join(tmpdir(), "synthetic-defects-"))
  try {
    const spec = join(root, "spec.json")
    await Bun.write(spec, JSON.stringify({
      name: "gaps",
      seed: 9,
      tables: [{ name: "measures", rows: 4000, columns: [{ name: "value", type: "int", min: 1, max: 10 }], output: { format: "csv", file: "measures.csv" } }],
      defects: [{ table: "measures", column: "value", kind: "missing", rate: 0.1, as: "empty", mechanism: "mcar" }],
    }))
    const result = await runSyntheticData({ operation: "generate", directory: root, spec, name: "gaps" })
    const generated = requireGenerated(result)
    expect(Math.abs(generated.defect_count / 4000 - 0.1)).toBeLessThan(0.03)
    const listed = (await readFile(join(generated.directory, "defects.csv"), "utf8")).trim().split("\n")
    expect(listed.length - 1).toBe(generated.defect_count)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("text formats keep encoding, BOM and decimal comma", async () => {
  const root = await mkdtemp(join(tmpdir(), "synthetic-format-"))
  try {
    const spec = join(root, "spec.json")
    await Bun.write(spec, JSON.stringify({
      name: "formats",
      seed: 2,
      tables: [
        { name: "prices", rows: 1, columns: [{ name: "price", type: "decimal", min: 10.5, max: 10.5, scale: 2 }], output: { format: "csv", file: "prices.csv", decimal: ",", delimiter: "," } },
        { name: "goods", rows: 1, columns: [{ name: "name", type: "category", values: ["Молоко"] }], output: { format: "csv", file: "goods.csv", encoding: "cp1251" } },
        { name: "marked", rows: 1, columns: [{ name: "name", type: "category", values: ["Чай"] }], output: { format: "csv", file: "marked.csv", bom: true } },
      ],
    }))
    const result = await runSyntheticData({ operation: "generate", directory: root, spec, name: "formats" })
    const directory = requireGenerated(result).directory
    expect(await readFile(join(directory, "prices.csv"), "utf8")).toContain('"10,50"')
    const encoded = await readFile(join(directory, "goods.csv"))
    expect([...encoded]).toContain(0xcc)
    expect((await readFile(join(directory, "marked.csv"))).subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("xlsx is a workbook with the generated text", async () => {
  const root = await mkdtemp(join(tmpdir(), "synthetic-xlsx-"))
  try {
    const spec = join(root, "spec.json")
    await Bun.write(spec, JSON.stringify({
      name: "book",
      seed: 1,
      tables: [{ name: "notes", rows: 1, columns: [{ name: "text", type: "category", values: ["Привет"] }], output: { format: "xlsx", file: "notes.xlsx" } }],
    }))
    const result = await runSyntheticData({ operation: "generate", directory: root, spec, name: "book" })
    const bytes = await readFile(join(requireGenerated(result).directory, "notes.xlsx"))
    const zip = new ZipReader(new Uint8ArrayReader(new Uint8Array(bytes)), { useWebWorkers: false })
    const entries = await zip.getEntries()
    const sheet = entries.find((entry) => entry.filename === "xl/worksheets/sheet1.xml")
    if (!sheet?.getData) throw Error("sheet missing")
    expect(await sheet.getData(new TextWriter())).toContain("Привет")
    await zip.close()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("inspect reads import nodes from a local package", async () => {
  const root = await mkdtemp(join(tmpdir(), "synthetic-inspect-"))
  try {
    const result = await runSyntheticData({ operation: "inspect", directory: root, lgp: fixture, name: "demo" })
    if (!result.ok || !("draft" in result)) throw Error(JSON.stringify(result))
    const draft = await Bun.file(String(result.draft)).json()
    const imports = await Bun.file(String(result.imports)).json()
    expect(draft.tables[0].name).toBe("Источник")
    expect(imports.imports[0].engine_type).toBe("TBGImportNative")
    expect(imports.imports[0].file).toBe("data.lgd")
    expect(String(result.note)).toContain("columns")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("validate rejects a broken specification and generate does not replace a set", async () => {
  const root = await mkdtemp(join(tmpdir(), "synthetic-reject-"))
  try {
    const spec = join(root, "spec.json")
    await Bun.write(spec, JSON.stringify({ name: "bad", seed: 1, tables: [{ name: "loop", rows: 1, columns: [{ name: "sku", type: "ref", table: "loop", column: "sku" }] }] }))
    const invalid = await runSyntheticData({ operation: "validate", directory: root, spec })
    expect(invalid.ok).toBe(false)
    await Bun.write(spec, JSON.stringify({ name: "ok", seed: 1, tables: [{ name: "ids", rows: 2, columns: [{ name: "id", type: "sequence", start: 1 }], output: { format: "json", file: "ids.json" } }] }))
    const created = await runSyntheticData({ operation: "generate", directory: root, spec, name: "ok" })
    expect(created.ok).toBe(true)
    await expect(runSyntheticData({ operation: "generate", directory: root, spec, name: "ok" })).rejects.toThrow("SYNTHETIC_DATA_OUTPUT_COLLISION")
    const json = await Bun.file(join(root, "synthetic-data/ok/ids.json")).json()
    expect(json).toEqual([{ id: 1 }, { id: 2 }])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function requireGenerated(value: { ok: boolean; directory?: unknown; manifest?: unknown; defect_count?: unknown }) {
  if (!value.ok || typeof value.directory !== "string" || typeof value.manifest !== "string" || typeof value.defect_count !== "number")
    throw Error("generation failed")
  return { directory: value.directory, manifest: value.manifest, defect_count: value.defect_count }
}

async function readTable(path: string) {
  const [header, ...lines] = (await readFile(path, "utf8")).trim().split("\n")
  const columns = header?.split(",") ?? []
  return lines.filter(Boolean).map((line) => Object.fromEntries(columns.map((column, index) => [column, line.split(",")[index] ?? ""])))
}
