// Local data files for Loginom: authorization, byte or reference admission and the `loginom_file_admit` tool (B2.5a).
// Ported from 0.4 `packages/opencode/src/tool/loginom-local-file.ts` and the tool in
// `packages/opencode/src/product/tool-contributor.ts`: the order of checks and the error texts are 0.4's. OpenCode 2
// gives a plugin its tool context, `permission.assert` and the session's context messages instead of 0.4's services.
import { createHash, randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { access, realpath, stat } from "node:fs/promises"
import { basename, dirname, join, parse, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { fileError, hostErrorText } from "@loginom-ai-agent/loginom-host/errors"
import {
  inspectReferenceFile,
  type FileReference,
  type ReferenceSnapshot,
} from "@loginom-ai-agent/loginom-host/file-reference"
import type { Plugin } from "@opencode/plugin"
import type { Info, ToolContext } from "@opencode/plugin/promise/tool"
import { Tool } from "@opencode/schema/tool"
import { FSUtil } from "@opencode/util/fs-util"
import { Option, Schema } from "effect"
import { exactFileDigest } from "./file-profile-core"
import { fileSnapshot } from "./file-snapshot"

const sampleReceipt = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ path: Schema.String, manifest: Schema.Struct({ sha256: Schema.String }) })),
)
// Plugin storage (B2.5d): the identity of a file the user attached, kept with its message (0.4 attachment receipt), and
// the attachments a compaction carried past its summary.
const receiptKey = (sessionID: string, messageID: string, uri: string) =>
  `attachment-receipt:${sessionID}:${messageID}:${uri}`
const carriedKey = (sessionID: string, compactionID: string) => `compacted-attachments:${sessionID}:${compactionID}`
const decodeReceipt = Schema.decodeUnknownOption(Schema.Struct({ canonical_path: Schema.String }))
const decodeCarried = Schema.decodeUnknownOption(
  Schema.Array(Schema.Struct({ message: Schema.String, uri: Schema.String })),
)

const attachmentHint = ". Для CLI передайте файл через --file; в Desktop/TUI приложите файл к сообщению."
// Metadata key of a rules-only check (0.4 `checkDeny`): this module's `permission.evaluate` hook settles it without
// asking. A configured deny is decided before plugin hooks run, so it still fails the check.
const check = "loginom.local-file.check"
const limit = 16 * 1024 * 1024

export type ReferenceHost = {
  reserveReference(userMessage: string, name: string, snapshot: ReferenceSnapshot): Promise<FileReference>
  admitReference(reference: FileReference): Promise<unknown>
  discardReference(grant: string): Promise<unknown>
}
export type AdmitHost = ReferenceHost & {
  admit(userMessage: string, files: { name: string; data: string }[]): Promise<unknown>
}
/** The Host run that serves a session's current task, and the task's user message (0.4 `turnLifecycle`; B2.3). */
export type Lease = { host: AdmitHost & { readonly generation: number }; userMessage: string }
type Authorized = { sourcePath: string; canonicalPath: string; verifyAttachment?: () => Promise<unknown> }

const admittedReferences = new WeakMap<ReferenceHost, Map<string, { sourcePath: string; artifact: unknown }>>()

/** Local file admission for one plugin instance; `profiles` holds `file-profiles/<session>` of the file tools. */
export async function localFiles(
  plugin: Pick<Plugin.Context, "location" | "permission" | "session" | "storage">,
  profiles: string,
) {
  const token = randomUUID()
  await plugin.permission.hook("evaluate", (event) => {
    if (event.metadata?.[check] === token && event.effect === "ask") event.effect = "allow"
  })
  // Attachment receipts (0.4 `createAttachmentReceipt`, B2.5d): the identity of each file the user attached by its path,
  // taken when the prompt is admitted and kept with its message. The attachment then authorizes that file only while it
  // is unchanged, and is checked again before the file is admitted.
  await plugin.session.hook("prompt", async (event) => {
    await Promise.all(
      (event.prompt.files ?? []).map(async (file) => {
        const path = attachedPath(file.uri)
        const identity = path && (await inspectReferenceFile(path).catch(() => undefined))
        if (identity) await plugin.storage.set(receiptKey(event.sessionID, event.messageID, file.uri), identity)
      }),
    )
  })
  // A compaction keeps the attachments of the messages it summarizes, as 0.4 replayed their prompt (B2.5d). The hook runs
  // while the compaction is open, before its summary is written; once completed, its message heads the session's
  // context, and only then do the attachments it carried count. A failed or reverted compaction never heads it.
  await plugin.session.hook("compaction", async (event) => {
    const history = await plugin.session.context({ sessionID: event.sessionID })
    const open = history.findLast((message) => message.type === "compaction" && message.status === "running")
    if (open)
      await plugin.storage.set(carriedKey(event.sessionID, open.id), await attachments(event.sessionID, history))
  })
  // The attachments of the session's context: what its leading compaction carried and what its user messages attach.
  const attachments = async (sessionID: string, history: Awaited<ReturnType<typeof plugin.session.context>>) => {
    const head = history[0]
    const carried =
      head?.type === "compaction" && head.status === "completed"
        ? Option.getOrElse(decodeCarried(await plugin.storage.get(carriedKey(sessionID, head.id))), () => [])
        : []
    return [
      ...carried,
      ...history.flatMap((message) =>
        message.type !== "user"
          ? []
          : (message.files ?? []).flatMap((file) =>
              file.source.type === "uri" ? [{ message: message.id, uri: file.source.uri }] : [],
            ),
      ),
    ]
  }
  const ask = (
    call: ToolContext,
    input: { action: string; resources: string[]; save?: string[]; metadata?: Record<string, unknown> },
  ) =>
    plugin.permission.assert({
      sessionID: call.sessionID,
      agent: call.agent,
      source: { type: "tool", messageID: call.messageID, id: call.id },
      ...input,
    })

  // Large files cross private IPC only as backend-authorized original references.
  const admitReference = async (
    path: string,
    call: ToolContext,
    host: ReferenceHost,
    userMessage: string,
    authorized?: Authorized,
  ) => {
    const source = authorized ?? (await authorize(path, call))
    const result = await (async () => {
      const identity = await inspectReferenceFile(source.sourcePath)
      if (identity.canonical_path !== source.canonicalPath) throw Error("LOGINOM_FILE_CHANGED")
      const sha256 = await exactFileDigest(identity, join(profiles, call.sessionID))
      if (call.signal.aborted) throw Error("LOGINOM_UPLOAD_CANCELLED")
      const reference = await host.reserveReference(userMessage, basename(source.canonicalPath), {
        ...identity,
        sha256: sha256 ?? null,
      })
      if (call.signal.aborted) {
        await host.discardReference(reference.grant)
        throw Error("LOGINOM_UPLOAD_CANCELLED")
      }
      // Once commit starts its reply may be lost. Retain the grant for an
      // exact retry or confirmed Host shutdown rather than discarding it here.
      const artifact = await host.admitReference(reference)
      return { sourcePath: source.sourcePath, artifact }
    })().catch((error) => {
      throw Error(hostErrorText(fileError(error)) + " Путь: " + source.sourcePath)
    })
    if (source.verifyAttachment) await source.verifyAttachment()
    return result
  }

  const admit = async (path: string, call: ToolContext, host: AdmitHost, userMessage: string) => {
    const source = await authorize(path, call)
    if (source.canonicalPath.toLowerCase().endsWith(".lgp"))
      throw Error("Use loginom_dock_prepare with local_package_path for a local .lgp: " + source.sourcePath)
    const identity = await inspectReferenceFile(source.canonicalPath).catch((error) => {
      throw Error(hostErrorText(fileError(error)) + " Путь: " + source.sourcePath)
    })
    if (identity.size > limit) {
      const key = JSON.stringify([call.sessionID, userMessage, identity])
      const cache = admittedReferences.get(host) ?? new Map()
      admittedReferences.set(host, cache)
      const previous = cache.get(key)
      if (previous) return previous
      const result = await admitReference(path, call, host, userMessage, source)
      cache.set(key, result)
      return result
    }
    const bytes = await fileSnapshot(source.canonicalPath, limit).catch((error) => {
      throw Error(hostErrorText(error) + " Путь: " + source.sourcePath)
    })
    await source.verifyAttachment()
    const artifacts = await host
      .admit(JSON.stringify(["local-file", call.messageID, call.id]), [
        { name: basename(source.canonicalPath), data: bytes.toString("base64") },
      ])
      .catch((error) => {
        throw Error(hostErrorText(error))
      })
    if (!Array.isArray(artifacts) || artifacts.length !== 1) throw Error("LOGINOM_INPUT_INVALID: " + source.sourcePath)
    return { sourcePath: source.sourcePath, artifact: artifacts[0] as unknown }
  }

  const snapshot = async (path: string, call: ToolContext) => {
    const source = await authorize(path, call)
    const bytes = await fileSnapshot(source.canonicalPath, limit).catch((error) => {
      throw Error(hostErrorText(error) + " Путь: " + source.sourcePath)
    })
    return {
      sourcePath: source.sourcePath,
      file: { name: basename(source.canonicalPath), data: bytes.toString("base64") },
    }
  }

  const authorize = async (path: string, call: ToolContext) => {
    call.signal.throwIfAborted()
    const directory = plugin.location.directory
    const worktree = plugin.location.project.directory
    const sourcePath = resolve(directory, path)
    // Permission resources as OpenCode's own file tools name them: relative inside the Location or its project,
    // absolute outside.
    const inside = (target: string) =>
      FSUtil.contains(directory, target) || (worktree !== parse(worktree).root && FSUtil.contains(worktree, target))
    const resource = (target: string) =>
      (inside(target) ? relative(directory, target) || "." : target).replaceAll("\\", "/")
    const checkDeny = (target: string) => {
      const rules = (action: string, resources: string[]) =>
        ask(call, { action, resources, metadata: { [check]: token } })
      return rules("read", [resource(target)])
        .then(() =>
          inside(target) ? undefined : rules("external_directory", [join(dirname(target), "*").replaceAll("\\", "/")]),
        )
        .catch((error) => {
          if (!(error instanceof Tool.Error) || reason(error) !== "Permission.BlockedError") throw error
          throw new Tool.Error({
            message: deniedText(error, sourcePath),
            error: error.error,
            metadata: { permissionDenied: true },
          })
        })
    }
    await checkDeny(sourcePath)
    const canonicalPath = await realpath(sourcePath).catch((error) => {
      throw Error(hostErrorText(fileError(error)) + " Путь: " + sourcePath)
    })
    await checkDeny(canonicalPath)
    const info = await stat(canonicalPath).catch((error) => {
      throw Error(hostErrorText(fileError(error)) + " Путь: " + sourcePath)
    })
    if (!info.isFile()) throw Error(hostErrorText("LOGINOM_FILE_NOT_REGULAR") + " Путь: " + sourcePath)
    await access(canonicalPath, constants.R_OK).catch((error) => {
      throw Error(hostErrorText(fileError(error)) + " Путь: " + sourcePath)
    })
    // The session's context: messages since its latest compaction (`session.context`).
    const history = await plugin.session.context({ sessionID: call.sessionID })
    // A completed tool result is the session-owned record of issuance. A filename
    // or a manifest sitting in file-profiles alone cannot grant access.
    const sampled = await (async () => {
      const dir = join(profiles, call.sessionID)
      if (
        path.split(/[\\/]/).includes("..") ||
        relative(sourcePath, canonicalPath) !== "" ||
        relative(dir, dirname(sourcePath)) !== "" ||
        relative(dir, dirname(canonicalPath)) !== ""
      )
        return false
      const realDir = await realpath(dir).catch(() => undefined)
      if (!realDir || relative(dir, realDir) !== "") return false
      // The receipt is the JSON text of a completed `loginom_file_sample` call (B2.5b).
      const receipts = history.flatMap((message) =>
        message.type !== "assistant"
          ? []
          : message.content.flatMap((part) => {
              if (part.type !== "tool" || part.name !== "loginom_file_sample" || part.state.status !== "completed")
                return []
              const text = part.state.content.flatMap((item) => (item.type === "text" ? [item.text] : [])).join("\n")
              const receipt = Option.getOrUndefined(sampleReceipt(text))
              return receipt && relative(receipt.path, canonicalPath) === "" ? [receipt] : []
            }),
      )
      if (!receipts.length) return false
      return fileSnapshot(canonicalPath, 8 * 1024 * 1024).then(
        (bytes) =>
          receipts.some((receipt) => receipt.manifest.sha256 === createHash("sha256").update(bytes).digest("hex")),
        () => false,
      )
    })()
    // A file the user attached by its path, in the context or carried by its compaction. With a receipt, the attachment
    // names the file it named when the prompt was admitted, and only while that file is unchanged (0.4
    // `verifyAttachmentReceipt`); without one (attached before B2.5d, or unreadable then), the file its path resolves to.
    const attached = await Promise.all(
      (await attachments(call.sessionID, history)).map(async (file) => {
        const path = attachedPath(file.uri)
        if (!path) return
        const receipt = await plugin.storage.get(receiptKey(call.sessionID, file.message, file.uri))
        const identity = Option.getOrUndefined(decodeReceipt(receipt))
        if (!identity)
          return (await realpath(path).catch(() => undefined)) === canonicalPath
            ? { verify: async () => {} }
            : undefined
        if (path !== sourcePath && identity.canonical_path !== canonicalPath) return
        await checkDeny(path)
        await checkDeny(identity.canonical_path)
        return {
          verify: async () => {
            const current = await inspectReferenceFile(path).catch((error) => {
              throw Error(hostErrorText(fileError(error)) + " Путь: " + path)
            })
            if (JSON.stringify(current) !== JSON.stringify(receipt))
              throw Error(hostErrorText("LOGINOM_FILE_CHANGED") + " Путь: " + path)
          },
        }
      }),
    )
    const verifyAttachment = () => Promise.all(attached.map((entry) => entry?.verify()))
    await verifyAttachment()
    if (!sampled && !attached.some(Boolean))
      await (async () => {
        if (!inside(canonicalPath)) {
          const glob = join(dirname(canonicalPath), "*").replaceAll("\\", "/")
          await ask(call, {
            action: "external_directory",
            resources: [glob],
            save: [glob],
            metadata: { filepath: canonicalPath, parentDir: dirname(canonicalPath) },
          })
        }
        await ask(call, {
          action: "read",
          resources: [...new Set([sourcePath, canonicalPath].map(resource))],
          save: ["*"],
          metadata: { filepath: canonicalPath },
        })
      })().catch((error) => {
        throw permissionFailure(sourcePath, error)
      })

    return { sourcePath, canonicalPath, verifyAttachment }
  }

  // Model-facing name, description and input as in 0.4. Without a Host lease there is no Loginom run to admit into;
  // 0.4 did not offer the tool then.
  const admitTool = (lease: (sessionID: string) => Promise<Lease | undefined> | Lease | undefined): Info => ({
    name: "loginom_file_admit",
    description:
      "Register one local data file by its literal path (relative to the session directory or absolute), including files of several GiB. Files over 16 MiB use a private streaming snapshot, without sending bytes through IPC. Returns an input artifact for dock_artifact_deliver; does not upload it. Register each source separately, including equal filenames in different folders. For a local .lgp use loginom_dock_prepare with local_package_path.",
    input: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
      additionalProperties: false,
    },
    options: { codemode: false },
    execute: async (input, call) => {
      const current = await lease(call.sessionID)
      if (!current) throw Error(hostErrorText("LOGINOM_HOST_NOT_READY"))
      const path = (input as { path: string }).path
      await ask(call, { action: "loginom_file_admit", resources: ["*"], save: ["*"] }).catch((error) => {
        throw permissionFailure(resolve(plugin.location.directory, path), error)
      })
      const source = await admit(path, call, current.host, current.userMessage)
      return {
        content: JSON.stringify({ source_path: source.sourcePath, artifact: source.artifact }),
        metadata: { generation: current.host.generation, truncated: false },
      }
    },
  })

  return { ask, authorize, admit, admitReference, snapshot, admitTool }
}

/**
 * 0.4 `localFilePermissionFailure`. A deny rule or a rejection with feedback fails with the file's path. A plain
 * rejection stays as it is: OpenCode ends the step on it only while the original error is what the tool throws.
 */
export function permissionFailure(path: string, error: unknown) {
  if (!(error instanceof Tool.Error)) return error
  if (reason(error) === "Permission.BlockedError")
    return new Tool.Error({ message: deniedText(error, path), error: error.error })
  if (reason(error) === "Permission.CorrectedError")
    return new Tool.Error({
      message: deniedText(error, path) + attachmentHint,
      error: error.error,
      metadata: { permissionDenied: true },
    })
  return error
}

// The local path of a file attachment, or nothing for another source or a line range (`?`) or fragment (`#`) of a file.
function attachedPath(uri: string) {
  const url = URL.parse(uri)
  if (!url || url.protocol !== "file:" || url.search || url.hash) return
  return fileURLToPath(url)
}

function deniedText(error: Tool.Error, path: string) {
  return hostErrorText("LOGINOM_FILE_ACCESS_DENIED") + " " + error.message + " Путь: " + path
}

// The permission error inside a `Tool.Error` from `permission.assert`; Core's error classes stay out of the plugin.
function reason(error: Tool.Error) {
  const cause = error.error
  return cause && typeof cause === "object" && "_tag" in cause ? cause._tag : undefined
}
