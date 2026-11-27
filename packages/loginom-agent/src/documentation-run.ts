import { constants } from "node:fs"
import { copyFile, mkdir, mkdtemp, realpath, stat } from "node:fs/promises"
import { basename, extname, isAbsolute, join } from "node:path"
import { Global } from "@opencode/util/global"

export async function prepareDocumentation(packagePath: string, home = Global.Path.home) {
  if (!isAbsolute(packagePath) || extname(packagePath).toLowerCase() !== ".lgp")
    throw Error("PACKAGE_DOCS_LGP_REQUIRED")
  const source = await realpath(packagePath)
  if (extname(source).toLowerCase() !== ".lgp" || !(await stat(source)).isFile())
    throw Error("PACKAGE_DOCS_LGP_REQUIRED")
  const filename = basename(packagePath)
  const root = join(home, "Documents", "Loginom AI Agent", "Без проекта")
  await mkdir(root, { recursive: true })
  const directory = await mkdtemp(
    join(await realpath(root), `${new Date().toISOString().slice(0, 10)} — Документировать пакет-`),
  )
  await copyFile(source, join(directory, filename), constants.COPYFILE_EXCL)
  return { directory, filename }
}
