import { expect, test } from "bun:test"
import { dict as en } from "@/i18n/en"
import { dict as ru } from "@/i18n/ru"
import {
  activeDiagnosticsSession,
  DIAGNOSTICS_DEFAULTS,
  publishDiagnosticsSession,
  summarizeDiagnostics,
} from "./diagnostics"

test("owner defaults: chat on, crash dump off", () => {
  expect(DIAGNOSTICS_DEFAULTS).toEqual({ chat: true, runtime: true, logs: true, dumps: false })
})

test("the open chat is published until its page leaves, without clearing a newer chat", () => {
  const first = { sessionID: "ses_a", chat: async () => ({}) }
  const second = { sessionID: "ses_b", chat: async () => ({}) }
  const leaveFirst = publishDiagnosticsSession(first)
  expect(activeDiagnosticsSession()).toBe(first)
  const leaveSecond = publishDiagnosticsSession(second)
  leaveFirst()
  expect(activeDiagnosticsSession()).toBe(second)
  leaveSecond()
  expect(activeDiagnosticsSession()).toBeUndefined()
})

test("groups summarize included files, sizes and skipped files", () => {
  expect(
    summarizeDiagnostics([
      { name: "chat/session.json", group: "chat", status: "included", size: 10 },
      { name: "runtime/a.jsonl", group: "runtime", status: "included", size: 5 },
      { name: "runtime/b.jsonl", group: "runtime", status: "omitted", reason: "archive-budget" },
      { name: "crashpad/a.dmp", group: "dumps", status: "omitted", reason: "unreadable-or-not-redactable" },
    ]),
  ).toEqual([
    { group: "chat", included: 1, omitted: 0, bytes: 10 },
    { group: "runtime", included: 1, omitted: 1, bytes: 5 },
    { group: "logs", included: 0, omitted: 0, bytes: 0 },
    { group: "dumps", included: 0, omitted: 1, bytes: 0 },
  ])
})

test("the Help menu item reads «Собрать диагностику…»", () => {
  expect(ru["desktop.menu.exportLogs"]).toBe("Собрать диагностику…")
  expect(ru["command.logs.export"]).toBe("Собрать диагностику…")
  expect(en["command.logs.export"]).toBe("Collect diagnostics…")
})
