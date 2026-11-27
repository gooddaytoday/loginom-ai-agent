import { afterEach, expect, test } from "bun:test"
import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises"
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

test("moves nested files into a distinct project folder and can restore them", async () => {
  const documents = await mkdtemp(path.join(tmpdir(), "loginom-folders-"))
  roots.push(documents)
  const api = managedFolders(documents)
  const original = await api.conversation("Отчёт")
  const project = await api.project("Аналитика")
  await mkdir(path.join(original, "данные"))
  await writeFile(path.join(original, "данные", "таблица.csv"), "a,b")
  await writeFile(path.join(original, ".заметки"), "notes")
  await mkdir(path.join(project, "Отчёт"))
  await writeFile(path.join(project, "Отчёт", "старый.csv"), "old")

  expect(await api.countFiles(original)).toBe(2)
  const moved = await api.moveFiles({ source: original, project, title: "Отчёт" })
  expect(moved.count).toBe(2)
  expect(path.dirname(moved.directory)).toBe(project)
  expect(await readFile(path.join(moved.directory, "данные", "таблица.csv"), "utf8")).toBe("a,b")
  expect(await readFile(path.join(project, "Отчёт", "старый.csv"), "utf8")).toBe("old")
  await expect(stat(original)).rejects.toMatchObject({ code: "ENOENT" })
  await api.restoreFiles({ source: moved.directory, project, original })
  expect(await readFile(path.join(original, ".заметки"), "utf8")).toBe("notes")
  await expect(stat(moved.directory)).rejects.toMatchObject({ code: "ENOENT" })
})

test("removes only the requested managed folder and rejects redirects", async () => {
  const documents = await mkdtemp(path.join(tmpdir(), "loginom-folders-"))
  roots.push(documents)
  const api = managedFolders(documents)
  const kept = await api.conversation("Оставить")
  const deleted = await api.conversation("Удалить")
  const project = await api.project("Проект")
  const redirected = path.join(path.dirname(project), "Ссылка")
  await writeFile(path.join(kept, "сохранить"), "keep")
  await writeFile(path.join(deleted, "удалить"), "delete")
  await writeFile(path.join(project, "удалить"), "delete")
  await symlink(kept, redirected, "junction")

  await expect(api.remove(documents)).rejects.toThrow("Outside managed folders")
  await expect(api.validateProject(redirected)).rejects.toThrow("Expected managed directory")
  await api.remove(deleted)
  await api.remove(project)
  await expect(stat(deleted)).rejects.toMatchObject({ code: "ENOENT" })
  await expect(stat(project)).rejects.toMatchObject({ code: "ENOENT" })
  expect(await readFile(path.join(kept, "сохранить"), "utf8")).toBe("keep")
})
