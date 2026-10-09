import { extractPackage, type PackageStructure } from "../../src/package-docs/extract"
import { basename, isAbsolute } from "node:path"
import { createHash } from "node:crypto"

// Test infrastructure only; the model cannot supply this replay plan.
export async function planColdReplay(input: {
  package: string
  packageSha256: string
  packagePath: string
  resultPrefix: string
  username: string
  inputs: { path: string; serverPath: string; sha256: string }[]
}) {
  if (!isAbsolute(input.package) || input.inputs.some((file) => !isAbsolute(file.path)))
    throw Error("COLD_SOURCE_PATH_INVALID")
  const name = basename(input.packagePath)
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(input.username) ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(input.resultPrefix) ||
    input.packagePath !== `/${input.username}/${name}` ||
    !name.endsWith(".lgp") ||
    !(name.startsWith(input.resultPrefix + ".") || name.startsWith(input.resultPrefix + "-"))
  )
    throw Error("COLD_PACKAGE_OWNERSHIP_INVALID")
  if (
    createHash("sha256")
      .update(await Bun.file(input.package).bytes())
      .digest("hex") !== input.packageSha256
  )
    throw Error("COLD_PACKAGE_INTEGRITY_INVALID")
  if (
    input.inputs.some((file) => file.serverPath !== `/${input.username}/${basename(file.serverPath)}`) ||
    new Set(input.inputs.map((file) => file.serverPath)).size !== input.inputs.length
  )
    throw Error("COLD_INPUT_BINDING_INVALID")
  await Promise.all(
    input.inputs.map(async (file) => {
      if (
        createHash("sha256")
          .update(await Bun.file(file.path).bytes())
          .digest("hex") !== file.sha256
      )
        throw Error("COLD_INPUT_INTEGRITY_INVALID")
    }),
  )
  const structure = await extractPackage(input.package)
  if (
    structure.modules
      .flatMap(allNodes)
      .filter((node) => node.engine_type === "TBGImportTextFile")
      .some((node) => !input.inputs.some((file) => file.serverPath === node.settings_main.FileName))
  )
    throw Error("COLD_INPUT_BINDING_INVALID")
  const module = structure.modules[0]
  const exports = structure.modules.flatMap(allNodes).filter((node) => node.engine_type === "TBGExportTextFile")
  const node = exports[0]
  if (!module || exports.length !== 1 || !node || !module.workflow_nodes.includes(node))
    throw Error("COLD_EXPORT_UNSUPPORTED")
  if (node.settings_main.FileName !== `/${input.username}/${input.resultPrefix}.result.csv`)
    throw Error("COLD_OUTPUT_OWNERSHIP_INVALID")
  return {
    packagePath: input.packagePath,
    packageSha256: input.packageSha256,
    export: { module: module.id, guid: node.guid, label: node.label, path: node.settings_main.FileName },
    inputs: input.inputs,
  }
}

// Harness archives saved package bytes separately from its original task inputs.
// Recover only the native host admission filename; never rewrite node settings.
export async function planEvalColdReplay(input: Omit<Parameters<typeof planColdReplay>[0], "inputs"> & {
  inputs: { path: string; sha256: string }[]
}) {
  if (!isAbsolute(input.package) || input.inputs.some((file) => !isAbsolute(file.path)))
    throw Error("COLD_SOURCE_PATH_INVALID")
  await Promise.all(input.inputs.map(async (file) => {
    if (createHash("sha256").update(await Bun.file(file.path).bytes()).digest("hex") !== file.sha256)
      throw Error("COLD_INPUT_INTEGRITY_INVALID")
  }))
  const structure = await extractPackage(input.package)
  const paths = [...new Set(structure.modules.flatMap(allNodes)
    .filter((node) => node.engine_type === "TBGImportTextFile")
    .map((node) => node.settings_main.FileName))]
  const inputs = paths.map((serverPath) => {
    const matches = input.inputs.filter((file) => {
      const suffix = "-" + basename(file.path)
      if (typeof serverPath !== "string" || !serverPath.endsWith(suffix)) return false
      return new RegExp(`^/${input.username}/[a-f0-9]{64}-[0-9]+$`).test(serverPath.slice(0, -suffix.length))
    })
    if (matches.length !== 1) throw Error("COLD_INPUT_BINDING_INVALID")
    return { ...matches[0]!, serverPath: serverPath! }
  })
  return planColdReplay({ ...input, inputs })
}

function allNodes(
  workflow: Pick<PackageStructure["modules"][number], "workflow_nodes" | "submodels">,
): PackageStructure["modules"][number]["workflow_nodes"] {
  return [...workflow.workflow_nodes, ...workflow.submodels.flatMap(allNodes)]
}
