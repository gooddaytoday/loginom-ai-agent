import { createHash, randomUUID } from "node:crypto"

export function publicationName(latest, now = Date.now()) {
  const previous = latest ? Date.parse(latest.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.json$/, "$1-$2-$3T$4:$5:$6Z")) : -Infinity
  return new Date(Math.max(Math.floor(now / 1000) * 1000, previous + 1000)).toISOString().replace(/[-:]|\.\d{3}/g, "") + ".json"
}

export function dashboardRequest(input, publish = false) {
  const binding = input?.binding
  if (!binding || typeof binding.packagePath !== "string" || binding.packagePath.length > 1024
    || !/^\/(?:[^/\\\x00-\x1f]+\/)*[^/\\\x00-\x1f]+\.lgp$/.test(binding.packagePath)
    || binding.packagePath.split("/").some(part => part === "." || part === "..")
    || ![binding.workflowGuid, binding.nodeGuid].every(value => typeof value === "string"
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)))
    throw Error("DASHBOARD_INPUT_INVALID")
  if (publish) {
    if (typeof input.content !== "string" || !input.content.isWellFormed() || Buffer.byteLength(input.content) > 1_048_576
      || input.expected !== null && (!input.expected || !validPublicationName(input.expected.name)
        || typeof input.expected.sourceHash !== "string" || !/^[a-f0-9]{64}$/.test(input.expected.sourceHash)))
      throw Error("DASHBOARD_INPUT_INVALID")
    try { JSON.parse(input.content) } catch { throw Error("DASHBOARD_INPUT_INVALID") }
  }
  return { directory: binding.packagePath + ".dashboards/" + binding.nodeGuid,
    ...(publish ? { content: input.content, expected: input.expected } : {}) }
}

export function validPublicationName(name) {
  if (typeof name !== "string" || !/^\d{8}T\d{6}Z\.json$/.test(name)) return false
  const time = Date.parse(name.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.json$/, "$1-$2-$3T$4:$5:$6Z"))
  return Number.isFinite(time) && publicationName(null, time) === name
}

// Only the private managed dispatcher calls this function; no browser code or
// storage path is accepted from a model-facing tool.
export async function dashboardStorage(context, input, publish = false, signal) {
  const request = dashboardRequest(input, publish)
  signal?.throwIfAborted()
  const page = context.pages()[0]
  if (!page) throw Error("DASHBOARD_STORAGE_UNAVAILABLE")
  const native = async (mode, values = {}) => {
    signal?.throwIfAborted()
    const result = await page.evaluate(async ({ mode, directory, packagePath, ...values }) => {
      const connection = bg.app.Application.FInstance.FMainForm.FMapTree.FServerConnection
      if (!connection?.Connected || !connection.Session || !connection.UserName) return { error: "DASHBOARD_STORAGE_UNAVAILABLE" }
      try {
        const storage = await connection.Session.get_FileStorage()
        if (mode === "list") {
          // Establish read access to the bound saved package before interpreting
          // an absent publication directory as an empty history.
          const info = await storage.GetFileInfo(packagePath)
          if (!info) return { error: "DASHBOARD_STORAGE_UNAVAILABLE" }
          await ReleaseObject(info, true)
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
          for (const folder of [packagePath + ".dashboards", directory]) {
            if (!await storage.DirectoryExists(folder) && !await storage.CreateDirectory(folder))
              return { error: "DASHBOARD_STORAGE_UNAVAILABLE" }
          }
          const stream = await storage.CreateFile(directory + "/" + values.part)
          try { await stream.WriteBuffer(new TextEncoder().encode(values.content)) }
          finally { await ReleaseObject(stream, true) }
          return { uploaded: true }
        }
        if (mode === "finish") {
          const moved = await storage.MoveFile(directory + "/" + values.part, directory + "/" + values.name, false)
          return moved === true ? { written: true } : { error: "DASHBOARD_WRITE_UNKNOWN" }
        }
        if (mode === "discard") {
          await storage.DeleteFile(directory + "/" + values.part)
          return {}
        }
        return { error: "DASHBOARD_INPUT_INVALID" }
      } catch (error) {
        const message = String(error?.message ?? error?._message ?? "")
        if (mode === "finish" && /^System error, \(OS Code 17\):\s*File exists$/.test(message))
          return { error: "DASHBOARD_VERSION_EXISTS" }
        // These releases also encode FileStorage ACL failures as EBGException.
        // Match its proven denial, not arbitrary native errors or false results.
        if (typeof bg.EPrivilege === "function" && error instanceof bg.EPrivilege
          || /^System error, \(OS Code (?:13|30)\):/.test(message)
          || mode === "list" && message === "Ошибка доступа к файлу: " + packagePath
          || message.endsWith(" в директории только для чтения"))
          return { error: "DASHBOARD_ACCESS_DENIED" }
        return { error: mode === "finish" || mode === "upload" ? "DASHBOARD_WRITE_UNKNOWN" : "DASHBOARD_STORAGE_UNAVAILABLE" }
      }
    }, { mode, directory: request.directory, packagePath: input.binding.packagePath, ...values })
    if (result.error) throw Error(result.error)
    return result
  }
  const names = (await native("list")).names.filter(validPublicationName).sort()
  const latestName = names.at(-1)
  const source = async name => {
    const { content } = await native("read", { name })
    return { version: { name, sourceHash: createHash("sha256").update(content).digest("hex") }, content }
  }
  const latest = latestName ? await source(latestName) : null
  if (!publish) return latest
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
