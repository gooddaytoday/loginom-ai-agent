import { lstat, mkdir, mkdtemp, readdir, realpath, rename, rm, rmdir } from "node:fs/promises"
import path from "node:path"
import { conversationsFolder, isConversationFolder, workspaceFolder } from "./folders"

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

async function replaceEmptyDirectory(source: string, destination: string) {
  // Windows does not support replacing a directory with rename.
  if (process.platform === "win32") {
    await rmdir(destination)
    await rename(source, destination)
    return
  }
  try {
    await rename(source, destination)
  } catch (error) {
    await rmdir(destination)
    throw error
  }
}

export function managedFolders(documents: string, today = () => new Date()) {
  const root = path.resolve(documents, workspaceFolder)
  const loose = path.join(root, conversationsFolder)
  const projects = path.join(root, "Проекты")

  async function childPath(directory: string, parent: string) {
    const normalized = path.resolve(directory)
    if (path.dirname(normalized) !== parent) throw new Error("Outside managed folders")
    const canonicalDocuments = await realpath(documents)
    const canonicalParent = path.join(canonicalDocuments, path.relative(documents, parent))
    if ((await realpath(parent)) !== canonicalParent) throw new Error("Redirected managed folder")
    return normalized
  }

  async function child(directory: string, parent: string) {
    const normalized = await childPath(directory, parent)
    const info = await lstat(normalized)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Expected managed directory")
    return normalized
  }

  async function count(directory: string): Promise<number> {
    let total = 0
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      total += entry.isDirectory() ? await count(path.join(directory, entry.name)) : 1
    }
    return total
  }

  return {
    async validateProject(directory: string) {
      await child(directory, projects)
    },
    async countFiles(directory: string) {
      if (!isConversationFolder(directory)) throw new Error("Expected conversation folder")
      return count(await child(directory, loose))
    },
    async remove(directory: string) {
      const parent = isConversationFolder(directory) ? loose : projects
      await rm(await child(directory, parent), { recursive: true })
    },
    async moveFiles(input: { source: string; project: string; title: string }) {
      if (!isConversationFolder(input.source)) throw new Error("Expected conversation folder")
      const source = await child(input.source, loose)
      const project = await child(input.project, projects)
      const total = await count(source)
      const directory = await createFolder(project, folderName(input.title))
      await replaceEmptyDirectory(source, directory)
      return { directory, count: total }
    },
    async restoreFiles(input: { source: string; project: string; original: string }) {
      if (!isConversationFolder(input.original)) throw new Error("Expected conversation folder")
      const original = await childPath(input.original, loose)
      const source = await child(input.source, await child(input.project, projects))
      // Reserve the destination so concurrent folder creation cannot claim it.
      await mkdir(original)
      await replaceEmptyDirectory(source, original)
    },
    async draftDirectory() {
      await mkdir(loose, { recursive: true })
      return loose
    },
    project(title: string) {
      if (!title.trim()) throw new Error("Missing project name")
      return createFolder(projects, folderName(title))
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
