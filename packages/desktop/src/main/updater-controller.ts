import type { UpdaterState, UpdateSettings } from "@opencode-ai/app/updater"
import { compareUpdateVersions } from "./update-policy"
import { redactUpdateMessage } from "@loginom-ai-agent/product/update-signature"

export type { UpdaterState } from "@opencode-ai/app/updater"

export type UpdaterReadyRecord = { version: string }

export type UpdaterBackend = {
  checkForUpdates(): Promise<
    | {
        isUpdateAvailable?: boolean
        unsupported?: boolean
        url?: string
        notes?: string
        updateInfo?: { version?: string }
      }
    | null
    | undefined
  >
  downloadUpdate(): Promise<unknown>
  quitAndInstall(): void
}

type UpdaterPersistence = {
  get(): UpdaterReadyRecord | undefined | Promise<UpdaterReadyRecord | undefined>
  set(value: UpdaterReadyRecord): void | Promise<void>
  clear(): void | Promise<void>
}

export function createUpdaterController(input: {
  enabled: boolean | (() => boolean)
  currentVersion: string
  backend: UpdaterBackend
  persistence: UpdaterPersistence
  stop: () => Promise<void>
  mode?: "automatic" | "notify"
  workState: () => Promise<{ activeWork: boolean; unsettledWork: boolean; dispatching?: boolean }>
  stopAdmission?: () => void
  settings?: () => UpdateSettings
  supportStatus?: () => boolean | undefined
  log?: (message: string, data?: object) => void
}) {
  const enabled = () => (typeof input.enabled === "function" ? input.enabled() : input.enabled)
  let state: UpdaterState = {
    status: enabled() ? "idle" : "disabled",
    ...(input.settings ? { settings: input.settings() } : {}),
  }
  let pending: Promise<UpdaterState> | undefined
  let configuring: Promise<UpdaterState> | undefined
  let installing = false
  let unsupported = false
  const listeners = new Set<(state: UpdaterState) => void>()

  const transition = (next: UpdaterState) => {
    input.log?.("updater state changed", { from: state.status, to: next.status })
    state = {
      ...next,
      ...(unsupported ? { unsupported: true } : {}),
      ...(input.settings ? { settings: input.settings() } : {}),
    }
    listeners.forEach((listener) => listener(state))
    return state
  }

  const check = () => {
    if (configuring) return configuring
    if (!enabled()) return Promise.resolve(transition({ status: "disabled" }))
    if (installing) return Promise.resolve(state)
    if (pending) return pending

    pending = (async () => {
      transition({ status: "checking" })
      const result = await input.backend.checkForUpdates()
      unsupported = result?.unsupported === true
      const version = result?.updateInfo?.version
      if (!result?.isUpdateAvailable || !version || compareUpdateVersions(version, input.currentVersion) <= 0) {
        await input.persistence.clear()
        return transition({ status: "up-to-date" })
      }

      if (input.mode === "notify") {
        if (!result.url) throw Error("LOGINOM_UPDATE_TARGET_INVALID")
        return transition({ status: "available", version, url: result.url, notes: result.notes })
      }

      transition({ status: "downloading", version })
      await input.backend.downloadUpdate()
      await input.persistence.set({ version })
      return transition({ status: "ready", version })
    })()
      .catch((error) => {
        // Signed minimum-version evidence remains valid even if a later metadata
        // request or download fails. Never clear it on a network/signature error.
        const verified = input.supportStatus?.()
        if (verified !== undefined) unsupported = verified
        const message = redactUpdateMessage(error instanceof Error ? error.message : String(error))
        input.log?.("updater check rejected", { message })
        return transition({ status: "error", message })
      })
      .finally(() => {
        pending = undefined
      })
    return pending
  }

  return {
    getState: () => state,
    subscribe(listener: (state: UpdaterState) => void) {
      listeners.add(listener)
      listener(state)
      return () => listeners.delete(listener)
    },
    async start() {
      const ready = await input.persistence.get()
      if (ready?.version === input.currentVersion) await input.persistence.clear()
      return check()
    },
    check,
    configure(change: () => void | Promise<void>) {
      if (installing) return Promise.reject(Error("LOGINOM_UPDATE_INSTALLING"))
      const previous = configuring ?? pending
      const next = (async () => {
        await previous
        await change()
        await input.persistence.clear()
        transition({ status: enabled() ? "idle" : "disabled" })
        return state
      })()
      configuring = next
      return next.finally(() => {
        if (configuring === next) configuring = undefined
      })
    },
    async install() {
      if (state.status !== "ready") throw new Error("Update is not ready to install")
      if (pending || configuring || installing || !enabled()) return
      installing = true
      const version = state.version
      try {
        input.stopAdmission?.()
        // A failed Host probe is uncertainty, never permission to interrupt work.
        const work = await input.workState().catch(() => ({ activeWork: true, unsettledWork: true, dispatching: true }))
        if (work?.activeWork || work?.unsettledWork || work?.dispatching) {
          input.log?.("updater installation deferred: Host work is active or unsettled")
          transition({ status: "ready", version, deferred: true })
          return
        }
        transition({ status: "installing", version })
        await input.stop()
        input.backend.quitAndInstall()
        transition({ status: "ready", version })
      } catch (error) {
        transition({ status: "ready", version })
        throw error
      } finally {
        installing = false
      }
    },
  }
}

export type UpdaterController = ReturnType<typeof createUpdaterController>
