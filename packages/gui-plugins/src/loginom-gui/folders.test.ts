import { afterEach, expect, test } from "bun:test"
import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { allocateManagedFolder, availableProjectName, conversationTitle } from "./folders"
import { managedFolders } from "./folders-main"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

test("each draft is private and conversations have separate dated folders", async () => {
  const documents = await mkdtemp(path.join(tmpdir(), "loginom-folders-"))
  roots.push(documents)
  const profile = path.join(documents, "profile")
  const api = managedFolders(documents, profile, () => new Date(2026, 10, 27))
  const draft = await api.draftDirectory("first-draft")
  const other = await api.draftDirectory("second-draft")
  expect(draft).not.toBe(other)
  expect(path.dirname(draft)).toBe(path.join(profile, "drafts"))
  expect(await readdir(draft)).toEqual([])

  const title = conversationTitle("  Анализ продаж  \nИз файла", "Новый разговор")
  const [first, second] = await Promise.all([api.conversation(title), api.conversation(title)])
  expect(first).not.toBe(second)
  expect([first, second]).toContain(path.join(documents, "Loginom AI Agent", "Без проекта", "2026-11-27 Анализ продаж"))

  for (const directory of [first, second]) {
    expect(path.dirname(directory)).toBe(path.join(documents, "Loginom AI Agent", "Без проекта"))
    expect((await stat(directory)).isDirectory()).toBe(true)
  }

  const project = await api.project("Отчёты")
  expect(project).toBe(path.join(documents, "Loginom AI Agent", "Проекты", "Отчёты"))
  expect((await stat(project)).isDirectory()).toBe(true)
})

test("path characters in titles cannot escape the managed directories", async () => {
  const documents = await mkdtemp(path.join(tmpdir(), "loginom-folders-"))
  roots.push(documents)
  const api = managedFolders(documents, path.join(documents, "profile"))
  const parent = path.join(documents, "Loginom AI Agent", "Проекты")
  expect(path.dirname(await api.project("../..\\elsewhere"))).toBe(parent)
  expect(path.basename(await api.project("CON.txt"))).toBe("_CON.txt")
  await expect(api.draftDirectory("../outside")).rejects.toThrow()
})

test("an unavailable Documents directory falls back to the profile and failed starts remove only empty folders", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "loginom-folders-"))
  roots.push(root)
  const documents = path.join(root, "Documents")
  await writeFile(documents, "")
  const profile = path.join(root, "profile")
  const api = managedFolders(documents, profile, () => new Date(2026, 10, 27))
  const failed = await api.conversation("Не запущен")
  const retained = await api.conversation("С файлом")
  const parent = path.join(profile, "Loginom AI Agent", "Без проекта")
  expect(path.dirname(failed)).toBe(parent)
  await writeFile(path.join(retained, "input.csv"), "total\n12\n")
  await api.finish({ directory: failed, keep: false })
  await api.finish({ directory: retained, keep: false })
  expect(await readdir(parent)).toEqual(["2026-11-27 С файлом"])
  expect(await readdir(retained)).toEqual(["input.csv"])
})

test("project display names preserve punctuation and distinguish duplicates", () => {
  const requested = "Отчёт: Q1/Q2"
  expect(availableProjectName(requested, ["Отчёт- Q1-Q2"])).toBe(requested)
  expect(availableProjectName(requested, [requested])).toBe("Отчёт: Q1/Q2 (2)")
  expect(availableProjectName(requested, [requested, "ОТЧЁТ: Q1/Q2 (2)"])).toBe("Отчёт: Q1/Q2 (3)")
})

test("closing a draft removes an empty private directory but leaves projects and nonempty drafts intact", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "loginom-drafts-"))
  roots.push(root)

  const api = managedFolders(path.join(root, "Documents"), path.join(root, "profile"))
  const draft = await api.draftDirectory("unused")
  const populated = await api.draftDirectory("with-file")
  const project = await api.project("Project")
  await writeFile(path.join(populated, "data.csv"), "value\n42\n")

  expect(await api.discardDraft(draft)).toBe(true)
  expect(await api.discardDraft(populated)).toBe(false)
  expect(await api.discardDraft(project)).toBe(false)
  expect(await readdir(path.dirname(draft))).toEqual(["with-file"])
  expect(await readdir(populated)).toEqual(["data.csv"])
  expect(await readdir(project)).toEqual([])
})

test("a failed conversation start forgets its hidden project after removing the folder", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "loginom-rollback-"))
  roots.push(root)
  const folders = managedFolders(root, path.join(root, "profile"))
  const hidden = new Set<string>()

  const workspace = await allocateManagedFolder(
    folders.conversation("Failed session"),
    async (directory) => void hidden.add(directory),
    folders.finish,
    async (directory) => {
      await expect(stat(directory)).rejects.toMatchObject({ code: "ENOENT" })
      hidden.delete(directory)
    },
  )

  expect([...hidden]).toEqual([workspace.directory])

  await workspace.finish(false)
  expect([...hidden]).toEqual([])
})

test("a draft registration that completes after Ctrl+N times out is rolled back", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "loginom-drafts-"))
  roots.push(root)
  const folders = managedFolders(root, path.join(root, "profile"))
  const hidden = new Set<string>()
  const timeout = new AbortController()
  const registered = Promise.withResolvers<void>()
  const response = Promise.withResolvers<void>()

  const attempt = allocateManagedFolder(
    folders.draftDirectory("timed-out"),
    async (directory) => {
      hidden.add(directory)
      registered.resolve()
      await response.promise
      timeout.signal.throwIfAborted()
    },
    ({ directory }) => folders.discardDraft(directory),
    async (directory) => {
      await expect(stat(directory)).rejects.toMatchObject({ code: "ENOENT" })
      hidden.delete(directory)
    },
  ).then(
    () => "opened",
    (error) => (error instanceof DOMException ? error.name : "failed"),
  )

  await registered.promise
  timeout.abort(new DOMException("Draft not opened", "TimeoutError"))
  response.resolve()
  expect(await attempt).toBe("TimeoutError")
  expect([...hidden]).toEqual([])
})
