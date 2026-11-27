import { realpath } from "node:fs/promises"
import { extname, relative, resolve } from "node:path"
import type { ReadStoredPackage } from "@loginom-ai-agent/loginom-host/package-folder"
import type { RpcHandlers } from "@opencode/plugin/promise/rpc"
import { FSUtil } from "@opencode/util/fs-util"
import { Schema } from "effect"
import { MAX_BYTE_ADMISSION } from "./file-profile-core"
import { fileSnapshot } from "./file-snapshot"
import { PackageVariables, type packageVariablesRpc } from "./package-variables-contract"

export function packageVariablesHandler(input: {
  directory: string
  sessionDirectory(sessionID: string): Promise<string | undefined>
  canRead(sessionID: string, resources: string[]): Promise<boolean>
  readStored(selection: ReadStoredPackage, signal: AbortSignal): Promise<unknown>
}): RpcHandlers<typeof packageVariablesRpc>["variables"] {
  return async (selection, call) => {
    if ("path" in selection) {
      try {
        const snapshot = Schema.decodeUnknownSync(PackageVariables)(await input.readStored(selection, call.signal))
        return { snapshot }
      } catch {
        call.signal.throwIfAborted()
        return call.error("unreadable_package", "The saved package could not be read in Loginom", {})
      }
    }

    const { sessionID, localPath } = selection
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
