export * as DesktopInitialization from "./desktop-initialization"

import { app } from "electron"
import { Context, Effect, Layer } from "effect"
import { desktopProxyPreference, startSystemProxy } from "../loginom/system-proxy"
import { DesktopLogging } from "../native/logging"
import { DesktopStorage } from "../storage"
import { ApplicationLifecycle } from "./index"
import { marks } from "./marks"
import {
  loadProxyEnvironment,
  preferApplicationEnvironment,
  prepareApplicationEnvironment,
  prepareDesktop,
} from "./environment"

export interface Interface {
  readonly version: string
  readonly systemProxy: Effect.Success<ReturnType<typeof startSystemProxy>>
}

export class Service extends Context.Service<Service, Interface>()("opencode/desktop/DesktopInitialization") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const logging = yield* DesktopLogging.Service
    const storage = yield* DesktopStorage.Service
    const lifecycle = yield* ApplicationLifecycle.Service
    yield* preferApplicationEnvironment
    // System certificates, the proxy and the net log serve later network work; the first window and
    // its IPC port do not wait for them.
    yield* Effect.forkScoped(
      prepareApplicationEnvironment.pipe(Effect.andThen(loadProxyEnvironment), Effect.andThen(logging.startNetwork)),
    )
    yield* Effect.promise(() => app.whenReady())
    const systemProxy = yield* startSystemProxy(lifecycle.state, desktopProxyPreference(storage.state))
    yield* prepareDesktop
    marks.init = Date.now()

    return Service.of({
      version: app.getVersion(),
      systemProxy,
    })
  }),
)
