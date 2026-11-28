import { expect, test } from "bun:test"
import { copyFile, mkdir, mkdtemp, realpath, rename, rm, symlink, truncate, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { packageVariablesHandler, packageVariablesRpc } from "../src/package-variables"

const fixture = new URL("../../../evals/tasks/node-evals/crosstable-local-variable-bindings/reference.lgp", import.meta.url)

test("variables RPC reads a saved file only in the conversation's location and honors read denials", async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "loginom-variables-")))
  try {
    await copyFile(fixture, join(directory, "package.lgp"))
    await copyFile(fixture, join(directory, "denied.lgp"))
    await mkdir(join(directory, "not-a-file.lgp"))
    await writeFile(join(directory, "broken.lgp"), "not a zip")
    await writeFile(join(directory, "large.lgp"), "")
    await truncate(join(directory, "large.lgp"), 16 * 1024 * 1024 + 1)
    await symlink(fileURLToPath(fixture), join(directory, "outside.lgp"))
    await symlink("denied.lgp", join(directory, "denied-alias.lgp"))
    const variables = packageVariablesHandler({
      directory,
      sessionDirectory: async (sessionID) => sessionID === "local" ? directory : "/another/location",
      canRead: async (_sessionID, resources) => !resources.includes("denied.lgp"),
    })
    const call: Parameters<typeof variables>[1] = {
      signal: new AbortController().signal,
      error: (...[name]) => { throw Error(name) },
    }
    expect(await variables({ sessionID: "local" }, call)).toEqual({ snapshot: null, reason: "server_snapshot_unavailable" })
    await expect(variables({ sessionID: "foreign", localPath: "package.lgp" }, call)).rejects.toThrow("invalid_session")
    for (const [localPath, code] of Object.entries({
      "denied.lgp": "access_denied", "denied-alias.lgp": "access_denied", "outside.lgp": "access_denied", "not-a-file.lgp": "invalid_path",
      "other.txt": "invalid_path", "missing.lgp": "file_not_found", "broken.lgp": "invalid_package",
      "large.lgp": "package_too_large",
    })) await expect(variables({ sessionID: "local", localPath }, call)).rejects.toThrow(code)
    const input = await packageVariablesRpc.methods.variables.input["~standard"].validate({ sessionID: "local", localPath: "package.lgp" })
    if (input.issues) throw Error("fixture input rejected")
    const output = await variables(input.value, call)
    expect(await packageVariablesRpc.methods.variables.output["~standard"].validate(output)).toMatchObject({
      value: { snapshot: { source: "saved", definitionsCoverage: "complete", definitions: [], defaults: [], usages: [
        { name: "CaptionSeparator", scope: "control", kind: "binding", parameter: "DisplayNameSeparator.Engine.Root." },
        { name: "GroupLimit", scope: "control", kind: "binding", parameter: "SlidingUniqueValuesLimit.Engine.Root." },
        { name: "CategoryNames", scope: "control", kind: "binding", parameter: "UniqueValueNames.Engine.Root." },
      ] } },
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("variables RPC rejects a different file installed while authorizing the canonical path", async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "loginom-variables-")))
  try {
    const canonical = join(directory, "package.lgp")
    await copyFile(fixture, canonical)
    await symlink(canonical, join(directory, "alias.lgp"))
    await copyFile(fixture, join(directory, "replacement.lgp"))
    const variables = packageVariablesHandler({
      directory,
      sessionDirectory: async () => directory,
      canRead: async (_sessionID, resources) => {
        if (resources.includes("package.lgp")) await rename(join(directory, "replacement.lgp"), canonical)
        return true
      },
    })
    const call: Parameters<typeof variables>[1] = {
      signal: new AbortController().signal,
      error: (...[name]) => { throw Error(name) },
    }
    await expect(variables({ sessionID: "local", localPath: "alias.lgp" }, call)).rejects.toThrow("file_changed")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
