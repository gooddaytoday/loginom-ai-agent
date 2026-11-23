import { describe, expect, test } from "bun:test"
import { createUpdaterController, type UpdaterBackend, type UpdaterReadyRecord } from "./updater-controller"

function setup(input?: {
  currentVersion?: string
  ready?: UpdaterReadyRecord
  enabled?: boolean
  mode?: "automatic" | "notify"
  latest?: string
  unsupported?: boolean
  workState?: () => Promise<{ activeWork: boolean; unsettledWork: boolean; dispatching?: boolean }>
  backend?: UpdaterBackend
  supportStatus?: () => boolean | undefined
  log?: (message: string, data?: object) => void
}) {
  const calls: string[] = []
  const backend: UpdaterBackend = {
    async checkForUpdates() {
      calls.push("check")
      return {
        isUpdateAvailable: true,
        updateInfo: { version: input?.latest ?? "2.0.0" },
        unsupported: input?.unsupported,
        url: "https://feed.test/stable/2.0.0/loginom-ai-agent.deb",
        notes: "Release notes",
      }
    },
    async downloadUpdate() {
      calls.push("download")
    },
    quitAndInstall() {
      calls.push("install")
    },
  }
  let ready = input?.ready
  const controller = createUpdaterController({
    enabled: input?.enabled ?? true,
    currentVersion: input?.currentVersion ?? "1.0.0",
    backend: input?.backend ?? backend,
    mode: input?.mode,
    supportStatus: input?.supportStatus,
    log: input?.log,
    workState: input?.workState ?? (async () => ({ activeWork: false, unsettledWork: false })),
    persistence: {
      get: () => ready,
      set: (value) => {
        ready = value
      },
      clear: () => {
        ready = undefined
      },
    },
    stop: async () => {
      calls.push("stop")
    },
  })
  return { controller, calls, getReady: () => ready }
}

describe("updater controller", () => {
  test("presigned credentials are redacted from error state and controller logs", async () => {
    const logs: string[] = []
    const app = setup({
      log: (message, data) => logs.push(message + JSON.stringify(data)),
      backend: {
        async checkForUpdates() {
          throw Error(
            'Cannot download "https://private.test/asset?X-Amz-Credential=tenant%3Aread-key&X-Amz-Signature=local-signature", status 403',
          )
        },
        async downloadUpdate() {
          throw Error("unexpected download")
        },
        quitAndInstall() {},
      },
    })
    expect(await app.controller.check()).toEqual({
      status: "error",
      message: 'Cannot download "https://private.test/asset?[REDACTED]", status 403',
    })
    expect(logs.join(" ")).not.toContain("read-key")
    expect(logs.join(" ")).not.toContain("local-signature")
  })
  test("notification-only mode never downloads or installs, including a persisted ready update", async () => {
    const app = setup({ mode: "notify", unsupported: true, ready: { version: "2.0.0" } })
    expect(await app.controller.start()).toEqual({
      status: "available",
      version: "2.0.0",
      url: "https://feed.test/stable/2.0.0/loginom-ai-agent.deb",
      notes: "Release notes",
      unsupported: true,
    })
    await expect(app.controller.install()).rejects.toThrow()
    expect(app.calls).toEqual(["check"])
  })

  test("a stable channel with an older version never downloads or installs", async () => {
    const app = setup({ currentVersion: "2.0.0", latest: "1.9.9" })
    expect(await app.controller.start()).toEqual({ status: "up-to-date" })
    expect(app.calls).toEqual(["check"])
  })

  test("unknown Host work fails closed; an idle next close may install", async () => {
    let unknown = true
    const app = setup({
      workState: async () => {
        if (unknown) throw Error("Host unavailable")
        return { activeWork: false, unsettledWork: false }
      },
    })
    await app.controller.start()
    await app.controller.install()
    expect(app.calls).toEqual(["check", "download"])
    expect(app.controller.getState()).toEqual({ status: "ready", version: "2.0.0", deferred: true })
    unknown = false
    await app.controller.install()
    expect(app.calls).toEqual(["check", "download", "stop", "install"])
  })

  test("metadata verification errors produce a logged error and no download", async () => {
    const calls: string[] = []
    const app = setup({
      backend: {
        async checkForUpdates() {
          throw Error("LOGINOM_UPDATE_SIGNATURE_INVALID")
        },
        async downloadUpdate() {
          calls.push("download")
        },
        quitAndInstall() {
          calls.push("install")
        },
      },
    })
    expect(await app.controller.check()).toEqual({ status: "error", message: "LOGINOM_UPDATE_SIGNATURE_INVALID" })
    expect(calls).toEqual([])
  })

  test("unsupported warning survives a later check failure and clears only on verified support", async () => {
    let outcome = "unsupported"
    const app = setup({
      backend: {
        async checkForUpdates() {
          if (outcome === "failed") throw Error("network")
          return { isUpdateAvailable: false, unsupported: outcome === "unsupported", updateInfo: { version: "2.0.0" } }
        },
        async downloadUpdate() {},
        quitAndInstall() {},
      },
    })
    expect((await app.controller.check()).unsupported).toBe(true)
    outcome = "failed"
    expect((await app.controller.check()).unsupported).toBe(true)
    outcome = "supported"
    expect((await app.controller.check()).unsupported).toBeUndefined()
  })

  test("a signed unsupported-version warning is retained when the updater metadata request fails", async () => {
    const app = setup({
      supportStatus: () => true,
      backend: {
        async checkForUpdates() {
          throw Error("LOGINOM_UPDATE_MANIFEST_MISMATCH")
        },
        async downloadUpdate() {},
        quitAndInstall() {},
      },
    })
    expect(await app.controller.check()).toEqual({
      status: "error",
      message: "LOGINOM_UPDATE_MANIFEST_MISMATCH",
      unsupported: true,
    })
  })

  test("channel reconfiguration waits for in-flight download and rechecks without stale readiness", async () => {
    let finish = () => {}
    const downloading = new Promise<void>((resolve) => {
      finish = resolve
    })
    let channel = "unstable"
    const calls: string[] = []
    const app = setup({
      backend: {
        async checkForUpdates() {
          calls.push(channel)
          return { isUpdateAvailable: true, updateInfo: { version: channel === "unstable" ? "2.0.0" : "0.9.9" } }
        },
        async downloadUpdate() {
          calls.push("download")
          await downloading
        },
        quitAndInstall() {},
      },
    })
    const check = app.controller.check()
    await Promise.resolve()
    const change = app.controller.configure(() => {
      channel = "stable"
    })
    expect(channel).toBe("unstable")
    finish()
    await check
    await change
    expect(app.controller.getState().status).toBe("idle")
    expect(app.getReady()).toBeUndefined()
    await app.controller.check()
    expect(calls).toEqual(["unstable", "download", "stable"])
    expect(app.controller.getState().status).toBe("up-to-date")
  })
  test("never stops or installs while Host work is active or unsettled", async () => {
    for (const work of [
      { activeWork: true, unsettledWork: false },
      { activeWork: false, unsettledWork: true },
    ]) {
      const calls: string[] = []
      const controller = createUpdaterController({
        enabled: true,
        currentVersion: "1.0.0",
        backend: {
          checkForUpdates: async () => ({ isUpdateAvailable: true, updateInfo: { version: "2.0.0" } }),
          downloadUpdate: async () => {},
          quitAndInstall: () => {
            calls.push("install")
          },
        },
        persistence: {
          get() {
            return undefined
          },
          set() {},
          clear() {},
        },
        stop: async () => {
          calls.push("stop")
        },
        workState: async () => work,
      })
      await controller.start()
      await controller.install()
      expect(calls).toEqual([])
      expect(controller.getState().status).toBe("ready")
    }
  })
  test("disabled feed never downloads or installs a previously persisted update", async () => {
    const app = setup({ enabled: false, ready: { version: "2.0.0" } })
    expect(await app.controller.start()).toEqual({ status: "disabled" })
    expect(await app.controller.check()).toEqual({ status: "disabled" })
    await expect(app.controller.install()).rejects.toThrow("Update is not ready to install")
    expect(app.calls).toEqual([])
  })

  test("checks, downloads, persists, and publishes one authoritative ready state", async () => {
    const app = setup()
    const states: ReturnType<typeof app.controller.getState>[] = []
    app.controller.subscribe((state) => states.push(state))

    await app.controller.start()

    expect(app.calls).toEqual(["check", "download"])
    expect(app.getReady()).toEqual({ version: "2.0.0" })
    expect(states.map((state) => state.status)).toEqual(["idle", "checking", "downloading", "ready"])
    expect(app.controller.getState()).toEqual({ status: "ready", version: "2.0.0" })
  })

  test("revalidates a persisted target through the updater cache on launch", async () => {
    const app = setup({ ready: { version: "2.0.0" } })

    await app.controller.start()

    expect(app.calls).toEqual(["check", "download"])
    expect(app.controller.getState()).toEqual({ status: "ready", version: "2.0.0" })
  })

  test("clears a target already installed before checking", async () => {
    const app = setup({ currentVersion: "2.0.0", ready: { version: "2.0.0" } })

    await app.controller.start()

    expect(app.getReady()).toBeUndefined()
    expect(app.calls).toEqual(["check"])
  })

  test("coalesces concurrent checks", async () => {
    const app = setup()

    await Promise.all([app.controller.check(), app.controller.check(), app.controller.check()])

    expect(app.calls).toEqual(["check", "download"])
  })

  test("returns to ready when quitAndInstall returns without exiting", async () => {
    const app = setup()
    await app.controller.start()

    await app.controller.install()

    expect(app.calls).toEqual(["check", "download", "stop", "install"])
    expect(app.controller.getState()).toEqual({ status: "ready", version: "2.0.0" })
  })

  test("returns to ready when installation cannot start", async () => {
    const app = setup()
    await app.controller.start()

    const failed = createUpdaterController({
      enabled: true,
      currentVersion: "1.0.0",
      backend: {
        checkForUpdates: async () => ({ isUpdateAvailable: true, updateInfo: { version: "2.0.0" } }),
        downloadUpdate: async () => {},
        quitAndInstall() {},
      },
      persistence: { get: () => undefined, set() {}, clear() {} },
      stop: async () => {
        throw new Error("stop failed")
      },
      workState: async () => ({ activeWork: false, unsettledWork: false }),
    })
    await failed.start()

    await expect(failed.install()).rejects.toThrow("stop failed")
    expect(failed.getState()).toEqual({ status: "ready", version: "2.0.0" })
  })
})
