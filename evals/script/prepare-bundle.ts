import path from "node:path"
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises"

const evalsRoot = path.resolve(import.meta.dir, "..")
const repoRoot = path.resolve(evalsRoot, "..")
const bundle = path.join(evalsRoot, ".bundle")
const resources = path.join(repoRoot, "packages", "desktop", "resources", "loginom")

// Runtime verifyResources() требует, чтобы realpath каждого файла из resource-manifest.json
// лежал внутри bundle, поэтому симлинки на ресурсы Desktop не подходят: копируем всё (~570 МБ).
for (const name of ["resource-manifest.json", "bin", "browsers", "runtime"]) {
  if (!(await stat(path.join(resources, name)).catch(() => undefined))) {
    console.error(`Нет ${path.join(resources, name)}: ресурсы Desktop не подготовлены (см. packages/desktop/AGENTS.md)`)
    process.exit(2)
  }
}
await mkdir(bundle, { recursive: true })
for (const name of await readdir(resources)) {
  const target = path.join(bundle, name)
  await rm(target, { recursive: true, force: true })
  await cp(path.join(resources, name), target, { recursive: true, verbatimSymlinks: true })
}
await rm(path.join(bundle, "host"), { recursive: true, force: true })
const build = Bun.spawn(["bun", "script/build-node-host.ts", path.join(bundle, "host")], {
  cwd: path.join(repoRoot, "packages", "loginom-host"),
  stdout: "inherit",
  stderr: "inherit",
})
if ((await build.exited) !== 0) {
  console.error("Сборка host не удалась")
  process.exit(1)
}
console.log(`Dev-bundle готов: ${bundle}`)
console.log("После изменений в packages/loginom-host или ресурсах Desktop выполните снова: bun run prepare-bundle")
