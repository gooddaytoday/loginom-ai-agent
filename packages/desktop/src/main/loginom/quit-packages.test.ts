import { expect, test } from "bun:test"
import { confirmPackageQuit } from "./quit-packages"

const path = "/alice/package.lgp"

const conversation = (modified: boolean | null) => ({
  sessionID: "ses_chat",
  directory: "/project",
  state: { open: true, path, modified },
})

test.each([
  { name: "clean", modified: false, decision: "cancel", output: null, allow: true, requests: ["active"], dialogs: [] },
  {
    name: "cancel",
    modified: true,
    decision: "cancel",
    output: null,
    allow: false,
    requests: ["active"],
    dialogs: ["unsaved"],
  },
  {
    name: "discard",
    modified: true,
    decision: "discard",
    output: { status: "closed" },
    allow: true,
    requests: ["active", "close"],
    dialogs: ["unsaved"],
  },
  {
    name: "unconfirmed Discard",
    modified: true,
    decision: "discard",
    output: { status: "blocked" },
    allow: false,
    requests: ["active", "close"],
    dialogs: ["unsaved", "discard failed"],
  },
  {
    name: "unknown package has no Save choice",
    modified: null,
    decision: "cancel",
    output: null,
    allow: false,
    requests: ["active"],
    dialogs: ["unknown"],
  },
  {
    name: "confirmed Save",
    modified: true,
    decision: "save",
    output: { status: "saved", lastSave: { path, confirmedAt: 101 } },
    allow: true,
    requests: ["active", "save", "active"],
    dialogs: ["unsaved"],
  },
  {
    name: "unconfirmed Save",
    modified: true,
    decision: "save",
    output: { status: "saved" },
    allow: false,
    requests: ["active", "save"],
    dialogs: ["unsaved", "save failed"],
  },
] as const)("Desktop exit: $name", async (row) => {
  const requests: string[] = []
  const dialogs: string[] = []

  const allow = await confirmPackageQuit({
    rpc: {
      call: async (request) => {
        requests.push(request.method)

        if (request.method === "active") return { output: [conversation(requests.length === 1 ? row.modified : false)] }

        const target = { sessionID: "ses_chat", path }
        expect(request.location).toEqual({ directory: "/project" })
        expect(request.input).toEqual(request.method === "close" ? { ...target, decision: "discard" } : target)

        return { output: row.output }
      },
    },
    ask: async (kind, choices) => {
      dialogs.push(kind)
      expect(choices).toEqual(kind === "unknown" ? ["discard", "cancel"] : ["save", "discard", "cancel"])

      return row.decision
    },
    failed: async (decision) => {
      dialogs.push(`${decision} failed`)
    },
  })

  expect(allow).toBe(row.allow)
  expect(requests).toEqual(row.requests)
  expect(dialogs).toEqual(row.dialogs)
})
