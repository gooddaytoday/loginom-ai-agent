import path from "node:path"
import { cp, mkdir, rm, stat, symlink } from "node:fs/promises"

const copy = Bun.argv.includes("--copy")
const evalsRoot = path.resolve(import.meta.dir, "..")
const repoRoot = path.resolve(evalsRoot, "..")
const bundle = path.join(evalsRoot, ".bundle")
const resources = path.join(repoRoot, "packages", "desktop", "resources", "loginom")

// Host читает resource-manifest.json из корня bundle (packages/loginom-host/src/host.ts); без него setup падает LOGINOM_CONNECTION_CHECK_FAILED.
const names = ["bin", "browsers", "runtime", "resource-manifest.json"]
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
  // Манифест копируется всегда: host сравнивает его с реальными файлами, симлинк на файл тут не нужен.
  await (copy || name.endsWith(".json") ? cp(source, target, { recursive: true }) : symlink(source, target))
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
