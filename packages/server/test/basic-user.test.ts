import { expect } from "bun:test"
import { Effect } from "effect"
import { HttpServer } from "effect/http"
import { it } from "../../core/test/lib/effect"
import { ServerProcess } from "../src/process"

// Loginom AI Agent (B2.7a11): the server's Basic user is `loginom-ai-agent`, as in 0.4, and
// LOGINOM_AI_AGENT_SERVER_USERNAME replaces it. A request passes two checks with the same user: the process's own
// (`dispatch`) and the API's (`ServerAuth.Config`).

it.live("accepts loginom-ai-agent and refuses OpenCode's opencode by default", () =>
  Effect.gen(function* () {
    expect(yield* statuses(undefined, ["loginom-ai-agent", "opencode"])).toEqual([200, 401])
  }),
)

it.live("treats an empty LOGINOM_AI_AGENT_SERVER_USERNAME as unset", () =>
  Effect.gen(function* () {
    expect(yield* statuses("", ["loginom-ai-agent"])).toEqual([200])
  }),
)

it.live("takes the user from LOGINOM_AI_AGENT_SERVER_USERNAME", () =>
  Effect.gen(function* () {
    expect(yield* statuses("alice", ["alice", "loginom-ai-agent", "opencode"])).toEqual([200, 401, 401])
  }),
)

// The server reads the variable while it starts; the previous value comes back once the requests are answered.
function statuses(username: string | undefined, users: ReadonlyArray<string>) {
  return Effect.acquireUseRelease(
    Effect.sync(() => {
      const previous = process.env.LOGINOM_AI_AGENT_SERVER_USERNAME
      assign(username)
      return previous
    }),
    () =>
      Effect.gen(function* () {
        const server = yield* ServerProcess.start<never, never>({
          hostname: "127.0.0.1",
          port: 0,
          password: "secret",
          database: { path: ":memory:" },
        })
        const url = new URL("/api/info", HttpServer.formatAddress(server.address))
        return yield* Effect.forEach(users, (user) =>
          Effect.promise(() =>
            fetch(url, { headers: { authorization: `Basic ${btoa(`${user}:secret`)}` } }).then((response) =>
              response.arrayBuffer().then(() => response.status),
            ),
          ),
        )
      }),
    (previous) => Effect.sync(() => assign(previous)),
  )
}

function assign(username: string | undefined) {
  if (username === undefined) {
    delete process.env.LOGINOM_AI_AGENT_SERVER_USERNAME
    return
  }
  process.env.LOGINOM_AI_AGENT_SERVER_USERNAME = username
}
