import { execFileSync } from "node:child_process"
import { cp, mkdir, mkdtemp, realpath, rename, rm, symlink, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { fileURLToPath } from "node:url"

const [id, option, ...extra] = process.argv.slice(2)
if (!/^[a-f0-9-]{36}$/.test(id ?? "") || (option !== undefined && option !== "--init") || extra.length) {
  throw Error("Использование: node dashboard/publish.mjs <ID снимка> [--init]")
}

const response = await fetch("http://127.0.0.1:32768/dashboard/targets/" + id)
if (!response.ok) throw Error(`Снимок ${id} недоступен: HTTP ${response.status}`)
const snapshot = await response.json()
const dashboard = fileURLToPath(new URL(".", import.meta.url))
const apps = join(dashboard, "apps")
if (snapshot.id !== id || !/^[a-f0-9]{64}$/.test(snapshot.key)) throw Error("Неверная привязка снимка")
const sourceDir = join(apps, snapshot.key)
if (sourceDir !== snapshot.sourceDir) throw Error("Каталог исходников не соответствует привязке")

if (option === "--init") {
  const template = join(dashboard, "template")
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
  // A fresh checkout has the app sources but no ignored node_modules link.
  await symlink(await realpath(join(dashboard, "template/node_modules")), join(sourceDir, "node_modules"), "dir")
    .catch(error => { if (error.code !== "EEXIST") throw error })
  execFileSync("npm", ["run", "typecheck"], { cwd: sourceDir, stdio: "inherit" })
  execFileSync("npm", ["run", "build"], { cwd: sourceDir, stdio: "inherit" })
  const dist = join(sourceDir, "dist")
  await writeFile(join(dist, "binding.json"), JSON.stringify(snapshot.binding) + "\n")
  if (snapshot.tableSource === "unavailable") throw Error("В снимке нет примера результата: выполните узел и откройте Dashboard заново")
  await writeFile(join(dist, "sample.json"), JSON.stringify({ schema: snapshot.schema, rows: snapshot.rows }) + "\n")

  const container = "dashboard-master-20261109-server"
  const root = "/workdir/dashboard-app/apps"
  const docker = (...args) => execFileSync("docker", args, { encoding: "utf8" })
  docker("exec", container, "mkdir", "-p", root)
  const staging = docker("exec", container, "mktemp", "-d", `${root}/.${snapshot.key}.XXXXXX`).trim()
  try {
    docker("cp", dist + "/.", container + ":" + staging)
    // Switch the whole directory at once, after every file has arrived.
    docker("exec", container, "sh", "-ec", `
      dest=$1
      stage=$2
      key=$3
      previous=$(readlink "$dest" || true)
      if [ -d "$dest/assets" ]; then
        mkdir -p "$stage/assets"
        cp -aln "$dest/assets/." "$stage/assets/"
      fi
      ln -s "$(basename "$stage")" "$stage/.switch"
      mv -Tf "$stage/.switch" "$dest"
      case "$previous" in ."$key".??????) rm -rf -- "$(dirname "$dest")/$previous";; esac
    `, "sh", `${root}/${snapshot.key}`, staging, snapshot.key)
  } catch (error) {
    // After a successful switch, a cleanup failure must not delete the published app.
    docker("exec", container, "sh", "-ec", 'if [ "$(readlink "$1" || true)" != "${2##*/}" ]; then rm -rf -- "$2"; fi',
      "sh", `${root}/${snapshot.key}`, staging)
    throw error
  }
  console.log(`Опубликовано: /dashboard/apps/${snapshot.key}/`)
}
