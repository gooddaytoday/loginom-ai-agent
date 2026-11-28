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
      if (!(error instanceof Error) || !hasCode(error, ["EEXIST"])) throw error
    }
  }
}

function hasCode(error: Error, codes: readonly string[]) {
  return "code" in error && codes.some((code) => code === error.code)
}

function removeEmptyFolder(directory: string) {
  return rmdir(directory).then(
    () => true,
    (error) => {
      if (!(error instanceof Error)) throw error

      if (hasCode(error, ["ENOENT"])) return true

      if (hasCode(error, ["ENOTEMPTY", "EEXIST"])) return false

      throw error
    },
  )
}

export function managedFolders(documents: string, profile: string, today = () => new Date()) {
  const drafts = path.join(profile, "drafts")
  const allocations = new Set<string>()

  const allocate = async (folder: string, name: string) => {
    const directory = await createFolder(path.join(documents, workspaceFolder, folder), name).catch((error) => {
      if (!(error instanceof Error) || !hasCode(error, ["EACCES", "EPERM", "EROFS", "ENOENT", "ENOTDIR", "ENOSPC"])) throw error

      return createFolder(path.join(profile, workspaceFolder, folder), name)
    })

    allocations.add(directory)

    return directory
  }

  return {
    async draftDirectory(draftID: string) {
      if (!/^[a-z0-9-]{1,80}$/i.test(draftID)) throw new Error("Invalid draft ID")

      return createFolder(drafts, draftID)
    },
    async discardDraft(directory: string) {
      if (path.dirname(directory) !== drafts || !/^[a-z0-9-]{1,80}(?: \(\d+\))?$/i.test(path.basename(directory)))
        return false

      return removeEmptyFolder(directory)
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
      if (!allocations.delete(directory) || keep) return false

      return removeEmptyFolder(directory)
    },
  }
}
