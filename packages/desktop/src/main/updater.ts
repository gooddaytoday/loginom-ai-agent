import { app, dialog, net } from "electron"
import { readFileSync } from "node:fs"
import type { UpdateInfo } from "electron-updater"
import { Product } from "@loginom-ai-agent/product"
import pkg from "electron-updater"
import { UPDATER_ENABLED } from "./constants"
import {
  updateProxyOptions,
  configureSignedUpdate,
  downloadSignedUpdate,
  loadSignedUpdate,
  readUpdateBytes,
  compareUpdateVersions,
  matchUpdateManifest,
  parseUpdateAdminPolicy,
  updateMode,
  updatePolicyPath,
  updateSources,
  type SelectedUpdate,
  type UpdateAdminPolicy,
  type UpdateChannel,
} from "./update-policy"
import { createUpdaterController, type UpdaterReadyRecord } from "./updater-controller"
import { getLogger } from "./logging"
import { getStore } from "./store"
import { openExternalURL, setAppQuitting } from "./windows"
import { nativeT } from "./native-translations"

const { autoUpdater } = pkg
const key = "ready"

export function setupAutoUpdater(input: {
  stop: () => Promise<void>
  workState: () => Promise<{ activeWork: boolean; unsettledWork: boolean; dispatching?: boolean }>
  stopAdmission: () => void
  proxy: () => Promise<NodeJS.ProcessEnv>
  systemProxyEnabled: () => boolean
}) {
  const logger = getLogger()
  const store = getStore(Product.stores.updater)
  let policy: UpdateAdminPolicy = {}
  let policyError = false
  try {
    policy = parseUpdateAdminPolicy(
      JSON.parse(readFileSync(updatePolicyPath(process.platform, process.env.ProgramData), "utf8")),
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      policyError = true
      policy = { updates: "off" }
      logger.error("updater administrator policy rejected")
    }
  }
  let settings = (() => {
    try {
      return updateSources(Product.updateFeed, Product.updateGithub, store.get("channel"), policy)
    } catch {
      policyError = true
      logger.error("updater feed configuration rejected")
      return updateSources(null, null, store.get("channel"), { updates: "off" })
    }
  })()
  const mode = updateMode(process.platform, process.env.APPIMAGE)
  autoUpdater.logger = logger
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.disableWebInstaller = true
  // Differential downloads may use old unsigned blockmaps. The final payload still
  // has SHA-512 verification; full downloads also keep this boundary simple.
  autoUpdater.disableDifferentialDownload = true
  let proxyCredentials: ReturnType<typeof updateProxyOptions>["credentials"] = []
  const login = (
    auth: { isProxy: boolean; host: string; port: number },
    callback: (username: string, password: string) => void,
  ) => {
    const credentials =
      auth.isProxy &&
      proxyCredentials.find((item) => item.host === auth.host.replace(/^\[|\]$/g, "") && item.port === auth.port)
    if (credentials) return callback(credentials.username, credentials.password)
    callback("", "")
  }
  autoUpdater.signals.login(login)
  autoUpdater.on("error", (error) => logger.error("updater backend error", error.message))
  const readManifest = (url: string, timeout?: number) =>
    readUpdateBytes(
      url,
      (url) => {
        const request = net.request({ url, session: autoUpdater.netSession, redirect: "manual" })
        let redirects = 0
        request.on("redirect", (_status, _method, location) => {
          if (++redirects > 5 || new URL(location).protocol !== "https:") {
            request.emit("error", Error("LOGINOM_UPDATE_REDIRECT_INVALID"))
            return
          }
          request.followRedirect()
        })
        request.on("login", login)
        return request
      },
      timeout,
    )
  let approved: { info: UpdateInfo; selected: SelectedUpdate } | undefined
  let verifiedUnsupported: boolean | undefined
  // 6.8.9 AppUpdater.js:413 stores result; :418 returns result.info;
  // :436/:462 pass that same object to doDownloadUpdate. Check identity as well
  // as signed fields again at the download boundary (and pin this in tests).
  const target = () =>
    (autoUpdater as unknown as { updateInfoAndProvider?: { info: UpdateInfo } }).updateInfoAndProvider?.info
  const controller = createUpdaterController({
    enabled: () => UPDATER_ENABLED && settings.enabled && !policyError,
    settings: () => ({
      enabled: UPDATER_ENABLED && settings.enabled && !policyError,
      channel: settings.channel,
      managed: settings.managed,
      channelLocked: settings.channelLocked,
    }),
    mode,
    supportStatus: () => verifiedUnsupported,
    currentVersion: app.getVersion(),
    workState: input.workState,
    stopAdmission: input.stopAdmission,
    backend: {
      async checkForUpdates() {
        approved = undefined
        if (!settings.sources.length) throw Error("LOGINOM_UPDATE_FEED_UNAVAILABLE")
        const environment = await input.proxy()
        const proxy = updateProxyOptions(environment, input.systemProxyEnabled())
        proxyCredentials = proxy.credentials
        // Apply the application's proxy to the updater's separate network session.
        await autoUpdater.netSession.setProxy(proxy.config)
        await autoUpdater.netSession.closeAllConnections()
        const file =
          process.platform === "darwin"
            ? "latest-mac.yml"
            : process.platform === "linux"
              ? "latest-linux.yml"
              : "latest.yml"
        const selected = await loadSignedUpdate({
          sources: settings.sources,
          file,
          currentVersion: app.getVersion(),
          read: readManifest,
        })
        const signed = selected.signed
        configureSignedUpdate(autoUpdater, selected)
        const unsupported = compareUpdateVersions(app.getVersion(), signed.minSupportedVersion) < 0
        verifiedUnsupported = unsupported
        const notes =
          typeof signed.releaseNotes === "string"
            ? signed.releaseNotes
            : signed.releaseNotes?.map((note) => note.note).join("\n")
        if (mode === "notify") {
          const extension = process.platform === "darwin" ? /\.(dmg|zip)$/i : /\.deb$/i
          const file = signed.files.find((file) => extension.test(file.url))
          if (!file) throw Error("LOGINOM_UPDATE_TARGET_INVALID")
          return {
            isUpdateAvailable:
              signed.stagingPercentage !== 0 &&
              compareUpdateVersions(signed.version, app.getVersion()) > 0 &&
              (await autoUpdater.isUserWithinRollout(signed)),
            updateInfo: signed,
            unsupported,
            notes,
            url: selected.url(file.url),
          }
        }
        const result = await autoUpdater.checkForUpdates()
        if (!result) throw Error("LOGINOM_UPDATE_FEED_UNAVAILABLE")
        matchUpdateManifest(signed, result.updateInfo)
        if (result.isUpdateAvailable) {
          if (target() !== result.updateInfo) throw Error("LOGINOM_UPDATE_MANIFEST_MISMATCH")
          approved = { info: result.updateInfo, selected }
        }
        return { ...result, unsupported }
      },
      downloadUpdate: () => {
        if (
          !approved ||
          target() !== approved.info ||
          !settings.enabled ||
          approved.selected.signed.stagingPercentage === 0
        )
          throw Error("LOGINOM_UPDATE_MANIFEST_MISMATCH")
        matchUpdateManifest(approved.selected.signed, approved.info)
        const selected = approved.selected
        return downloadSignedUpdate(autoUpdater, selected, () =>
          loadSignedUpdate({
            sources: settings.sources.filter((source) => source.kind === "generic"),
            file: process.platform === "linux" ? "latest-linux.yml" : "latest.yml",
            currentVersion: selected.signed.version,
            read: readManifest,
          }),
        )
      },
      quitAndInstall: () => {
        // quitAndInstall closes all windows before emitting before-quit, so
        // flag the quit first to keep window ids persisted for restore.
        setAppQuitting()
        try {
          autoUpdater.quitAndInstall(true, false)
        } catch (error) {
          // The install failed and the app keeps running; clear the flag so
          // deliberate window closes prune ids again.
          setAppQuitting(false)
          throw error
        }
      },
    },
    persistence: {
      get() {
        const value = store.get(key)
        if (!value || typeof value !== "object" || !("version" in value) || typeof value.version !== "string") return
        return { version: value.version } satisfies UpdaterReadyRecord
      },
      set: (value) => store.set(key, value),
      clear: () => store.delete(key),
    },
    stop: input.stop,
    log: (message, data) => logger.log(message, data),
  })
  return {
    ...controller,
    async setChannel(channel: UpdateChannel) {
      if (channel !== "stable" && channel !== "unstable") throw Error("LOGINOM_UPDATE_CHANNEL_INVALID")
      if (settings.channelLocked) throw Error("LOGINOM_UPDATE_POLICY_MANAGED")
      await controller.configure(() => {
        store.set("channel", channel)
        settings = updateSources(Product.updateFeed, Product.updateGithub, channel, policy)
        approved = undefined
      })
      return controller.check()
    },
    async requestInstall() {
      if (controller.getState().status !== "ready") return
      // Only the before-quit hook may install. Never stop work from a renderer action.
      const work = await input.workState().catch(() => ({ activeWork: true, unsettledWork: true }))
      if (work.activeWork || work.unsettledWork || ("dispatching" in work && work.dispatching)) {
        await dialog.showMessageBox({ type: "info", message: nativeT("desktop.updater.deferred") })
        return
      }
      app.quit()
    },
  }
}

export async function showUpdaterDialog(controller: ReturnType<typeof setupAutoUpdater>, alertOnFail: boolean) {
  const state = await controller.check()
  if (state.status === "error") {
    if (!alertOnFail) return
    await dialog.showMessageBox({
      type: "error",
      message: nativeT("desktop.updater.verificationFailed"),
      title: nativeT("desktop.updater.dialog.checkFailed.title"),
    })
    return
  }
  if (state.status === "up-to-date") {
    if (!alertOnFail) return
    await dialog.showMessageBox({
      type: "info",
      message: nativeT("desktop.updater.dialog.upToDate.message"),
      title: nativeT("desktop.updater.dialog.upToDate.title"),
    })
    return
  }
  if (state.status === "available") {
    const response = await dialog.showMessageBox({
      type: "info",
      message: nativeT("desktop.updater.available", { version: state.version }),
      detail: state.notes,
      buttons: [nativeT("desktop.updater.download"), nativeT("desktop.updater.dialog.later")],
      cancelId: 1,
    })
    if (response.response === 0) openExternalURL(state.url)
    return
  }
  if (state.status !== "ready") return

  const response = await dialog.showMessageBox({
    type: "info",
    message: nativeT("desktop.updater.onClose", { version: state.version }),
    title: nativeT("desktop.updater.dialog.ready.title"),
    buttons: [nativeT("desktop.updater.closeAndUpdate"), nativeT("desktop.updater.dialog.later")],
    defaultId: 0,
    cancelId: 1,
  })
  if (response.response === 0) await controller.requestInstall()
}
