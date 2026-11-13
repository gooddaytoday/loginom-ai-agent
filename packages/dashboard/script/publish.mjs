import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import { homedir } from "node:os"
import { basename, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const [id, option, ...extra] = process.argv.slice(2)
if (!/^[a-f0-9-]{36}$/.test(id ?? "") || (option !== undefined && option !== "--init") || extra.length) {
  throw Error("Использование: node packages/dashboard/script/publish.mjs <ID снимка> [--init]")
}

const response = await fetch((process.env.DASHBOARD_BASE ?? "http://127.0.0.1:32768") + "/dashboard/targets/" + id)
if (!response.ok) throw Error(`Снимок ${id} недоступен: HTTP ${response.status}`)
const snapshot = await response.json()
const template = fileURLToPath(new URL("../template/", import.meta.url))
const apps = process.env.DASHBOARD_APPS ?? fileURLToPath(new URL("../../../dashboard/apps/", import.meta.url))
if (snapshot.id !== id || !/^[a-f0-9]{64}$/.test(snapshot.key)) throw Error("Неверная привязка снимка")
const sourceDir = join(apps, snapshot.key)
if (sourceDir !== snapshot.sourceDir) throw Error("Каталог исходников не соответствует привязке")

if (option === "--init") {
  const modules = await realpath(join(template, "node_modules"))
  await mkdir(apps, { recursive: true })
  const staging = await mkdtemp(join(apps, ".init-"))
  try {
    await cp(template, staging, {
      recursive: true,
      filter: path => !["node_modules", "dist"].includes(basename(path)),
    })
    await symlink(modules, join(staging, "node_modules"), "dir")
    // rename refuses to replace a nonempty directory, including an existing edited app.
    await rename(staging, sourceDir)
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
  console.log(sourceDir)
} else {
  if (await realpath(sourceDir) !== sourceDir) throw Error("Недопустимый путь к исходникам")
  if (process.platform !== "linux") throw Error("Публикация M2 поддерживается на Linux dev-стенде")
  // A kernel-owned name excludes concurrent builds without leaving a stale lock file.
  const lock = createServer(socket => socket.destroy())
  await new Promise((resolve, reject) => {
    lock.once("error", reject)
    lock.listen("\0loginom-dashboard-publish-" + createHash("sha256").update(sourceDir).digest("hex"), resolve)
  }).catch(error => {
    if (error.code === "EADDRINUSE") throw Error("Публикация этого приложения уже выполняется. Повторите команду после её завершения.")
    throw error
  })
  try {
    // A fresh checkout has the app sources but no ignored node_modules link.
    await symlink(await realpath(join(template, "node_modules")), join(sourceDir, "node_modules"), "dir")
      .catch(error => { if (error.code !== "EEXIST") throw error })
    execFileSync("npm", ["run", "typecheck"], { cwd: sourceDir, stdio: "inherit" })
    execFileSync("npm", ["run", "build"], { cwd: sourceDir, stdio: "inherit" })
    if (snapshot.tableSource === "unavailable") throw Error("В снимке нет примера результата: выполните узел и откройте Dashboard заново")
    const dist = join(sourceDir, "dist")
    const builds = process.env.DASHBOARD_BUILDS ?? join(homedir(), "loginom-dashboard/builds")
    const keyDir = join(builds, snapshot.key)
    await mkdir(keyDir, { recursive: true, mode: 0o700 })
    const staging = await mkdtemp(join(keyDir, ".build-"))
    try {
      await cp(dist, staging, { recursive: true })
      // Hash the completed private copy, not the mutable source directory.
      const files = (await readdir(staging, { recursive: true, withFileTypes: true }))
        .filter(entry => entry.isFile())
        .map(entry => relative(staging, join(entry.parentPath, entry.name)))
        .sort()
      const sha = createHash("sha256")
      for (const file of files) {
        const bytes = await readFile(join(staging, file))
        sha.update(file).update("\0").update(String(bytes.length)).update("\0").update(bytes)
      }
      const hash = sha.digest("hex")
      const target = join(keyDir, hash)
      if (!existsSync(target)) {
        // A concurrent publication of identical bytes may win the rename.
        await rename(staging, target).catch(error => { if (!existsSync(target)) throw error })
      }
      const replace = async (name, text) => {
        const temp = join(keyDir, `.${name}.${process.pid}.tmp`)
        await writeFile(temp, text, { mode: 0o600 })
        await rename(temp, join(keyDir, name))
      }
      await replace("binding.json", JSON.stringify(snapshot.binding) + "\n")
      await replace("sample.json", JSON.stringify({ schema: snapshot.schema, rows: snapshot.rows }) + "\n")
      // Switch lookup only after the complete build and its private metadata exist.
      await replace("current", hash + "\n")
      console.log(`Опубликовано: ${target}`)
    } finally {
      await rm(staging, { recursive: true, force: true })
    }
  } finally {
    await new Promise(resolve => lock.close(resolve))
  }
}
