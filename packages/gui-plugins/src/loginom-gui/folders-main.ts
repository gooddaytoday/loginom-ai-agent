import { mkdir, rmdir } from "node:fs/promises"
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
  for (let index = 1; ; index++) {
    const directory = path.join(parent, index === 1 ? name : `${name} (${index})`)
    try {
      await mkdir(directory)
      return directory
    } catch (error) {
      if (!hasCode(error, ["EEXIST"])) throw error
    }
  }
}

function hasCode(error: unknown, codes: readonly string[]) {
  if (!(error instanceof Error) || !("code" in error)) return false
  return codes.some((code) => code === error.code)
}

export function managedFolders(documents: string, profile: string, today = () => new Date()) {
  const allocations = new Set<string>()
  const allocate = async (folder: string, name: string) => {
    const directory = await createFolder(path.join(documents, workspaceFolder, folder), name).catch((error) => {
      if (!hasCode(error, ["EACCES", "EPERM", "EROFS", "ENOENT", "ENOTDIR", "ENOSPC"])) throw error
      return createFolder(path.join(profile, workspaceFolder, folder), name)
    })
    allocations.add(directory)
    return directory
  }

  return {
    async draftDirectory(draftID: string) {
      if (!/^[a-z0-9-]{1,80}$/i.test(draftID)) throw new Error("Invalid draft ID")
      const directory = await createFolder(path.join(profile, "drafts"), draftID)
      allocations.add(directory)
      return directory
    },
    project(title: string) {
      if (!title.trim()) throw new Error("Missing project name")
      return allocate("Проекты", folderName(title))
    },
    conversation(title: string) {
      const date = today()
      const day = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
        .map((part) => String(part).padStart(2, "0"))
        .join("-")
      return allocate(conversationsFolder, `${day} ${folderName(title)}`)
    },
    async finish({ directory, keep }: { directory: string; keep: boolean }) {
      if (!allocations.delete(directory) || keep) return
      await rmdir(directory).catch((error) => {
        if (!hasCode(error, ["ENOENT", "ENOTEMPTY", "EEXIST"])) throw error
      })
    },
  }
}
