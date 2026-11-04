import "../server/httpapi-exercise/environment"
import { Effect } from "effect"
import { runScenario } from "../server/httpapi-exercise/runner"
import { parseOptions } from "../server/httpapi-exercise/routing"
import { TestLLMServer } from "../lib/llm-server"

const cleanup = Bun.argv.at(-1) === "cleanup"
await Effect.runPromise(
  runScenario(parseOptions(["--scenario-timeout", "5 seconds"]))({
    kind: "active",
    name: "stalled-probe",
    method: "GET",
    path: "/global/health",
    project: undefined,
    seed: () =>
      Effect.gen(function* () {
        console.error(`probe reached ${cleanup ? "cleanup" : "body"}`)
        if (cleanup) {
          yield* Effect.addFinalizer(() => Effect.never)
          return yield* Effect.die("seed failed before cleanup")
        }
        return yield* Effect.never.pipe(Effect.uninterruptible)
      }).pipe(Effect.scoped),
    request: () => ({ path: "/global/health" }),
    authProbe: undefined,
    expect: () => Effect.void,
    compare: "none",
    capture: "full",
    mutates: false,
    reset: false,
    auth: "public",
  }).pipe(Effect.provide(TestLLMServer.layer), Effect.scoped),
)
process.exit(0)
