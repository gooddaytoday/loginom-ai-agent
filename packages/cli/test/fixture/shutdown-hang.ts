import { NodeRuntime } from "@effect/platform-node"
import { CrossSpawnSpawner } from "@opencode/util/cross-spawn-spawner"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Context, Effect, Layer } from "effect"
import { ChildProcess } from "effect/process"
import { ShutdownDeadline } from "../../src/shutdown-deadline"

class Hung extends Context.Service<Hung, {}>()("test/Hung") {}

// Owns a running child, then a finalizer that never finishes, so releasing the layer hangs before the child stops.
const hung = LayerNode.make({
  service: Hung,
  layer: Layer.effect(
    Hung,
    Effect.gen(function* () {
      const child = yield* ChildProcess.make(process.execPath, ["-e", "setInterval(() => {}, 1000)"])
      yield* Effect.addFinalizer(() => Effect.never)
      console.log(`SHUTDOWN_READY ${child.pid}`)
      return Hung.of({})
    }),
  ),
  deps: [CrossSpawnSpawner.node],
})

Effect.gen(function* () {
  yield* ShutdownDeadline.install(Number(process.argv[2]))
  yield* Layer.build(LayerNode.compile(hung))
  // Loginom AI Agent (B2.3b): `arm` stands for a service asked to stop without a signal; teardown starts at once.
  if (process.argv[3] === "arm") return yield* ShutdownDeadline.arm(Number(process.argv[2]), "service stop")
  return yield* Effect.never
}).pipe(Effect.scoped, NodeRuntime.runMain)
