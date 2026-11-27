import { afterEach, expect, test } from "bun:test"
import { mkdtemp, readdir, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { conversationTitle, isConversationDraft, isConversationFolder } from "./folders"
import { managedFolders } from "./folders-main"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

test("conversations have separate dated folders and projects are not hidden", async () => {
  const documents = await mkdtemp(path.join(tmpdir(), "loginom-folders-"))
  roots.push(documents)
  const api = managedFolders(documents, () => new Date(2026, 10, 27))
  const draft = await api.draftDirectory()
  expect(isConversationDraft(draft)).toBe(true)
  expect(await readdir(draft)).toEqual([])

  const title = conversationTitle("  Анализ продаж  \nИз файла", "Новый разговор")
  const [first, second] = await Promise.all([api.conversation(title), api.conversation(title)])
  expect(first).not.toBe(second)
  expect([first, second]).toContain(path.join(documents, "Loginom AI Agent", "Без проекта", "2026-11-27 Анализ продаж"))
  for (const directory of [first, second]) {
    expect(path.dirname(directory)).toBe(draft)
    expect(isConversationFolder(directory)).toBe(true)
    expect((await stat(directory)).isDirectory()).toBe(true)
  }

  const project = await api.project("Отчёты")
  expect(project).toBe(path.join(documents, "Loginom AI Agent", "Проекты", "Отчёты"))
  expect(isConversationFolder(project)).toBe(false)
  expect((await stat(project)).isDirectory()).toBe(true)
})

test("path characters in titles cannot escape the managed directories", async () => {
  const documents = await mkdtemp(path.join(tmpdir(), "loginom-folders-"))
  roots.push(documents)
  const api = managedFolders(documents, () => new Date(2026, 10, 27))
  const parent = path.join(documents, "Loginom AI Agent", "Проекты")
  expect(path.dirname(await api.project("../..\\elsewhere"))).toBe(parent)
  expect(path.basename(await api.project("CON.txt"))).toBe("_CON.txt")
  expect(isConversationFolder("C:\\Documents\\Loginom AI Agent\\Без проекта\\2026-11-27 Анализ")).toBe(true)
  expect(isConversationFolder("C:\\Documents\\Loginom AI Agent\\Без проекта\\other")).toBe(false)
})
