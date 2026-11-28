import { execFile } from "node:child_process"
import { constants } from "node:fs"
import { copyFile, mkdir, mkdtemp, readFile, realpath, rmdir, stat, unlink } from "node:fs/promises"
import { basename, extname, isAbsolute, join } from "node:path"
import { promisify } from "node:util"
import { Global } from "@opencode/util/global"

export async function xdgDocuments(home: string, config: string) {
  const contents = await readFile(join(config, "user-dirs.dirs"), "utf8").catch(() => "")
  const entry = /^XDG_DOCUMENTS_DIR="(.*)"[ \t]*\r?$/m.exec(contents)?.[1]
  if (entry === undefined) return join(home, "Documents")
  if (entry === "$HOME" || entry === "$HOME/") return
  const path = entry.startsWith("$HOME/") ? join(home, entry.slice(6)) : entry
  const documents = path.replace(/\\(["\\$`])/g, "$1")
  return isAbsolute(documents) ? documents : undefined
}

async function documentsDirectory() {
  const home = Global.Path.home
  if (process.platform === "win32") {
    if (process.env.LOGINOM_AI_AGENT_TEST_HOME) return join(home, "Documents")
    const systemRoot = process.env.SystemRoot
    if (!systemRoot || !isAbsolute(systemRoot)) return
    const { stdout } = await promisify(execFile)(
      join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "[Console]::OutputEncoding = [Text.Encoding]::UTF8; [Environment]::GetFolderPath('MyDocuments')",
      ],
      { windowsHide: true, timeout: 5_000 },
    )
    return stdout.trim()
  }
  if (process.platform === "darwin") return join(home, "Documents")
  const config = process.env.XDG_CONFIG_HOME
  return xdgDocuments(home, config && isAbsolute(config) ? config : join(home, ".config"))
}

async function runDirectory(documents: string | undefined, profile: string) {
  const create = async (root: string) => {
    await mkdir(root, { recursive: true })
    return mkdtemp(join(await realpath(root), `${new Date().toISOString().slice(0, 10)} — Документировать пакет-`))
  }

  if (documents && isAbsolute(documents)) {
    const directory = await stat(documents)
      .then(() => create(join(documents, "Loginom AI Agent", "Без проекта")))
      .catch(() => undefined)
    if (directory) return directory
  }
  return create(join(profile, "documentation-runs"))
}

export async function prepareDocumentation(
  packagePath: string,
  signal?: AbortSignal,
  folders = { documents: documentsDirectory, profile: Global.Path.data },
) {
  signal?.throwIfAborted()
  if (!isAbsolute(packagePath) || extname(packagePath).toLowerCase() !== ".lgp")
    throw Error("PACKAGE_DOCS_LGP_REQUIRED")
  const source = await realpath(packagePath)
  if (extname(source).toLowerCase() !== ".lgp" || !(await stat(source)).isFile())
    throw Error("PACKAGE_DOCS_LGP_REQUIRED")
  const filename = basename(packagePath)
  const documents = await folders.documents().catch(() => undefined)
  signal?.throwIfAborted()
  const directory = await runDirectory(documents, folders.profile)
  try {
    signal?.throwIfAborted()
    await copyFile(source, join(directory, filename), constants.COPYFILE_EXCL)
    signal?.throwIfAborted()
    return { directory, filename }
  } catch (error) {
    await discardDocumentation({ directory, filename })
    throw error
  }
}

export async function discardDocumentation(copy: { directory: string; filename: string }) {
  await unlink(join(copy.directory, copy.filename)).catch(ignoreMissing)
  await rmdir(copy.directory).catch(ignoreMissing)
}

function ignoreMissing(error: unknown) {
  if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error
}
