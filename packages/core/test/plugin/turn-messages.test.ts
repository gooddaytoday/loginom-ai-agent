import { expect } from "bun:test"
import { Database } from "@opencode/core/database/database"
import { Plugin } from "@opencode/core/plugin"
import { PluginHost } from "@opencode/core/plugin/host"
import { PluginPromise } from "@opencode/core/plugin/promise"
import { SessionMessageTable } from "@opencode/core/session/sql"
import { Agent } from "@opencode/schema/agent"
import { Model } from "@opencode/schema/model"
import { Provider } from "@opencode/schema/provider"
import { SessionMessage } from "@opencode/schema/session-message"
import { DateTime, Effect, Schema } from "effect"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "./fixture"

const it = testEffect(PluginTestLayer)

it.live("plugin turn history retains a compacted prompt's tool receipts and stops at the next prompt", () =>
  Effect.gen(function* () {
    const host = yield* PluginHost.make(yield* Plugin.Service, "test")
    const session = yield* host.session.create({})
    const other = yield* host.session.create({})
    const time = { created: DateTime.makeUnsafe(0) }
    const old = SessionMessage.User.make({ type: "user", id: SessionMessage.ID.create(), time, text: "Old prompt" })
    const next = SessionMessage.User.make({ type: "user", id: SessionMessage.ID.create(), time, text: "Next prompt" })
    const compacted = SessionMessage.CompactionCompleted.make({
      type: "compaction",
      id: SessionMessage.ID.create(),
      time,
      status: "completed",
      reason: "manual",
      summary: "Summary",
    })
    const metadata = {
      loginom: { v: 1, operationId: "verified-save", evidence: [{ kind: "saved", path: "/saved.lgp" }] },
    }
    const step = SessionMessage.Assistant.make({
      type: "assistant",
      id: SessionMessage.ID.create(),
      time,
      agent: Agent.ID.make("test"),
      model: { providerID: Provider.ID.make("test"), id: Model.ID.make("fixture") },
      content: [
        {
          type: "tool",
          id: "save",
          name: "loginom_dock_action_run",
          time,
          state: { status: "completed", input: {}, metadata, content: [{ type: "text", text: "Saved" }] },
        },
      ],
    })
    const padding = Array.from({ length: 65 }, () =>
      SessionMessage.Assistant.make({ ...step, id: SessionMessage.ID.create(), content: [] }),
    )
    const history = [old, ...padding, step, compacted, next]
    const db = (yield* Database.Service).db
    yield* db
      .insert(SessionMessageTable)
      .values(
        history.map((message, index) => {
          const { id, type, ...data } = Schema.encodeSync(SessionMessage.Info)(message)
          return { id: SessionMessage.ID.make(id), session_id: session.id, type, seq: index + 1, time_created: 0, data }
        }),
      )
      .run()
      .pipe(Effect.orDie)

    yield* PluginPromise.fromPromise({
      id: "test.turn-messages",
      async setup(ctx) {
        expect((await ctx.session.context({ sessionID: session.id })).map(({ id }) => id)).not.toContain(old.id)
        const turn = await ctx.session.turnMessages({ sessionID: session.id, promptID: old.id })
        expect(turn.map(({ id }) => id)).toEqual(history.slice(0, -1).map(({ id }) => id))
        expect(turn.find(({ id }) => id === step.id)).toMatchObject({ content: [{ state: { metadata } }] })
        expect(await ctx.session.turnMessages({ sessionID: other.id, promptID: old.id })).toEqual([])
        expect(await ctx.session.turnMessages({ sessionID: session.id, promptID: step.id })).toEqual([])
      },
    }).effect(host)
  }),
)
