import { expect, test } from "bun:test"
import { copyFile, mkdtemp, readFile, realpath, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { packageVariablesHandler, packageVariablesMetadata } from "../src/package-variables"
import { packageVariablesRpc } from "../src/package-variables-contract"

const fixture = new URL("../../../evals/tasks/node-evals/crosstable-local-variable-bindings/reference.lgp", import.meta.url)

test("variables RPC reads a saved file only in the conversation's location and honors read denials", async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "loginom-variables-")))
  try {
    await copyFile(fixture, join(directory, "package.lgp"))
    await copyFile(fixture, join(directory, "denied.lgp"))
    await symlink(fileURLToPath(fixture), join(directory, "outside.lgp"))
    const variables = packageVariablesHandler({
      directory,
      sessionDirectory: async (sessionID) => sessionID === "local" ? directory : "/another/location",
      canRead: async (_sessionID, resources) => !resources.includes("denied.lgp"),
      readStored: async () => { throw Error("Not a Loginom storage request") },
    })
    const call: Parameters<typeof variables>[1] = {
      signal: new AbortController().signal,
      error: (...[name]) => { throw Error(name) },
    }
    expect(await variables({ sessionID: "local" }, call)).toEqual({ snapshot: null })
    await expect(variables({ sessionID: "foreign", localPath: "package.lgp" }, call)).rejects.toThrow("invalid_session")
    for (const localPath of ["denied.lgp", "outside.lgp"])
      await expect(variables({ sessionID: "local", localPath }, call)).rejects.toThrow("unreadable_package")
    const input = await packageVariablesRpc.methods.variables.input["~standard"].validate({ sessionID: "local", localPath: "package.lgp" })
    if (input.issues) throw Error("fixture input rejected")
    const output = await variables(input.value, call)
    expect(await packageVariablesRpc.methods.variables.output["~standard"].validate(output)).toMatchObject({
      value: { snapshot: { source: "saved", definitionsCoverage: "complete", definitions: [], defaults: [], usages: [
        { name: "CaptionSeparator", kind: "binding", parameter: "DisplayNameSeparator.Engine.Root." },
        { name: "GroupLimit", kind: "binding", parameter: "SlidingUniqueValuesLimit.Engine.Root." },
        { name: "CategoryNames", kind: "binding", parameter: "UniqueValueNames.Engine.Root." },
      ] } },
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("conversation metadata contains provenance and counts, not variable names, settings or values", async () => {
  expect(await packageVariablesMetadata(await readFile(fixture))).toEqual({
    packageVariables: { source: "saved", definitionsCoverage: "complete", usagesCoverage: "partial", definitionCount: 0, usageCount: 3 },
  })
})
