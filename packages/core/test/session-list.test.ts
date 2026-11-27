import { describe, expect } from "bun:test"
import { Bus } from "@opencode/core/bus"
import { Database } from "@opencode/core/database/database"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { Location } from "@opencode/core/location"
import { Project } from "@opencode/core/project"
import { ProjectTable } from "@opencode/core/project/sql"
import { AbsolutePath } from "@opencode/core/schema"
import { Session } from "@opencode/core/session"
import { SessionExecution } from "@opencode/core/session/execution"
import { SessionMessage } from "@opencode/core/session/message"
import { SessionProjector } from "@opencode/core/session/projector"
import { SessionMessageTable, SessionPartTable } from "@opencode/core/session/sql"
import { SessionStore } from "@opencode/core/session/store"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { eq, sql } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { testEffect } from "./lib/effect"
import { globalProjectNode } from "./lib/project"

const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([Database.node, Bus.node, SessionProjector.node, SessionStore.node, Session.node]),
    [
      Bus.node.replace(Bus.configured({ persist: true })),
      Project.node.replace(globalProjectNode),
      SessionExecution.node.replace(SessionExecution.noopLayer),
    ],
  ),
)
const project = Location.Ref.make({ directory: AbsolutePath.make("/project") })
const other = Location.Ref.make({ directory: AbsolutePath.make("/other") })

describe("Session.list", () => {
  it.effect("pages through the filtered store results in both directions", () =>
    Effect.gen(function* () {
      const session = yield* Session.Service
      yield* Effect.forEach(["match one", "match two", "match three"], (title) =>
        session.create({ location: project, title }),
      )
      yield* session.create({ location: project, title: "different" })
      yield* session.create({ location: other, title: "match elsewhere" })
      const filter = { directory: project.directory, search: "match", order: "asc" as const }
      const store = yield* SessionStore.Service
      const expected = (yield* store.list(filter)).map((item) => item.id)

      const first = yield* session.list({ ...filter, limit: 2 })
      const second = yield* session.list({ cursor: first.cursor.next, limit: 2 })
      const back = yield* session.list({ cursor: second.cursor.previous, limit: 2 })
      const end = yield* session.list({ cursor: second.cursor.next, limit: 2 })

      expect(expected).toHaveLength(3)
      expect([...first.data, ...second.data].map((item) => item.id)).toEqual(expected)
      expect(back.data.map((item) => item.id)).toEqual(expected.slice(0, 2))
      expect(end).toEqual({ data: [], cursor: { previous: undefined, next: undefined } })
    }),
  )

  it.effect("returns 50 sessions when no limit is given", () =>
    Effect.gen(function* () {
      const session = yield* Session.Service
      yield* Effect.forEach(Array.from({ length: 51 }), () => session.create({ location: project }), { discard: true })

      expect((yield* session.list()).data).toHaveLength(50)
    }),
  )

  it.effect("searches literal user prompts, not assistant replies or titles, across pages", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const userMatch = yield* sessions.create({ location: project, title: "Untitled first" })
      const nextMatch = yield* sessions.create({ location: other, title: "Untitled second" })
      const assistantOnly = yield* sessions.create({ location: project, title: "Assistant only" })
      const titleOnly = yield* sessions.create({ location: project, title: "Выручка [2026]?" })
      const wildcardOnly = yield* sessions.create({ location: project, title: "Wildcard only" })
      const reply = SessionMessage.ID.make("msg_search_reply")
      const { db } = yield* Database.Service

      yield* db
        .insert(SessionMessageTable)
        .values([
          ...[userMatch, nextMatch, wildcardOnly].map((session, index) => ({
            id: SessionMessage.ID.make(`msg_search_${index}`),
            session_id: session.id,
            type: "user" as const,
            seq: 0,
            data: { time: { created: 0 }, text: session === wildcardOnly ? "ВЫРУЧКУ 2!" : "Найди ВЫРУЧКУ [2026]?" },
          })),
          {
            id: reply,
            session_id: assistantOnly.id,
            type: "assistant",
            seq: 0,
            data: { time: { created: 0 }, agent: "build", model: { id: "test", providerID: "test" }, content: [] },
          },
        ])
        .run()
      yield* db
        .insert(SessionPartTable)
        .values({
          message_id: reply,
          session_id: assistantOnly.id,
          ordinal: 0,
          type: "text",
          data: { type: "text", text: "ВЫРУЧКУ [2026]? Выручка [2026]?" },
        })
        .run()

      const first = yield* sessions.list({ search: "выручку [2026]?", searchField: "prompt", limit: 1 })
      const next = yield* sessions.list({ cursor: first.cursor.next, limit: 1 })
      const end = yield* sessions.list({ cursor: next.cursor.next, limit: 1 })
      const titles = yield* sessions.list({ search: "выручка [2026]?", searchField: "title" })
      const short = yield* sessions.list({ search: "вы", searchField: "prompt" })

      expect([...first.data, ...next.data].map((session) => session.id).toSorted()).toEqual(
        [userMatch.id, nextMatch.id].toSorted(),
      )
      expect(end.data).toEqual([])
      expect(titles.data.map((session) => session.id)).toEqual([titleOnly.id])
      expect(short.data).toEqual([])
    }),
  )

  it.effect("finds conversations by the project label, falling back to the folder name", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const item = yield* sessions.create({ location: project, title: "Untitled" })
      const { db } = yield* Database.Service
      const setName = (name: string | null) =>
        db
          .update(ProjectTable)
          .set({ name, worktree: AbsolutePath.make('/parent/Папка "отчётов"') })
          .where(eq(ProjectTable.id, item.projectID))
          .run()
      const find = (search: string) => sessions.list({ search, searchField: "project" })

      yield* setName("Продажи")
      expect((yield* find("продажи")).data.map((session) => session.id)).toEqual([item.id])
      expect((yield* find("отчётов")).data).toEqual([])
      yield* setName(null)
      expect((yield* find('папка "отчётов"')).data.map((session) => session.id)).toEqual([item.id])
      expect((yield* find("parent")).data).toEqual([])
    }),
  )

  it.effect("does not match parent folders of a persisted Windows project path", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const item = yield* sessions.create({ location: project, title: "Untitled" })
      const { db } = yield* Database.Service
      const worktree = "C:\\Work\\Loginom\\Documents\\Витрина\\"
      yield* db.run(sql`update ${ProjectTable} set worktree = ${worktree} where ${ProjectTable.id} = ${item.projectID}`)

      const find = (search: string) => sessions.list({ search, searchField: "project" })
      expect((yield* find("витрина")).data.map((session) => session.id)).toEqual([item.id])
      expect((yield* find("documents")).data).toEqual([])
      expect((yield* find("loginom")).data).toEqual([])
    }),
  )

  it.effect("rejects an invalid cursor", () =>
    Effect.gen(function* () {
      const session = yield* Session.Service
      const error = yield* session.list({ cursor: Schema.decodeSync(Session.ListCursor)("invalid") }).pipe(Effect.flip)

      expect(error).toBeInstanceOf(Session.InvalidListCursorError)
    }),
  )
})
