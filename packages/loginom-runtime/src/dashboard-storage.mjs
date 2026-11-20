import { createHash, randomUUID } from "node:crypto"

export function publicationName(latest, now = Date.now()) {
  const previous = latest ? Date.parse(latest.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.json$/, "$1-$2-$3T$4:$5:$6Z")) : -Infinity
  return new Date(Math.max(Math.floor(now / 1000) * 1000, previous + 1000)).toISOString().replace(/[-:]|\.\d{3}/g, "") + ".json"
}

export function dashboardRequest(input, operation = "dashboardRead") {
  const binding = input?.binding
  if (!validBinding(binding)) throw Error("DASHBOARD_INPUT_INVALID")
  const directory = binding.packagePath + ".dashboards/" + binding.nodeGuid
  if (operation === "dashboardDelete") {
    if (!validPublicationSet(input.expected)) throw Error("DASHBOARD_INPUT_INVALID")
    return { directory, expected: input.expected }
  }
  if (operation !== "dashboardPublish") return { directory }
  if (typeof input.content !== "string" || !input.content.isWellFormed() || Buffer.byteLength(input.content) > 1_048_576
    || input.expected !== null && !validPublicationRef(input.expected)) throw Error("DASHBOARD_INPUT_INVALID")
  try { JSON.parse(input.content) } catch { throw Error("DASHBOARD_INPUT_INVALID") }
  return { directory, content: input.content, expected: input.expected }
}

function validBinding(binding) {
  return Boolean(binding && typeof binding.packagePath === "string" && binding.packagePath.length <= 1024
    && /^\/(?:[^/\\\x00-\x1f]+\/)*[^/\\\x00-\x1f]+\.lgp$/.test(binding.packagePath)
    && !binding.packagePath.split("/").some(part => part === "." || part === "..")
    && [binding.workflowGuid, binding.nodeGuid].every(value => typeof value === "string"
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)))
}

function validPublicationRef(ref) {
  return ref && validPublicationName(ref.name) && typeof ref.sourceHash === "string" && /^[a-f0-9]{64}$/.test(ref.sourceHash)
}

export function validPublicationSet(refs) {
  return Array.isArray(refs) && refs.every((ref, index) => validPublicationRef(ref) && (!index || refs[index - 1].name < ref.name))
}

export function validPublicationName(name) {
  if (typeof name !== "string" || !/^\d{8}T\d{6}Z\.json$/.test(name)) return false
  const time = Date.parse(name.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.json$/, "$1-$2-$3T$4:$5:$6Z"))
  return Number.isFinite(time) && publicationName(null, time) === name
}

// Only the private managed dispatcher calls this function; no browser code or
// storage path is accepted from a model-facing tool.
export async function dashboardStorage(context, input, operation = "dashboardRead", signal) {
  const request = dashboardRequest(input, operation)
  signal?.throwIfAborted()
  const page = context.pages()[0]
  const native = async (mode, values = {}) => {
    signal?.throwIfAborted()
    if (!page) throw Error("DASHBOARD_STORAGE_UNAVAILABLE")
    const call = async ({ mode, directory, packagePath, ...values }) => {
      const connection = bg.app.Application.FInstance.FMainForm.FMapTree.FServerConnection
      if (!connection?.Connected || !connection.Session || !connection.UserName) return { error: "DASHBOARD_STORAGE_UNAVAILABLE" }
      try {
        const storage = await connection.Session.get_FileStorage()
        if (mode === "list" || mode === "lock") {
          // Establish read access to the saved package before using its publication directory.
          const info = await storage.GetFileInfo(packagePath)
          if (!info) return { error: "DASHBOARD_STORAGE_UNAVAILABLE" }
          await ReleaseObject(info, true)
        }
        if (mode === "upload") {
          for (const folder of [packagePath + ".dashboards", directory]) {
            if (!await storage.DirectoryExists(folder) && !await storage.CreateDirectory(folder)
              && !await storage.DirectoryExists(folder)) return { error: "DASHBOARD_STORAGE_UNAVAILABLE" }
          }
        }
        if (mode === "lock") {
          if (!await storage.DirectoryExists(directory)) return { absent: true }
          const lock = directory + "/.delete.lock"
          const part = directory + "/" + values.part
          const open = () => storage.OpenFile(lock, bg.TBGFileOpenMode.fomReadWrite, bg.TBGShareFileMode.sfmExclusive)
          try {
            return { stream: await open() }
          } catch (error) {
            const message = String(error?.message ?? error?._message ?? "")
            if (message !== 'Невозможно открыть файл: "' + lock + '": No such file or directory') throw error
          }
          let moved = false
          try {
            const temporary = await storage.CreateFile(part)
            await ReleaseObject(temporary, true)
            try {
              moved = await storage.MoveFile(part, lock, false) === true
            } catch (error) {
              const message = String(error?.message ?? error?._message ?? "")
              if (!/^System error, \(OS Code 17\):\s*File exists$/.test(message)) throw error
            }
          } finally {
            if (!moved) {
              try { await storage.DeleteFile(part) } catch { /* Keep the original storage result. */ }
            }
          }
          return { stream: await open() }
        }
        if (mode === "list") {
          if (!await storage.DirectoryExists(directory)) return { names: [] }
          const list = await storage.FileInfoList
          const items = await list.GetFileInfoItemsEx(directory + "/", ["*.json"], bg.TBGFileInfoAttributes.fiaNormalFilesOnly)
          try {
            const names = []
            ;(await bg.selectAllAsync(items, item => [item.FileName]))(rows => bg.forEach(rows, row => names.push(row.FileName)))
            return { names }
          } finally { await ReleaseObject(items, true) }
        }
        if (mode === "read") {
          const info = await storage.GetFileInfo(directory + "/" + values.name)
          if (!info) return { error: "DASHBOARD_STORAGE_UNAVAILABLE" }
          let size
          try { size = await info.Size } finally { await ReleaseObject(info, true) }
          if (!Number.isSafeInteger(size) || size < 0 || size > 1_048_576) return { error: "DASHBOARD_INPUT_INVALID" }
          const stream = await storage.OpenFile(directory + "/" + values.name, bg.TBGFileOpenMode.fomRead)
          try {
            const bytes = new Uint8Array(size)
            await stream.ReadBuffer(bytes)
            return { content: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes) }
          } finally { await ReleaseObject(stream, true) }
        }
        if (mode === "upload") {
          const stream = await storage.CreateFile(directory + "/" + values.part)
          try { await stream.WriteBuffer(new TextEncoder().encode(values.content)) }
          finally { await ReleaseObject(stream, true) }
          return { uploaded: true }
        }
        if (mode === "finish") {
          const moved = await storage.MoveFile(directory + "/" + values.part, directory + "/" + values.name, false)
          return moved === true ? { written: true } : { error: "DASHBOARD_WRITE_UNKNOWN" }
        }
        if (mode === "delete") {
          const removed = await storage.DeleteFile(directory + "/" + values.name)
          return removed === true ? { removed } : { error: "DASHBOARD_DELETE_UNKNOWN" }
        }
        if (mode === "discard") {
          await storage.DeleteFile(directory + "/" + values.part)
          return {}
        }
        return { error: "DASHBOARD_INPUT_INVALID" }
      } catch (error) {
        const message = String(error?.message ?? error?._message ?? "")
        if (mode === "lock" && message === 'Невозможно открыть файл: "' + directory + '/.delete.lock": Try again')
          return { error: "DASHBOARD_DELETE_BUSY" }
        if (mode === "finish" && /^System error, \(OS Code 17\):\s*File exists$/.test(message))
          return { error: "DASHBOARD_VERSION_EXISTS" }
        // These releases also encode FileStorage ACL failures as EBGException.
        // Match its proven denial, not arbitrary native errors or false results.
        if (typeof bg.EPrivilege === "function" && error instanceof bg.EPrivilege
          || /^System error, \(OS Code (?:13|30)\):/.test(message)
          || (mode === "list" || mode === "lock") && message === "Ошибка доступа к файлу: " + packagePath
          || mode === "lock" && message === 'Невозможно открыть файл "' + directory + '/.delete.lock" на запись'
          || mode === "upload" && message === 'Невозможно создать файл: "' + directory + "/" + values.part + '": Permission denied'
          || message.endsWith(" в директории только для чтения"))
          return { error: "DASHBOARD_ACCESS_DENIED" }
        return { error: mode === "finish" || mode === "upload" ? "DASHBOARD_WRITE_UNKNOWN"
          : mode === "delete" ? "DASHBOARD_DELETE_UNKNOWN" : "DASHBOARD_STORAGE_UNAVAILABLE" }
      }
    }
    const args = { mode, directory: request.directory, packagePath: input.binding.packagePath, ...values }
    if (mode === "lock") {
      const lock = await page.evaluateHandle(call, args)
      try {
        const state = await lock.evaluate(result => ({ error: result.error, absent: result.absent, acquired: Boolean(result.stream) }))
        if (state.error || !state.acquired && !state.absent) throw Error(state.error ?? "DASHBOARD_STORAGE_UNAVAILABLE")
        if (state.acquired) return lock
        await lock.dispose()
        return null
      } catch (error) {
        await lock.dispose().catch(() => undefined)
        throw error
      }
    }
    const result = await page.evaluate(call, args)
    if (result.error) throw Error(result.error)
    return result
  }
  const names = async () => (await native("list")).names.filter(validPublicationName).sort()
  const source = async name => {
    const { content } = await native("read", { name })
    return { version: { name, sourceHash: createHash("sha256").update(content).digest("hex") }, content }
  }
  const versions = async () => {
    const refs = []
    for (const name of await names()) {
      const publication = await source(name)
      let binding
      try { binding = JSON.parse(publication.content)?.binding }
      catch { throw Error("DASHBOARD_STORAGE_UNAVAILABLE") }
      if (!validBinding(binding)) throw Error("DASHBOARD_STORAGE_UNAVAILABLE")
      if (binding.packagePath === input.binding.packagePath &&
          binding.workflowGuid.toLowerCase() === input.binding.workflowGuid.toLowerCase() &&
          binding.nodeGuid.toLowerCase() === input.binding.nodeGuid.toLowerCase()) refs.push(publication.version)
    }
    return refs
  }
  if (operation === "dashboardVersions") return versions()
  if (operation === "dashboardDelete") {
    let lock
    try {
      lock = await native("lock", { part: ".delete." + randomUUID() + ".part" })
    } catch (error) {
      return { status: "failed", reason: deleteFailure(error), confirmedRemoved: 0 }
    }
    if (!lock) return request.expected.length
      ? { status: "changed", remaining: [], confirmedRemoved: 0 }
      : { status: "empty" }
    try {
      const current = await versions().catch(error => error)
      if (!Array.isArray(current)) return { status: "failed", reason: deleteFailure(current), confirmedRemoved: 0 }
      if (current.length !== request.expected.length || current.some((ref, index) =>
        ref.name !== request.expected[index].name || ref.sourceHash !== request.expected[index].sourceHash
      )) return { status: "changed", remaining: current, confirmedRemoved: 0 }

      let confirmedRemoved = 0
      let reason
      for (const { name } of current) {
        try {
          await native("delete", { name })
          confirmedRemoved++
        } catch (error) {
          reason = deleteFailure(error, "DASHBOARD_DELETE_UNKNOWN")
          break
        }
      }
      const remaining = await versions().catch(error => error)
      if (!Array.isArray(remaining)) {
        const failure = reason ?? deleteFailure(remaining)
        return {
          status: "failed", confirmedRemoved,
          reason: confirmedRemoved > 0 && failure === "DASHBOARD_STORAGE_UNAVAILABLE" ? "DASHBOARD_DELETE_UNKNOWN" : failure,
        }
      }
      if (reason) return { status: "failed", reason, confirmedRemoved, remaining }
      return remaining.length ? { status: "changed", remaining, confirmedRemoved } : { status: "empty" }
    } finally {
      await lock.evaluate(({ stream }) => ReleaseObject(stream, true)).catch(() => undefined)
      await lock.dispose().catch(() => undefined)
    }
  }

  const latestName = (await names()).at(-1)
  const latest = latestName ? await source(latestName) : null
  if (operation !== "dashboardPublish") return latest
  if (request.expected?.name !== latest?.version.name || request.expected?.sourceHash !== latest?.version.sourceHash)
    return { status: "changed", latest: latest?.version ?? null }
  const name = publicationName(latestName)
  const version = { name, sourceHash: createHash("sha256").update(request.content).digest("hex") }
  const part = name + "." + randomUUID() + ".part"
  try {
    await native("upload", { part, content: request.content })
    await native("finish", { part, name })
    return { status: "written", version }
  } catch (error) {
    const known = ["DASHBOARD_VERSION_EXISTS", "DASHBOARD_ACCESS_DENIED"].includes(error?.message)
    if (!known) {
      // Only an exact final-name/hash read-back can establish success after a lost reply.
      const confirmed = await source(name).catch(() => null)
      if (confirmed?.version.sourceHash === version.sourceHash) return { status: "written", version }
    }
    await native("discard", { part }).catch(() => undefined)
    if (known) throw error
    throw Error("DASHBOARD_WRITE_UNKNOWN")
  }
}

function deleteFailure(error, fallback = "DASHBOARD_STORAGE_UNAVAILABLE") {
  return ["DASHBOARD_ACCESS_DENIED", "DASHBOARD_DELETE_BUSY", "DASHBOARD_STORAGE_UNAVAILABLE", "DASHBOARD_DELETE_UNKNOWN"]
    .includes(error?.message) ? error.message : fallback
}
