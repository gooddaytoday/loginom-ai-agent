import { existsSync, statSync } from "node:fs"
import { cp, mkdir, mkdtemp, realpath, rename, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { open } from "#sqlite"
import { Option, Schema } from "effect"
import { LookupResponse } from "../contract/snapshot.ts"
import { buildDashboard } from "./build.ts"
import { NO_SAMPLE } from "./draft.ts"
import { readDashboardSnapshot, removePublishedSample, type ControlBinding } from "./folder.ts"
import type { DashboardResources } from "./resources.ts"

export { embeddedValues } from "./build.ts"

type Prepared = { control: ControlBinding; build: { hash: string; dir: string } }

export async function preparePublish(input: { work: string; operation: string; resources: DashboardResources; signal?: AbortSignal }):
  Promise<({ ok: true } & Prepared) | { ok: false; text: string }> {
  const work = await realpath(input.work)
  const saved = readDashboardSnapshot(work)
  if (!saved) return { ok: false, text: NO_SAMPLE }
  const build = await buildDashboard({
    work, node: input.resources.node, template: input.resources.template, out: join(work, "../control/draft"),
    publication: { operation: input.operation, sample: saved.sample }, signal: input.signal,
  })
  if (!build.ok) return { ok: false, text: "Сборка не удалась.\n" + build.output }
  return { ok: true, control: saved.control, build: { hash: build.hash, dir: build.dir } }
}

export async function finishPublish(input: Prepared & { work: string; builds?: string; fetch?: typeof fetch }):
  Promise<{ status: "published" | "failed"; text: string }> {
  const builds = input.builds ?? join(homedir(), "loginom-dashboard/builds")
  let db: ReturnType<typeof open> | undefined
  try {
    const origin = URL.parse(input.control.origin)
    if (!origin || origin.origin !== input.control.origin || !["http:", "https:"].includes(origin.protocol) ||
        !["localhost", "127.0.0.1"].includes(origin.hostname) || !statSync(builds, { throwIfNoEntry: false })?.isDirectory())
      return { status: "failed", text: "Публикация на этот стенд появится в следующей версии" }
    const keyDir = join(builds, input.control.key)
    await mkdir(keyDir, { recursive: true })
    db = open(join(keyDir, "publish.sqlite"))
    // A second publisher must return immediately, including while the first reads the lookup body.
    db.exec("PRAGMA busy_timeout = 0; BEGIN IMMEDIATE")
    const hash = input.build.hash
    const directory = join(keyDir, hash)
    if (!existsSync(directory)) {
      const staging = await mkdtemp(join(keyDir, ".install-"))
      try {
        await cp(input.build.dir, staging, { recursive: true })
        await rename(staging, directory)
      } finally {
        await rm(staging, { recursive: true, force: true })
      }
    }
    const pointer = join(keyDir, ".current.tmp")
    await writeFile(pointer, hash + "\n")
    await rename(pointer, join(keyDir, "current"))
    const response = await (input.fetch ?? fetch)(input.control.origin + "/dashboard/lookup", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input.control.binding),
      redirect: "error", signal: AbortSignal.timeout(10_000),
    })
    const lookup = response.ok && Schema.decodeUnknownOption(LookupResponse)(await response.json())
    if (!lookup || Option.isNone(lookup) || lookup.value.hash !== hash)
      return { status: "failed", text: "Стенд не подтвердил хеш сборки." }
    removePublishedSample(input.work, input.control.snapshotId)
    return { status: "published", text: "Dashboard опубликован. Откройте узел в Studio и нажмите Dashboard" }
  } catch (error) {
    if (error instanceof Error && (("errcode" in error && error.errcode === 5) || ("code" in error && error.code === "SQLITE_BUSY")))
      return { status: "failed", text: "Этот dashboard занят другой публикацией. Попробуйте ещё раз." }
    return { status: "failed", text: "Не удалось опубликовать dashboard: " + (error instanceof Error ? error.message : String(error)) }
  } finally {
    db?.close()
  }
}
