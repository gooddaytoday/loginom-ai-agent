import { afterEach, expect, test } from "bun:test"
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"

import { checkAppExists, resolveAppPath } from "./apps"

const originalPath = process.env.PATH
const directories: string[] = []

afterEach(async () => {
  process.env.PATH = originalPath
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

test.skipIf(process.platform !== "win32")("resolves a Windows executable directly", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-app-"))
  directories.push(directory)
  const executable = join(directory, "sample-editor.exe")
  await writeFile(executable, "fixture")
  process.env.PATH = `${directory}${delimiter}${originalPath ?? ""}`

  expect(await checkAppExists("sample-editor")).toBe(true)
  expect(await resolveAppPath("sample-editor")).toBe(await realpath(executable))
})

test.skipIf(process.platform !== "win32")("does not return an unresolved command wrapper", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-app-"))
  directories.push(directory)
  await writeFile(join(directory, "missing-editor.cmd"), "@missing-editor.exe %*\r\n")
  process.env.PATH = `${directory}${delimiter}${originalPath ?? ""}`

  expect(await checkAppExists("missing-editor")).toBe(false)
  expect(await resolveAppPath("missing-editor")).toBeNull()
})

test.skipIf(process.platform !== "win32")("resolves an executable behind a command wrapper", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-app-"))
  directories.push(directory)
  const executable = join(directory, "bin/sample editor.exe")
  await mkdir(join(directory, "bin"))
  await writeFile(executable, "fixture")
  await writeFile(join(directory, "sample-wrapper.cmd"), '@"%~dp0bin\\sample editor.exe" %*\r\n')
  process.env.PATH = `${directory}${delimiter}${originalPath ?? ""}`

  expect(await checkAppExists("sample-wrapper")).toBe(true)
  expect(await resolveAppPath("sample-wrapper")).toBe(await realpath(executable))
})
