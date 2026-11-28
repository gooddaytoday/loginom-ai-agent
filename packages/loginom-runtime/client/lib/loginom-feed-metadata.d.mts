export const LOGINOM_METADATA_MAX_BYTES: number
export const LOGINOM_METADATA_FIELD_MAX_BYTES: Readonly<{
  kind: number
  busy: number
  step: number
  manualEdits: number
  verificationStale: number
  savedPackageGraph: number
  evidence: number
  receiptWindow: number
  packageAccess: number
  packageVariables: number
  agentCopy: number
}>

type Identity = { operationId: string; state: "running" | "settled" }
type Update = Partial<Identity> &
  Partial<Record<keyof typeof LOGINOM_METADATA_FIELD_MAX_BYTES, unknown>> & {
    receipt?: Identity
    dropped?: readonly string[]
  }

export function loginomMetadataBytes(value: unknown): number
export function withLoginomMetadata<Reply extends object>(
  reply: Reply,
  update: Update,
): Reply & { _meta?: Record<string, unknown> }
