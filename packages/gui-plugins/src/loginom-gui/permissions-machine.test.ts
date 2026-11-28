import { expect, test } from "bun:test"
import { settingRules } from "@loginom-ai-agent/product/permissions"
import type { ConfigEntry } from "@opencode/client/promise"
import { initialPermissions, permissionPatch, permissionView, transitionPermissions } from "./permissions-machine"

const profile = (permissions: NonNullable<Extract<ConfigEntry, { type: "document" }>["info"]["permissions"]>) =>
  [{ type: "document", profile: true, info: { permissions } }] satisfies ConfigEntry[]

test("default removes the profile pair rather than writing an explicit Ask", () => {
  expect(permissionPatch([{ kind: "write", effect: "ask" }])).toEqual({
    permissions: [],
    removePermissions: [{ action: "edit", resource: "*" }],
  })
})

test("a successful save displays the persisted value and warns only if the profile masked it", () => {
  const loading = transitionPermissions(initialPermissions, { type: "load" })
  const broad = { action: "*", resource: "*", effect: "ask" } as const
  const choice = { action: "edit", resource: "*", effect: "deny" } as const
  const ready = transitionPermissions(loading, { type: "loaded", attempt: loading.attempt, entries: profile([broad]) })
  const saving = transitionPermissions(ready, { type: "save", selected: [{ kind: "write", effect: "deny" }] })

  const masked = transitionPermissions(saving, {
    type: "loaded",
    attempt: saving.attempt,
    entries: profile([choice, broad]),
  })

  const applied = transitionPermissions(saving, {
    type: "loaded",
    attempt: saving.attempt,
    entries: profile([broad, choice]),
  })

  expect(permissionView(masked, "write")).toMatchObject({ value: "ask", profileOverride: "ask" })
  expect(permissionView(applied, "write")).toMatchObject({ value: "deny", profileOverride: undefined })
})

test("a response from the previous location cannot replace the current settings", () => {
  const first = transitionPermissions(initialPermissions, { type: "load" })
  const second = transitionPermissions(first, { type: "load" })

  const late = transitionPermissions(second, {
    type: "loaded",
    attempt: first.attempt,
    entries: profile([{ action: "edit", resource: "*", effect: "deny" }]),
  })

  const current = transitionPermissions(late, {
    type: "loaded",
    attempt: second.attempt,
    entries: profile([{ action: "edit", resource: "*", effect: "allow" }]),
  })

  expect(permissionView(current, "write").value).toBe("allow")
})

test("the reading row uses the server's Windows case-insensitive rules, not the renderer platform", () => {
  const loading = transitionPermissions(initialPermissions, { type: "load" })
  const entries = profile([{ action: "READ", resource: "*", effect: "ask" }])
  const linux = transitionPermissions(loading, { type: "loaded", attempt: loading.attempt, entries })

  const windows = transitionPermissions(loading, {
    type: "loaded",
    attempt: loading.attempt,
    entries: entries.map((entry) => ({ ...entry, permissionCaseInsensitive: true })),
  })

  expect(permissionView(linux, "read").value).toBe("allow")
  expect(permissionView(windows, "read").value).toBe("mixed")

  const allAsk = settingRules("read", "ask").map((rule) => ({ ...rule, action: rule.action.toUpperCase() }))

  const windowsAllAsk = transitionPermissions(loading, {
    type: "loaded",
    attempt: loading.attempt,
    entries: profile(allAsk).map((entry) => ({ ...entry, permissionCaseInsensitive: true })),
  })

  expect(permissionView(windowsAllAsk, "read").value).toBe("ask")
})
