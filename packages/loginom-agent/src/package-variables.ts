import { realpath } from "node:fs/promises"
import { extname, relative, resolve } from "node:path"
import type { RpcHandlers } from "@opencode/plugin/promise/rpc"
import { FSUtil } from "@opencode/util/fs-util"
import { Schema } from "effect"
import { MAX_BYTE_ADMISSION } from "./file-profile-core"
import { fileSnapshot } from "./file-snapshot"

const snapshot = Schema.Struct({
  source: Schema.Literal("saved"),
  definitionsCoverage: Schema.Literals(["complete", "partial", "unavailable"]),
  usagesCoverage: Schema.Literal("partial"),
  definitions: Schema.NullOr(Schema.Array(Schema.Struct({ name: Schema.String, type: Schema.String }))),
  defaults: Schema.NullOr(Schema.Array(Schema.Struct({ name: Schema.String, value: Schema.String }))),
  usages: Schema.Array(Schema.Struct({
    name: Schema.String,
    kind: Schema.Literals(["template", "binding"]),
    scope: Schema.Literal("control"),
    module: Schema.String,
    branch: Schema.Array(Schema.String),
    nodeID: Schema.String,
    nodeLabel: Schema.String,
    parameter: Schema.String,
  })),
})

const empty = Schema.toStandardSchemaV1(Schema.Struct({}))
export const packageVariablesRpc = {
  id: "loginom.package",
  methods: {
    variables: {
      input: Schema.toStandardSchemaV1(Schema.Struct({
        sessionID: Schema.NonEmptyString,
        localPath: Schema.optional(Schema.NonEmptyString),
      })),
      output: Schema.toStandardSchemaV1(Schema.Struct({ snapshot: Schema.NullOr(snapshot) })),
      errors: { invalid_session: empty, unreadable_package: empty },
    },
  },
  events: {},
}

export function packageVariablesHandler(input: {
  directory: string
  sessionDirectory(sessionID: string): Promise<string | undefined>
  canRead(sessionID: string, resources: string[]): Promise<boolean>
}): RpcHandlers<typeof packageVariablesRpc>["variables"] {
  return async ({ sessionID, localPath }, call) => {
    if (await input.sessionDirectory(sessionID) !== input.directory)
      return call.error("invalid_session", "The conversation is unavailable in this location", {})
    if (localPath === undefined) return { snapshot: null }

    try {
      const directory = await realpath(input.directory)
      const requested = resolve(directory, localPath)
      const inside = (path: string) => resolve(directory, "..") !== directory && FSUtil.contains(directory, path)
      const resource = (path: string) => relative(directory, path).replaceAll("\\", "/")
      if (!inside(requested) || extname(requested).toLowerCase() !== ".lgp" ||
        !await input.canRead(sessionID, [resource(requested)])) throw Error("PACKAGE_VARIABLES_FORBIDDEN")
      const canonical = await realpath(requested)
      if (!inside(canonical) || extname(canonical).toLowerCase() !== ".lgp" ||
        (requested !== canonical && !await input.canRead(sessionID, [resource(canonical)])))
        throw Error("PACKAGE_VARIABLES_FORBIDDEN")
      call.signal.throwIfAborted()
      return { snapshot: await readVariables(await fileSnapshot(canonical, MAX_BYTE_ADMISSION)) }
    } catch {
      return call.error("unreadable_package", "The saved package could not be read in this location", {})
    }
  }
}

export async function packageVariablesMetadata(bytes: Uint8Array) {
  const result = await readVariables(bytes).catch(() => undefined)
  if (!result) return undefined
  return {
    packageVariables: {
      source: result.source,
      definitionsCoverage: result.definitionsCoverage,
      usagesCoverage: result.usagesCoverage,
      definitionCount: result.definitions?.length ?? null,
      usageCount: result.usages.length,
    },
  }
}

async function readVariables(bytes: Uint8Array) {
  const { extractPackageVariables } = await import("@loginom-ai-agent/loginom-host/package-docs/extract")
  return extractPackageVariables(bytes)
}
