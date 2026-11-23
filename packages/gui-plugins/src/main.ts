import { compose } from "@opencode/plugin/gui/host"
import context from "./context"
import btw from "./btw"
import debug from "./debug"
import terminal from "./terminal"
import file from "./file"
import review from "./review"
import details from "./details"
import browser from "./browser"
import updater from "./updater"
import wsl from "./wsl"
import microsoftOffice from "./microsoft-office"
import sources from "./sources"
import goal from "./goal"

/** Built-in plugins with their main entries, by id. Lists every built-in so their ids stay reserved. */
export const builtins = compose({
  context,
  btw,
  debug: { ...debug, mainEntry: () => import("./debug/main") },
  terminal,
  file,
  review,
  details,
  browser: { ...browser, mainEntry: () => import("./browser/main") },
  // Loginom AI Agent (B4.11e): no pairing or ssh, as in 0.4. wsl stays here for now: the window does not load it, so
  // it has no UI, and its main entry alone bundles node-pty (B4.11e in docs/upstream-sync/oc2-migration-log.md).
  updater: { ...updater, mainEntry: () => import("./updater/main") },
  wsl: { ...wsl, mainEntry: () => import("./wsl/main") },
  "microsoft-office": microsoftOffice,
  sources,
  goal,
})
