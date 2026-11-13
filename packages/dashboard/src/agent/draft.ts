import { realpath } from "node:fs/promises"
import { join } from "node:path"
import { buildDashboard } from "./build.ts"
import { selfCheck } from "./check.ts"
import { readDashboardSnapshot } from "./folder.ts"
import type { DashboardResources } from "./resources.ts"
import { draftServer } from "../draft/server.ts"

export const NO_SAMPLE = "Образца данных нет: он удаляется после публикации. Нажмите в Studio «Изменить в чате», чтобы получить свежие данные."
let shared: ReturnType<typeof draftServer> | undefined

export async function draftDashboard(input: { work: string; resources: DashboardResources; signal?: AbortSignal }) {
  const work = await realpath(input.work)
  const saved = readDashboardSnapshot(work)
  if (!saved) return NO_SAMPLE
  const builds = join(work, "..", "control", "draft")
  const build = await buildDashboard({ work, template: input.resources.template, node: input.resources.node, out: builds, signal: input.signal })
  if (!build.ok) return "Сборка не удалась. Исправьте код и вызовите dashboard_draft снова.\n" + build.output
  shared ??= draftServer(input.resources.page).catch((error: unknown) => {
    shared = undefined
    throw error
  })
  const url = (await shared).publish({
    key: saved.control.key,
    builds,
    hash: build.hash,
    data: {
      nodeName: saved.control.nodeName,
      created: saved.snapshot.created,
      parameters: saved.snapshot.parameters.map(p => ({ name: p.name, value: typeof p.value === "number" ? p.value : null })),
      sample: saved.sample,
    },
  })
  const checked = await selfCheck({ resources: input.resources, url, signal: input.signal })
  return `Черновик: ${url}\nПроверка типов и сборка: успешно.\nСамопроверка страницы: ${checked.ok ? "успешно" : "ошибка (" + checked.state + ")\n" + checked.errors.join("\n")}`
}
