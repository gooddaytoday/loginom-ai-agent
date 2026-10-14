import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
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
}, 20_000)

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

const retailBytes = {
  clean: {
    "products.csv": "d80790c56ba20427b4fd46c4c2bf58243ab4f0480088a735836b3de8063f3269",
    "sales-Север.csv": "c052209ff318cb0f601e558d626286f11d3b8dece41aa97203684229d8fb18cd",
    "sales-Центр.csv": "e4c95ee1647f8089f7dc10cec70a5307d3d3b5b3c05e5eaf682dcfd1c29a16ef",
    "sales-Юг.csv": "41cef7ed9527bdd7a342c5da98929bc59ecc6167bdeb2353d1b8c88091b9d4df",
    "warehouse.csv": "f8d7cc94a6de13747c2d442d4266471f595e3061a0c56e26663b4b21f6d06557",
    "logistics.csv": "55a84181e8e7f6d522a2b008ce353558ff06e0e1a7cd0db374d421af8f14ebab",
    "defects.csv": "63054c305c72623c18eac6d29489faa4d46f1749d04b921fdc349f071aadcb4f",
  },
  dirtySales: "aa851644d5c33e6459637f90242742e4bc91c5a9e5f801fc0e5cfa3df53abb89",
  dirtyDefects: "a35258366e6ea54d71442b2a77cb3ebb9ed4ea04bbd7ec24640013e8ac23b6d9",
}

test("retail bytes stay compatible with and without defects", async () => {
  const root = await mkdtemp(join(tmpdir(), "synthetic-retail-bytes-"))
  try {
    const params = { stores: 3, products: 8, salesPerStore: 15, seed: 11 }
    const clean = await runSyntheticData({ operation: "generate", directory: root, preset: "retail", params: JSON.stringify({ ...params, defects: false }), name: "clean" })
    const dirty = await runSyntheticData({ operation: "generate", directory: root, preset: "retail", params: JSON.stringify({ ...params, defects: true }), name: "dirty" })
    expect(await hashes(requireGenerated(clean).directory)).toEqual(retailBytes.clean)
    const dirtyHashes = await hashes(requireGenerated(dirty).directory)
    expect(dirtyHashes["products.csv"]).toBe(retailBytes.clean["products.csv"])
    expect(dirtyHashes["sales-Центр.csv"]).toBe(retailBytes.clean["sales-Центр.csv"])
    expect(dirtyHashes["sales-Юг.csv"]).toBe(retailBytes.clean["sales-Юг.csv"])
    expect(dirtyHashes["warehouse.csv"]).toBe(retailBytes.clean["warehouse.csv"])
    expect(dirtyHashes["logistics.csv"]).toBe(retailBytes.clean["logistics.csv"])
    expect(dirtyHashes["sales-Север.csv"]).toBe(retailBytes.dirtySales)
    expect(dirtyHashes["defects.csv"]).toBe(retailBytes.dirtyDefects)
    expect(requireGenerated(dirty).defect_count).toBe(1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("groups keep allowed tuples, shared fields and resetting counters", async () => {
  const root = await mkdtemp(join(tmpdir(), "synthetic-groups-"))
  try {
    const generated = await writeAndGenerate(root, {
      name: "catalog",
      seed: 4,
      tables: [{
        name: "items",
        rows: 12,
        groups: { keys: ["section", "line"], shared: ["section", "maker", "model"], size: { min: 2, max: 3 }, sortBy: ["section"] },
        links: [{ name: "catalog", columns: ["section", "maker", "model"], rows: [["audio", "north", "shared"], ["video", "west", "shared"], ["audio", "north", "solo"]] }],
        split: { by: "section", file: "section-{value}.csv" },
        columns: [
          { name: "section", type: "linked", link: "catalog" },
          { name: "maker", type: "linked", link: "catalog" },
          { name: "model", type: "linked", link: "catalog" },
          { name: "line", type: "sequence", start: 1, per: ["section"], unit: "row" },
        ],
      }],
    }, "groups")
    const rows = (await Promise.all(["section-audio.csv", "section-video.csv"].map((name) => readTable(join(generated.directory, name))))).flat()
    const allowed = new Set(["audio|north|shared", "video|west|shared", "audio|north|solo"])
    expect(rows.every((row) => allowed.has(`${row.section}|${row.maker}|${row.model}`))).toBe(true)
    expect(new Set(rows.filter((row) => row.model === "shared").map((row) => row.section)).size).toBe(2)
    expect(rows.some((row) => row.model === "solo" && row.section === "video")).toBe(false)
    const audio = await readTable(join(generated.directory, "section-audio.csv"))
    expect(new Set(audio.map((row) => row.section))).toEqual(new Set(["audio"]))
    expect(audio.map((row) => Number(row.line))).toEqual(audio.map((_, index) => index + 1))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("series, walks, offsets and strict rules stay coherent", async () => {
  const root = await mkdtemp(join(tmpdir(), "synthetic-series-"))
  try {
    const spec = {
      name: "quotes",
      seed: 8,
      realism: { oneDefectPerCell: true, maxDefectsPerRow: 2, respectLimits: true },
      tables: [{
        name: "bars",
        series: { by: ["ticker"], date: "date", step: "day", weekdays: "mon-fri" },
        columns: [
          { name: "ticker", type: "category", values: ["USD", "EUR"] },
          { name: "date", type: "date", from: "2024-01-01", to: "2024-01-05" },
          { name: "close", type: "walk", model: "arithmetic", start: 1, drift: -5, volatility: 0, floor: 0.5, scale: 4 },
          { name: "spread", type: "float", min: 0.01, max: 0.02, hidden: true },
          { name: "open", type: "expr", expr: "close", scale: 4 },
          { name: "high", type: "expr", expr: "max(open, close) * (1 + spread)", scale: 4 },
          { name: "low", type: "expr", expr: "min(open, close) * (1 - spread)", scale: 4 },
        ],
      }, {
        name: "events",
        rows: 8,
        groups: { keys: ["session", "n"], shared: ["session", "started"], size: { min: 2, max: 2 }, sortBy: ["session"] },
        columns: [
          { name: "session", type: "sequence", start: 1 },
          { name: "started", type: "datetime", from: "2024-03-01", to: "2024-03-01" },
          { name: "n", type: "sequence", start: 1, per: ["session"], unit: "row" },
          { name: "at", type: "offset", from: "started", unit: "minutes", min: 5, max: 5, cumulative: true },
        ],
      }, {
        name: "tickets",
        rows: 40,
        rules: [
          { name: "order_assigned", compare: { left: "created", op: "<=", right: "assigned" } },
          { name: "order_closed", compare: { left: "assigned", op: "<=", right: "closed" } },
          { name: "open_blank", never: [{ column: "status", in: ["open"] }, { column: "closed", notEmpty: true }] },
          { name: "high_note", severity: "soft", never: [{ column: "priority", in: ["high"] }, { column: "note", empty: true }] },
        ],
        columns: [
          { name: "created", type: "date", from: "2024-02-01", to: "2024-02-10" },
          { name: "assigned", type: "offset", from: "created", unit: "days", min: 0, max: 2 },
          { name: "closed", type: "offset", from: "assigned", unit: "days", min: 0, max: 3 },
          { name: "status", type: "category", values: ["open", "closed"] },
          { name: "priority", type: "category", values: ["low", "high"] },
          { name: "note", type: "category", values: ["ready", "waiting"] },
          { name: "age", type: "int", min: 18, max: 40, limits: { min: 0, max: 120 } },
        ],
      }],
      defects: [
        { table: "bars", kind: "drop", rate: 0.3 },
        { table: "tickets", column: "age", kind: "outlier", rate: 0.4, method: "multiplier", factor: 50 },
        { table: "tickets", column: "age", kind: "missing", rate: 0.4, as: "empty" },
        { table: "tickets", column: "note", kind: "missing", rate: 0.4, as: "empty" },
        { table: "tickets", kind: "rule_violation", rate: 0.5, rule: "high_note" },
      ],
    }
    const first = await writeAndGenerate(root, spec, "one")
    const second = await writeAndGenerate(root, spec, "two")
    expect(await hashes(first.directory)).toEqual(await hashes(second.directory))
    const bars = await readTable(join(first.directory, "bars.csv"))
    expect(bars.length).toBeLessThan(10)
    expect(bars.length).toBeGreaterThan(0)
    expect(bars.every((row) => !["2024-01-06", "2024-01-07"].includes(row.date))).toBe(true)
    expect(bars.every((row) => Number(row.close) >= 0.5)).toBe(true)
    expect(bars.every((row) => Number(row.low) <= Number(row.open) && Number(row.open) <= Number(row.high) && Number(row.low) <= Number(row.close) && Number(row.close) <= Number(row.high))).toBe(true)
    expect(bars[0]?.spread).toBeUndefined()
    const events = await readTable(join(first.directory, "events.csv"))
    for (const session of new Set(events.map((row) => row.session))) {
      const times = events.filter((row) => row.session === session).map((row) => row.at)
      expect(times).toEqual([...times].sort())
    }
    const tickets = await readTable(join(first.directory, "tickets.csv"))
    expect(tickets.every((row) => row.created <= row.assigned && row.assigned <= row.closed)).toBe(true)
    expect(tickets.some((row) => row.status === "open" && row.closed !== "")).toBe(false)
    expect(tickets.every((row) => Number(row.age) >= 0 && Number(row.age) <= 120)).toBe(true)
    const listed = await readFile(join(first.directory, "defects.csv"), "utf8")
    expect(listed).toContain("high_note")
    expect(listed).toContain("drop")
    const ages = new Map<string, number>()
    for (const line of listed.trim().split("\n").slice(1)) {
      const cells = line.split(",")
      if (cells[1] !== "tickets" || cells[3] !== "age") continue
      ages.set(cells[2] ?? "", (ages.get(cells[2] ?? "") ?? 0) + 1)
    }
    expect([...ages.values()].every((count) => count <= 1)).toBe(true)
    const perRow = new Map<string, number>()
    for (const line of listed.trim().split("\n").slice(1)) {
      const cells = line.split(",")
      if (cells[1] !== "tickets") continue
      const key = cells[2] ?? ""
      perRow.set(key, (perRow.get(key) ?? 0) + 1)
    }
    expect([...perRow.values()].every((count) => count <= 2)).toBe(true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("unsatisfiable rules fail before files are written", async () => {
  const root = await mkdtemp(join(tmpdir(), "synthetic-unsat-"))
  try {
    const spec = join(root, "spec.json")
    await Bun.write(spec, JSON.stringify({
      name: "blocked",
      seed: 1,
      tables: [{
        name: "flags",
        rows: 4,
        columns: [
          { name: "status", type: "category", values: ["open"] },
          { name: "flag", type: "category", values: ["yes"] },
        ],
        rules: [{ name: "impossible", never: [{ column: "status", in: ["open"] }, { column: "flag", in: ["yes"] }] }],
      }],
    }))
    const result = await runSyntheticData({ operation: "generate", directory: root, spec, name: "blocked" })
    expect(result.ok).toBe(false)
    if (result.ok || !("errors" in result)) throw Error("expected errors")
    expect(result.errors.join(" ")).toContain("допустимых")
    expect(await readdir(root)).not.toContain("synthetic-data")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("shared entities keep one type and title for an identifier", async () => {
  const root = await mkdtemp(join(tmpdir(), "synthetic-entities-"))
  try {
    const generated = await writeAndGenerate(root, {
      name: "shared",
      seed: 6,
      entities: [{ name: "items", columns: ["id", "kind", "title"], rows: [["a", "sensor", "north"], ["b", "meter", "south"], ["c", "sensor", "east"]] }],
      tables: [
        { name: "catalog", enumerate: "items", columns: [
          { name: "id", type: "linked", link: "items" },
          { name: "kind", type: "linked", link: "items" },
          { name: "title", type: "linked", link: "items" },
        ] },
        { name: "log", rows: 10, columns: [
          { name: "id", type: "linked", link: "items" },
        ] },
        { name: "north", rows: 8, columns: [
          { name: "id", type: "linked", link: "items" },
          { name: "kind", type: "linked", link: "items" },
          { name: "title", type: "linked", link: "items" },
        ] },
        { name: "south", rows: 8, columns: [
          { name: "id", type: "linked", link: "items" },
          { name: "kind", type: "linked", link: "items" },
          { name: "title", type: "linked", link: "items" },
        ] },
      ],
    }, "shared")
    const catalog = await readTable(join(generated.directory, "catalog.csv"))
    expect(catalog).toEqual([
      { id: "a", kind: "sensor", title: "north" },
      { id: "b", kind: "meter", title: "south" },
      { id: "c", kind: "sensor", title: "east" },
    ])
    const known = new Map(catalog.map((row) => [row.id, row]))
    const log = await readTable(join(generated.directory, "log.csv"))
    expect(Object.keys(log[0] ?? {})).toEqual(["id"])
    expect(log.every((row) => known.has(row.id))).toBe(true)
    for (const name of ["north.csv", "south.csv"]) {
      const rows = await readTable(join(generated.directory, name))
      expect(rows.every((row) => known.get(row.id)?.kind === row.kind && known.get(row.id)?.title === row.title)).toBe(true)
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("generated entity tuples are shared by every table", async () => {
  const root = await mkdtemp(join(tmpdir(), "synthetic-entity-generate-"))
  try {
    const generated = await writeAndGenerate(root, {
      name: "drawn",
      seed: 2,
      entities: [{ name: "items", columns: ["id", "kind"], generate: [{ values: ["a", "b", "c"] }, { values: ["sensor", "meter"], fanout: 1 }] }],
      tables: [
        { name: "left", rows: 12, columns: [{ name: "id", type: "linked", link: "items" }, { name: "kind", type: "linked", link: "items" }] },
        { name: "right", rows: 12, columns: [{ name: "id", type: "linked", link: "items" }, { name: "kind", type: "linked", link: "items" }] },
      ],
    }, "drawn")
    const left = await readTable(join(generated.directory, "left.csv"))
    const right = await readTable(join(generated.directory, "right.csv"))
    const kinds = new Map(left.map((row) => [row.id, row.kind]))
    expect(new Set(kinds.keys()).size).toBe(3)
    expect(right.every((row) => kinds.get(row.id) === row.kind)).toBe(true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("entity conflicts fail before files are written", async () => {
  const root = await mkdtemp(join(tmpdir(), "synthetic-entity-reject-"))
  try {
    const duplicate = await runSyntheticData({ operation: "generate", directory: root, spec: await specFile(root, "duplicate", {
      name: "duplicate", seed: 1,
      entities: [{ name: "items", columns: ["id", "kind"], rows: [["a", "sensor"], ["a", "meter"]] }],
      tables: [{ name: "facts", rows: 2, columns: [{ name: "id", type: "linked", link: "items" }, { name: "kind", type: "linked", link: "items" }] }],
    }), name: "duplicate" })
    expect(duplicate.ok).toBe(false)
    if (duplicate.ok || !("errors" in duplicate)) throw Error("expected errors")
    expect(duplicate.errors.join(" ")).toContain("ключ")
    const renamed = await runSyntheticData({ operation: "generate", directory: root, spec: await specFile(root, "renamed", {
      name: "renamed", seed: 1,
      tables: [
        { name: "parent", rows: 2, columns: [{ name: "id", type: "sequence", start: 1 }, { name: "name", type: "category", values: ["north"] }] },
        { name: "child", rows: 2, columns: [{ name: "id", type: "ref", table: "parent", column: "id" }, { name: "name", type: "category", values: ["south"] }] },
      ],
    }), name: "renamed" })
    expect(renamed.ok).toBe(false)
    if (renamed.ok || !("errors" in renamed)) throw Error("expected errors")
    expect(renamed.errors.join(" ")).toContain("lookup")
    expect(await readdir(root)).not.toContain("synthetic-data")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("strict rules do not split an entity and defects cannot rewrite it", async () => {
  const root = await mkdtemp(join(tmpdir(), "synthetic-entity-protect-"))
  try {
    const generated = await writeAndGenerate(root, {
      name: "protect",
      seed: 9,
      entities: [{ name: "items", columns: ["id", "kind", "title"], rows: [["a", "sensor", "north"], ["b", "meter", "south"]] }],
      rules: [],
      tables: [{
        name: "facts",
        rows: 16,
        rules: [{ name: "sensor_open", never: [{ column: "kind", in: ["sensor"] }, { column: "status", in: ["closed"] }] }],
        columns: [
          { name: "id", type: "linked", link: "items" },
          { name: "kind", type: "linked", link: "items" },
          { name: "title", type: "linked", link: "items" },
          { name: "status", type: "category", values: ["open", "closed"] },
          { name: "value", type: "int", min: 1, max: 5 },
        ],
      }],
      defects: [
        { table: "facts", column: "id", kind: "missing", rate: 1, as: "empty" },
        { table: "facts", column: "kind", kind: "noise", rate: 1, noise: "typo" },
        { table: "facts", column: "id", kind: "orphan", rate: 0.5 },
        { table: "facts", kind: "duplicate", rate: 0.5, mode: "fuzzy" },
      ],
    }, "protect")
    const rows = await readTable(join(generated.directory, "facts.csv"))
    const known = new Map([["a", { kind: "sensor", title: "north" }], ["b", { kind: "meter", title: "south" }]])
    expect(rows.every((row) => row.kind !== "sensor" || row.status !== "closed")).toBe(true)
    expect(rows.filter((row) => known.has(row.id)).every((row) => known.get(row.id)?.kind === row.kind && known.get(row.id)?.title === row.title)).toBe(true)
    const listed = await readFile(join(generated.directory, "defects.csv"), "utf8")
    expect(listed).toContain("orphan")
    expect(listed.split("\n").some((line) => line.includes(",id,missing,") || line.includes(",kind,typo,"))).toBe(false)
    const manifest = await Bun.file(generated.manifest).json()
    const facts = manifest.constraints.find((item: { table: string }) => item.table === "facts")
    expect(facts.rejected_defects).toBeGreaterThan(0)
    expect(facts.entities[0].mismatches).toBe(0)
    const copies = rows.filter((row) => !known.has(row.id))
    expect(copies.every((row) => [...known.values()].some((item) => item.kind === row.kind && item.title === row.title))).toBe(true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("lookup of an ambiguous parent key stops generation", async () => {
  const root = await mkdtemp(join(tmpdir(), "synthetic-lookup-"))
  try {
    const spec = await specFile(root, "ambiguous", {
      name: "ambiguous",
      seed: 1,
      tables: [
        { name: "parent", rows: 2, columns: [{ name: "id", type: "category", values: ["a"] }, { name: "label", type: "sequence", start: 1 }] },
        { name: "child", rows: 2, columns: [{ name: "id", type: "ref", table: "parent", column: "id" }, { name: "label", type: "lookup", table: "parent", column: "label", match: "id" }] },
      ],
    })
    const result = await runSyntheticData({ operation: "generate", directory: root, spec, name: "ambiguous" })
    expect(result.ok).toBe(false)
    if (result.ok || !("errors" in result)) throw Error("expected errors")
    expect(result.errors.join(" ")).toContain("атрибуты")
    expect(await readdir(root)).not.toContain("synthetic-data")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("skill examples validate and generate", async () => {
  const root = await mkdtemp(join(tmpdir(), "synthetic-examples-"))
  const examples = join(import.meta.dir, "../../product/skills/synthetic-data/references/examples")
  try {
    for (const name of await readdir(examples)) {
      const result = await runSyntheticData({ operation: "generate", directory: root, spec: join(examples, name), name: name.replace(".json", "") })
      expect(result.ok, name).toBe(true)
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function requireGenerated(value: { ok: boolean; directory?: unknown; manifest?: unknown; defect_count?: unknown }) {
  if (!value.ok || typeof value.directory !== "string" || typeof value.manifest !== "string" || typeof value.defect_count !== "number")
    throw Error("generation failed")
  return { directory: value.directory, manifest: value.manifest, defect_count: value.defect_count }
}

async function hashes(directory: string) {
  const names = (await readdir(directory)).filter((name) => name !== "manifest.json").toSorted()
  return Object.fromEntries(await Promise.all(names.map(async (name) => [name, createHash("sha256").update(await readFile(join(directory, name))).digest("hex")])))
}

async function specFile(root: string, name: string, spec: unknown) {
  const file = join(root, `${name}.json`)
  await Bun.write(file, JSON.stringify(spec))
  return file
}

async function writeAndGenerate(root: string, spec: unknown, name: string) {
  const file = join(root, `${name}.json`)
  await Bun.write(file, JSON.stringify(spec))
  return requireGenerated(await runSyntheticData({ operation: "generate", directory: root, spec: file, name }))
}

async function readTable(path: string) {
  const [header, ...lines] = (await readFile(path, "utf8")).trim().split("\n")
  const columns = header?.split(",") ?? []
  return lines.filter(Boolean).map((line) => Object.fromEntries(columns.map((column, index) => [column, line.split(",")[index] ?? ""])))
}
