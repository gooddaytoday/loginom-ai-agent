import { existsSync, readFileSync, realpathSync, renameSync, unlinkSync } from "node:fs"
import { open } from "#sqlite"
import { cp, lstat, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { Option, Schema } from "effect"
import { bindingKey, Binding, Snapshot } from "../contract/snapshot.ts"

let updates = Promise.resolve()

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const Control = Schema.Struct({ snapshotId: Schema.String, binding: Binding, nodeName: Schema.String, origin: Schema.String, key: Schema.String })
const decodeControl = Schema.decodeUnknownOption(Schema.fromJsonString(Control), { onExcessProperty: "error" })
export type ControlBinding = typeof Control.Type

export function folderName(packagePath: string, key: string) {
  const name = [...basename(packagePath.replaceAll("\\", "/"), ".lgp")
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "")]
    .slice(0, 40)
    .join("")
  return (name || "dashboard") + "-" + key.slice(0, 8)
}

export async function prepareDashboard(input: { id: string; origin: string; dashboards: string; template: string; fetch?: typeof fetch }) {
  if (!uuid.test(input.id)) throw Error("DASHBOARD_SNAPSHOT_UNAVAILABLE")
  const response = await (input.fetch ?? fetch)(input.origin + "/dashboard/snapshots/" + input.id, { redirect: "error" })
  if (!response.ok) throw Error("DASHBOARD_SNAPSHOT_UNAVAILABLE")
  const decoded = Schema.decodeUnknownOption(Snapshot, { onExcessProperty: "error" })(await response.json().catch(() => undefined))
  if (Option.isNone(decoded) || decoded.value.id !== input.id) throw Error("DASHBOARD_SNAPSHOT_INVALID")
  const snapshot = decoded.value
  const key = await bindingKey(snapshot.binding)
  const prepared = updates.then(async () => {
    const folder = join(input.dashboards, folderName(snapshot.binding.packagePath, key))
    const file = join(folder, "control/binding.json")
    const existing = existsSync(folder)
    if (existing) {
      if (!existsSync(file)) throw Error("DASHBOARD_BINDING_CONFLICT")
      const previous = decodeControl(await readFile(file, "utf8"))
      if (Option.isNone(previous) || previous.value.key !== key || await bindingKey(previous.value.binding) !== key)
        throw Error("DASHBOARD_BINDING_CONFLICT")
    }
    await mkdir(input.dashboards, { recursive: true, mode: 0o700 })
    const staging = existing ? undefined : await mkdtemp(join(input.dashboards, ".prepare-"))
    try {
      const work = join(staging ?? folder, "work")
      const control = join(staging ?? folder, "control")
      await mkdir(work, { recursive: true, mode: 0o700 })
      await mkdir(control, { recursive: true, mode: 0o700 })
      const fresh = !existsSync(join(work, "src"))
      if (fresh) await copySources(input.template, work, control)
      await writeFile(join(work, "snapshot.json.tmp"), JSON.stringify({ nodeName: snapshot.nodeName, schema: snapshot.sample.schema, parameters: snapshot.parameters, created: snapshot.created }, null, 2) + "\n", { mode: 0o600 })
      const rows = snapshot.sample.rows.map(row => "  " + JSON.stringify(row)).join(",\n")
      // One row per line: the read tool truncates long lines.
      await writeFile(join(work, "sample.json.tmp"), `{"schema": ${JSON.stringify(snapshot.sample.schema)},\n"rows": [\n${rows}\n]}\n`, { mode: 0o600 })
      const binding: ControlBinding = { snapshotId: snapshot.id, binding: snapshot.binding, nodeName: snapshot.nodeName, origin: input.origin, key }
      await writeFile(join(control, "binding.json.tmp"), JSON.stringify(binding, null, 2) + "\n", { mode: 0o600 })
      withSnapshot(work, (directory, control) => {
        if (existsSync(join(directory, "sample.json"))) unlinkSync(join(directory, "sample.json"))
        renameSync(join(directory, "snapshot.json.tmp"), join(directory, "snapshot.json"))
        renameSync(join(control, "binding.json.tmp"), join(control, "binding.json"))
        renameSync(join(directory, "sample.json.tmp"), join(directory, "sample.json"))
      })
      if (staging) await rename(staging, folder)
      return { directory: join(folder, "work"), nodeName: snapshot.nodeName, action: snapshot.published ? ("edit" as const) : ("create" as const), fresh }
    } finally {
      if (staging) await rm(staging, { recursive: true, force: true })
    }
  })
  updates = prepared.then(() => undefined, () => undefined)
  return prepared
}

export async function findDashboard(dashboards: string, id: string) {
  if (!uuid.test(id) || !existsSync(dashboards)) return
  for (const name of await readdir(dashboards)) {
    const file = join(dashboards, name, "control/binding.json")
    const control = decodeControl(await readFile(file, "utf8").catch(() => undefined))
    if (Option.isNone(control) || control.value.snapshotId !== id) continue
    if (control.value.key !== await bindingKey(control.value.binding) || folderName(control.value.binding.packagePath, control.value.key) !== name) continue
    const work = join(dashboards, name, "work")
    if ((await lstat(work).catch(() => undefined))?.isDirectory()) return work
  }
}

async function copySources(template: string, work: string, control: string) {
  const staging = await mkdtemp(join(control, ".src-"))
  try {
    await cp(join(template, "src"), staging, { recursive: true })
    await rename(staging, join(work, "src"))
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

// The callback stays synchronous; never hold this lock during builds or HTTP.
export function withSnapshot<T>(work: string, body: (work: string, control: string) => T): T {
  const directory = realpathSync(work)
  const control = join(directory, "..", "control")
  const db = open(join(control, "snapshot.sqlite"))
  try {
    db.exec("PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE")
    return body(directory, control)
  } finally {
    db.close()
  }
}

export function readDashboardSnapshot(work: string) {
  return withSnapshot(work, (directory, control) => {
    if (!existsSync(join(directory, "sample.json"))) return
    const sample = JSON.parse(readFileSync(join(directory, "sample.json"), "utf8")) as typeof Snapshot.Type.sample
    const snapshot = JSON.parse(readFileSync(join(directory, "snapshot.json"), "utf8")) as Pick<typeof Snapshot.Type, "created" | "parameters">
    const binding = JSON.parse(readFileSync(join(control, "binding.json"), "utf8")) as ControlBinding
    return { sample, snapshot, control: binding }
  })
}
