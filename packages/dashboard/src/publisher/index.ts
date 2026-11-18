import { createHash, randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { chmod, lstat, mkdir, open, readdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join, relative, resolve, sep } from "node:path"
import { assetContentType } from "../contract/asset.ts"
import { parsePublication } from "../contract/publication.ts"
import { bindingKey } from "../contract/snapshot.ts"
import { outputText, treeHash } from "../builder/build.ts"
import type { EventName, EventWriter } from "../log.ts"

type Entry = {
  sourceHash?: string
  key?: string
  status: "pending" | "building" | "ready" | "failed"
  buildHash?: string
  error?: string
  template?: number
  builderImage?: string
  code?: string
}

export async function scanPublications(input: {
  storage: string; builds: string; jobsIn: string; jobsOut: string; restart?: boolean; signal?: AbortSignal;
  events?: EventWriter; builderImage?: string
}) {
  const previous: Record<string, Entry> = await readFile(join(input.builds, "state.json"), "utf8").then(JSON.parse).catch(error => {
    if (error.code === "ENOENT") return {}
    throw error
  })
  const state = { ...previous }
  if (input.restart) {
    for (const root of [input.jobsIn, input.jobsOut]) {
      for (const id of await readdir(root)) {
        if (/^[a-f0-9]{64}$/.test(id)) await rm(join(root, id), { recursive: true, force: true })
      }
    }
    for (const [path, entry] of Object.entries(state)) if (entry.status === "building") state[path] = { ...entry, status: "pending" }
  }
  const files = (await readdir(input.storage, { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile())
    .map(entry => "/" + relative(input.storage, join(entry.parentPath, entry.name)).split(sep).join("/"))
    .filter(path => /\.lgp\.dashboards\/[a-f0-9-]{36}\/\d{8}T\d{6}Z\.json$/i.test(path)).sort()
  for (const path of Object.keys(state)) if (!files.includes(path)) delete state[path]
  let candidate: { path: string; bytes: Buffer } | undefined
  for (const path of files) {
    input.signal?.throwIfAborted()
    let sourceHash: string | undefined
    try {
      const bytes = await readBounded(join(input.storage, path), 1_048_576)
      sourceHash = createHash("sha256").update(bytes).digest("hex")
      if (state[path]?.sourceHash === sourceHash && state[path]?.status !== "pending") continue
      const publication = parsePublication(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
      if (path !== `${publication.binding.packagePath}.dashboards/${publication.binding.nodeGuid}/${path.split("/").at(-1)}`) throw Error("DASHBOARD_BINDING_MISMATCH")
      state[path] = { sourceHash, status: "pending", key: await bindingKey(publication.binding), template: publication.template }
      candidate ??= { path, bytes }
    } catch (error) {
      const message = error instanceof Error ? error.message : ""
      const status = message === "DASHBOARD_FILE_CHANGED" ? "pending" : "failed"
      const code = message === "DASHBOARD_FILE_LIMIT" || message === "DASHBOARD_BINDING_MISMATCH" ? message
        : sourceHash ? "DASHBOARD_PUBLICATION_INVALID" : "DASHBOARD_FILE_UNREADABLE"
      state[path] = { sourceHash, status, code, error: outputText(Buffer.from(String(error))) }
    }
  }
  const jobs = (await readdir(input.jobsIn)).filter(name => /^[a-f0-9]{64}$/.test(name))
  for (const id of jobs) {
    const job = JSON.parse(await readFile(join(input.jobsIn, id, "job.json"), "utf8")) as { path: string; sourceHash: string }
    const current = state[job.path]
    const entry = current?.status === "building" && current.sourceHash === job.sourceHash ? current : undefined
    let code = "DASHBOARD_BUILD_RESULT_REJECTED"
    try {
      // Only absence waits; a dangling manifest link is an invalid result.
      const manifest = join(input.jobsOut, id, "result.json")
      const present = await lstat(manifest).catch(error => {
        if (error.code === "ENOENT") return
        throw error
      })
      if (!present) continue
      // JSON escaping can expand each byte of the 8 KiB diagnostic to six bytes.
      const raw = await readBounded(manifest, 65_536)
      if (entry) {
        const result = JSON.parse(raw.toString("utf8"))
        if (result.id !== id || result.sourceHash !== job.sourceHash || !["ready", "failed"].includes(result.outcome) || typeof result.output !== "string") throw Error("DASHBOARD_RESULT_INVALID")
        if (result.outcome === "failed") {
          code = "DASHBOARD_BUILD_FAILED"
          throw Error(result.output)
        }
        const staging = join(input.builds, `.accept-${id}`)
        await rm(staging, { recursive: true, force: true })
        await mkdir(staging)
        try {
          const source = join(input.jobsOut, id, "dist")
          if (await realpath(source) !== resolve(source)) throw Error("DASHBOARD_OUTPUT_LINK")
          const entries = await readdir(source, { recursive: true, withFileTypes: true })
          if (!entries.some(file => file.parentPath === source && file.name === "index.html" && file.isFile())) throw Error("DASHBOARD_OUTPUT_ENTRY")
          let remaining = 20 * 1024 * 1024
          for (const file of entries) {
            const path = relative(source, join(file.parentPath, file.name)).split(sep).join("/")
            if (file.isDirectory() && path === "assets") continue
            const asset = path.startsWith("assets/") && assetContentType(path.slice("assets/".length))
            if (!file.isFile() || (path !== "index.html" && !asset)) throw Error("DASHBOARD_OUTPUT_FILE")
            const bytes = await readBounded(join(source, path), remaining)
            remaining -= bytes.length
            await mkdir(dirname(join(staging, path)), { recursive: true })
            await writeFile(join(staging, path), bytes)
          }
        } catch (error) {
          await rm(staging, { recursive: true, force: true })
          throw error
        }
        const buildHash = await treeHash(staging)
        const parent = join(input.builds, entry.key!)
        await mkdir(parent, { recursive: true })
        await rename(staging, join(parent, buildHash)).catch(async error => {
          if (!["EEXIST", "ENOTEMPTY"].includes(error.code)) throw error
          await rm(staging, { recursive: true, force: true })
        })
        state[job.path] = { ...entry, status: "ready", buildHash }
      }
    } catch (error) {
      if (entry)
        state[job.path] = { ...entry, status: "failed", code, error: outputText(Buffer.from(String(error))) }
    }
    await rm(join(input.jobsIn, id), { recursive: true, force: true })
    await rm(join(input.jobsOut, id), { recursive: true, force: true })
  }
  const active = (await readdir(input.jobsIn)).filter(name => /^[a-f0-9]{64}$/.test(name))
  for (const id of await readdir(input.jobsOut)) {
    if (/^[a-f0-9]{64}$/.test(id) && !active.includes(id)) await rm(join(input.jobsOut, id), { recursive: true, force: true })
  }
  let startedPath: string | undefined
  if (!active.length) {
    const entry = candidate && state[candidate.path]
    if (candidate && entry?.status === "pending") {
      const path = candidate.path
      const id = createHash("sha256").update(path).update(entry.sourceHash!).update(randomUUID()).digest("hex")
      await rm(join(input.jobsOut, id), { recursive: true, force: true })
      await mkdir(join(input.jobsOut, id), { mode: 0o777 })
      await chmod(join(input.jobsOut, id), 0o777)
      const temporary = join(input.jobsIn, `.job-${randomUUID()}`)
      await mkdir(temporary)
      await writeFile(join(temporary, "publication.json"), candidate.bytes)
      await writeFile(join(temporary, "job.json"), JSON.stringify({ path, sourceHash: entry.sourceHash }))
      await rename(temporary, join(input.jobsIn, id))
      state[path] = { ...entry, status: "building", builderImage: input.builderImage }
      startedPath = path
    }
  }
  const temporary = join(input.builds, `.state-${randomUUID()}`)
  await writeFile(temporary, JSON.stringify(state))
  await rename(temporary, join(input.builds, "state.json"))
  if (input.events) {
    for (const [path, entry] of Object.entries(previous)) {
      if (!state[path]) emit(input.events, "publication_removed", path, entry)
    }
    for (const [path, entry] of Object.entries(state)) {
      const before = previous[path]
      if (entry === before) continue
      if ((entry.status === "pending" || path === startedPath) && entry.key && before?.sourceHash !== entry.sourceHash) {
        emit(input.events, "publication_pending", path, { ...entry, builderImage: undefined })
      }
      if (path === startedPath) emit(input.events, "build_started", path, entry)
      if (entry.status === "ready") emit(input.events, "build_ready", path, entry)
      if (entry.status === "failed" && entry.code &&
        (before?.status !== "failed" || before.sourceHash !== entry.sourceHash || before.code !== entry.code)) {
        emit(input.events, entry.key ? "build_failed" : "publication_rejected", path, entry)
      }
    }
  }
  const retained = new Set(Object.values(state).filter(entry => entry.status === "ready").map(entry => `${entry.key}/${entry.buildHash}`))
  for (const key of await readdir(input.builds, { withFileTypes: true })) {
    if (!key.isDirectory() || !/^[a-f0-9]{64}$/.test(key.name)) continue
    for (const build of await readdir(join(input.builds, key.name), { withFileTypes: true })) {
      if (build.isDirectory() && /^[a-f0-9]{64}$/.test(build.name) && !retained.has(`${key.name}/${build.name}`))
        await rm(join(input.builds, key.name, build.name), { recursive: true, force: true })
    }
  }
}

function emit(events: EventWriter, event: EventName, publication: string, entry: Entry) {
  try {
    events(event, {
      publication, key: entry.key, sourceHash: entry.sourceHash, buildHash: entry.buildHash,
      template: entry.template, builderImage: entry.builderImage, code: entry.code,
    })
  } catch {
    // A diagnostic sink must not interrupt publication or cleanup.
  }
}

async function readBounded(path: string, limit: number) {
  if (await realpath(path) !== resolve(path)) throw Error("DASHBOARD_FILE_LINK")
  const file = await openFile(path)
  try {
    const before = await file.stat()
    if (!before.isFile() || before.size > limit) throw Error("DASHBOARD_FILE_LIMIT")
    const bytes = Buffer.alloc(Math.min(before.size + 1, limit + 1))
    let length = 0
    while (length < bytes.length) {
      const read = await file.read(bytes, length, bytes.length - length, length)
      if (!read.bytesRead) break
      length += read.bytesRead
    }
    const after = await file.stat()
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || length !== before.size || await realpath(path) !== resolve(path)) throw Error("DASHBOARD_FILE_CHANGED")
    return bytes.subarray(0, length)
  } finally {
    await file.close()
  }
}

// Linux publisher: retain each directory while opening its child, so a rename cannot redirect a read.
async function openFile(path: string) {
  const parts = resolve(path).split("/").filter(Boolean)
  let directory = await open("/", constants.O_RDONLY | constants.O_DIRECTORY)
  try {
    for (const part of parts.slice(0, -1)) {
      const next = await open(`/proc/self/fd/${directory.fd}/${part}`, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
      await directory.close()
      directory = next
    }
    return await open(`/proc/self/fd/${directory.fd}/${parts.at(-1)}`, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  } finally {
    await directory.close()
  }
}
