import { afterEach, expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { copyIcons } from "./copy-icons"

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

test("copies only the selected channel and replaces stale resources", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-icons-"))
  directories.push(directory)
  await mkdir(join(directory, "icons/prod/nested"), { recursive: true })
  await mkdir(join(directory, "resources/icons"), { recursive: true })
  await writeFile(join(directory, "icons/prod/icon.ico"), "prod-icon")
  await writeFile(join(directory, "icons/prod/nested/icon.png"), "nested-icon")
  await writeFile(join(directory, "resources/icons/stale.txt"), "stale")

  await copyIcons("prod", directory)

  expect(await readFile(join(directory, "resources/icons/icon.ico"), "utf8")).toBe("prod-icon")
  expect(await readFile(join(directory, "resources/icons/nested/icon.png"), "utf8")).toBe("nested-icon")
  expect(await Bun.file(join(directory, "resources/icons/stale.txt")).exists()).toBe(false)
})
