import { afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import { brandWindowsRuntime, windowsResource } from "../script/windows-resource"

// The CLI executable on Windows names the product, not Bun (B4.7c, BRAND-01): Task Manager shows its FileDescription.
// The real Bun runtime is 110 MB, so a small executable with Bun's version resource stands in for it; the built CLI is
// checked in the migration log.
const desktop = createRequire(path.resolve(import.meta.dir, "../../desktop/package.json"))
const ResEdit = createRequire(desktop.resolve("app-builder-lib/package.json"))("resedit")
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe("the Windows version resource of the CLI", () => {
  test("names the product of the build's channel, its publisher and a four-part version", () => {
    expect(windowsResource("latest", "0.5.1")).toEqual({
      title: "Loginom AI Agent",
      description: "Loginom AI Agent",
      publisher: "Loginom",
      version: "0.5.1.0",
    })
    expect(windowsResource("prod", "1.2.3")).toMatchObject({ title: "Loginom AI Agent", version: "1.2.3.0" })
    expect(windowsResource("beta", "0.5.1-beta.2")).toMatchObject({
      title: "Loginom AI Agent Beta",
      description: "Loginom AI Agent Beta",
      version: "0.5.1.0",
    })
    for (const channel of ["dev", "local", "b47c-desktop-pty-brand"])
      expect(windowsResource(channel, `0.0.0-${channel}-202611231545`)).toMatchObject({
        title: "Loginom AI Agent Dev",
        description: "Loginom AI Agent Dev",
        version: "0.0.0.0",
      })
    expect(() => windowsResource("dev", "local")).toThrow("needs a numeric version")
  })

  test("replaces Bun's name, publisher and version in the runtime the CLI compiles from", async () => {
    const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "loginom-windows-resource-")))
    roots.push(root)
    const file = path.join(root, "bun.exe")
    await fs.writeFile(file, bun())

    await brandWindowsRuntime(file, windowsResource("dev", "0.0.0-dev-202611231545"))

    const info = versionInfo(await fs.readFile(file))
    expect(info.getStringValues(english)).toEqual({
      FileDescription: "Loginom AI Agent Dev",
      ProductName: "Loginom AI Agent Dev",
      CompanyName: "Loginom",
      FileVersion: "0.0.0.0",
      ProductVersion: "0.0.0.0",
      // Bun's compile.windows has no field for these, so the build on Windows keeps them too.
      InternalName: "bun",
      OriginalFilename: "bun.exe",
      LegalCopyright: "https://bun.com/docs/project/licensing",
    })
    expect(info.fixedInfo).toMatchObject({
      fileVersionMS: 0,
      fileVersionLS: 0,
      productVersionMS: 0,
      productVersionLS: 0,
    })

    await brandWindowsRuntime(file, windowsResource("latest", "1.2.3"))
    const release = versionInfo(await fs.readFile(file))
    expect(release.getStringValues(english)).toMatchObject({
      FileDescription: "Loginom AI Agent",
      ProductName: "Loginom AI Agent",
      FileVersion: "1.2.3.0",
    })
    expect(release.fixedInfo).toMatchObject({
      fileVersionMS: 0x10002,
      fileVersionLS: 0x30000,
      productVersionMS: 0x10002,
      productVersionLS: 0x30000,
    })
  })
})

const english = { lang: 1033, codepage: 1200 }

// An empty x64 executable with the version resource of Bun 1.4.4's Windows runtime.
function bun() {
  const executable = ResEdit.NtExecutable.createEmpty(false, false)
  const resources = ResEdit.NtExecutableResource.from(executable)
  const info = ResEdit.Resource.VersionInfo.create(
    english.lang,
    { fileVersionMS: 0x10004, fileVersionLS: 0x40000, productVersionMS: 0x10004, productVersionLS: 0x40000 },
    [
      {
        ...english,
        values: {
          FileDescription: "Bun",
          FileVersion: "1.4.4",
          InternalName: "bun",
          OriginalFilename: "bun.exe",
          ProductName: "Bun",
          ProductVersion: "1.4.4",
          CompanyName: "Oven",
          LegalCopyright: "https://bun.com/docs/project/licensing",
        },
      },
    ],
  )
  info.outputToResourceEntries(resources.entries)
  resources.outputResource(executable)
  return Buffer.from(executable.generate())
}

function versionInfo(bytes: Buffer) {
  const executable = ResEdit.NtExecutable.from(bytes)
  const [info] = ResEdit.Resource.VersionInfo.fromEntries(ResEdit.NtExecutableResource.from(executable).entries)
  return info
}
