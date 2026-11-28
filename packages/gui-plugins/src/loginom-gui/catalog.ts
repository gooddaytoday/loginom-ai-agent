export const tiers = ["loginom", "verified", "community"] as const

export const kinds = ["action", "skill", "scenario", "connection"] as const

export const tabs = ["catalog", "installed"] as const

export type Tier = (typeof tiers)[number]

export type Kind = (typeof kinds)[number]

export type Tab = (typeof tabs)[number]

export interface Item {
  id: string
  tier: Tier
  kind: Kind
  installed: boolean
}

// Every bundled entry is backed by a shipped skill. The package actions are read-only workflows.
export const bundledItems = [
  { id: "loginom-automation", tier: "loginom", kind: "skill", installed: true },
  { id: "package-docs", tier: "loginom", kind: "action", installed: true },
  { id: "loginom-dashboard", tier: "loginom", kind: "skill", installed: true },
  { id: "package-linter", tier: "loginom", kind: "action", installed: true },
] as const satisfies readonly Item[]
