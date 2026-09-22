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
  await mkdir(join(directory, "icons/prod/linux"), { recursive: true })
  await mkdir(join(directory, "resources/icons"), { recursive: true })
  await Promise.all(
    ["icon.png", "icon.ico", "icon.icns", "dock.png"].map((name) =>
      writeFile(join(directory, "icons/prod", name), "prod-icon"),
    ),
  )
  await writeFile(join(directory, "icons/prod/linux/32x32.png"), "linux-icon")
  await writeFile(join(directory, "icons/prod/StoreLogo.png"), "legacy-icon")
  await writeFile(join(directory, "resources/icons/stale.txt"), "stale")

  await copyIcons("prod", directory)

  expect(await readFile(join(directory, "resources/icons/icon.ico"), "utf8")).toBe("prod-icon")
  expect(await readFile(join(directory, "resources/icons/linux/32x32.png"), "utf8")).toBe("linux-icon")
  expect(await Bun.file(join(directory, "resources/icons/StoreLogo.png")).exists()).toBe(false)
  expect(await Bun.file(join(directory, "resources/icons/stale.txt")).exists()).toBe(false)
})
