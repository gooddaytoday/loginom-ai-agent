import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { app, autoUpdater, net, shell } from "electron"
import pkg from "electron-updater"
import { Effect } from "effect"
import { Product } from "@loginom-ai-agent/product"
import { redactUpdateMessage } from "@loginom-ai-agent/product/update-signature"
import {
  checkAutomaticUpdate,
  compareUpdateVersions,
  downloadSignedUpdate,
  downloadTarget,
  loadSignedUpdate,
  matchUpdateManifest,
  readUpdateBytes,
  updateMode,
  updateNotificationLink,
  type UpdateSource,
} from "./signed-feed"
import type { Platform } from "./machine"

const updateClient = pkg.autoUpdater

const execFileAsync = promisify(execFile)

const restartTimeout = 10_000

const unpackTimeout = 120_000

export const make = Effect.fn("Updater.platform")(function* (sources: readonly UpdateSource[]) {
  const currentVersion = app.getVersion()
  const mode = updateMode(process.platform, process.env.APPIMAGE)
  const preferArm64 = process.platform === "win32" && app.runningUnderARM64Translation
  const file =
    process.platform === "darwin" ? "latest-mac.yml" : process.platform === "linux" ? "latest-linux.yml" : "latest.yml"
  const runFork = Effect.runForkWith(yield* Effect.context())
  const safe = (values: unknown[]) => values.map((value) => redactUpdateMessage(String(value)))
  updateClient.logger = {
    info: (...args) => runFork(Effect.logInfo(...safe(args))),
    warn: (...args) => runFork(Effect.logWarning(...safe(args))),
    error: (...args) => runFork(Effect.logError(...safe(args))),
    debug: (...args) => runFork(Effect.logDebug(...safe(args))),
  }
  updateClient.requestHeaders = { "User-Agent": `${Product.slug}/${currentVersion}/desktop` }
  updateClient.allowPrerelease = false
  updateClient.allowDowngrade = false
  updateClient.autoDownload = false
  updateClient.autoInstallOnAppQuit = false
  updateClient.disableWebInstaller = true
  updateClient.disableDifferentialDownload = true
  const read = (url: string, timeout?: number) =>
    readUpdateBytes(
      url,
      (url) => {
        const request = net.request({ url, session: updateClient.netSession, redirect: "manual" })
        let redirects = 0
        request.on("redirect", (_status, _method, location) => {
          if (++redirects > 5 || !URL.canParse(location) || new URL(location).protocol !== "https:") {
            request.emit("error", Error("LOGINOM_UPDATE_REDIRECT_INVALID"))
            return
          }
          request.followRedirect()
        })
        return request
      },
      timeout,
    )
  const failure = (error: unknown) => Error(redactUpdateMessage(error instanceof Error ? error.message : String(error)))
  let approved: Awaited<ReturnType<typeof checkAutomaticUpdate>>
  let notification: ReturnType<typeof updateNotificationLink> | undefined

  return {
    checkForUpdate: Effect.tryPromise({
      try: async (signal) => {
        approved = undefined
        notification = undefined
        const selected = await loadSignedUpdate({ sources, file, currentVersion, read })
        signal.throwIfAborted()
        if (
          !selected ||
          compareUpdateVersions(selected.signed.version, currentVersion) <= 0 ||
          selected.signed.stagingPercentage === 0
        )
          return undefined

        if (mode === "notify") {
          const extension = process.platform === "darwin" ? /\.(dmg|zip)$/i : /\.deb$/i
          const installer = selected.signed.files.find((candidate) => extension.test(candidate.url))
          if (!installer) throw Error("LOGINOM_UPDATE_TARGET_INVALID")
          if (!(await updateClient.isUserWithinRollout(selected.signed))) return undefined
          signal.throwIfAborted()
          notification = updateNotificationLink(selected, installer.url)
          return { mode: "external", version: selected.signed.version, url: notification.url } as const
        }

        const candidate = await checkAutomaticUpdate(updateClient, selected, preferArm64)
        signal.throwIfAborted()
        approved = candidate
        if (approved) return { mode: "restart", version: approved.info.version } as const
      },
      catch: failure,
    }),
    stageUpdate: () =>
      Effect.tryPromise({
        try: () => {
          if (!approved || downloadTarget(updateClient) !== approved.info)
            throw Error("LOGINOM_UPDATE_MANIFEST_MISMATCH")
          const { selected, info } = approved
          matchUpdateManifest(selected.signed, info)
          return downloadSignedUpdate(
            updateClient,
            selected,
            () =>
              loadSignedUpdate({
                sources: sources.filter((source) => source.kind !== "github"),
                file,
                currentVersion: selected.signed.version,
                read,
              }),
            preferArm64,
          )
        },
        catch: failure,
      }).pipe(Effect.flatMap(unpackInstaller)),
    externalInstall:
      mode === "notify"
        ? (url: string) =>
            Effect.tryPromise({
              try: () => {
                if (!notification) throw Error("LOGINOM_UPDATE_TARGET_INVALID")
                return shell.openExternal(notification.resolve(url))
              },
              catch: failure,
            })
        : undefined,
    installAndRestart,
  } satisfies Platform
})

// The NSIS installer unpacks the update beside the install directory while the app keeps running, so the
// install after the restart moves one directory into place instead of decompressing the whole app. When this
// fails, the restart still installs the update, only slower.
function unpackInstaller(files: string[]) {
  const installer = files.find((file) => file.endsWith(".exe"))

  if (process.platform !== "win32" || !app.isPackaged || !installer) return Effect.void

  return Effect.tryPromise(() =>
    execFileAsync(installer, ["--stage"], { windowsHide: true, timeout: unpackTimeout }),
  ).pipe(
    Effect.andThen(Effect.logInfo("update unpacked before restart", { installer })),
    Effect.catch((error) =>
      Effect.logWarning("update not unpacked before restart", {
        installer,
        message: error.cause instanceof Error ? error.cause.message : String(error.cause),
      }),
    ),
  )
}

const installAndRestart = Effect.callback<void, Error>((resume) => {
  const cleanup = () => {
    autoUpdater.removeListener("before-quit-for-update", started)
    updateClient.removeListener("error", fail)
  }

  const started = () => {
    cleanup()
    resume(Effect.void)
  }

  const fail = (error: Error) => {
    cleanup()
    resume(Effect.fail(error))
  }

  autoUpdater.once("before-quit-for-update", started)
  updateClient.once("error", fail)

  try {
    updateClient.quitAndInstall()
  } catch (error) {
    fail(error instanceof Error ? error : new Error(String(error)))
  }

  return Effect.sync(cleanup)
}).pipe(
  Effect.timeoutOrElse({
    duration: restartTimeout,
    orElse: () =>
      Effect.logError("update restart did not start").pipe(
        Effect.andThen(Effect.fail(new Error("Update restart did not start"))),
      ),
  }),
)
