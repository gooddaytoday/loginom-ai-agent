import type { Page } from "@playwright/test"
import type { OpenCodeEvent } from "@opencode/client/promise"
import type { Schema } from "effect"
import { pageMessagesFrom, seed, T0, sessionHref } from "./app"
import { fixture, mockStressTimeline } from "./session-fixture"

const path = "C:/Samples/Продажи.lgp"

const currentWindow = {
  windowID: "loginom-sales",
  sessionID: fixture.targetID,
  sessionTitle: "Продажи по регионам",
  packageName: "Продажи.lgp",
  path,
  state: "open",
  modified: true,
  readOnly: false,
  busy: false,
  openedAt: T0,
}

const otherWindow = {
  ...currentWindow,
  windowID: "loginom-other-sales",
  sessionID: fixture.sourceID,
  sessionTitle: "Проверка импорта",
  state: "minimized",
  modified: false,
}

export async function openLoginomWindowFixture(page: Page, messageCount = 1) {
  let modified = true
  let lastSave: { path: string; confirmedAt: number } | null = null
  let modifiedDetectedAt: number | null = T0
  let windows = [currentWindow, otherWindow]
  let sequence = 0
  const focusRequests: unknown[] = []
  await seed(page, { locale: "ru", theme: { id: "oc-2", scheme: "light" } })

  const server = await mockStressTimeline(page, {
    sessions: fixture.sessions.map((session) => ({
      ...session,
      title: session.id === currentWindow.sessionID ? currentWindow.sessionTitle : session.title,
    })),
    provider: {
      all: [{ id: "test", name: "Test", models: { local: { id: "local", name: "Local" } } }],
      connected: ["test"],
      default: { providerID: "test", modelID: "local" },
    },
    pageMessages: pageMessagesFrom({
      [fixture.targetID]: Array.from({ length: messageCount }, (_, index) => ({
        id: `msg_loginom_${String(index).padStart(2, "0")}`,
        type: "user",
        time: { created: T0 + index },
        text: messageCount === 1 ? "Соберём отчёт по продажам." : `Обсуждение отчёта, шаг ${index + 1}.`,
      })),
    }),
    onRpc({ id, method, input }): Schema.Json | undefined {
      if (id === "loginom.package-state" && method === "snapshot")
        return { open: true, path, modified, modifiedDetectedAt, lastSave }

      if (id === "loginom.windows" && method === "list") return { windows }

      if (id === "loginom.window" && method === "show") {
        focusRequests.push(input)

        return "focus-unconfirmed"
      }
    },
  })

  await page.goto(sessionHref(fixture.targetID))

  const push = (type: `rpc.${string}`, data: Record<string, string>) =>
    server.push([
      {
        type,
        id: `evt_loginom_${++sequence}`,
        created: T0 + sequence,
        location: { directory: fixture.directory },
        data,
      } satisfies OpenCodeEvent,
    ])

  return {
    focusRequests,
    async save() {
      modified = false
      modifiedDetectedAt = null
      lastSave = { path, confirmedAt: T0 + 1 }
      windows = [{ ...currentWindow, modified }, otherWindow]
      await push("rpc.loginom.package-state.changed", { sessionID: fixture.targetID })
    },
    async setReadOnlyAndBusy() {
      windows = [{ ...currentWindow, modified, readOnly: true, busy: true }, otherWindow]
      await push("rpc.loginom.windows.changed", {})
    },
    async finishAndCloseOther() {
      windows = [{ ...currentWindow, modified, readOnly: true }]
      await push("rpc.loginom.windows.changed", {})
    },
  }
}
