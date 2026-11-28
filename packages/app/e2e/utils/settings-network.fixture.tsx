import { createMemoryHistory, MemoryRouter } from "@solidjs/router"
import { render } from "solid-js/web"
import { AppBaseProviders, AppInterface } from "../../src/app"
import { PlatformProvider, type Platform } from "../../src/runtime/platform/platform"
import { ServerConnection } from "../../src/runtime/server/registry"

const root = document.getElementById("root")

const query = new URLSearchParams(location.search)

const url = query.get("server")

if (!root || !url) throw new Error("Missing network settings fixture root or server")

const history = createMemoryHistory()

history.set({ value: "/settings", replace: true, scroll: false })

const desktop = query.get("platform") !== "web"
const server: ServerConnection.Any = desktop
  ? { type: "sidecar", variant: "base", displayName: "Loginom AI Agent", http: { url } }
  : { type: "http", http: { url } }

const platform: Platform = {
  ...(desktop
    ? {
        platform: "desktop",
        os: "windows",
        windowID: "settings-network-test",
        openDirectoryPickerDialog: async () => null,
      }
    : { platform: "web" }),
  openExternal: () => undefined,
  notify: async () => undefined,
  restart: async () => undefined,
}

render(
  () => (
    <PlatformProvider value={platform}>
      <AppBaseProviders locale="ru">
        <AppInterface
          canonicalLocalServer={desktop ? undefined : ServerConnection.key(server)}
          servers={[server]}
          router={(props) => <MemoryRouter {...props} history={history} />}
        />
      </AppBaseProviders>
    </PlatformProvider>
  ),
  root,
)
