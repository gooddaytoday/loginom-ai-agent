import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile, appendFile, readdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ZipWriter, Uint8ArrayWriter, TextReader, ZipReader, Uint8ArrayReader, TextWriter } from "@zip.js/zip.js"
import { profileFile, scanFile, sampleFile, profilePage, exactScanReceipt } from "../../src/tool/loginom-file-profile-core"
import { validateExcelParameters } from "../../../loginom-runtime/client/lib/imports-excel-parameters.mjs"

const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
const text = (col: string, row: number, value: string) =>
  `<c r="${col}${row}" t="inlineStr"><is><t>${value}</t></is></c>`
const num = (col: string, row: number, value: string, style = 0) =>
  `<c r="${col}${row}" s="${style}"><v>${value}</v></c>`
const header = `<row r="1">${text("A", 1, "region")}${text("B", 1, "amount")}</row>`
async function fixture(
  sheet: string,
  run: (path: string, dir: string) => Promise<void>,
  options: { epoch?: boolean; sst?: string; extra?: Record<string, string>; hidden?: boolean } = {},
) {
  const dir = await mkdtemp(join(tmpdir(), "xlsx-profile-test-"))
  try {
    const zip = new ZipWriter(new Uint8ArrayWriter())
    const parts = {
      "_rels/.rels":
        '<Relationships><Relationship Id="w" Type="x/officeDocument" Target="book/main.xml"/></Relationships>',
      "book/main.xml": `<workbook xmlns:r="r"><workbookPr date1904="${options.epoch ? 1 : 0}"/><sheets><sheet name="Sales" state="${options.hidden ? "hidden" : "visible"}" r:id="s"/></sheets></workbook>`,
      "book/_rels/main.xml.rels":
        '<Relationships><Relationship Id="s" Type="x/worksheet" Target="sheets/data.xml"/><Relationship Id="t" Type="x/sharedStrings" Target="strings.xml"/><Relationship Id="f" Type="x/styles" Target="styles.xml"/><Relationship Id="ext" Type="x/externalLink" TargetMode="External" Target="https://invalid.example/never-fetch"/></Relationships>',
      "book/sheets/data.xml": `<worksheet xmlns="${ns}"><dimension ref="A1:Z1048576"/><sheetData>${sheet}</sheetData></worksheet>`,
      "book/strings.xml": `<sst><si><t>North</t></si>${options.sst ?? ""}</sst>`,
      "book/styles.xml":
        '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="dd.mm.yyyy"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="4"/></cellXfs></styleSheet>',
      ...options.extra,
    }
    for (const [name, value] of Object.entries(parts))
      await zip.add(name, new TextReader(value), { useWebWorkers: false })
    const path = join(dir, "disguised.bin") // detection must not use extension or xl/workbook.xml
    await writeFile(path, await zip.close())
    await run(path, join(dir, "session"))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
async function profile(path: string, dir: string, options = {}) {
  const p = await profileFile(path, dir, options)
  if (p.format !== "xlsx") throw Error("expected XLSX")
  return p
}
async function contents(path: string) {
  const zip = new ZipReader(new Uint8ArrayReader(new Uint8Array(await readFile(path))), { useWebWorkers: false })
  try {
    const result: Record<string, string> = {}
    for (const e of await zip.getEntries()) result[e.filename] = await e.getData!(new TextWriter())
    return result
  } finally {
    await zip.close()
  }
}

test("container relationships, SST/inline, hidden sheet, settings and small XLSX sample", async () => {
  await fixture(
    header +
      '<row r="2"><c r="A2" t="s"><v>0</v></c>' +
      num("B", 2, "12.50", 2) +
      "</row>" +
      `<row r="4">${text("A", 4, "South")}${num("B", 4, "3.25", 2)}</row>`,
    async (path, dir) => {
      const p = await profile(path, dir)
      expect(p.sheets).toEqual([{ name: "Sales", visibility: "hidden" }])
      expect(p.declared_dimension).toBe("A1:Z1048576")
      expect(p.observed_dimension).toBe("A1:B4")
      expect(p.settings_complete).toBe(true)
      expect(p.settings.excel.columns.map((c) => c.type)).toEqual(["string", "real"])
      validateExcelParameters(
        {
          source: { artifact_id: "a", upload_operation_id: "u" },
          excel: { ...p.settings.excel, source_path: "/sample.xlsx" },
        },
        "xlsx",
        { inputs: [], mappings: [], finish: "done", read: { ports: [] } },
      )
      expect((await scanFile(p.profile_id, dir)).records).toBe(3) // missing row 3 is imported
      const sample = await sampleFile(p.profile_id, dir)
      expect(sample.path.endsWith(".xlsx")).toBe(true)
      expect(sample.manifest.bytes).toBeLessThanOrEqual(8388608)
      const xml = await contents(sample.path)
      expect(xml["xl/worksheets/sheet1.xml"]).toContain('t="inlineStr"')
      expect(xml["xl/worksheets/sheet1.xml"]).toContain('<row r="3"></row>')
      expect(xml["xl/styles.xml"]).toContain('formatCode="dd.mm.yyyy"')
      expect(xml["xl/styles.xml"]).toContain('numFmtId="4"')
      const again = await profile(sample.path, join(dir, "sample-profile"))
      expect(again.settings.excel.columns).toEqual(p.settings.excel.columns)
      expect((await scanFile(again.profile_id, join(dir, "sample-profile"))).records).toBe(3)
      expect((await readdir(dir)).some((p) => p.startsWith(".xlsx-"))).toBe(false)
    },
    { hidden: true },
  )
})

test.each([false, true])("1900/1904 dates and cached formula values (%s)", async (epoch) => {
  await fixture(
    header + `<row r="2">${num("A", 2, "45000", 1)}<c r="B2"><f>1+1</f><v>2</v></c></row>`,
    async (path, dir) => {
      const p = await profile(path, dir)
      expect(p.date_system).toBe(epoch ? "1904" : "1900")
      expect(p.settings.excel.columns[0].type).toBe("datetime")
      expect(p.formulas).toBe(1)
      const s = await sampleFile(p.profile_id, dir)
      expect("formulas_as_cached_values" in s.manifest && s.manifest.formulas_as_cached_values).toBe(1)
      const xml = await contents(s.path)
      expect(xml["xl/workbook.xml"]).toContain(`date1904="${epoch ? 1 : 0}"`)
      expect(xml["xl/worksheets/sheet1.xml"]).not.toContain("<f>")
      expect(xml["xl/worksheets/sheet1.xml"]).toContain('<c r="A2" s="1" t="n"><v>45000</v>')
    },
    { epoch },
  )
})

test("formula without cache is explicit incompleteness and sample refusal", async () => {
  await fixture(header + `<row r="2">${text("A", 2, "North")}<c r="B2"><f>1+1</f></c></row>`, async (path, dir) => {
    const p = await profile(path, dir)
    expect(p.settings_complete).toBe(false)
    expect(p.missing_cached_values).toBe(1)
    const scan = await scanFile(p.profile_id, dir)
    expect(scan.first_violation).toMatchObject({ sheet: "Sales", row: 2, column: 2, expected_type: "cached value" })
    await expect(sampleFile(p.profile_id, dir)).rejects.toThrow("formula without cached value: Sales!B2")
  })
})

test("wide worksheet profiles within 8 KiB but is not importable", async () => {
  await fixture(
    '<row r="1">' +
      Array.from({ length: 120 }, (_, i) =>
        text(
          String.fromCharCode(65 + Math.floor(i / 26) - 1).replace("@", "") + String.fromCharCode(65 + (i % 26)),
          1,
          `field${i}`,
        ),
      ).join("") +
      "</row>",
    async (path, dir) => {
      const p = await profile(path, dir)
      expect(p.columns_total).toBe(120)
      expect(p.settings_complete).toBe(false)
      expect(p.settings_incomplete_reason).toContain("1–8")
      expect(Buffer.byteLength(JSON.stringify(p))).toBeLessThanOrEqual(8192)
      expect(p.continuation).not.toBeNull()
      const next = await profilePage(p.profile_id, dir, p.continuation!)
      expect(Buffer.byteLength(JSON.stringify(next))).toBeLessThanOrEqual(8192)
    },
  )
})

test("generated technical names cannot collide with existing ASCII headers", async () => {
  await fixture(
    `<row r="1">${text("A", 1, "Column2")}${text("B", 1, "Сумма")}</row><row r="2">${text("A", 2, "North")}${num("B", 2, "1.25")}</row>`,
    async (path, dir) => {
      const p = await profile(path, dir)
      expect(new Set(p.settings.excel.columns.map((c) => c.name)).size).toBe(2)
      validateExcelParameters(
        {
          source: { artifact_id: "a", upload_operation_id: "u" },
          excel: { ...p.settings.excel, source_path: "/sample.xlsx" },
        },
        "xlsx",
        { inputs: [], mappings: [], finish: "done", read: { ports: [] } },
      )
    },
  )
})

test("blank row policy, header policy and first type mismatch", async () => {
  const rows =
    header +
    `<row r="2">${text("A", 2, "North")}${num("B", 2, "1.25")}</row><row r="3"/>` +
    `<row r="5">${text("A", 5, "South")}${text("B", 5, "bad")}</row>`
  await fixture(rows, async (path, dir) => {
    const p = await profile(path, dir)
    const scan = await scanFile(p.profile_id, dir)
    expect(scan.records).toBe(4)
    expect(scan.first_violation).toMatchObject({
      sheet: "Sales",
      row: 5,
      column: 2,
      logical_record: 4,
      expected_type: "real",
      example: "bad",
    })
    const skip = await profile(path, dir, { blank_rows: "skip" })
    expect(skip.settings_complete).toBe(false)
    expect((await scanFile(skip.profile_id, dir)).records).toBe(2)
    const noHeader = await profile(path, dir, { header_rows: 0 })
    expect(noHeader.settings_complete).toBe(false)
    expect((await scanFile(noHeader.profile_id, dir)).records).toBe(5)
  })
})

test("late mismatch outside quick prefix and deterministic reservoir", async () => {
  let rows = header
  for (let r = 2; r <= 100002; r++)
    rows += `<row r="${r}">${text("A", r, "North")}${r === 100002 ? text("B", r, "late") : num("B", r, "1.25")}</row>`
  await fixture(rows, async (path, dir) => {
    const p = await profile(path, dir)
    expect(p.status).toBe("partial")
    const scan = await scanFile(p.profile_id, dir)
    expect(scan.records).toBe(100001)
    expect(scan.first_violation).toMatchObject({ row: 100002, column: 2, logical_record: 100001 })
    const a = await sampleFile(p.profile_id, dir, { seed: 42, max_records: 40, max_bytes: 10000 })
    const b = await sampleFile(p.profile_id, dir, { seed: 42, max_records: 40, max_bytes: 10000 })
    expect(a.manifest.sha256).toBe(b.manifest.sha256)
    expect(a.manifest.bytes).toBeLessThanOrEqual(10000)
    expect(a.manifest.full_file_validated).toBe(false)
  })
}, 30000)

test("changed source invalidates profile pages, scans and samples", async () => {
  await fixture(header, async (path, dir) => {
    const p = await profile(path, dir)
    await appendFile(path, "changed")
    await expect(profilePage(p.profile_id, dir)).rejects.toThrow("LOGINOM_FILE_CHANGED")
    await expect(scanFile(p.profile_id, dir)).rejects.toThrow("LOGINOM_FILE_CHANGED")
    await expect(sampleFile(p.profile_id, dir)).rejects.toThrow("LOGINOM_FILE_CHANGED")
  })
})

test("exact scan finding a late missing formula cache makes settings incomplete", async () => {
  const rows =
    header +
    Array.from({ length: 100000 }, (_, i) => {
      const r = i + 2
      return `<row r="${r}">${text("A", r, "North")}${i === 99999 ? `<c r="B${r}"><f>1+1</f></c>` : num("B", r, "1.25")}</row>`
    }).join("")
  await fixture(rows, async (path, dir) => {
    const p = await profile(path, dir)
    expect(p.coverage.eof).toBe(false)
    expect(p.settings_complete).toBe(true)
    await scanFile(p.profile_id, dir)
    const full = await profilePage(p.profile_id, dir)
    expect(full.settings_complete).toBe(false)
    expect("missing_cached_values" in full && full.missing_cached_values).toBe(1)
  })
}, 30000)

test("ZIP expansion, XML depth, cell size and DTD limits", async () => {
  for (const sheet of [
    "<a>".repeat(70) + "</a>".repeat(70),
    header + `<row r="2">${text("A", 2, "x".repeat(1048577))}</row>`,
    "<!DOCTYPE a [<!ENTITY x 'y'>]><a>&x;</a>",
    "x".repeat(9 * 1048576),
    "<a><b></a>",
    "<a>",
  ]) {
    await fixture(sheet, async (path, dir) => {
      await expect(profileFile(path, dir)).rejects.toThrow(/LOGINOM_FILE_XLSX_(LIMIT|UNSUPPORTED)/)
      expect((await readdir(dir)).some((p) => p.startsWith(".xlsx-"))).toBe(false)
    })
  }
})

test("large SST has a bounded quick prefix and exact scan resolves its disk index", async () => {
  const sst = Array.from(
    { length: 75000 },
    (_, i) => `<si><t>${i}-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789</t></si>`,
  ).join("")
  await fixture(
    header + '<row r="2"><c r="A2" t="s"><v>75000</v></c>' + num("B", 2, "1.25") + "</row>",
    async (path, dir) => {
      const p = await profile(path, dir)
      expect(p.settings_complete).toBe(false)
      expect(p.settings_incomplete_reason).toContain("Shared strings")
      expect(p.coverage.bytes_read).toBeLessThanOrEqual(8388608)
      expect((await scanFile(p.profile_id, dir)).records).toBe(1)
      const full = await profilePage(p.profile_id, dir)
      expect(full.settings_complete).toBe(true)
      const sample = await sampleFile(p.profile_id, dir)
      const xml = await contents(sample.path)
      expect(xml["xl/worksheets/sheet1.xml"]).toContain("74999-abcdefghijklmnopqrstuvwxyz")
      expect((await readdir(dir)).some((p) => p.startsWith(".xlsx-"))).toBe(false)
    },
    { sst },
  )
}, 30000)

test("cancelled scan stays partial without an exact count", async () => {
  await fixture(header + `<row r="2">${text("A", 2, "N")}${num("B", 2, "1")}</row>`, async (path, dir) => {
    const p = await profile(path, dir),
      controller = new AbortController()
    controller.abort()
    const scan = await scanFile(p.profile_id, dir, { signal: controller.signal })
    expect(scan.status).toBe("partial")
    expect(scan.records).toBeUndefined()
  })
})

test("XLSX exact receipt retains selected worksheet and count policies", async () => {
  await fixture(header + `<row r="2">${text("A", 2, "North")}${num("B", 2, "1")}</row>`, async (path, dir) => {
    const p = await profile(path, dir, { sheet_name: "Sales", header_rows: 1, blank_rows: "import" })
    expect(await exactScanReceipt(p.profile_id, dir)).toBeUndefined()
    await scanFile(p.profile_id, dir)
    const receipt = await exactScanReceipt(p.profile_id, dir)
    expect(receipt?.records).toBe(1)
    expect(receipt?.xlsx).toEqual({ sheet_name: "Sales", sheet_index: 1, header_rows: 1, blank_rows: "import" })
  })
})
