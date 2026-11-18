import { createHash } from "node:crypto"
import { existsSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import { open } from "#sqlite"
import { cp, lstat, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { Option, Schema } from "effect"
import { bindingKey, Binding, Snapshot, PublicationVersion, LookupResponse } from "../contract/snapshot.ts"
import { parsePublication, type PublicationSource } from "../contract/publication.ts"

let updates = Promise.resolve()

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const Control = Schema.Struct({ snapshotId: Schema.String, binding: Binding, nodeName: Schema.String, origin: Schema.String, key: Schema.String, base: Schema.optional(Schema.NullOr(PublicationVersion)) })
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

export type DashboardNotice = { kind: "newer-publication" | "publication-check-unavailable" | "latest-build-failed"; latest?: string; current?: string; error?: string }

export async function prepareDashboard(input: {
  id: string
  origin: string
  dashboards: string
  template: string
  readPublication: (binding: typeof Binding.Type) => Promise<typeof PublicationSource.Type | null>
  deferCreatePublicationCheck?: boolean
  signal?: AbortSignal
  fetch?: typeof fetch
}) {
  input.signal?.throwIfAborted()
  if (!uuid.test(input.id)) throw Error("DASHBOARD_SNAPSHOT_UNAVAILABLE")
  const response = await (input.fetch ?? fetch)(input.origin + "/dashboard/snapshots/" + input.id, { redirect: "error", signal: input.signal })
  if (!response.ok) throw Error("DASHBOARD_SNAPSHOT_UNAVAILABLE")
  const decoded = Schema.decodeUnknownOption(Snapshot, { onExcessProperty: "error" })(await response.json().catch(() => undefined))
  if (Option.isNone(decoded) || decoded.value.id !== input.id) throw Error("DASHBOARD_SNAPSHOT_INVALID")
  const snapshot = decoded.value
  const key = await bindingKey(snapshot.binding)
  const prepared = updates.then(async () => {
    const folder = join(input.dashboards, folderName(snapshot.binding.packagePath, key))
    const file = join(folder, "control/binding.json")
    const existing = existsSync(folder)
    let previous: ControlBinding | undefined
    if (existing) {
      if (!existsSync(file)) throw Error("DASHBOARD_BINDING_CONFLICT")
      const decoded = decodeControl(await readFile(file, "utf8"))
      if (Option.isNone(decoded) || decoded.value.origin !== input.origin || decoded.value.key !== key || await bindingKey(decoded.value.binding) !== key)
        throw Error("DASHBOARD_BINDING_CONFLICT")
      previous = decoded.value
    }
    const deferred = input.deferCreatePublicationCheck && !snapshot.published
    const latest = deferred ? null : await input.readPublication(snapshot.binding).catch(error => {
      input.signal?.throwIfAborted()
      if (!existsSync(join(folder, "work/src"))) throw error
      return undefined
    })
    let notice: DashboardNotice | undefined = previous && latest && (previous.base?.name !== latest.version.name || previous.base.sourceHash !== latest.version.sourceHash)
      ? { kind: "newer-publication", latest: latest.version.name } : latest === undefined ? { kind: "publication-check-unavailable" } : undefined
    if (latest) {
      const status = await (input.fetch ?? fetch)(input.origin + "/dashboard/lookup", {
        method: "POST", headers: { "content-type": "application/json" }, redirect: "error",
        body: JSON.stringify({ ...snapshot.binding, publication: latest.version.name }), signal: input.signal,
      }).then(async response => response.ok ? Schema.decodeUnknownOption(LookupResponse)(await response.json()) : Option.none()).catch(() => Option.none())
      if (Option.isSome(status) && status.value.publication?.name === latest.version.name &&
          status.value.publication.sourceHash === latest.version.sourceHash && status.value.publication.status === "failed")
        notice = { kind: "latest-build-failed", latest: latest.version.name, ...(status.value.currentVersion ? { current: status.value.currentVersion.name } : {}), error: status.value.publication.error }
    }
    input.signal?.throwIfAborted()
    await mkdir(input.dashboards, { recursive: true, mode: 0o700 })
    const staging = existing ? undefined : await mkdtemp(join(input.dashboards, ".prepare-"))
    try {
      const work = join(staging ?? folder, "work")
      const control = join(staging ?? folder, "control")
      await mkdir(work, { recursive: true, mode: 0o700 })
      await mkdir(control, { recursive: true, mode: 0o700 })
      const fresh = !existsSync(join(work, "src"))
      if (fresh) {
        const source = latest ? parsePublication(latest.content) : undefined
        if (latest && (await bindingKey(source!.binding) !== key || createHash("sha256").update(latest.content).digest("hex") !== latest.version.sourceHash))
          throw Error("DASHBOARD_PUBLICATION_INVALID")
        await copySources(input.template, work, control, source)
      }
      await writeFile(join(work, "snapshot.json.tmp"), JSON.stringify({ nodeName: snapshot.nodeName, schema: snapshot.sample.schema, parameters: snapshot.parameters, created: snapshot.created }, null, 2) + "\n", { mode: 0o600 })
      const rows = snapshot.sample.rows.map(row => "  " + JSON.stringify(row)).join(",\n")
      // One row per line: the read tool truncates long lines.
      await writeFile(join(work, "sample.json.tmp"), `{"schema": ${JSON.stringify(snapshot.sample.schema)},\n"rows": [\n${rows}\n]}\n`, { mode: 0o600 })
      input.signal?.throwIfAborted()
      withSnapshot(work, (directory, control) => {
        const current = existsSync(join(control, "binding.json")) ? decodeControl(readFileSync(join(control, "binding.json"), "utf8")) : undefined
        if (current && (Option.isNone(current) || current.value.key !== key || current.value.origin !== input.origin))
          throw Error("DASHBOARD_BINDING_CONFLICT")
        const initialBase = deferred ? undefined : (latest?.version ?? null)
        const base = fresh ? initialBase : current && Option.isSome(current) ? current.value.base : undefined
        const binding: ControlBinding = { snapshotId: snapshot.id, binding: snapshot.binding, nodeName: snapshot.nodeName, origin: input.origin, key,
          ...(base !== undefined ? { base } : {}) }
        writeFileSync(join(control, "binding.json.tmp"), JSON.stringify(binding, null, 2) + "\n", { mode: 0o600 })
        if (existsSync(join(directory, "sample.json"))) unlinkSync(join(directory, "sample.json"))
        renameSync(join(directory, "snapshot.json.tmp"), join(directory, "snapshot.json"))
        renameSync(join(control, "binding.json.tmp"), join(control, "binding.json"))
        renameSync(join(directory, "sample.json.tmp"), join(directory, "sample.json"))
      })
      if (staging) await rename(staging, folder)
      return { directory: join(folder, "work"), nodeName: snapshot.nodeName, action: snapshot.published ? ("edit" as const) : ("create" as const), fresh, ...(notice ? { notice } : {}) }
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

async function copySources(template: string, work: string, control: string, source?: ReturnType<typeof parsePublication>) {
  const staging = await mkdtemp(join(control, ".src-"))
  try {
    if (source) {
      for (const file of source.files) {
        const path = join(staging, file.path.slice(4))
        await mkdir(dirname(path), { recursive: true, mode: 0o700 })
        await writeFile(path, file.content, { encoding: file.encoding, mode: 0o600 })
      }
    } else await cp(join(template, "src"), staging, { recursive: true })
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

export function removePublishedSample(work: string, snapshotId: string) {
  withSnapshot(work, (directory, control) => {
    const binding = JSON.parse(readFileSync(join(control, "binding.json"), "utf8")) as ControlBinding
    const file = join(directory, "sample.json")
    if (binding.snapshotId === snapshotId && existsSync(file)) unlinkSync(file)
  })
}

export function updatePublicationBase(work: string, captured: ControlBinding, version: PublicationVersion) {
  withSnapshot(work, (_directory, control) => {
    const file = join(control, "binding.json")
    const decoded = decodeControl(readFileSync(file, "utf8"))
    if (Option.isNone(decoded)) throw Error("DASHBOARD_BINDING_CONFLICT")
    const current = decoded.value
    if (current.key !== captured.key || current.origin !== captured.origin ||
        current.binding.packagePath !== captured.binding.packagePath ||
        current.binding.workflowGuid.toLowerCase() !== captured.binding.workflowGuid.toLowerCase() ||
        current.binding.nodeGuid.toLowerCase() !== captured.binding.nodeGuid.toLowerCase()) throw Error("DASHBOARD_BINDING_CONFLICT")
    if (current.base && version.name < current.base.name) return
    const same = current.base === captured.base || (current.base != null && captured.base != null &&
      current.base.name === captured.base.name && current.base.sourceHash === captured.base.sourceHash)
    if (current.base !== undefined && !same && !(current.base && version.name > current.base.name)) return
    writeFileSync(file + ".tmp", JSON.stringify({ ...current, base: version }, null, 2) + "\n", { mode: 0o600 })
    renameSync(file + ".tmp", file)
  })
}
