import { CrossSpawnSpawner } from "@opencode/util/cross-spawn-spawner"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Deferred, Effect, Fiber, Schema, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { randomBytes } from "node:crypto"
import { selfCommand } from "../util/process"

const Ready = Schema.Struct({ url: Schema.String })
const decodeReady = Schema.decodeUnknownPromise(Schema.fromJsonString(Ready))

type Options = {
  readonly command?: ReadonlyArray<string>
}

const startupDirectory = process.cwd()

function command(password: string, options: Options) {
  const [executable, ...args] = options.command ?? [...selfCommand(), "serve"]
  if (!executable) throw new Error("Failed to resolve standalone server command")
  return ChildProcess.make(executable, [...args, "--stdio", "--port", "0"], {
    cwd: startupDirectory,
    // Explicit entry wins over anything inherited, so a user-exported
    // LOGINOM_AI_AGENT_PASSWORD cannot shadow the child's lease credential.
    env: { LOGINOM_AI_AGENT_PASSWORD: password },
    extendEnv: true,
    // The server treats EOF on this pipe as the end of its ownership lease.
    // The OS closes it even when the TUI is killed before Effect finalizers run.
    stdin: "pipe",
    stderr: process.env.LOGINOM_AI_AGENT_PRINT_LOGS === "1" ? "inherit" : "pipe",
    killSignal: "SIGTERM",
    forceKillAfter: "3 seconds",
  })
}

const makeEndpoint = Effect.fn("cli.standalone.endpoint")(
  function* (options: Options) {
    const password = randomBytes(32).toString("base64url")
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const proc = yield* spawner.spawn(command(password, options))
    const readyLine = yield* Deferred.make<string, Error>()
    // The end of the server's stderr, drained for its whole life: a server that fails to start says why there.
    const stderr = yield* proc.stderr.pipe(
      Stream.decodeText(),
      Stream.runFold(
        () => "",
        (tail, text) => (tail + text).slice(-4096),
      ),
      Effect.forkScoped,
    )
    // Keep draining stdout after readiness so later server writes cannot hit EPIPE.
    yield* proc.stdout.pipe(
      Stream.decodeText(),
      Stream.splitLines,
      Stream.runForEach((line) => Deferred.succeed(readyLine, line)),
      // stdout ends as the server exits. One that never reported readiness fails this command with its exit code and
      // the end of its stderr.
      Effect.andThen(
        Effect.gen(function* () {
          if (yield* Deferred.isDone(readyLine)) return
          const code = yield* proc.exitCode.pipe(Effect.option)
          const reason = (yield* Fiber.join(stderr).pipe(Effect.orElseSucceed(() => "")))
            .split("\n")
            .filter((line) => !/^\s+at /.test(line))
            .join("\n")
            .trim()
          if (code._tag === "Some" && code.value !== 0) process.exitCode = code.value
          yield* Deferred.fail(
            readyLine,
            new Error(
              `Standalone server exited before reporting readiness${code._tag === "Some" ? ` (code ${code.value})` : ""}${reason ? `: ${reason}` : ""}`,
            ),
          )
        }),
      ),
      Effect.ensuring(Deferred.fail(readyLine, new Error("Standalone server exited before reporting readiness"))),
      Effect.forkScoped,
    )
    const output = yield* Deferred.await(readyLine)
    const ready = yield* Effect.tryPromise(() => decodeReady(output))
    return {
      url: ready.url,
      auth: { type: "basic" as const, username: "opencode", password },
      pid: proc.pid,
      exited: proc.exitCode,
    }
  },
  Effect.provide(LayerNode.compile(CrossSpawnSpawner.node)),
)

export function start(options: Options = {}) {
  return makeEndpoint(options)
}

export * as Standalone from "./standalone"
