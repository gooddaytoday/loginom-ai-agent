import { Schema } from "effect"
import { Ipc } from "@opencode/plugin/gui"

export type WslCommandResult = {
  code: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
}

export type RunWslOptions = {
  signal?: AbortSignal
  /**
   * Ceiling on how long we wait for the child process to exit. When the
   * LXSS service or a specific distro wedges (e.g. Ubuntu-24.04 with a
   * pending first-run prompt), `wsl.exe` never returns and any command
   * that doesn't specify a timeout hangs the entire startup flow. Default
   * is 20s - enough for slow cold-starts, short enough to fail fast on
   * a wedge. Callers can override for longer-running jobs.
   */
  timeoutMs?: number
}

export const WslServerConfig = Schema.Struct({
  id: Schema.String,
  distro: Schema.String,
  autostart: Schema.optionalKey(Schema.Boolean),
})

export type WslServerConfig = typeof WslServerConfig.Type

export const WslServerRuntime = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("starting") }),
  Schema.Struct({
    kind: Schema.Literal("ready"),
    url: Schema.String,
    password: Schema.NullOr(Schema.String),
  }),
  Schema.Struct({ kind: Schema.Literal("failed"), message: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("stopped") }),
])

export type WslServerRuntime = typeof WslServerRuntime.Type

/** The one job a distro runs; a distro missing from `distroJobs` runs none. */
export const WslDistroJob = Schema.Literals(["probing", "installing", "updating", "starting", "removing"])

export type WslDistroJob = typeof WslDistroJob.Type

export const WslRuntimeCheck = Schema.Struct({
  available: Schema.Boolean,
  version: Schema.NullOr(Schema.String),
  error: Schema.NullOr(Schema.String),
})

export type WslRuntimeCheck = typeof WslRuntimeCheck.Type

export const WslInstalledDistro = Schema.Struct({
  name: Schema.String,
  version: Schema.NullOr(Schema.Number),
  isDefault: Schema.Boolean,
})

export type WslInstalledDistro = typeof WslInstalledDistro.Type

export const WslOnlineDistro = Schema.Struct({ name: Schema.String, label: Schema.String })

export type WslOnlineDistro = typeof WslOnlineDistro.Type

export const WslDistroProbe = Schema.Struct({
  name: Schema.String,
  canExecute: Schema.Boolean,
  hasBash: Schema.Boolean,
  hasArchiveTools: Schema.Boolean,
  error: Schema.NullOr(Schema.String),
})

export type WslDistroProbe = typeof WslDistroProbe.Type

export const WslOpencodeCheck = Schema.Struct({
  distro: Schema.String,
  resolvedPath: Schema.NullOr(Schema.String),
  version: Schema.NullOr(Schema.String),
  expectedVersion: Schema.NullOr(Schema.String),
  matchesDesktop: Schema.NullOr(Schema.Boolean),
  error: Schema.NullOr(Schema.String),
})

export type WslOpencodeCheck = typeof WslOpencodeCheck.Type

export const WslServerItem = Schema.Struct({ config: WslServerConfig, runtime: WslServerRuntime })

export type WslServerItem = typeof WslServerItem.Type

export const WslServersState = Schema.Struct({
  runtime: Schema.NullOr(WslRuntimeCheck),
  installed: Schema.Array(WslInstalledDistro),
  online: Schema.Array(WslOnlineDistro),
  distroProbes: Schema.Record(Schema.String, WslDistroProbe),
  opencodeChecks: Schema.Record(Schema.String, WslOpencodeCheck),
  pendingRestart: Schema.Boolean,
  servers: Schema.Array(WslServerItem),
  hostJob: Schema.Literals(["idle", "busy"]),
  distroJobs: Schema.Record(Schema.String, WslDistroJob),
})

export type WslServersState = typeof WslServersState.Type

const Name = Schema.Struct({ name: Schema.NonEmptyString })

const Id = Schema.Struct({ id: Schema.NonEmptyString })

/** WSL runtime, distros, and the OpenCode servers the main process runs inside them. */
export const Wsl = Ipc.define({
  id: "wsl",
  state: WslServersState,
  methods: {
    probeRuntime: {},
    refreshDistros: {},
    installWsl: {},
    installDistro: { input: Name },
    probeAddable: { input: Schema.Struct({ distros: Schema.Array(Schema.NonEmptyString) }) },
    installOpencode: { input: Name },
    addServer: { input: Schema.Struct({ distro: Schema.NonEmptyString }), output: WslServerConfig },
    removeServer: { input: Id },
    startServer: { input: Id },
  },
})
