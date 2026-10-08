import { TextReader, Uint8ArrayWriter, ZipWriter } from "@zip.js/zip.js"
import type { Cell } from "../cells"
import { displayCell, formatNumber } from "./text"
import type { Output } from "../spec"

export type Sheet = { name: string; columns: string[]; rows: Cell[][]; output: Output }

// Excel serial day 0 is 1899-12-30 because of the product's 1900 leap-year bug.
export async function writeWorkbook(sheets: Sheet[]) {
  const names = sheets.map((sheet, index) => sheetName(sheet.name, index))
  const files: Record<string, string> = {
    "[Content_Types].xml": contentTypes(sheets.length),
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": workbook(names),
    "xl/_rels/workbook.xml.rels": workbookRels(sheets.length),
    "xl/styles.xml": styles(),
    ...Object.fromEntries(sheets.map((sheet, index) => [`xl/worksheets/sheet${index + 1}.xml`, worksheet(sheet)])),
  }
  const zip = new ZipWriter(new Uint8ArrayWriter())
  for (const [name, content] of Object.entries(files)) await zip.add(name, new TextReader(content), { useWebWorkers: false })
  return zip.close()
}

function worksheet(sheet: Sheet) {
  const header = sheet.output.header ? [sheet.columns.map((column) => ({ kind: "text" as const, value: column }))] : []
  const rows = [...header, ...sheet.rows].map((row, rowIndex) => {
    const cells = row.map((cell, columnIndex) => cellXml(cell, rowIndex + 1, columnIndex, sheet.output)).join("")
    return `<row r="${rowIndex + 1}">${cells}</row>`
  })
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.join("")}</sheetData></worksheet>`
}

function cellXml(cell: Cell, row: number, column: number, output: Output) {
  const ref = `${columnName(column)}${row}`
  if (cell.kind === "number") return `<c r="${ref}"><v>${formatNumber(cell, ".")}</v></c>`
  if (cell.kind === "date") return `<c r="${ref}" s="${cell.time ? 2 : 1}"><v>${excelSerial(cell.value)}</v></c>`
  if (cell.kind === "bool") return `<c r="${ref}" t="b"><v>${cell.value ? 1 : 0}</v></c>`
  if (cell.kind === "null") return `<c r="${ref}"/>`
  return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(displayCell(cell, output))}</t></is></c>`
}

function excelSerial(value: string) {
  const [date, time = "00:00:00"] = value.split("T")
  const [year, month, day] = date.split("-").map(Number)
  const [hour, minute, second] = time.split(":").map(Number)
  const utc = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0, second ?? 0)
  return (utc - Date.UTC(1899, 11, 30)) / 86400000
}

function contentTypes(count: number) {
  const sheets = Array.from({ length: count }, (_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets}</Types>`
}

function workbook(names: string[]) {
  const sheets = names.map((name, index) => `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`
}

function workbookRels(count: number) {
  const sheets = Array.from({ length: count }, (_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets}<Relationship Id="rId${count + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
}

function styles() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd hh:mm:ss"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`
}

function sheetName(name: string, index: number) {
  const cleaned = name.replace(/[\\/?*[\]:]/gu, " ").trim().slice(0, 31) || `Sheet${index + 1}`
  return cleaned
}

function columnName(index: number) {
  let value = index + 1
  let name = ""
  while (value > 0) {
    const remainder = (value - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    value = Math.floor((value - 1) / 26)
  }
  return name
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}
