import { canHoldProjectRoute, type SettingsServerAvailability } from "./servers/machine"

export type SettingsRootTab = keyof typeof rootTabs

declare const pluginTab: unique symbol

/** A root page a GUI plugin contributes; the value is its SettingsPage id. */
export type SettingsPluginTab = string & { readonly [pluginTab]: true }

/** Root pages that show one server's settings: the selected server, or the default one. */
export type SettingsServerTab = "providers" | "models"

export type SettingsProjectTab = "general"

type SettingsViewState = {
  target?: string
  searchActivation?: number
}

type SettingsProjectView = { type: "project"; server: string; project: string; tab: SettingsProjectTab }

/** `server` on a root view is the server its per-server pages show; without it they show the default server. */
export type SettingsView = (
  | { type: "root"; tab: SettingsRootTab | SettingsPluginTab; server?: string }
  | SettingsProjectView
) &
  SettingsViewState

/** A view of a page the host owns. */
export type SettingsHostView = ({ type: "root"; tab: SettingsRootTab; server?: string } | SettingsProjectView) &
  SettingsViewState

export type SettingsTransientView = Pick<SettingsView, "target" | "searchActivation">

const rootTabs = {
  general: true,
  appearance: true,
  notifications: true,
  shortcuts: true,
  providers: true,
  models: true,
  servers: true,
  about: true,
}

const hiddenTabs = new Set(["projects", "workspaces", "extensions", "experimental", "plugins"])

export function parseSettingsView(
  search: string,
  transient?: SettingsTransientView,
  pluginTabs?: ReadonlySet<string>,
): SettingsView {
  const params = new URLSearchParams(search)
  const tab = params.get("tab") ?? "general"
  const server = params.get("server") ?? undefined
  const project = params.get("project")
  if (project && server && tab === "general") return { type: "project", server, project, tab, ...transient }

  // Links to a server's own page, which the Servers page replaced, name a server without a tab.
  if (!project && server && !params.has("tab")) return { type: "root", tab: "servers", server, ...transient }

  if (!project && isRootTab(tab)) return { type: "root", tab, server, ...transient }

  if (!project && pluginTabs && isPluginTab(tab, pluginTabs)) return { type: "root", tab, server, ...transient }

  return { type: "root", tab: "general", ...transient }
}

export function settingsViewUrl(view: SettingsView) {
  const params = new URLSearchParams()

  if (view.server) params.set("server", view.server)

  if (view.type === "project") params.set("project", view.project)

  // A server without a tab names the Servers page, so a root view with a server always names its tab.
  if (view.tab !== "general" || (view.type === "root" && view.server)) params.set("tab", view.tab)

  const search = params.toString()

  return search ? `/settings?${search}` : "/settings"
}

type RedirectServer = { key: string; availability: SettingsServerAvailability["status"] }

/** Where a view must go when the server it names is gone, or a project's server is unavailable. */
export function settingsViewRedirect(input: {
  view: SettingsView
  /** False while the saved, WSL, and SSH server lists load; a restored route waits for them. */
  loaded: boolean
  servers: readonly RedirectServer[]
}): SettingsView | undefined {
  const view = input.view

  if (!view.server || !input.loaded) return
  const server = input.servers.find((item) => item.key === view.server)

  if (view.type === "root") return server ? undefined : { ...view, server: undefined }

  if (!server) return { type: "root", tab: "general" }

  // The Servers page offers a retry for an unreachable project's server.
  if (!canHoldProjectRoute(server.availability)) return { type: "root", tab: "servers", server: server.key }
}

export function isRootTab(value: string): value is SettingsRootTab {
  return Object.hasOwn(rootTabs, value)
}

/** Host tab ids stay reserved even when the host hides the page. */
export function isReservedSettingsTab(value: string) {
  return isRootTab(value) || hiddenTabs.has(value)
}

export function isPluginTab(value: string, tabs: ReadonlySet<string>): value is SettingsPluginTab {
  return !isReservedSettingsTab(value) && tabs.has(value)
}
