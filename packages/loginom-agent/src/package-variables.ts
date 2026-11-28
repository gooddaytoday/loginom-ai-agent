import { lstat, realpath } from "node:fs/promises"
import { extname, relative, resolve } from "node:path"
import { fileError, hostError } from "@loginom-ai-agent/loginom-host/errors"
import type { RpcHandlers } from "@opencode/plugin/promise/rpc"
import { FSUtil } from "@opencode/util/fs-util"
import { Schema } from "effect"
import { MAX_BYTE_ADMISSION } from "./file-profile-core"
import { fileSnapshot } from "./file-snapshot"
import { LoginomPackageVariables } from "./loginom-metadata"

const snapshot = Schema.Struct({
  ...LoginomPackageVariables.fields,
  truncated: Schema.Boolean,
})

const empty = Schema.toStandardSchemaV1(Schema.Struct({}))
export const packageVariablesRpc = {
  id: "loginom.package-variables",
  methods: {
    variables: {
      input: Schema.toStandardSchemaV1(Schema.Struct({
        sessionID: Schema.NonEmptyString,
        localPath: Schema.optional(Schema.NonEmptyString),
      })),
      output: Schema.toStandardSchemaV1(Schema.Union([
        Schema.Struct({ snapshot }),
        Schema.Struct({ snapshot: Schema.Null, reason: Schema.Literal("server_snapshot_unavailable") }),
      ])),
      errors: {
        invalid_session: empty, invalid_path: empty, access_denied: empty, file_not_found: empty,
        file_changed: empty, package_too_large: empty, invalid_package: empty, unreadable_package: empty,
      },
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
    if (localPath === undefined) return { snapshot: null, reason: "server_snapshot_unavailable" }
    call.signal.throwIfAborted()

    let bytes: Uint8Array
    try {
      const directory = await realpath(input.directory)
      const requested = resolve(directory, localPath)
      const inside = (path: string) => resolve(directory, "..") !== directory && FSUtil.contains(directory, path)
      const resource = (path: string) => relative(directory, path).replaceAll("\\", "/")
      if (extname(requested).toLowerCase() !== ".lgp") throw Error("LOGINOM_FILE_NOT_REGULAR")
      if (!inside(requested) || !await input.canRead(sessionID, [resource(requested)]))
        throw Error("LOGINOM_FILE_ACCESS_DENIED")
      const canonical = await realpath(requested)
      if (!inside(canonical)) throw Error("LOGINOM_FILE_ACCESS_DENIED")
      if (extname(canonical).toLowerCase() !== ".lgp") throw Error("LOGINOM_FILE_NOT_REGULAR")
      bytes = await fileSnapshot(canonical, MAX_BYTE_ADMISSION, async (opened) => {
        const checkIdentity = async () => {
          if (await realpath(canonical) !== canonical) throw Error("LOGINOM_FILE_CHANGED")
          const current = await lstat(canonical, { bigint: true })
          if (current.dev !== opened.dev || current.ino !== opened.ino) throw Error("LOGINOM_FILE_CHANGED")
        }
        await checkIdentity()
        if (!await input.canRead(sessionID, [resource(canonical)])) throw Error("LOGINOM_FILE_ACCESS_DENIED")
        await checkIdentity()
        call.signal.throwIfAborted()
      })
    } catch (error) {
      call.signal.throwIfAborted()
      switch (hostError(fileError(error))) {
        case "LOGINOM_FILE_ACCESS_DENIED": return call.error("access_denied", "Read access to this package is denied", {})
        case "LOGINOM_FILE_NOT_FOUND": return call.error("file_not_found", "The saved package was not found", {})
        case "LOGINOM_FILE_NOT_REGULAR": return call.error("invalid_path", "A regular .lgp file is required", {})
        case "LOGINOM_FILE_TOO_LARGE": return call.error("package_too_large", "The saved package exceeds the read limit", {})
        case "LOGINOM_FILE_CHANGED": return call.error("file_changed", "The saved package changed during the read", {})
        default: return call.error("unreadable_package", "The saved package could not be read", {})
      }
    }
    call.signal.throwIfAborted()
    const { extractPackageVariables } = await import("@loginom-ai-agent/loginom-host/package-docs/extract")
    try {
      return { snapshot: await extractPackageVariables(bytes) }
    } catch (error) {
      if (error instanceof Error && error.message === "PACKAGE_VARIABLES_XML_LIMIT")
        return call.error("package_too_large", "The package XML exceeds the read limit", {})
      return call.error("invalid_package", "The file is not a readable Loginom package archive", {})
    }
  }
}
