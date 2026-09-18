import path from "node:path"
import { cp, mkdir, rm, stat, symlink } from "node:fs/promises"

const copy = Bun.argv.includes("--copy")
const evalsRoot = path.resolve(import.meta.dir, "..")
const repoRoot = path.resolve(evalsRoot, "..")
const bundle = path.join(evalsRoot, ".bundle")
const resources = path.join(repoRoot, "packages", "desktop", "resources", "loginom")

const names = ["bin", "browsers", "runtime"]
for (const name of names) {
  const source = path.join(resources, name)
  if (!(await stat(source).catch(() => undefined))) {
    console.error(`Нет ${source}: ресурсы Desktop не подготовлены (см. packages/desktop/AGENTS.md)`)
    process.exit(2)
  }
}
await mkdir(bundle, { recursive: true })
for (const name of names) {
  const source = path.join(resources, name)
  const target = path.join(bundle, name)
  await rm(target, { recursive: true, force: true })
  await (copy ? cp(source, target, { recursive: true }) : symlink(source, target))
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
console.log("После изменений в packages/loginom-host выполните снова: bun run prepare-bundle")
