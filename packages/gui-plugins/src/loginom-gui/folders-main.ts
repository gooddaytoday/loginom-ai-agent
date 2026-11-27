import { mkdir, mkdtemp } from "node:fs/promises"
import path from "node:path"
import { conversationsFolder, workspaceFolder } from "./folders"

function folderName(title: string) {
  const clean = [...title.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")]
    .slice(0, 60)
    .join("")
    .replace(/[. ]+$/, "")
  if (!clean) return "—"
  return /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i.test(clean) ? `_${clean}` : clean
}

async function createFolder(parent: string, name: string) {
  await mkdir(parent, { recursive: true })
  const directory = path.join(parent, name)
  try {
    await mkdir(directory)
    return directory
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error
    return mkdtemp(`${directory} — `)
  }
}

export function managedFolders(documents: string, today = () => new Date()) {
  const root = path.join(documents, workspaceFolder)
  const loose = path.join(root, conversationsFolder)
  return {
    async draftDirectory() {
      await mkdir(loose, { recursive: true })
      return loose
    },
    project(title: string) {
      if (!title.trim()) throw new Error("Missing project name")
      return createFolder(path.join(root, "Проекты"), folderName(title))
    },
    conversation(title: string) {
      const date = today()
      const day = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
        .map((part) => String(part).padStart(2, "0"))
        .join("-")
      return createFolder(loose, `${day} ${folderName(title)}`)
    },
  }
}
