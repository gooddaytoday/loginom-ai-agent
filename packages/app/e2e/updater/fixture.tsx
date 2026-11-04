import { Dynamic, render } from "solid-js/web"
import { createStore } from "solid-js/store"
import { SettingsUpdates } from "../../src/components/settings-general"
import { SettingsUpdatesV2 } from "../../src/components/settings-v2/general"
import { TitlebarUpdateIconButton } from "../../src/components/titlebar"
import { LanguageProvider, useLanguage } from "../../src/context/language"
import { PlatformProvider, type Platform } from "../../src/context/platform"
import { SettingsProvider } from "../../src/context/settings"
import type { UpdaterState } from "../../src/updater"
import "../../src/index.css"

const query = new URLSearchParams(location.search)
const [state, setState] = createStore<{ update: UpdaterState; opened: string[]; installs: number; checks: number }>({
  update: {
    status: "available",
    version: "0.4.902",
    url: "https://updates.example.test/0.4.902/download",
    notes: '<img src=x onerror="alert(1)">\n' + "Release notes\n".repeat(100),
    settings: { enabled: true, channel: "stable", managed: false, channelLocked: false },
  },
  opened: [],
  installs: 0,
  checks: 0,
})
const platform: Platform = {
  platform: "desktop",
  os: query.get("os") === "macos" ? "macos" : query.get("os") === "windows" ? "windows" : "linux",
  version: "0.4.901",
  openExternal: (url) => setState("opened", (opened) => [...opened, url]),
  openDirectoryPickerDialog: async () => null,
  restart: async () => {},
  notify: async () => {},
  updater: {
    state: () => state.update,
    check: async () => {
      setState("checks", (count) => count + 1)
      return state.update
    },
    install: async () => {
      setState("installs", (count) => count + 1)
    },
  },
}

function TitlebarUpdateFixture() {
  const language = useLanguage()
  return (
    <TitlebarUpdateIconButton
      state={{
        visible: true,
        installing: false,
        label: language.t("titlebar.update"),
        ariaLabel: language.t("settings.updates.download"),
        title: language.t("titlebar.updateVersion", { version: "0.4.902" }),
        onInstall: () => platform.openExternal("https://updates.example.test/0.4.902/download"),
      }}
    />
  )
}

render(
  () => (
    <PlatformProvider value={platform}>
      <LanguageProvider locale={query.get("locale") === "ru" ? "ru" : "en"}>
        <SettingsProvider>
          <Dynamic
            component={
              query.get("part") === "titlebar"
                ? TitlebarUpdateFixture
                : query.get("layout") === "v2"
                  ? SettingsUpdatesV2
                  : SettingsUpdates
            }
          />
          <output data-tid="update-test-result">
            {JSON.stringify({ opened: state.opened, installs: state.installs, checks: state.checks })}
          </output>
          <button
            data-tid="update-test-no-notes"
            onClick={() =>
              setState("update", {
                status: "available",
                version: "0.4.903",
                notes: undefined,
                url: "https://updates.example.test/0.4.903/download",
              })
            }
          >
            No notes
          </button>
          <button
            data-tid="update-test-downloading"
            onClick={() => setState("update", { status: "downloading", version: "0.4.902" })}
          >
            Downloading
          </button>
          <button
            data-tid="update-test-ready"
            onClick={() => setState("update", { status: "ready", version: "0.4.902" })}
          >
            Ready
          </button>
        </SettingsProvider>
      </LanguageProvider>
    </PlatformProvider>
  ),
  document.getElementById("root")!,
)
