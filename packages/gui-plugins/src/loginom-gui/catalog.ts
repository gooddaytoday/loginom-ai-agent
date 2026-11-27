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

// The platform pins in product/loginom-catalogs.json describe executor primitives, not end-user actions.
// These are the skills shipped under product/skills. The inventory test checks the list against the product.
export const bundledItems = [
  { id: "loginom-automation", tier: "loginom", kind: "skill", installed: true },
  { id: "package-docs", tier: "loginom", kind: "skill", installed: true },
  { id: "loginom-dashboard", tier: "loginom", kind: "skill", installed: true },
  { id: "package-linter", tier: "loginom", kind: "skill", installed: true },
] satisfies readonly Item[]
