// The original snapshot is retained separately for Dock admission. Only this
// bounded preview goes into model text, using Read's line and byte limits.
export function attachmentPreview(text: string) {
  const lines = text.split("\n")
  const result: string[] = []
  let bytes = 0
  let truncated = false
  for (const original of lines) {
    const line = original.length > 2000 ? original.slice(0, 2000) + "... (line truncated to 2000 chars)" : original
    const size = Buffer.byteLength(line, "utf8") + (result.length ? 1 : 0)
    if (result.length === 2000 || bytes + size > 50 * 1024) {
      truncated = true
      break
    }
    result.push(line)
    bytes += size
    if (line !== original) truncated = true
  }
  return result.join("\n") + (truncated ? "\n\n[Attachment preview truncated; full snapshot retained for Dock.]" : "")
}
