import { Schema } from "effect"
import { Ipc } from "@opencode/plugin/gui"

export const workspaceFolder = "Loginom AI Agent"
export const conversationsFolder = "Без проекта"

export const ManagedFolders = Ipc.define({
  id: "loginom-gui.folders",
  methods: {
    draftDirectory: { output: Schema.String },
    project: { input: Schema.String, output: Schema.String },
    conversation: { input: Schema.String, output: Schema.String },
    validateProject: { input: Schema.String, output: Schema.Void },
    countFiles: { input: Schema.String, output: Schema.Number },
    remove: { input: Schema.String, output: Schema.Void },
    moveFiles: {
      input: Schema.Struct({ source: Schema.String, project: Schema.String, title: Schema.String }),
      output: Schema.Struct({ directory: Schema.String, count: Schema.Number }),
    },
    restoreFiles: {
      input: Schema.Struct({ source: Schema.String, project: Schema.String, original: Schema.String }),
      output: Schema.Void,
    },
  },
})

function parts(directory: string) {
  return directory.split(/[\\/]+/).filter(Boolean)
}

export function isConversationDraft(directory: string) {
  const segments = parts(directory)
  return segments.at(-2) === workspaceFolder && segments.at(-1) === conversationsFolder
}

export function isConversationFolder(directory: string) {
  const segments = parts(directory)
  return (
    segments.at(-3) === workspaceFolder &&
    segments.at(-2) === conversationsFolder &&
    /^\d{4}-\d{2}-\d{2} .+/.test(segments.at(-1) ?? "")
  )
}

export function conversationTitle(prompt: string, fallback: string) {
  const line = prompt.trim().split(/\r?\n/, 1)[0] ?? ""
  return [...(line.replace(/\s+/g, " ") || fallback)].slice(0, 60).join("").trimEnd()
}

export function isManagedProject(directory: string) {
  const segments = parts(directory)
  return segments.at(-3) === workspaceFolder && segments.at(-2) === "Проекты"
}
