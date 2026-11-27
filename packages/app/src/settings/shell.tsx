import { Tabs } from "@opencode/ui/tabs"
import { useDialog } from "@opencode/ui/context/dialog"
import { createEffect, createMemo, For, on, onCleanup, onMount, Show, Switch, Match } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import { useGlobal } from "@/runtime/server/runtime"
import { ServerConnection } from "@/runtime/server/registry"
import type { LocalProject } from "@/shell/state/layout"
import { DialogServer } from "@/servers/connect/dialog"
import { LocationProvider } from "@/workspaces/location"
import { SettingsGeneral } from "./general/general"
import { SettingsAppearance } from "./appearance/appearance"
import { SettingsKeybinds } from "./keybinds/keybinds"
import { SettingsNotifications } from "./notifications/notifications"
import { SettingsProviders } from "./providers/providers"
import { SettingsModels } from "./models/models"
import { SettingsServerGeneral, SettingsServerList } from "./servers/servers"
import { SettingsServerSwitcher } from "./servers/switcher"
import { SettingsServerUnavailable } from "./servers/unavailable"
import { useSettingsServers, useSettingsServersLoaded } from "./servers/inventory"
import { serverPagesConnection } from "./servers/machine"
import { SettingsAbout } from "./about/about"
import { SettingsServerDataScope } from "./server-scope"
import { SettingsNavigation, type SettingsNavGroup } from "./navigation"
import { SettingsProjectGeneral } from "./workspaces/project"
import { useSettingsSurface } from "./surface"
import { settingsViewRedirect } from "./route"
import { pageIcons, settingsPageGroups } from "./pages"
import { PluginSettingsPages } from "@/runtime/plugin/settings-page-view"
import "@/settings/settings.css"

// The heading of each per-server page, which its unreachable state keeps.
const serverPages = [
  { value: "providers", title: "settings.providers.title", description: "settings.providers.description" },
  { value: "models", title: "settings.models.title", description: "settings.models.description" },
] as const

export function SettingsScreen() {
  const surface = useSettingsSurface()
  const dialog = useDialog()
  const servers = useSettingsServers()
  const loaded = useSettingsServersLoaded()
  const global = useGlobal()
  let root: HTMLDivElement | undefined

  onMount(() => {
    root?.focus({ preventScroll: true })
    onCleanup(surface.search.attach(root!))
  })
  createEffect(() => surface.search.sync(surface.view()))
  createEffect(
    on(
      createMemo(() => surface.view().type),
      () =>
        queueMicrotask(() => {
          const target = surface.search.expanded()
            ? root?.querySelector<HTMLInputElement>(".settings-search input")
            : root

          target?.focus({ preventScroll: true })
        }),
      { defer: true },
    ),
  )

  const connection = (key: string) => servers().find((item) => item.key === key)

  const project = (server: ServerConnection.Any, directory: string) =>
    global
      .serverCtx(ServerConnection.key(server))
      ?.projects.list()
      .find((item) => item.worktree === directory)

  const targetServer = createMemo(() => {
    const view = surface.view()

    if (view.type !== "project") return undefined
    const server = connection(view.server)

    return server && serverPagesConnection(server.availability)
  })

  const targetProject = createMemo(() => {
    const view = surface.view()
    const server = targetServer()

    if (view.type !== "project" || !server) return undefined

    return project(server, view.project)
  })

  createEffect(() => {
    const next = settingsViewRedirect({
      view: surface.view(),
      loaded: loaded(),
      servers: servers().map((item) => ({ key: item.key, availability: item.availability.status })),
    })

    if (next) surface.replace(next)
  })

  return (
    <div
      ref={root}
      data-testid="settings-screen"
      class="settings-screen"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented || dialog.active) return
        event.preventDefault()
        surface.search.escape()
      }}
    >
      <Switch>
        <Match when={surface.view().type === "root"}>
          <RootSettings />
        </Match>
        <Match when={surface.view().type === "project"}>
          <Show when={targetServer()} keyed>
            {(server) => (
              <Show when={targetProject()}>{(project) => <ProjectSettings server={server} project={project()} />}</Show>
            )}
          </Show>
        </Match>
      </Switch>
    </div>
  )
}

function RootSettings() {
  const language = useLanguage()
  const dialog = useDialog()
  const surface = useSettingsSurface()
  const inventory = useSettingsServers()

  const [state, setState] = createStore<{ modelProvider: string | undefined }>({ modelProvider: undefined })

  const multiple = createMemo(() => inventory().length > 1)

  // The selected server while its pages can load; an unreachable one shows its pages' unavailable state instead.
  const reachable = createMemo(() => {
    const entry = surface.server()

    return entry && serverPagesConnection(entry.availability)
  })

  const selectServer = (server: ServerConnection.Any) => surface.selectServer(ServerConnection.key(server))

  const addServer = () => void dialog.push(() => <DialogServer mode="add" onSave={selectServer} />)

  const groups = createMemo(() =>
    settingsPageGroups({
      translate: language.t,
      multipleServers: multiple(),
      pages: surface.plugins.pages().map((item) => item.value),
    }),
  )

  return (
    <SettingsNavigation
      value={surface.view().tab}
      groups={groups()}
      backLabel={language.t("settings.backToApp")}
      onBack={() => surface.close()}
      onChange={(value) => surface.select(value)}
    >
      <Tabs.Content value="general" class="settings-panel">
        <SettingsGeneral />
      </Tabs.Content>
      <Tabs.Content value="appearance" class="settings-panel">
        <SettingsAppearance />
      </Tabs.Content>
      <Tabs.Content value="notifications" class="settings-panel">
        <SettingsNotifications />
      </Tabs.Content>
      <Tabs.Content value="shortcuts" class="settings-panel">
        <SettingsKeybinds active={surface.view().tab === "shortcuts"} />
      </Tabs.Content>
      <PluginSettingsPages />
      <Tabs.Content value="about" class="settings-panel settings-about">
        <SettingsAbout active={surface.view().tab === "about"} />
      </Tabs.Content>
      <Show
        when={reachable()}
        keyed
        fallback={
          <Show when={surface.server()}>
            {(entry) => (
              <For each={serverPages}>
                {(item) => (
                  <Tabs.Content value={item.value} class="settings-panel">
                    <SettingsServerUnavailable
                      entry={entry()}
                      title={language.t(item.title)}
                      description={language.t(item.description)}
                      headerAction={<SettingsServerSwitcher />}
                      onManage={() => surface.openServers(entry().key)}
                      onServerChange={selectServer}
                    />
                  </Tabs.Content>
                )}
              </For>
            )}
          </Show>
        }
      >
        {(server) => (
          <SettingsServerDataScope server={server}>
            <Tabs.Content value="providers" class="settings-panel">
              <SettingsProviders
                directory={undefined}
                headerAction={<SettingsServerSwitcher />}
                onSelectProvider={(providerID) => {
                  setState("modelProvider", providerID)
                  surface.select("models")
                }}
              />
            </Tabs.Content>
            <Tabs.Content value="models" class="settings-panel">
              <SettingsModels
                active={surface.view().tab === "models"}
                provider={state.modelProvider}
                headerAction={<SettingsServerSwitcher />}
                onConsumeTarget={() => setState("modelProvider", undefined)}
              />
            </Tabs.Content>
          </SettingsServerDataScope>
        )}
      </Show>
      <Tabs.Content value="servers" class="settings-panel">
        <Show
          when={multiple() ? undefined : inventory()[0]}
          fallback={
            <SettingsServerList
              servers={inventory()}
              selected={surface.server()?.key}
              onAddServer={addServer}
              onServerChange={selectServer}
            />
          }
        >
          {(entry) => <SettingsServerGeneral entry={entry()} onAddServer={addServer} />}
        </Show>
      </Tabs.Content>
    </SettingsNavigation>
  )
}

function ProjectSettings(props: { server: ServerConnection.Any; project: LocalProject }) {
  const language = useLanguage()
  const surface = useSettingsSurface()
  const groups: SettingsNavGroup[] = [
    {
      items: [{ value: "general", icon: pageIcons.projects, label: language.t("settings.general.section.general") }],
    },
  ]

  return (
    <SettingsServerDataScope server={props.server} directory={props.project.worktree}>
      <LocationProvider directory={props.project.worktree}>
        <SettingsNavigation
          value={surface.view().tab}
          groups={groups}
          backLabel={language.t("settings.backToSettings")}
          onBack={() => surface.back()}
          onChange={(value) => surface.select(value)}
        >
          <Tabs.Content value="general" class="settings-panel">
            <SettingsProjectGeneral
              server={props.server}
              project={props.project}
              onOpenServer={() => surface.openServers(ServerConnection.key(props.server))}
            />
          </Tabs.Content>
        </SettingsNavigation>
      </LocationProvider>
    </SettingsServerDataScope>
  )
}
