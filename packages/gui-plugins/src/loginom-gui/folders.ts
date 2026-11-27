import { Schema } from "effect"
import { Ipc } from "@opencode/plugin/gui"

export const workspaceFolder = "Loginom AI Agent"
export const conversationsFolder = "Без проекта"

export const ManagedFolders = Ipc.define({
  id: "loginom-gui.folders",
  methods: {
    draftDirectory: { input: Schema.String, output: Schema.String },
    project: { input: Schema.String, output: Schema.String },
    conversation: { input: Schema.String, output: Schema.String },
    finish: { input: Schema.Struct({ directory: Schema.String, keep: Schema.Boolean }), output: Schema.Void },
  },
})

export function conversationTitle(prompt: string, fallback: string) {
  const line = prompt.trim().split(/\r?\n/, 1)[0] ?? ""
  return [...(line.replace(/\s+/g, " ") || fallback)].slice(0, 60).join("").trimEnd()
}

export function availableProjectName(requested: string, existing: readonly string[]) {
  const names = new Set(existing.map((name) => name.normalize().toLowerCase()))
  let name = requested
  for (let index = 2; names.has(name.normalize().toLowerCase()); index++) name = `${requested} (${index})`
  return name
}
