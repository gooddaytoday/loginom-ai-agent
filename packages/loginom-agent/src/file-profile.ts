// The file profile tools `loginom_file_profile`, `loginom_file_scan` and `loginom_file_sample` (B2.5b1), ported from 0.4
// `packages/opencode/src/tool/loginom-file-profile.ts`: names, descriptions, inputs, the order of checks and the results
// are 0.4's. OpenCode 2 gives the tool its call context and runs the tool hooks itself.
import { join } from "node:path"
import type { Info } from "@opencode/plugin/promise/tool"
import { loadProfile, profileFile, profilePage, sampleFile, scanFile, type ProfileOptions } from "./file-profile-core"
import { permissionFailure, type localFiles } from "./local-file"

type Args = ProfileOptions & {
  path?: string
  profile_id?: string
  continuation?: string
  seed?: number
  max_records?: number
  max_bytes?: number
}

const definitions = [
  {
    name: "loginom_file_profile",
    description:
      "Profile a local CSV/TSV/TXT or XLSX by literal path BEFORE Read or admission. XLSX is recognized by ZIP workbook relationships; reads bounded streaming XML, disk-indexed shared strings, sheet names/visibility, dimensions, date system, cached formulas and Excel import settings. Quick budget: 8 MiB decoded content / about 5 seconds. Select sheet_name if needed. settings.source delivery IDs and source_path are filled after sample delivery. Excel runtime supports 1–64 columns, 1–1000 header rows and imports blank rows; respect settings_complete=false. CSV returns encoding/dialect and paginated columns. Does not validate the whole file: use loginom_file_scan for exact count/types.",
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
      sheet_name: {
        type: "string",
        maxLength: 120,
        description: "Exact XLSX worksheet name; default first worksheet",
      },
      header_rows: {
        type: "integer",
        minimum: 0,
        maximum: 1000,
        description: "XLSX header rows; default 1. Runtime Excel import requires 1–1000.",
      },
      blank_rows: {
        type: "string",
        enum: ["import", "skip"],
        description: "XLSX exact count policy; default import matches Excel runtime.",
      },
      decimal_separator: { type: "string", enum: [".", ","] },
      null_marker: { type: "string", maxLength: 256 },
    },
    required: [] as string[],
  },
  {
    name: "loginom_file_scan",
    description:
      "Separate cancellable streaming pass over a previously authorized CSV/XLSX profile: exact DATA count under the profile's header/blank-row policy, SHA-256 and first type violation. XLSX reports sheet, worksheet row, column and expected type; byte_offset=0 is not an XML seek position. CSV reports physical line/byte offset and disk boundary index. Can take minutes. Cancellation remains partial; missing formula caches are explicit violations. Sampling alone is not full validation.",
    properties: { profile_id: { type: "string" } },
    required: ["profile_id"],
  },
  {
    name: "loginom_file_sample",
    description:
      "Create a local <=8 MiB sample from a CSV/XLSX profile. CSV preserves original bytes, BOM/preamble/header and dialect. XLSX returns a small XLSX of the selected sheet: headers, cell order/types, number/date formats and 1900/1904 system, rewritten row numbers/shared strings; formulas become cached values, missing caches refuse sampling. Uses confirmed head plus seeded reservoir after exact scan. Next call loginom_file_admit on the returned path, then artifact_deliver and build the scenario using settings.excel for XLSX. Report sample-only results honestly; full calculation requires loading the full file.",
    properties: {
      profile_id: { type: "string" },
      seed: { type: "integer" },
      max_records: { type: "integer", minimum: 1, maximum: 100000 },
      max_bytes: { type: "integer", minimum: 1, maximum: 8388608 },
    },
    required: ["profile_id"],
  },
]

/** The file profile tools over a plugin instance's local file admission; `profiles` holds `file-profiles/<session>`. */
export function fileTools(
  files: Pick<Awaited<ReturnType<typeof localFiles>>, "ask" | "authorize">,
  profiles: string,
): Info[] {
  return definitions.map((definition) => ({
    name: definition.name,
    description: definition.description,
    input: {
      type: "object",
      properties: definition.properties,
      required: definition.required,
      additionalProperties: false,
    },
    options: { codemode: false },
    execute: async (input, call) => {
      const args = input as Args
      const dir = join(profiles, call.sessionID)
      const stored = args.profile_id ? await loadProfile(args.profile_id, dir) : undefined
      const source = stored?.source ?? args.path
      if (!source) throw Error("LOGINOM_FILE_FORMAT_AMBIGUOUS: path or a session-owned profile_id is required")
      await files.ask(call, { action: definition.name, resources: [source], save: ["*"] }).catch((error) => {
        throw permissionFailure(source, error)
      })
      // Always re-authorize the original path, including both sides of symlinks.
      const authorized = await files.authorize(source, call)
      const value = await (async () => {
        if (definition.name === "loginom_file_profile") {
          if (args.profile_id) return profilePage(args.profile_id, dir, args.continuation)
          // 0.4 passed the literal path, which the core resolves against the process directory. The service of
          // OpenCode 2 serves many Locations, so the path resolved against the Location directory goes instead.
          return profileFile(authorized.sourcePath, dir, {
            ...args,
            signal: call.signal,
            authorized_path: authorized.canonicalPath,
          })
        }
        if (!args.profile_id) throw Error("LOGINOM_FILE_FORMAT_AMBIGUOUS: profile_id is required")
        if (definition.name === "loginom_file_scan") {
          const { index, ...result } = await scanFile(args.profile_id, dir, { signal: call.signal })
          return { profile_id: args.profile_id, ...result }
        }
        const sample = await sampleFile(args.profile_id, dir, { ...args, signal: call.signal })
        const { offsets, ...manifest } = sample.manifest
        return {
          path: sample.path,
          manifest_path: `${sample.path}.manifest.json`,
          manifest,
          offset_count: offsets.length,
          next_step:
            "loginom_file_admit on path, then artifact_deliver. Build and report on the sample; полный расчёт будет после загрузки полного файла.",
        }
      })()
      await authorized.verifyAttachment()
      // A set `truncated` keeps OpenCode from cutting the result: a sample's result is its receipt (`local-file.ts`).
      return { content: JSON.stringify(value), metadata: { truncated: false } }
    },
  }))
}
