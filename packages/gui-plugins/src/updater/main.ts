import { dialog } from "electron"
import { join } from "node:path"
import { Effect, Exit, Schema, Scope } from "effect"
import { Product } from "@loginom-ai-agent/product"
import { builtinMainContext } from "@opencode/plugin/gui/builtin"
import { MenubarItem, type Plugin } from "@opencode/plugin/gui/main"
import { Updater } from "@opencode/plugin/gui/updater"
import { logContext } from "./log"
import { make } from "./machine"

const setup: Plugin.MainSetup = async (ctx) => {
  const builtin = builtinMainContext(ctx)
  const build = ctx.app
  const lifecycle = builtin.lifecycle
  // Holds no resources, so it needs no cleanup.
  const context = logContext(ctx.log.write)
  const runPromise = Effect.runPromiseWith(context)
  const runFork = Effect.runForkWith(context)

  // The update main staged for the next start; stored before in the updater's settings file.
  const ready = builtin.storage.store("ready", {
    schema: Schema.NullOr(Schema.Struct({ version: Schema.String })),
    initial: null,
    from: { settings: "ready", file: Product.stores.updater },
  })

  const settings =
    build.packaged && build.channel !== "dev"
      ? await (async () => {
          const preference = builtin.storage.store("channel", {
            schema: Schema.NullOr(Schema.Literals(["stable", "unstable"])),
            initial: null,
            from: { settings: "channel", file: Product.stores.updater },
          })
          const { readUpdateSettings, updatePolicyPath } = await import("./signed-feed")
          try {
            return readUpdateSettings({
              policyPath: updatePolicyPath(process.platform, process.env.ProgramData),
              s3Path: join(process.resourcesPath, "updates-s3.json"),
              preference: preference.value,
              feed: Product.updateFeed,
              github: Product.updateGithub,
            })
          } catch {
            ctx.log.write("error", "updater administrator policy or product feed rejected")
          }
        })()
      : undefined

  if (ctx.signal.aborted) return
  const scope = Scope.makeUnsafe()
  ctx.onCleanup(() => runPromise(Scope.close(scope, Exit.void)))

  // electron-updater loads only in packaged builds, after the first window is up.
  const platform = settings?.enabled
    ? await import("./platform").then((module) => runPromise(module.make(settings.sources).pipe(Scope.provide(scope))))
    : undefined

  if (ctx.signal.aborted) return
  const publish = { changed: () => {} }

  const updater = await runPromise(
    make({
      currentVersion: build.version,
      platform,
      // The updater stays active through the handoff, so a failed install returns to a state the user can retry.
      restart: (handoff) =>
        Effect.tryPromise({
          try: () => lifecycle.restart(() => runPromise(handoff)),
          catch: (error) => error,
        }),
      persistence: {
        get: Effect.sync(() => ready.value ?? undefined),
        set: (value) => Effect.sync(() => ready.set(value)),
        clear: Effect.sync(() => ready.set(null)),
      },
      changed: () => publish.changed(),
    }).pipe(Scope.provide(scope)),
  )

  const provider = ctx.provide(Updater, {
    state: () => updater.state(),
    check: () => runPromise(updater.check),
    install: () => runPromise(updater.install),
  })

  publish.changed = () => provider.changed()

  const show = Effect.gen(function* () {
    const state = yield* updater.check

    if (state.status === "error") {
      yield* promise(() =>
        dialog.showMessageBox({
          type: "error",
          message: ctx.t("dialog.checkFailed.message"),
          title: ctx.t("dialog.checkFailed.title"),
        }),
      )

      return
    }

    if (state.status === "up-to-date") {
      yield* promise(() =>
        dialog.showMessageBox({
          type: "info",
          message: ctx.t("dialog.upToDate.message"),
          title: ctx.t("dialog.upToDate.title"),
        }),
      )

      return
    }

    if (state.status !== "ready") return

    const response = yield* promise(() =>
      dialog.showMessageBox({
        type: "info",
        message: ctx.t("dialog.ready.message", { version: state.version }),
        title: ctx.t("dialog.ready.title"),
        buttons: [ctx.t("dialog.restart"), ctx.t("dialog.later")],
        defaultId: 0,
        cancelId: 1,
      }),
    )

    // A failed install returns the updater to ready, so the user can retry from the menu.
    if (response.response === 0)
      yield* updater.install.pipe(
        Effect.catch((error) => Effect.logWarning("update install failed", { message: error.message })),
      )
  })

  ctx.add(
    MenubarItem,
    (): MenubarItem => ({
      menu: "app",
      id: "check",
      label: ctx.t("menu.check"),
      after: "about",
      enabled: () => !!platform,
      run(window) {
        // Beta builds and external downloads report the result in the focused window.
        if (build.channel !== "beta" && !platform?.externalInstall) return void runFork(show)

        if (window) provider.emit("check", null, window.id)
      },
    }),
  )
}

function promise<A>(evaluate: () => Promise<A>) {
  return Effect.tryPromise(evaluate).pipe(Effect.orDie)
}

export default setup
