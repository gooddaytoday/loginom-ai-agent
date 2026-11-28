import { Schema } from "effect"
import { Ipc } from "@opencode/plugin/gui"

export const workspaceFolder = "Loginom AI Agent"

export const conversationsFolder = "Без проекта"

export const ManagedFolders = Ipc.define({
  id: "loginom-gui.folders",
  methods: {
    draftDirectory: { input: Schema.String, output: Schema.String },
    discardDraft: { input: Schema.String, output: Schema.Boolean },
    project: { input: Schema.String, output: Schema.String },
    conversation: { input: Schema.String, output: Schema.String },
    finish: { input: Schema.Struct({ directory: Schema.String, keep: Schema.Boolean }), output: Schema.Boolean },
  },
})

export async function allocateManagedFolder(
  pending: Promise<string>,
  use: (directory: string) => Promise<void>,
  release: (input: { directory: string; keep: boolean }) => Promise<boolean>,
  forget?: (directory: string) => Promise<void>,
) {
  const directory = await pending

  const finish = async (keep: boolean) => {
    if (await release({ directory, keep })) await forget?.(directory)
  }

  try {
    await use(directory)

    return { directory, finish }
  } catch (error) {
    await finish(false).catch(() => undefined)
    throw error
  }
}

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
