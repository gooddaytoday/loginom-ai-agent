import { ManualEdits } from "@loginom-ai-agent/loginom-host/manual-edits"
import { Schema } from "effect"

const decode = Schema.decodeUnknownOption(ManualEdits)
const caption = (text: string) => {
  const clean = text
    .replace(/[\s\p{Cc}\p{Cf}]+/gu, " ")
    .replaceAll("«", "‹")
    .replaceAll("»", "›")
    .trim()
  const chars = Array.from(clean)
  return `«${chars.length > 30 ? chars.slice(0, 29).join("") + "…" : clean}»`
}

export function manualEditNotice(value: unknown, operationId: string | undefined, state: "running" | "settled") {
  if (value === undefined) return
  const result = decode(value)
  if (result._tag === "None") return
  const manualEdits = result.value
  const phrases = manualEdits.edits.slice(0, 3).map((edit) => {
    switch (edit.kind) {
      case "node_added":
        return `добавили ${caption(edit.node.label)}`
      case "node_removed":
        return `удалили ${caption(edit.node.label)}`
      case "node_renamed":
        return `переименовали ${caption(edit.from)} → ${caption(edit.to)}`
      case "node_moved":
        return `переместили ${caption(edit.label)}`
      case "link_added":
        return `добавили связь ${caption(edit.sourceLabel)} → ${caption(edit.targetLabel)}`
      case "link_removed":
        return `удалили связь ${caption(edit.sourceLabel)} → ${caption(edit.targetLabel)}`
    }
  })
  const remaining = manualEdits.omitted + manualEdits.edits.length - phrases.length
  if (remaining) phrases.push(phrases.length ? `ещё ${remaining}` : `изменений: ${remaining}`)
  if (!phrases.length) return
  return {
    loginom: operationId ? { v: 1, operationId, state, manualEdits, verificationStale: true } : undefined,
    text: `Учёл ваши правки в Loginom: ${phrases.join(", ")}.`,
  }
}
