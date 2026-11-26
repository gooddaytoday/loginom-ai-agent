// SQLite, Loginom data and legacy Excel files are opened by native importers from their original path, so they travel as
// a path reference and their bytes are never read into the renderer (0.4.2 `binaryReferenceMime`).
const BINARY_REFERENCE_MIMES = new Map([
  ["db", "application/octet-stream"],
  ["lgd", "application/octet-stream"],
  ["xls", "application/vnd.ms-excel"],
])

export function binaryReferenceMime(name: string) {
  const dot = name.lastIndexOf(".")

  return dot === -1 ? undefined : BINARY_REFERENCE_MIMES.get(name.slice(dot + 1).toLowerCase())
}
