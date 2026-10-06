import { TextReader, Uint8ArrayWriter, ZipWriter } from "@zip.js/zip.js"

export async function renderReport(markdown: string, format: "md" | "docx" | "pdf" = "pdf"): Promise<Uint8Array> {
  if (/PLACEHOLDER_/.test(markdown)) throw Error("PACKAGE_DOCS_PLACEHOLDER")
  if (format === "md") return new TextEncoder().encode(markdown.endsWith("\n") ? markdown : markdown + "\n")
  if (format === "docx") return writeDocx(parseBlocks(markdown))
  throw Error("PACKAGE_DOCS_EMIT_UNSUPPORTED")
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

const docxParts = {
  "[Content_Types].xml": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">\n<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>\n<Default Extension=\"xml\" ContentType=\"application/xml\"/>\n<Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/>\n<Override PartName=\"/word/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml\"/>\n</Types>\n",
  "_rels/.rels": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\n<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/>\n</Relationships>\n",
  "word/styles.xml": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<w:styles xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">\n<w:style w:type=\"paragraph\" w:default=\"1\" w:styleId=\"Normal\"><w:name w:val=\"Normal\"/><w:rPr><w:sz w:val=\"22\"/><w:szCs w:val=\"22\"/></w:rPr></w:style>\n<w:style w:type=\"paragraph\" w:styleId=\"Heading1\"><w:name w:val=\"heading 1\"/><w:basedOn w:val=\"Normal\"/><w:pPr><w:spacing w:before=\"240\" w:after=\"120\"/></w:pPr><w:rPr><w:b/><w:sz w:val=\"36\"/><w:szCs w:val=\"36\"/></w:rPr></w:style>\n<w:style w:type=\"paragraph\" w:styleId=\"Heading2\"><w:name w:val=\"heading 2\"/><w:basedOn w:val=\"Normal\"/><w:pPr><w:spacing w:before=\"200\" w:after=\"80\"/></w:pPr><w:rPr><w:b/><w:sz w:val=\"30\"/><w:szCs w:val=\"30\"/></w:rPr></w:style>\n<w:style w:type=\"paragraph\" w:styleId=\"Heading3\"><w:name w:val=\"heading 3\"/><w:basedOn w:val=\"Normal\"/><w:pPr><w:spacing w:before=\"160\" w:after=\"60\"/></w:pPr><w:rPr><w:b/><w:sz w:val=\"26\"/><w:szCs w:val=\"26\"/></w:rPr></w:style>\n</w:styles>\n",
  "word/_rels/document.xml.rels": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\n<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/>\n</Relationships>\n"
}
