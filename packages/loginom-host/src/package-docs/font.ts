import { readFile } from "node:fs/promises"

export type ReportFont = Awaited<ReturnType<typeof loadFont>>

export async function loadFont(url: URL, name: string) {
  const data = await readFile(url).catch((error: unknown) => {
    if (error && typeof error === "object" && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR"))
      throw Error("PACKAGE_DOCS_FONT_MISSING")
    throw Error("PACKAGE_DOCS_FONT_UNREADABLE")
  })
  const tables = fontTables(data)
  const units = tables.head.readUInt16BE(18)
  const bbox = [36, 38, 40, 42].map((offset) => tables.head.readInt16BE(offset))
  const count = tables.hhea.readUInt16BE(34)
  const advances = Array.from({ length: count }, (_, index) => tables.hmtx.readUInt16BE(index * 4))
  const glyphOf = cmap(tables.cmap)
  const glyph = (character: string) => glyphOf(character.codePointAt(0)!)
  if (!units || !count || !glyph("A") || !glyph("А")) throw Error("PACKAGE_DOCS_FONT_INVALID")
  return { data, name, units, bbox, advances, glyph,
    ascent: tables.hhea.readInt16BE(4), descent: tables.hhea.readInt16BE(6),
    width: (character: string, size: number) => advances[Math.min(glyph(character), advances.length - 1)] * size / units }
}

function fontTables(data: Buffer) {
  if (data.length < 12) throw Error("PACKAGE_DOCS_FONT_INVALID")
  const count = data.readUInt16BE(4)
  if (12 + count * 16 > data.length) throw Error("PACKAGE_DOCS_FONT_INVALID")
  const tables: Record<string, Buffer> = {}
  for (let index = 0; index < count; index++) {
    const offset = 12 + index * 16
    const tag = data.toString("latin1", offset, offset + 4)
    const start = data.readUInt32BE(offset + 8), length = data.readUInt32BE(offset + 12)
    if (start + length > data.length || tables[tag]) throw Error("PACKAGE_DOCS_FONT_INVALID")
    tables[tag] = data.subarray(start, start + length)
  }
  if (["head", "hhea", "hmtx", "cmap", "maxp", "loca", "glyf"].some((tag) => !tables[tag]))
    throw Error("PACKAGE_DOCS_FONT_INVALID")
  if (tables.head.length < 54 || tables.hhea.length < 36 || tables.maxp.length < 6 || tables.cmap.length < 4 ||
      tables.hmtx.length < tables.hhea.readUInt16BE(34) * 4)
    throw Error("PACKAGE_DOCS_FONT_INVALID")
  return tables
}

function cmap(table: Buffer) {
  const subtables = Array.from({ length: table.readUInt16BE(2) }, (_, index) => {
    const offset = 4 + index * 8
    return { platform: table.readUInt16BE(offset), encoding: table.readUInt16BE(offset + 2), offset: table.readUInt32BE(offset + 4) }
  })
  const unicode = subtables.find((entry) => table.readUInt16BE(entry.offset) === 12)
  if (unicode) return cmap12(table, unicode.offset)
  const windows = subtables.find((entry) => entry.platform === 3 && entry.encoding === 1 && table.readUInt16BE(entry.offset) === 4)
  if (windows) return cmap4(table, windows.offset)
  throw Error("PACKAGE_DOCS_FONT_CMAP_MISSING")
}

function cmap12(table: Buffer, offset: number) {
  const groups = Array.from({ length: table.readUInt32BE(offset + 12) }, (_, index) => {
    const cursor = offset + 16 + index * 12
    return { start: table.readUInt32BE(cursor), end: table.readUInt32BE(cursor + 4), glyph: table.readUInt32BE(cursor + 8) }
  })
  return (code: number) => {
    let low = 0, high = groups.length - 1
    while (low <= high) {
      const middle = Math.floor((low + high) / 2)
      const group = groups[middle]
      if (code < group.start) { high = middle - 1; continue }
      if (code > group.end) { low = middle + 1; continue }
      return group.glyph + code - group.start
    }
    return 0
  }
}

function cmap4(table: Buffer, offset: number) {
  const count = table.readUInt16BE(offset + 6) / 2
  const ends = offset + 14, starts = ends + count * 2 + 2, deltas = starts + count * 2, offsets = deltas + count * 2
  return (code: number) => {
    for (let index = 0; index < count; index++) {
      if (code > table.readUInt16BE(ends + index * 2)) continue
      const start = table.readUInt16BE(starts + index * 2)
      if (code < start) return 0
      const delta = table.readInt16BE(deltas + index * 2)
      const range = table.readUInt16BE(offsets + index * 2)
      if (!range) return (code + delta) & 0xffff
      const glyph = table.readUInt16BE(offsets + index * 2 + range + (code - start) * 2)
      return glyph ? (glyph + delta) & 0xffff : 0
    }
    return 0
  }
}

export function subsetFont(data: Buffer, glyphs: Set<number>) {
  const tables = fontTables(data)
  const count = tables.maxp.readUInt16BE(4)
  const short = tables.head.readInt16BE(50) === 0
  const offsets = Array.from({ length: count + 1 }, (_, index) => short
    ? tables.loca.readUInt16BE(index * 2) * 2 : tables.loca.readUInt32BE(index * 4))
  const needed = new Set([0, ...glyphs])
  const pending = [...needed]
  while (pending.length) {
    const glyph = pending.pop()!
    for (const component of compositeGlyphs(tables.glyf, offsets[glyph], offsets[glyph + 1])) {
      if (needed.has(component)) continue
      needed.add(component)
      pending.push(component)
    }
  }
  // Retain original glyph IDs in empty slots so Identity-H text needs no remap.
  const glyphData = Array.from({ length: count }, (_, glyph) => needed.has(glyph)
    ? tables.glyf.subarray(offsets[glyph], offsets[glyph + 1]) : Buffer.alloc(0))
  const loca = Buffer.alloc((count + 1) * 4)
  let cursor = 0
  for (const [index, bytes] of glyphData.entries()) {
    loca.writeUInt32BE(cursor, index * 4)
    cursor += bytes.length
  }
  loca.writeUInt32BE(cursor, count * 4)
  const head = Buffer.from(tables.head)
  head.writeUInt32BE(0, 8)
  head.writeInt16BE(1, 50)
  return packFont(Object.fromEntries(["OS/2", "cmap", "head", "hhea", "hmtx", "maxp", "name", "post"]
    .filter((tag) => tables[tag]?.length).map((tag) => [tag, tag === "head" ? head : tables[tag]])
    .concat([["loca", loca], ["glyf", Buffer.concat([...glyphData, Buffer.alloc((4 - cursor % 4) % 4)])]])))
}

function compositeGlyphs(data: Buffer, start: number, end: number) {
  if (end < start + 10 || data.readInt16BE(start) >= 0) return []
  const glyphs: number[] = []
  let cursor = start + 10
  while (cursor + 4 <= end) {
    const flags = data.readUInt16BE(cursor)
    glyphs.push(data.readUInt16BE(cursor + 2))
    cursor += 4 + (flags & 1 ? 4 : 2) + (flags & 8 ? 2 : flags & 64 ? 4 : flags & 128 ? 8 : 0)
    if (!(flags & 32)) break
  }
  return glyphs
}

function checksum(data: Buffer) {
  const padded = Buffer.concat([data, Buffer.alloc((4 - data.length % 4) % 4)])
  let result = 0
  for (let offset = 0; offset < padded.length; offset += 4) result = (result + padded.readUInt32BE(offset)) >>> 0
  return result
}

function packFont(tables: Record<string, Buffer>) {
  const tags = Object.keys(tables).toSorted()
  const count = tags.length, selector = Math.floor(Math.log2(count)), range = 2 ** selector * 16
  const directory = Buffer.alloc(12 + count * 16)
  directory.writeUInt32BE(0x00010000)
  directory.writeUInt16BE(count, 4)
  directory.writeUInt16BE(range, 6)
  directory.writeUInt16BE(selector, 8)
  directory.writeUInt16BE(count * 16 - range, 10)
  let offset = directory.length
  const data = tags.map((tag, index) => {
    const padded = Buffer.concat([tables[tag], Buffer.alloc((4 - tables[tag].length % 4) % 4)])
    const record = 12 + index * 16
    directory.write(tag, record, 4, "latin1")
    directory.writeUInt32BE(checksum(padded), record + 4)
    directory.writeUInt32BE(offset, record + 8)
    directory.writeUInt32BE(tables[tag].length, record + 12)
    offset += padded.length
    return padded
  })
  const font = Buffer.concat([directory, ...data])
  const head = directory.readUInt32BE(12 + tags.indexOf("head") * 16 + 8)
  font.writeUInt32BE((0xb1b0afba - checksum(font)) >>> 0, head + 8)
  return font
}
