import { TextReader, Uint8ArrayWriter, ZipWriter } from "@zip.js/zip.js"
import { deflateSync } from "node:zlib"
import { loadFont, subsetFont } from "./font"
import type { ReportFont } from "./font"
import { renderSkeleton } from "./skeleton"
import type { PackageStructure } from "./extract"

export function validateReport(markdown: string, structure: PackageStructure) {
  const headings = (text: string) => text.split(/\r?\n/).map((line) => line.trim())
    .filter((line) => /^#{1,3}\s/.test(line)).map((line) => line.replace(/ \(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\)$/, ""))
  const actual = headings(markdown)
  let cursor = 0
  for (const required of headings(renderSkeleton(structure))) {
    const index = actual.indexOf(required, cursor)
    if (index < 0) throw Error("PACKAGE_DOCS_REQUIRED_SECTION")
    cursor = index + 1
  }
}

export async function renderReport(markdown: string, format: "md" | "docx" | "pdf" = "pdf", fonts = new URL("../assets/fonts/", import.meta.url)): Promise<Uint8Array> {
  if (/PLACEHOLDER_/.test(markdown)) throw Error("PACKAGE_DOCS_PLACEHOLDER")
  if (format === "md") return new TextEncoder().encode(markdown.endsWith("\n") ? markdown : markdown + "\n")
  if (format === "docx") return writeDocx(parseBlocks(markdown))
  return writePdf(parseBlocks(markdown), fonts)
}

type Run = { text: string; bold: boolean }
type Block = { kind: string; runs: Run[]; depth: number; marker: string }

function parseBlocks(markdown: string) {
  const blocks: Block[] = []
  const counters = new Map<number, number>()
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.trim()) { counters.clear(); continue }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line.trim())
    if (heading) {
      counters.clear()
      blocks.push({ kind: "h" + heading[1].length, runs: inlineRuns(heading[2]), depth: 0, marker: "" })
      continue
    }
    const quote = /^>\s?(.*)$/.exec(line.trim())
    if (quote) {
      counters.clear()
      blocks.push({ kind: "quote", runs: inlineRuns(quote[1]), depth: 0, marker: "" })
      continue
    }
    const bullet = /^(\s*)\*\s+(.*)$/.exec(line)
    const number = /^(\s*)\d+\.\s+(.*)$/.exec(line)
    const match = bullet || number
    if (match) {
      const depth = Math.floor(match[1].length / 2) + 1
      for (const key of counters.keys()) if (key > depth) counters.delete(key)
      if (!bullet) counters.set(depth, (counters.get(depth) || 0) + 1)
      blocks.push({ kind: "li", runs: inlineRuns(match[2]), depth, marker: bullet ? "•" : `${counters.get(depth)}.` })
      continue
    }
    counters.clear()
    blocks.push({ kind: "p", runs: inlineRuns(line.trim()), depth: 0, marker: "" })
  }
  return blocks
}

function inlineRuns(text: string) {
  const runs: Run[] = []
  let cursor = 0
  for (const match of text.matchAll(/\*\*(.+?)\*\*|`([^`]+)`/g)) {
    if (match.index > cursor) runs.push({ text: text.slice(cursor, match.index), bold: false })
    runs.push({ text: match[1] || match[2] || "", bold: !!match[1] })
    cursor = match.index + match[0].length
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor), bold: false })
  return runs.filter((run) => run.text)
}

async function writeDocx(blocks: Block[]) {
  const paragraphs = blocks.map((block) => {
    const style = ({ h1: "Heading1", h2: "Heading2", h3: "Heading3", h4: "Heading3" } as Record<string, string>)[block.kind]
    const indent = block.kind === "li" ? 360 * block.depth : block.kind === "quote" ? 360 : 0
    const properties = (style ? `<w:pStyle w:val="${style}"/>` : "") + (indent ? `<w:ind w:left="${indent}"/>` : "")
    const body = (block.marker ? docxRun({ text: block.marker + " ", bold: false }) : "") + block.runs
      .map((run) => docxRun({ text: run.text, bold: block.kind.startsWith("h") || run.bold })).join("")
    return `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ""}${body}</w:p>`
  }).join("")
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
${paragraphs}
<w:sectPr>
<w:pgSz w:w="11906" w:h="16838"/>
<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/>
</w:sectPr>
</w:body>
</w:document>
`
  const zip = new ZipWriter(new Uint8ArrayWriter())
  for (const [name, content] of Object.entries({ ...docxParts, "word/document.xml": document })) {
    await zip.add(name, new TextReader(content), { useWebWorkers: false })
  }
  return zip.close()
}

function docxRun(run: Run) {
  const space = run.text.startsWith(" ") || run.text.endsWith(" ") || run.text.includes("  ") ? ' xml:space="preserve"' : ""
  const text = run.text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  return `<w:r>${run.bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t${space}>${text}</w:t></w:r>`
}

type Glyphs = { F1: Map<number, string>; F2: Map<number, string> }
type Page = { commands: string[]; glyphs: Glyphs }
type Character = { text: string; bold: boolean }

async function writePdf(blocks: Block[], fonts: URL) {
  const [regular, bold] = await Promise.all([
    loadFont(new URL("GolosText-Regular.ttf", fonts), "GolosText"),
    loadFont(new URL("GolosText-Bold.ttf", fonts), "GolosText-Bold"),
  ])
  const pages = layoutPdf(blocks, regular, bold)
  regular.data = subsetFont(regular.data, new Set(pages.flatMap((page) => [...page.glyphs.F1.keys()])))
  bold.data = subsetFont(bold.data, new Set(pages.flatMap((page) => [...page.glyphs.F2.keys()])))
  return assemblePdf(pages, regular, bold)
}

function layoutPdf(blocks: Block[], regular: ReportFont, bold: ReportFont) {
  const pages: Page[] = []
  let current: Page = { commands: [], glyphs: { F1: new Map(), F2: new Map() } }
  let y = 841.89 - 56
  const newPage = () => {
    if (current.commands.length) pages.push(current)
    current = { commands: [], glyphs: { F1: new Map(), F2: new Map() } }
    y = 841.89 - 56
  }
  const gap = (amount: number) => {
    if (current.commands.length && y - amount < 56) { newPage(); return }
    y -= amount
  }
  for (const block of blocks) {
    const style = pdfStyle(block)
    const chars = block.runs.flatMap((run) => [...run.text].map((text) => ({ text, bold: block.kind.startsWith("h") || run.bold })))
    const marker = block.marker ? block.marker + " " : ""
    const markerWidth = [...marker].reduce((sum, char) => sum + regular.width(char, style.size), 0)
    const wrapped = wrapText(chars, 595.28 - 112 - style.indent - markerWidth, style.size, regular, bold)
    gap(style.before)
    const ascent = regular.ascent * style.size / regular.units, leading = style.size * 1.35
    for (const [index, line] of (wrapped.length ? wrapped : [[]]).entries()) {
      if (y - leading < 56) newPage()
      const baseline = y - ascent, x = 56 + style.indent
      if (!index && marker) current.commands.push(pdfTextCommand(regular, "F1", marker, style.size, x, baseline, current.glyphs))
      current.commands.push(pdfLine(line, style.size, x + (!index ? markerWidth : 0), baseline, regular, bold, current.glyphs))
      y -= leading
    }
    gap(style.after)
  }
  pages.push(current)
  return pages.some((page) => page.commands.length) ? pages.filter((page) => page.commands.length) : [current]
}

function pdfStyle(block: Block) {
  if (block.kind === "h1") return { size: 18, before: 12, after: 8, indent: 0 }
  if (block.kind === "h2") return { size: 15, before: 10, after: 6, indent: 0 }
  if (block.kind === "h3" || block.kind === "h4") return { size: 13, before: 8, after: 4, indent: 0 }
  if (block.kind === "quote") return { size: 11, before: 2, after: 6, indent: 16 }
  if (block.kind === "li") return { size: 11, before: 1, after: 2, indent: 14 * block.depth }
  return { size: 11, before: 2, after: 6, indent: 0 }
}

function wrapText(chars: Character[], maximum: number, size: number, regular: ReportFont, bold: ReportFont) {
  const lines: Character[][] = []
  let line: Character[] = [], width = 0, lastSpace = -1
  const measure = (character: Character) => (character.bold ? bold : regular).width(character.text, size)
  for (const character of chars) {
    const next = measure(character)
    if (character.text === " ") lastSpace = line.length
    if (line.length && width + next > maximum) {
      lines.push(lastSpace > 0 ? line.slice(0, lastSpace) : line)
      line = lastSpace > 0 ? line.slice(lastSpace + 1) : []
      width = line.reduce((sum, character) => sum + measure(character), 0)
      lastSpace = -1
    }
    line.push(character)
    width += next
  }
  if (line.length) lines.push(line)
  return lines
}

function pdfLine(line: Character[], size: number, x: number, y: number, regular: ReportFont, bold: ReportFont, used: Glyphs) {
  const chunks: string[] = []
  let cursor = x, index = 0
  while (index < line.length) {
    const isBold = line[index].bold
    let end = index + 1
    while (end < line.length && line[end].bold === isBold) end++
    const text = line.slice(index, end).map((character) => character.text).join("")
    const font = isBold ? bold : regular
    chunks.push(pdfTextCommand(font, isBold ? "F2" : "F1", text, size, cursor, y, used))
    cursor += [...text].reduce((sum, character) => sum + font.width(character, size), 0)
    index = end
  }
  return chunks.join("\n")
}

function pdfTextCommand(font: ReportFont, key: keyof Glyphs, text: string, size: number, x: number, y: number, used: Glyphs) {
  const glyphs = [...text].map((character) => {
    const glyph = font.glyph(character)
    if (!used[key].has(glyph)) used[key].set(glyph, character)
    return glyph.toString(16).toUpperCase().padStart(4, "0")
  }).join("")
  return `BT /${key} ${size.toFixed(2)} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm <${glyphs}> Tj ET`
}

function assemblePdf(pages: Page[], regular: ReportFont, bold: ReportFont) {
  // Objects 3–12 contain two fonts; page and content objects follow them.
  const used: Glyphs = { F1: new Map(), F2: new Map() }
  for (const page of pages) for (const key of ["F1", "F2"] as const)
    for (const [glyph, character] of page.glyphs[key]) used[key].set(glyph, character)
  const objects = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, index) => `${13 + index} 0 R`).join(" ")}] >>`),
    ...fontObjects(regular, used.F1, 3), ...fontObjects(bold, used.F2, 8),
    ...pages.map((_, index) => Buffer.from("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] " +
      `/Resources << /Font << /F1 7 0 R /F2 12 0 R >> >> /Contents ${13 + pages.length + index} 0 R >>`)),
    ...pages.map((page) => stream(Buffer.from(page.commands.join("\n") + "\n"))),
  ]
  return pdfBytes(objects)
}

function stream(bytes: Buffer, extra = "") {
  return Buffer.concat([Buffer.from(`<< /Length ${bytes.length}${extra} >>\nstream\n`), bytes, Buffer.from("\nendstream")])
}

function fontObjects(font: ReportFont, used: Map<number, string>, first: number) {
  const widths = [...used.keys()].toSorted((a, b) => a - b).map((glyph) => {
    const width = font.advances[Math.min(glyph, font.advances.length - 1)] * 1000 / font.units
    return `${glyph} [${width % 1 === 0.5 ? 2 * Math.round(width / 2) : Math.round(width)}]`
  }).join(" ")
  return [
    stream(deflateSync(font.data), ` /Length1 ${font.data.length} /Filter /FlateDecode`),
    Buffer.from(`<< /Type /FontDescriptor /FontName /${font.name} /Flags 32 /FontBBox [${font.bbox.join(" ")}] ` +
      `/ItalicAngle 0 /Ascent ${font.ascent} /Descent ${font.descent} /CapHeight ${font.ascent} /StemV 80 /FontFile2 ${first} 0 R >>`),
    Buffer.from(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${font.name} ` +
      `/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${first + 1} 0 R /CIDToGIDMap /Identity /DW 500 /W [${widths}] >>`),
    stream(Buffer.from(toUnicode(used))),
    Buffer.from(`<< /Type /Font /Subtype /Type0 /BaseFont /${font.name} /Encoding /Identity-H /DescendantFonts [${first + 2} 0 R] /ToUnicode ${first + 3} 0 R >>`),
  ]
}

function toUnicode(used: Map<number, string>) {
  const pairs = [...used].toSorted((a, b) => a[0] - b[0])
  const lines = ["/CIDInit /ProcSet findresource begin", "12 dict begin", "begincmap",
    "/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> def",
    "/CMapName /Adobe-Identity-UCS def", "/CMapType 2 def", "1 begincodespacerange", "<0000> <FFFF>", "endcodespacerange"]
  for (let offset = 0; offset < pairs.length; offset += 100) {
    const chunk = pairs.slice(offset, offset + 100)
    lines.push(`${chunk.length} beginbfchar`, ...chunk.map(([glyph, character]) =>
      `<${glyph.toString(16).toUpperCase().padStart(4, "0")}> <${Buffer.from(character, "utf16le").swap16().toString("hex").toUpperCase()}>`), "endbfchar")
  }
  if (!pairs.length) lines.push("0 beginbfchar", "endbfchar")
  return [...lines, "endcmap", "CMapName currentdict /CMap defineresource pop", "end", "end", ""].join("\n")
}

function pdfBytes(objects: Buffer[]) {
  const chunks = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")]
  const offsets: number[] = []
  let cursor = chunks[0].length
  for (const [index, body] of objects.entries()) {
    const chunk = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), body, Buffer.from("\nendobj\n")])
    offsets.push(cursor)
    chunks.push(chunk)
    cursor += chunk.length
  }
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${cursor}\n%%EOF\n`))
  return Buffer.concat(chunks)
}

const docxParts = {
  "[Content_Types].xml": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">\n<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>\n<Default Extension=\"xml\" ContentType=\"application/xml\"/>\n<Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/>\n<Override PartName=\"/word/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml\"/>\n</Types>\n",
  "_rels/.rels": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\n<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/>\n</Relationships>\n",
  "word/styles.xml": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<w:styles xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">\n<w:style w:type=\"paragraph\" w:default=\"1\" w:styleId=\"Normal\"><w:name w:val=\"Normal\"/><w:rPr><w:sz w:val=\"22\"/><w:szCs w:val=\"22\"/></w:rPr></w:style>\n<w:style w:type=\"paragraph\" w:styleId=\"Heading1\"><w:name w:val=\"heading 1\"/><w:basedOn w:val=\"Normal\"/><w:pPr><w:spacing w:before=\"240\" w:after=\"120\"/></w:pPr><w:rPr><w:b/><w:sz w:val=\"36\"/><w:szCs w:val=\"36\"/></w:rPr></w:style>\n<w:style w:type=\"paragraph\" w:styleId=\"Heading2\"><w:name w:val=\"heading 2\"/><w:basedOn w:val=\"Normal\"/><w:pPr><w:spacing w:before=\"200\" w:after=\"80\"/></w:pPr><w:rPr><w:b/><w:sz w:val=\"30\"/><w:szCs w:val=\"30\"/></w:rPr></w:style>\n<w:style w:type=\"paragraph\" w:styleId=\"Heading3\"><w:name w:val=\"heading 3\"/><w:basedOn w:val=\"Normal\"/><w:pPr><w:spacing w:before=\"160\" w:after=\"60\"/></w:pPr><w:rPr><w:b/><w:sz w:val=\"26\"/><w:szCs w:val=\"26\"/></w:rPr></w:style>\n</w:styles>\n",
  "word/_rels/document.xml.rels": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\n<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/>\n</Relationships>\n"
}
