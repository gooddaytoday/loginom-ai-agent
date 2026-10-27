import { Cause, Effect } from "effect"
import { PlatformError } from "effect/PlatformError"
import { tool, jsonSchema, type Tool as AITool, type ToolExecutionOptions, type JSONSchema7 } from "ai"
import { join } from "node:path"
import { Global } from "@loginom-ai-agent/core/global"
import { EffectBridge } from "@/effect/bridge"
import { Plugin } from "@/plugin"
import { TaskScope } from "@/session/task-scope"
import { Tool } from "./tool"
import { authorizeLoginomFile, localFilePermissionFailure } from "./loginom-local-file"
import {
  loadProfile,
  profileFile,
  profilePage,
  scanFile,
  sampleFile,
  type ProfileOptions,
} from "./loginom-file-profile-core"

type Args = ProfileOptions & {
  path?: string
  profile_id?: string
  continuation?: string
  seed?: number
  max_records?: number
  max_bytes?: number
}

export const loginomFileTools = Effect.fn("Loginom.fileTools")(function* (
  context: (args: Record<string, unknown>, options: ToolExecutionOptions) => Tool.Context,
) {
  const run = yield* EffectBridge.make()
  const plugin = yield* Plugin.Service
  const definitions: {
    name: string
    description: string
    properties: Record<string, JSONSchema7>
    required: string[]
  }[] = [
    {
      name: "loginom_file_profile",
      description:
        "Profile a local CSV/TSV/TXT by literal path BEFORE Read or admission, especially files >16 MiB. Reads at most 8 MiB within a 5-second quick budget. Returns encoding, dialect, column types, heuristic row estimate and import settings (source_path is empty until delivery). Unconfirmed seek windows never supply typed records. Specify overrides for ambiguous encoding/header/dialect. For wide tables, call again with profile_id and continuation; assemble all columns before importing. Does not validate the whole file: use loginom_file_scan for exact count/types.",
      properties: {
        path: { type: "string" },
        profile_id: { type: "string" },
        continuation: { type: "string" },
        encoding: {
          type: "string",
          description: "Explicit resolver code/alias, e.g. CP1251, CP1252, UTF-8, UTF-16 LE, UTF-16 BE",
        },
        delimiter: { type: "string", enum: [";", "\t", ",", "|"] },
        text_qualifier: { type: "string", enum: ['"', "'", ""] },
        rows_to_skip: { type: "integer", minimum: 0, maximum: 1000000 },
        first_line_as_title: { type: "boolean" },
        decimal_separator: { type: "string", enum: [".", ","] },
        null_marker: { type: "string", maxLength: 256 },
      },
      required: [] as string[],
    },
    {
      name: "loginom_file_scan",
      description:
        "Separate cancellable streaming pass over a previously authorized profile: exact logical DATA record count (excludes skipped records/header; quoted newlines stay in the same record), SHA-256, disk boundary index, and first type/field-count violation with physical line/byte offset. Can take minutes for GB files. Cancellation remains partial. Records >8 MiB fail. Request only when full count/type validation or reservoir sampling is needed; sampling alone is not full validation.",
      properties: { profile_id: { type: "string" } },
      required: ["profile_id"],
    },
    {
      name: "loginom_file_sample",
      description:
        "Create a local <=8 MiB byte-exact sample from a profile: BOM/preamble/header once, complete records, original encoding/dialect/line endings. Uses confirmed head, plus deterministic reservoir if an exact scan exists. Returns a session file and manifest; next call loginom_file_admit on the returned sample path, then deliver its artifact and build the scenario on that sample. The full calculation will be available after loading the full file; report sample-only results honestly.",
      properties: {
        profile_id: { type: "string" },
        seed: { type: "integer" },
        max_records: { type: "integer", minimum: 1, maximum: 100000 },
        max_bytes: { type: "integer", minimum: 1, maximum: 8388608 },
      },
      required: ["profile_id"],
    },
  ]
  return Object.fromEntries(
    definitions.map((definition) => [
      definition.name,
      tool({
        description: definition.description,
        inputSchema: jsonSchema<Args>({
          type: "object",
          properties: definition.properties,
          required: definition.required,
          additionalProperties: false,
        }),
        execute(args, options) {
          return run.promise(
            Effect.gen(function* () {
              const ctx = context(args, options)
              const dir = join(Global.Path.data, "file-profiles", ctx.sessionID)
              yield* plugin.trigger(
                "tool.execute.before",
                { tool: definition.name, sessionID: ctx.sessionID, callID: ctx.callID },
                { args },
              )
              const stored = args.profile_id
                ? yield* Effect.promise(() => loadProfile(args.profile_id!, dir))
                : undefined
              const source = stored?.source ?? args.path
              if (!source)
                return yield* Effect.die(
                  Error("LOGINOM_FILE_FORMAT_AMBIGUOUS: path or a session-owned profile_id is required"),
                )
              yield* ctx
                .ask({ permission: definition.name, metadata: {}, patterns: [source], always: ["*"] })
                .pipe(Effect.catchCause((cause) => localFilePermissionFailure(source, cause, ctx)))
              // Always re-authorize the original path, including both sides of symlinks.
              const authorized = yield* authorizeLoginomFile(source, ctx).pipe(
                Effect.catchCause((cause) => {
                  const error = Cause.squash(cause)
                  if (stored && error instanceof PlatformError && error.reason._tag === "NotFound")
                    return Effect.die(Error("LOGINOM_FILE_CHANGED: " + source))
                  return Effect.failCause(cause)
                }),
              )
              const value = yield* Effect.promise(async (signal) => {
                const abort = AbortSignal.any([signal, ctx.abort])
                if (definition.name === "loginom_file_profile") {
                  if (args.profile_id) return profilePage(args.profile_id, dir, args.continuation)
                  return profileFile(source, dir, { ...args, signal: abort, authorized_path: authorized.canonicalPath })
                }
                if (!args.profile_id) throw Error("LOGINOM_FILE_FORMAT_AMBIGUOUS: profile_id is required")
                if (definition.name === "loginom_file_scan") {
                  const { index, ...result } = await scanFile(args.profile_id, dir, { signal: abort })
                  return { profile_id: args.profile_id, ...result }
                }
                const sample = await sampleFile(args.profile_id, dir, { ...args, signal: abort })
                const { offsets, ...manifest } = sample.manifest
                return {
                  path: sample.path,
                  manifest_path: `${sample.path}.manifest.json`,
                  manifest,
                  offset_count: offsets.length,
                  next_step:
                    "loginom_file_admit on path, then artifact_deliver. Build and report on the sample; полный расчёт будет после загрузки полного файла.",
                }
              })
              const output = { title: definition.name, output: JSON.stringify(value), metadata: { truncated: false } }
              yield* plugin.trigger(
                "tool.execute.after",
                { tool: definition.name, sessionID: ctx.sessionID, callID: ctx.callID, args },
                output,
              )
              return { ...output, metadata: TaskScope.cleanMetadata(output.metadata) }
            }).pipe(Effect.orDie),
          )
        },
      }),
    ]),
  ) as Record<string, AITool>
})
