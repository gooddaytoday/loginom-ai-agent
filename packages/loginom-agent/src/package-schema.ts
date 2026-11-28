import { createHash } from "node:crypto"
import { basename } from "node:path"
import { maxPackageBytes, PackageWorkflow, savedPackageSchema } from "@loginom-ai-agent/loginom-host/package-schema"
import type { Plugin } from "@opencode/plugin"
import { Schema } from "effect"
import { fileSnapshot } from "./file-snapshot"
import { ServiceHost } from "./host"
import type { localFiles } from "./local-file"

const rpc = {
  id: "loginom.package",
  methods: {
    schema: {
      input: {
        type: "object",
        properties: {
          sessionID: { type: "string", minLength: 1 },
          source: { type: "string", enum: ["window", "saved"] },
          target: {
            type: "object",
            properties: { document_id: { type: "string", minLength: 1 }, workflow_id: { type: "string", minLength: 1 } },
            required: ["document_id", "workflow_id"],
            additionalProperties: false,
          },
        },
        required: ["sessionID"],
        additionalProperties: false,
      },
      errors: { invalid_session: { type: "object", additionalProperties: false } },
      output: {
        type: "object",
        properties: {
          snapshot: { anyOf: [{ type: "object" }, { type: "null" }] },
          reason: { type: "string", const: "saveRequired" },
        },
        required: ["snapshot"],
        additionalProperties: false,
      },
    },
  },
  events: {},
} as const

const Request = Schema.Struct({
  sessionID: Schema.NonEmptyString,
  target: Schema.optionalKey(PackageWorkflow),
  source: Schema.optionalKey(Schema.Literals(["window", "saved"])),
})
const SavedRef = Schema.Struct({ path: Schema.NonEmptyString, sha256: Schema.NonEmptyString })
const decodeSavedRef = Schema.decodeUnknownOption(SavedRef)
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const storageKey = (sessionID: string) => "package-schema:" + sessionID

export async function rememberSavedPackage(
  storage: Pick<Plugin.Context["storage"], "set">,
  sessionID: string,
  source: { canonicalPath: string; file: { data: string } } | undefined,
) {
  await storage.set(
    storageKey(sessionID),
    source ? { path: source.canonicalPath, sha256: digest(Buffer.from(source.file.data, "base64")) } : null,
  )
}

export async function registerPackageSchema(
  ctx: Pick<Plugin.Context, "rpc" | "storage">,
  files: Pick<Awaited<ReturnType<typeof localFiles>>, "attachedPackage">,
  ownsSession: (sessionID: string) => Promise<boolean>,
) {
  await ctx.rpc.register(rpc, {
    async schema(value, { error, signal }) {
      const input = Schema.decodeUnknownSync(Request)(value)
      const denied = () => error("invalid_session", "The conversation is unavailable in this location", {})

      if (!(await ownsSession(input.sessionID))) return denied()
      signal.throwIfAborted()

      const window =
        input.source === "saved" ? null : await ServiceHost.packageSchema(input.sessionID, input.target, signal).catch(() => null)
      const snapshot =
        window ??
        (input.source === "window" || input.target
          ? null
          : await (async () => {
              const stored = await ctx.storage.get(storageKey(input.sessionID))
              if (stored === null) return null
              const ref = decodeSavedRef(stored)
              if (ref._tag === "Some") {
                const bytes = await fileSnapshot(ref.value.path, maxPackageBytes)
                if (digest(bytes) !== ref.value.sha256) return null
                return savedPackageSchema(basename(ref.value.path), bytes)
              }
              const attached = await files.attachedPackage(input.sessionID, signal)
              return attached && savedPackageSchema(attached.name, attached.bytes)
            })().catch(() => null))
      signal.throwIfAborted()
      if (!(await ownsSession(input.sessionID))) return denied()

      if (snapshot && typeof snapshot === "object" && "source" in snapshot && snapshot.source === "save_required")
        return { snapshot: null, reason: "saveRequired" }
      return { snapshot }
    },
  })
}
