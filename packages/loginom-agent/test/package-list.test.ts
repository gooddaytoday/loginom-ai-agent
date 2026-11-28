import { expect, test } from "bun:test"
import { packageListHandlers } from "../src/package-list"
import { type FolderListing, packageConnectionError, type ReadFolder } from "@loginom-ai-agent/loginom-host/package-folder"

const folder = (name: string, path: string): FolderListing["entries"][number] => ({ kind: "folder", name, path })
const pkg = (name: string, path: string) => ({
  kind: "package" as const,
  name,
  path,
  sizeBytes: 7,
  modifiedAt: "2026-02-03T14:30:00.000Z",
})

function call(signal = new AbortController().signal) {
  return {
    signal,
    error(type: string, ...[message]: [string, ...unknown[]]): never {
      throw Object.assign(Error(message), { type })
    },
  }
}

function fixture() {
  const requests: ReadFolder[] = []
  const table = new Map<string, FolderListing>([
    [
      "/user",
      {
        folder: "/user",
        slow: false,
        entries: [
          folder("one", "/user/one"),
          folder("two", "/user/two"),
          pkg("Продажи.lgp", "/user/Продажи.lgp"),
          pkg("Другой.lgp", "/user/Другой.lgp"),
        ],
      },
    ],
    ["/user/one", { folder: "/user/one", slow: true, entries: [] }],
    [
      "/user/two",
      { folder: "/user/two", slow: false, entries: [pkg("Годовые продажи.lgp", "/user/two/Годовые продажи.lgp")] },
    ],
  ])
  const view: { state: string; failure?: string } = { state: "ready" }
  const host = {
    async generation() {
      const reason = packageConnectionError(view)
      if (reason) throw Error(reason)
      return 11
    },
    async read(input: ReadFolder, signal: AbortSignal) {
      signal.throwIfAborted()
      requests.push(input)
      const result = table.get(input.folder)
      if (!result) throw Error("private host error")
      const listings = input.query === undefined ? [result] : [...table.values()].map(page => ({
        ...page, entries: page.entries.filter(entry => entry.kind === "package"),
      }))
      return { listings, truncated: false }
    },
  }
  return { rpc: packageListHandlers(host), host, table, requests, view }
}

test("list reads only the requested folder", async () => {
  const f = fixture()
  const result = f.table.get("/user")
  if (!result) throw Error("Expected fixture folder")
  expect(await f.rpc.list({ folder: "/user" }, call())).toEqual(result)
  expect(f.requests).toEqual([{ folder: "/user", generation: 11 }])
})

test("recursive search filters pages and reuses one host read for every cursor", async () => {
  const f = fixture()
  const input = { folder: "/user", text: " ПРОДАЖИ ", recursive: false }
  const expected = [pkg("Продажи.lgp", "/user/Продажи.lgp")]
  expect(await f.rpc.search(input, call())).toEqual({ folder: "/user", entries: expected, slow: false })
  expect(f.requests.map((x) => x.folder)).toEqual(["/user"])

  const first = await f.rpc.search({ ...input, recursive: true }, call())
  if (!("cursor" in first) || !first.cursor) throw Error("Expected cursor")
  expect(first).toMatchObject({ folder: "/user", entries: expected, slow: false })
  expect(f.requests.map((x) => x.folder)).toEqual(["/user", "/user"])
  const second = await f.rpc.search({ ...input, recursive: true, cursor: first.cursor }, call())
  if (!("cursor" in second) || !second.cursor) throw Error("Expected cursor")
  expect(second).toMatchObject({ folder: "/user/one", entries: [], slow: true })
  expect(await f.rpc.search({ ...input, recursive: true, cursor: second.cursor }, call())).toEqual({
    folder: "/user/two",
    entries: [pkg("Годовые продажи.lgp", "/user/two/Годовые продажи.lgp")],
    slow: false,
  })
  expect(f.requests).toEqual([{ folder: "/user", generation: 11 }, { folder: "/user", generation: 11, query: input.text }])
})

test("every cursor page shows that the result is partial", async () => {
  const f = fixture()
  const read = f.host.read
  f.host.read = async (input, signal) => ({ ...await read(input, signal), truncated: true })
  const input = { folder: "/user", text: "", recursive: true }
  const first = await f.rpc.search(input, call())
  expect(first).toMatchObject({ truncated: true })
  if (!("cursor" in first) || !first.cursor) throw Error("Expected cursor")
  const second = await f.rpc.search({ ...input, cursor: first.cursor }, call())
  expect(second).toMatchObject({ truncated: true })
  if (!("cursor" in second) || !second.cursor) throw Error("Expected cursor")
  expect(await f.rpc.search({ ...input, cursor: second.cursor }, call())).toEqual({
    folder: "/user/two", entries: [pkg("Годовые продажи.lgp", "/user/two/Годовые продажи.lgp")],
    slow: false, truncated: true,
  })
  expect(f.requests).toHaveLength(1)
})

test("canceling a recursive search aborts the host read", async () => {
  const f = fixture()
  const input = { folder: "/user", text: "", recursive: true }
  const active = Promise.withResolvers<void>()
  const read = f.host.read
  f.host.read = async (input, signal) => {
    await read(input, signal)
    return new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true })
      active.resolve()
    })
  }
  const stop = new AbortController()
  const pending = f.rpc.search(input, call(stop.signal))
  await active.promise
  stop.abort(Error("user canceled"))
  await expect(pending).rejects.toThrow("user canceled")
  expect(f.requests).toHaveLength(1)
})

test("a session limit produces the approved client message", async () => {
  const f = fixture()
  f.host.read = async () => {
    throw Error("LOGINOM_SESSION_LIMIT")
  }
  await expect(f.rpc.list({ folder: "/common" }, call())).rejects.toMatchObject({
    type: "session_limit",
    message: "Сейчас заняты все сессии Loginom вашей организации",
  })
})

for (const { state, failure, type } of [
  { state: "unconfigured", type: "not_connected" },
  { state: "recoverable-error", type: "recovering" },
  { state: "starting", type: "connecting" },
  { state: "pending", type: "connecting" },
  { state: "recoverable-error", failure: "LOGINOM_RUNTIME_START_FAILED", type: "connection_failed" },
  { state: "recoverable-error", failure: "LOGINOM_STORE_READ_FAILED", type: "connection_failed" },
]) {
  test(`list and search expose ${state} ${failure ?? ""} as ${type}`, async () => {
    const f = fixture()
    f.view.state = state
    f.view.failure = failure
    await expect(f.rpc.list({ folder: "/user" }, call())).rejects.toMatchObject({ type })
    await expect(f.rpc.search({ folder: "/user", text: "", recursive: true }, call())).rejects.toMatchObject({ type })
    expect(f.requests).toEqual([])
  })
}

test("a failed settings change leaves the ready connection usable for the picker", async () => {
  const f = fixture()
  f.view.failure = "LOGINOM_RUNTIME_START_FAILED"
  const listing = f.table.get("/user")
  if (!listing) throw Error("Expected fixture folder")
  expect(await f.rpc.list({ folder: "/user" }, call())).toEqual(listing)
  expect(f.requests).toHaveLength(1)
})

test("a cursor expires when the connection generation changes", async () => {
  const f = fixture()
  const input = { folder: "/user", text: "", recursive: true }
  const first = await f.rpc.search(input, call())
  if (!("cursor" in first) || !first.cursor) throw Error("Expected cursor")
  f.host.generation = async () => 12
  await expect(f.rpc.search({ ...input, cursor: first.cursor }, call())).rejects.toMatchObject({ type: "search_expired" })
  expect(f.requests).toHaveLength(1)
})
