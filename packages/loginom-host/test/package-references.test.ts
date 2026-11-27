import { afterEach, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { TextReader, Uint8ArrayWriter, ZipWriter } from "@zip.js/zip.js"
import { SessionID } from "@opencode/schema/session-id"
import { readReferenceTarget, scanPackageReferences } from "../src/package-references"
import type { FolderListing } from "../src/package-folder"

const guid = (number: number) => `a1000000-0000-4000-8000-${number.toString(16).padStart(12, "0")}`
const originalPath = "/analyst/Исходный.lgp"
const copyPath = "/analyst/Копии агента/Исходный — правка агента.lgp"
const dependentPath = "/common/Отчёт.lgp"
const target = { originalPath, copyPath, homeFolder: "/analyst" }
const output = guid(20)

function node(id: number, label: string, reference?: number, port: string | undefined = output) {
  return `<Item Guid="${guid(id)}" DisplayName="${label}"><OutputPorts>${port ? `<Item Guid="${port}"/>` : ""}</OutputPorts>
    ${reference ? `<Component><Engine xsi:type="TBGReferenceNodeComponentEngine" GlobalNodeID="${guid(reference).toUpperCase()}"/></Component>` : ""}</Item>`
}

async function archive(id: number, nodes: string, hint?: string) {
  const zip = new ZipWriter(new Uint8ArrayWriter())
  const options = { useWebWorkers: false }
  await zip.add("PackageInfo.xml", new TextReader(`<PackageInfo Guid="${guid(id)}"/>`), options)
  await zip.add("References.xml", new TextReader(hint
    ? `<References><Item Guid="${guid(31)}" HintPath="${hint}"><Name Guid="${guid(1)}" Name="original" VersionMask="^1.0.0"/></Item></References>`
    : "<References/>"), options)
  await zip.add("Unit_0/Unit.xml", new TextReader(`<Unit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <WorkFlow><Nodes>${nodes}</Nodes></WorkFlow></Unit>`), options)
  return zip.close()
}

const pkg = (path: string) => ({ kind: "package" as const, name: path.split("/").at(-1) ?? "", path,
  modifiedAt: "2026-11-27T10:00:00.000Z", sizeBytes: 100 })

async function fixture() {
  const unrelated = "/common/Другой.lgp"
  const files = new Map([
    [originalPath, await archive(1, node(10, "Сохранённый") + node(11, "Удалённый") + node(12, "Без выхода"))],
    [copyPath, await archive(2, node(10, "Переименован") + node(12, "Порт заменён", undefined, guid(21)))],
    [dependentPath, await archive(3, node(41, "Первая ссылка", 10) + node(42, "Вторая ссылка", 11)
      + node(43, "Третья ссылка", 12) + node(44, "Локальный", 19) + node(19, "Местный источник"), originalPath)],
    [unrelated, await archive(4, node(45, "Ссылка не сюда", 10), "/analyst/Исходный — v2.lgp")],
  ])
  const folders = new Map<string, FolderListing["entries"]>([
    [target.homeFolder, [pkg(originalPath), { kind: "folder", name: "Копии агента", path: "/analyst/Копии агента" }]],
    ["/analyst/Копии агента", [pkg(copyPath)]],
    ["/common", [pkg(dependentPath), pkg(unrelated)]],
  ])
  const storage = {
    async list(folder: string, signal: AbortSignal) {
      signal.throwIfAborted()
      const entries = folders.get(folder)
      if (!entries) throw Error("LOGINOM_PACKAGE_FOLDER_ACCESS_DENIED")
      return { folder, entries, slow: false }
    },
    async read(path: string, signal: AbortSignal) {
      signal.throwIfAborted()
      const bytes = files.get(path)
      if (!bytes) throw Error("missing fixture")
      return bytes
    },
  }
  let active = 0
  return { folders, storage, unrelated, active: () => active,
    async using(work: (source: typeof storage) => Promise<void>) {
      active++
      try { await work(storage) } finally { active-- }
    } }
}

test("reports cross-package links by GUID, including removed nodes and changed output GUIDs", async () => {
  const sample = await fixture()
  const result = await scanPackageReferences(target, sample.using, new AbortController().signal)
  expect(result).toEqual({
    status: "scanned", complete: true, timedOut: false, packagesScanned: 2, foldersWithoutAccess: 0,
    notChecked: ["inaccessible_folders", "version_compatibility", "schedules", "open_users"],
    packages: [{ path: dependentPath, name: "Отчёт.lgp", references: [
      { node: { guid: guid(41), label: "Первая ссылка" }, target: { guid: guid(10), label: "Сохранённый" },
        copy: "node_and_outputs_present" },
      { node: { guid: guid(42), label: "Вторая ссылка" }, target: { guid: guid(11), label: "Удалённый" },
        copy: "node_missing" },
      { node: { guid: guid(43), label: "Третья ссылка" }, target: { guid: guid(12), label: "Без выхода" },
        copy: "outputs_missing" },
    ] }],
  })
  expect(sample.active()).toBe(0)
})

test("counts only explicit folder denials and retains results from readable folders", async () => {
  const sample = await fixture()
  sample.folders.set("/common", [
    { kind: "folder", name: "Недоступная", path: "/common/Недоступная" }, pkg(dependentPath),
  ])
  expect(await scanPackageReferences(target, sample.using, new AbortController().signal)).toMatchObject({
    status: "scanned", complete: false, timedOut: false, packagesScanned: 1, foldersWithoutAccess: 1,
    packages: [{ path: dependentPath }],
  })
  expect(sample.active()).toBe(0)
})

test("deadline returns already inspected packages and closes storage", async () => {
  const sample = await fixture()
  const read = sample.storage.read
  sample.storage.read = (path, signal) => path === sample.unrelated
    ? new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }))
    : read(path, signal)
  expect(await scanPackageReferences(target, sample.using, new AbortController().signal, 750)).toMatchObject({
    status: "scanned", complete: false, timedOut: true, packagesScanned: 1, foldersWithoutAccess: 0,
    packages: [{ path: dependentPath }],
  })
  expect(sample.active()).toBe(0)
})

test("caller cancellation returns no success and closes storage", async () => {
  const sample = await fixture()
  const controller = new AbortController()
  sample.storage.list = async () => {
    controller.abort(Error("cancelled"))
    throw controller.signal.reason
  }
  await expect(scanPackageReferences(target, sample.using, controller.signal)).rejects.toThrow("cancelled")
  expect(sample.active()).toBe(0)
})

const scratch: string[] = []
afterEach(async () => {
  await Promise.all(scratch.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

test("uses only the session's confirmed C3.17 replacement source in the current generation", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-references-"))
  scratch.push(root)
  const sessionID = SessionID.create()
  const chat = createHash("sha256").update(sessionID).digest("hex")
  const file = join(root, "runtime", "generations", "7", "chats", chat, "package-copy.json")
  const version = "/analyst/Исходный — v2.lgp"
  const signal = new AbortController().signal
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify({ versions: {}, backups: {}, copy: { original: originalPath, path: copyPath, version } }))
  expect(await readReferenceTarget(root, { sessionID, generation: 7 }, signal)).toEqual({ originalPath, copyPath: version })
  expect(await readReferenceTarget(root, { sessionID, generation: 8 }, signal)).toBeUndefined()
  expect(await readReferenceTarget(root, { sessionID: SessionID.create(), generation: 7 }, signal)).toBeUndefined()
  await writeFile(file, JSON.stringify({ pending: { action: "replace-original" }, copy: { original: originalPath, path: copyPath } }))
  await expect(readReferenceTarget(root, { sessionID, generation: 7 }, signal)).rejects.toThrow("LOGINOM_PACKAGE_FOLDER_UNAVAILABLE")
})
