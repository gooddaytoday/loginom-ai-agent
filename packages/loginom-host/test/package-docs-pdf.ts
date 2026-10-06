// Independent evidence reader for the uncompressed page/ToUnicode streams in
// our frozen Python and Node PDFs. It needs no renderer or system Python in CI.
export function pdfText(bytes: Uint8Array) {
  const text = Buffer.from(bytes).toString("latin1")
  const objects = new Map([...text.matchAll(/(\d+) 0 obj\n([\s\S]*?)\nendobj/g)]
    .map((match) => [Number(match[1]), match[2]]))
  const resource = /\/Font << ([^]*?) >>/.exec(text)
  if (!resource) throw Error("PDF_FONT_RESOURCES_MISSING")
  const fonts = new Map([...resource[1].matchAll(/\/(F\d+) (\d+) 0 R/g)].map((match) => {
    const font = objects.get(Number(match[2])) ?? ""
    const reference = /\/ToUnicode (\d+) 0 R/.exec(font)
    if (!reference) throw Error("PDF_TO_UNICODE_MISSING")
    const mapping = objects.get(Number(reference[1])) ?? ""
    const pairs = [...mapping.matchAll(/\d+ beginbfchar\n([\s\S]*?)endbfchar/g)].flatMap((section) =>
      [...section[1].matchAll(/<([0-9A-F]{4})> <([0-9A-F]+)>/g)]
        .map((pair) => [pair[1], Buffer.from(pair[2], "hex").swap16().toString("utf16le")] as const))
    return [match[1], new Map(pairs)] as const
  }))
  return [...objects.values()].flatMap((object) => {
    const page = /\/Type \/Page .*\/Contents (\d+) 0 R/.exec(object)
    if (!page) return []
    const content = objects.get(Number(page[1])) ?? ""
    return [...content.matchAll(/BT \/(F\d+) [^\n]*?<([0-9A-F]+)> Tj ET/g)].map((command) =>
      (command[2].match(/.{4}/g) ?? []).map((glyph) => {
        const character = fonts.get(command[1])?.get(glyph)
        if (character === undefined) throw Error("PDF_GLYPH_UNMAPPED")
        return character
      }).join(""))
  })
}
