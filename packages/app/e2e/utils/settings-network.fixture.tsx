import { createMemoryHistory, MemoryRouter } from "@solidjs/router"
import { render } from "solid-js/web"
import type { ServiceProxyStatus } from "@opencode/plugin/gui/builtin"
import { AppBaseProviders, AppInterface } from "../../src/app"
import { PlatformProvider, type Platform } from "../../src/runtime/platform/platform"

const root = document.getElementById("root")

const query = new URLSearchParams(location.search)

const url = query.get("server")

if (!root || !url) throw new Error("Missing network settings fixture root or server")

const explicit: ServiceProxyStatus = { source: "environment", hosts: ["proxy.example:8080"] }

const system: ServiceProxyStatus = { source: "windows", hosts: ["proxy.example:8080"] }

const direct: ServiceProxyStatus = { source: "none", hosts: [] }

const proxies = new Map([
  ["explicit", explicit],
  ["system", system],
  ["direct", direct],
])

const proxy = proxies.get(query.get("proxy") ?? "") ?? explicit

const history = createMemoryHistory()

history.set({ value: "/settings", replace: true, scroll: false })

const platform: Platform = {
  platform: "desktop",
  os: "windows",
  windowID: "settings-network-test",
  openExternal: () => undefined,
  openDirectoryPickerDialog: async () => null,
  notify: async () => undefined,
  restart: async () => undefined,
  getSystemProxySetting: async () => ({
    enabled: true,
    unreachable: false,
    socksOnly: false,
    status: proxy,
  }),
}

render(
  () => (
    <PlatformProvider value={platform}>
      <AppBaseProviders locale="ru">
        <AppInterface
          servers={[{ type: "sidecar", variant: "base", displayName: "Loginom AI Agent", http: { url } }]}
          router={(props) => <MemoryRouter {...props} history={history} />}
        />
      </AppBaseProviders>
    </PlatformProvider>
  ),
  root,
)
