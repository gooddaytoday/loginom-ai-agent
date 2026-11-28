import { PackageAccess, PackageRecheck } from "@loginom-ai-agent/loginom-host/package-access"
import type { SessionID } from "@opencode/schema/session-id"
import { Option, Schema } from "effect"

export const packageAccessRpc = {
  id: "loginom.package",
  methods: {
    recheck: {
      input: Schema.toStandardSchemaV1(PackageRecheck),
      output: Schema.toStandardSchemaV1(PackageAccess),
    },
  },
  events: {},
} as const

const decode = Schema.decodeUnknownOption(PackageAccess)

export async function visiblePackageAccess(value: unknown, hasSession?: (id: SessionID) => Promise<unknown>) {
  const access = Option.getOrUndefined(decode(value))
  if (access?.kind !== "other_conversation") return access
  if (await hasSession?.(access.sessionId).catch(() => undefined)) return access
  return { packagePath: access.packagePath, kind: "read_only", lockMarker: "unknown" } as const
}
