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

export function manualEditNotice(value: unknown, operationId: string, state: "running" | "settled") {
  if (!Array.isArray(value) || !value.length) return
  const result = decode(value)
  if (result._tag === "None") return
  const manualEdits = result.value
  const phrases = manualEdits.slice(0, 3).map((edit) => {
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
  if (manualEdits.length > phrases.length) phrases.push(`ещё ${manualEdits.length - phrases.length}`)
  return {
    loginom: { v: 1, operationId, state, manualEdits, verificationStale: true },
    text: `Учёл ваши правки в Loginom: ${phrases.join(", ")}.`,
  }
}
