export const permissionDefaults = {
  read: "allow",
  write: "ask",
  save: "ask",
  export: "ask",
  web: "ask",
  terminal: "deny",
} as const

export type Kind = keyof typeof permissionDefaults
type Effect = "allow" | "ask" | "deny"
type Rule = { readonly action: string; readonly resource: string; readonly effect: Effect }
type Entry = Rule & { readonly kind: Kind }
type Match = (input: string, pattern: string) => boolean

export const permissionTable: readonly Entry[] = [
  ...[
    "read",
    "glob",
    "grep",
    "loginom_file_admit",
    "loginom_file_profile",
    "loginom_file_scan",
    "loginom_file_sample",
  ].map((action) => ({ action, resource: "*", kind: "read" as const, effect: permissionDefaults.read })),
  { action: "external_directory", resource: "*", kind: "read", effect: "ask" },
  { action: "edit", resource: "*", kind: "write", effect: permissionDefaults.write },
  { action: "loginom_dock_action_run", resource: "*", kind: "save", effect: permissionDefaults.save },
  { action: "loginom_dock_prepare", resource: "local_package", kind: "save", effect: permissionDefaults.save },
  { action: "dashboard_publish", resource: "*", kind: "save", effect: permissionDefaults.save },
  { action: "dashboard_delete", resource: "*", kind: "save", effect: permissionDefaults.save },
  { action: "loginom_dock_node_apply", resource: "exports.*", kind: "export", effect: permissionDefaults.export },
  { action: "webfetch", resource: "*", kind: "web", effect: permissionDefaults.web },
  { action: "websearch", resource: "*", kind: "web", effect: permissionDefaults.web },
  { action: "shell", resource: "*", kind: "terminal", effect: permissionDefaults.terminal },
]

export const permissionKinds = Object.keys(permissionDefaults) as Kind[]

export function settingRules(kind: Kind, effect: Effect = permissionDefaults[kind]): Rule[] {
  return permissionTable
    .filter((entry) => entry.kind === kind && entry.action !== "external_directory")
    .map((entry) => ({
      action: entry.action,
      resource: entry.resource,
      effect: kind === "terminal" && effect === "allow" ? "ask" : effect,
    }))
}

export function permissionEffect(entry: Rule, rules: readonly Rule[], match: Match) {
  return rules.findLast((rule) => match(entry.action, rule.action) && match(entry.resource, rule.resource))?.effect
}

export function settingEffect(kind: Kind, rules: readonly Rule[], match: Match) {
  const effects = new Set(
    settingRules(kind).map((entry) => {
      const effect = permissionEffect(entry, rules, match) ?? entry.effect
      return kind === "terminal" && effect === "allow" ? "ask" : effect
    }),
  )
  return effects.size === 1 ? [...effects][0] : "mixed"
}
