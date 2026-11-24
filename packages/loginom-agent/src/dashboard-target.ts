// A dashboard's folder before its chat (B2.9h), ported from 0.4 Desktop `packages/desktop/src/main/dashboard-target.ts`,
// which 0.4's CLI repeated with its own Host (`packages/opencode/src/cli/standalone-run.ts`). The Host is the server's
// now (`./host`), so Desktop and the CLI ask the product plugin (`loginom.dashboard`) on the Location of their own
// working directory, and the folder lives under the server's data root (`Dashboard.root()`).
export * as DashboardTarget from "./dashboard-target"

import { existsSync } from "node:fs"
import { join } from "node:path"
import type { DashboardRead, PublicationSource } from "@loginom-ai-agent/loginom-host/dashboard"
import { hostError, hostErrorText } from "@loginom-ai-agent/loginom-host/errors"
import { Dashboard } from "./dashboard"
import { ServiceHost } from "./host"

export const rpc = {
  id: "loginom.dashboard",
  methods: {
    prepare: {
      input: {
        type: "object",
        properties: { id: { type: "string" }, defer: { type: "boolean" } },
        required: ["id", "defer"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          directory: { type: "string" },
          nodeName: { type: "string" },
          action: { type: "string", enum: ["create", "edit"] },
          fresh: { type: "boolean" },
          notice: {
            type: "object",
            properties: {
              kind: { type: "string" },
              latest: { type: "string" },
              current: { type: "string" },
              error: { type: "string" },
            },
            required: ["kind"],
          },
          code: { type: "string" },
          message: { type: "string" },
        },
        additionalProperties: false,
      },
    },
    find: {
      input: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      },
      output: { type: "object", properties: { found: { type: "boolean" } }, required: ["found"] },
    },
  },
  events: {},
} as const

export type Deps = {
  status(): Promise<{ url: string; generation: number }>
  settled(): Promise<void>
  catalog(generation: number): Promise<unknown>
  dashboards(): string
  template: string
  /** Desktop opens a new dashboard without the publication check (0.4 `deferCreatePublicationCheck`); the CLI checks. */
  defer: boolean
  fetch?: typeof fetch
  signal?: AbortSignal
  readPublication(input: DashboardRead, signal?: AbortSignal): Promise<PublicationSource | null>
}

/**
 * `loginom.dashboard.prepare`: the dashboard's folder from its Studio snapshot and the installation's template, with the
 * server's Host, or the code that stopped it and its text, as 0.4's CLI reported them. Only the codes 0.4 named and the
 * Host's own reach the client: a file system error carries paths.
 */
export async function answer(
  input: { id: string; defer: boolean },
  resources: string | undefined,
  signal: AbortSignal,
) {
  const template = resources && join(resources, "dashboard", "template")
  // Studio gives a snapshot once: a preparation that cannot copy the template stops before it fetches.
  if (!template || !existsSync(join(template, "src")))
    return { code: "DASHBOARD_RESOURCES_MISSING", message: "DASHBOARD_RESOURCES_MISSING" }
  return prepare(input.id, {
    ...ServiceHost.dashboard,
    dashboards: Dashboard.root,
    template,
    defer: input.defer,
    signal,
  }).catch((error: unknown) => {
    const code = error instanceof Error && codes.test(error.message) ? error.message : hostError(error)
    return { code, message: code === hostError(error) ? hostErrorText(error) : code }
  })
}

const codes =
  /^(DASHBOARD_SNAPSHOT_(UNAVAILABLE|INVALID)|DASHBOARD_BINDING_CONFLICT|DASHBOARD_PUBLICATION_(INVALID|TOO_LARGE))$/

/**
 * 0.4 `getDashboardTarget`: a connection that has none answers `LOGINOM_CONFIG_REQUIRED` before the snapshot. The
 * publication is read with the origin and generation captured first, once the Host has settled and that generation's
 * catalog is ready; a cancellation stops the wait and never falls back to the local sources.
 */
export async function prepare(id: string, deps: Deps) {
  const { prepareDashboard } = await import("@loginom-ai-agent/dashboard/agent/folder")
  const view = await deps.status()
  if (!view.generation) throw new Error("LOGINOM_CONFIG_REQUIRED")
  const origin = new URL(view.url).origin
  return prepareDashboard({
    deferCreatePublicationCheck: deps.defer,
    signal: deps.signal,
    readPublication: async (binding) => {
      const cancelled = Promise.withResolvers<never>()
      const abort = () => cancelled.reject(deps.signal?.reason)
      deps.signal?.addEventListener("abort", abort, { once: true })
      try {
        deps.signal?.throwIfAborted()
        await Promise.race([
          deps.settled().then(() => {
            deps.signal?.throwIfAborted()
            return deps.catalog(view.generation)
          }),
          cancelled.promise,
        ])
        deps.signal?.throwIfAborted()
        return deps.readPublication({ origin, generation: view.generation, binding }, deps.signal)
      } finally {
        deps.signal?.removeEventListener("abort", abort)
      }
    },
    id,
    origin,
    dashboards: deps.dashboards(),
    template: deps.template,
    fetch: deps.fetch,
  })
}

/** 0.4 `checkDashboardTarget`: whether the dashboard's folder is prepared, without fetching its snapshot again. */
export async function find(id: string, dashboards: string) {
  const { findDashboard } = await import("@loginom-ai-agent/dashboard/agent/folder")
  return (await findDashboard(dashboards, id)) !== undefined
}
