import { permissionDefaults, settingEffect, settingRules, type Kind } from "@loginom-ai-agent/product/permissions"
import type { ConfigEntry, PermissionRuleset } from "@opencode/client/promise"
import { Wildcard } from "@opencode/util/wildcard"

type Selection = { kind: Kind; effect: (typeof permissionDefaults)[Kind] }

type Settings = { profile: PermissionRuleset; effective: PermissionRuleset; ignoreCase: boolean }

type Issue = "permissionsLoadFailed" | "permissionsSaveFailed"

type Phase =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "ready"; settings: Settings; overridden: readonly Selection[] }
  | { type: "saving"; settings: Settings; selected: readonly Selection[] }
  | { type: "error"; issue: Issue }

export type State = Phase & { attempt: number }

type Event =
  | { type: "load" }
  | { type: "disconnect" }
  | { type: "save"; selected: readonly Selection[] }
  | { type: "loaded"; attempt: number; entries: readonly ConfigEntry[] }
  | { type: "failed"; attempt: number }

export const initialPermissions: State = { type: "idle", attempt: 0 }

export function transitionPermissions(state: State, event: Event): State {
  switch (event.type) {
    case "load":
      return { type: "loading", attempt: state.attempt + 1 }
    case "disconnect":
      return { type: "idle", attempt: state.attempt + 1 }
    case "save":
      if (state.type !== "ready" || !event.selected.length) return state

      return { type: "saving", attempt: state.attempt + 1, settings: state.settings, selected: event.selected }
    case "loaded": {
      if (event.attempt !== state.attempt || (state.type !== "saving" && state.type !== "loading")) return state
      const documents = event.entries.filter((entry) => entry.type === "document")
      const rules = (entries: typeof documents) => entries.flatMap((entry) => entry.info.permissions ?? [])

      const settings = {
        profile: rules(documents.filter((entry) => entry.profile)),
        effective: rules(documents),
        ignoreCase: documents.some((entry) => entry.permissionCaseInsensitive === true),
      }

      const overridden =
        state.type === "saving"
          ? state.selected.filter(
              ({ kind, effect }) => resolveSetting(kind, settings.profile, settings.ignoreCase) !== effect,
            )
          : []

      return { type: "ready", attempt: state.attempt, settings, overridden }
    }

    case "failed":
      if (event.attempt !== state.attempt || (state.type !== "saving" && state.type !== "loading")) return state

      return {
        type: "error",
        attempt: state.attempt,
        issue: state.type === "saving" ? "permissionsSaveFailed" : "permissionsLoadFailed",
      }
  }
}

export function permissionPatch(selected: readonly Selection[]) {
  const permissions = selected.flatMap(({ kind, effect }) =>
    effect === permissionDefaults[kind] ? [] : settingRules(kind, effect),
  )

  const removePermissions = selected.flatMap(({ kind, effect }) =>
    effect === permissionDefaults[kind] ? settingRules(kind).map(({ action, resource }) => ({ action, resource })) : [],
  )

  return { permissions, removePermissions }
}

function resolveSetting(kind: Kind, rules: PermissionRuleset, ignoreCase: boolean) {
  return settingEffect(kind, rules, (input, pattern) => Wildcard.match(input, pattern, ignoreCase))
}

export function permissionView(state: State, kind: Kind) {
  const settings = state.type === "ready" || state.type === "saving" ? state.settings : undefined
  const profile = resolveSetting(kind, settings?.profile ?? [], settings?.ignoreCase ?? false)
  const effective = resolveSetting(kind, settings?.effective ?? [], settings?.ignoreCase ?? false)
  const selected = state.type === "saving" ? state.selected.find((item) => item.kind === kind) : undefined
  const overridden = state.type === "ready" && state.overridden.some((item) => item.kind === kind)

  return {
    value: selected?.effect ?? profile,
    workspaceOverride: effective === profile ? undefined : effective,
    profileOverride: overridden ? profile : undefined,
  }
}
