import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { realpath } from "node:fs/promises"
import { join } from "node:path"
import { buildDashboard } from "./build.ts"
import { selfCheck } from "./check.ts"
import { readDashboardSnapshot, withSnapshot, type ControlBinding } from "./folder.ts"
import type { DashboardResources } from "./resources.ts"
import { draftServer } from "../draft/server.ts"

export const NO_SAMPLE = "Образца данных нет: он удаляется после публикации. Нажмите в Studio «Изменить в чате», чтобы получить свежие данные."
const STOPPED = "Черновик остановлен. Попросите агента показать его снова."
let shared: ReturnType<typeof draftServer> | undefined

export async function revokeDashboardDraft(key: string) {
  await shared?.then(server => server.revoke(key), () => undefined)
}

export async function draftDashboard(input: { work: string; resources: DashboardResources; signal?: AbortSignal }) {
  const work = await realpath(input.work)
  const saved = readDashboardSnapshot(work)
  if (!saved) return NO_SAMPLE
  const builds = join(work, "..", "control", "draft")
  const withCurrentSnapshot = <T>(run: () => T) => {
    try {
      return withSnapshot(work, (directory, control) => {
        if (!existsSync(join(directory, "sample.json"))) return
        const binding = JSON.parse(readFileSync(join(control, "binding.json"), "utf8")) as ControlBinding
        if (binding.snapshotId === saved.control.snapshotId) return run()
      })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
  }
  if (!withCurrentSnapshot(() => {
    if (!existsSync(builds)) mkdirSync(builds, { mode: 0o700 })
    return true
  })) return STOPPED
  // The compiler can create directories while a different session removes this draft.
  const build = await buildDashboard({
    work, template: input.resources.template, node: input.resources.node, out: builds,
    draftStagingRoot: join(work, "..", ".."), signal: input.signal,
  }).catch(error => {
    if (withCurrentSnapshot(() => true)) throw error
  })
  if (!build || !withCurrentSnapshot(() => true)) return STOPPED
  if (!build.ok) return "Сборка не удалась. Исправьте код и вызовите dashboard_draft снова.\n" + build.output
  shared ??= draftServer(input.resources.page).catch((error: unknown) => {
    shared = undefined
    throw error
  })
  const server = await shared
  const url = withCurrentSnapshot(() => server.publish({
    key: saved.control.key,
    builds,
    hash: build.hash,
    data: {
      nodeName: saved.control.nodeName,
      packagePath: saved.control.binding.packagePath,
      created: saved.snapshot.created,
      parameters: saved.snapshot.parameters.map(p => ({ name: p.name, value: typeof p.value === "number" ? p.value : null })),
      sample: saved.sample,
    },
  }))
  if (!url) return STOPPED
  const checked = await selfCheck({ resources: input.resources, url, signal: input.signal })
  if (!withCurrentSnapshot(() => true)) return STOPPED
  return `Черновик: ${url}\nПроверка типов и сборка: успешно.\nСамопроверка страницы: ${checked.ok ? "успешно" : "ошибка (" + checked.state + ")\n" + checked.errors.join("\n")}`
}
