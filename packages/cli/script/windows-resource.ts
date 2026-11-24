import { readFile, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { Product, productChannel, productName } from "@loginom-ai-agent/product"

// Loginom AI Agent (B4.7c): the version resource of the CLI executable on Windows, in both builds (the product CLI
// and the one Desktop bundles). Task Manager names a process by its FileDescription; Bun's runtime says "Bun".
export function windowsResource(channel: string, version: string) {
  const numbers = /^(\d+)\.(\d+)\.(\d+)(?:[-+]|$)/.exec(version)?.slice(1)
  if (!numbers) throw new Error(`The Windows version resource needs a numeric version, not ${version}`)
  const name = productName(productChannel(channel === "latest" ? "prod" : channel))
  // The field names of Bun's `compile.windows`; Windows wants a four-part number.
  return { title: name, description: name, publisher: Product.publisher, version: [...numbers, "0"].join(".") }
}

// Bun writes `compile.windows` only when it compiles on Windows. Elsewhere the build gives Bun a Windows runtime with
// these fields already set. resedit is electron-builder's PE resource editor (Desktop's app-builder-lib); it cannot
// edit a compiled CLI, whose embedded `.bun` section follows `.rsrc`, only the runtime before Bun adds that section.
export async function brandWindowsRuntime(file: string, resource: ReturnType<typeof windowsResource>) {
  const desktop = createRequire(path.resolve(import.meta.dirname, "../../desktop/package.json"))
  const ResEdit: ResEdit = createRequire(desktop.resolve("app-builder-lib/package.json"))("resedit")
  // Bun drops the runtime's signature from the executable it compiles anyway.
  const executable = ResEdit.NtExecutable.from(await readFile(file), { ignoreCert: true })
  const resources = ResEdit.NtExecutableResource.from(executable)
  const [info] = ResEdit.Resource.VersionInfo.fromEntries(resources.entries)
  if (!info) throw new Error(`${file} has no version resource`)
  const [major, minor, patch, revision] = resource.version.split(".").map(Number)
  for (const language of info.getAllLanguagesForStringValues()) {
    info.setStringValues(language, {
      ProductName: resource.title,
      FileDescription: resource.description,
      CompanyName: resource.publisher,
      FileVersion: resource.version,
      ProductVersion: resource.version,
    })
    info.setFileVersion(major, minor, patch, revision, language.lang)
    info.setProductVersion(major, minor, patch, revision, language.lang)
  }
  info.outputToResourceEntries(resources.entries)
  resources.outputResource(executable)
  await writeFile(file, Buffer.from(executable.generate()))
}

// The part of resedit 1.7 used here; the CLI does not depend on it directly.
type ResEdit = {
  NtExecutable: { from(bin: Uint8Array, options: { ignoreCert: boolean }): Executable }
  NtExecutableResource: {
    from(executable: Executable): { entries: unknown[]; outputResource(executable: Executable): void }
  }
  Resource: { VersionInfo: { fromEntries(entries: unknown[]): VersionInfo[] } }
}
type Executable = { generate(): ArrayBuffer }
type Language = { lang: number; codepage: number }
type VersionInfo = {
  getAllLanguagesForStringValues(): Language[]
  setStringValues(language: Language, values: Record<string, string>): void
  setFileVersion(major: number, minor: number, patch: number, revision: number, lang: number): void
  setProductVersion(major: number, minor: number, patch: number, revision: number, lang: number): void
  outputToResourceEntries(entries: unknown[]): void
}
