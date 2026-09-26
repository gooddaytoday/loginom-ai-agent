import { beforeEach, expect, mock, test } from "bun:test"
import type { IpcMainInvokeEvent } from "electron"
import type { Loginom } from "@loginom-ai-agent/schema/loginom"

const handlers = new Map<string, (event: IpcMainInvokeEvent, value?: unknown) => unknown>()
const window = { isDestroyed: () => false }
mock.module("electron", () => ({
  app: { isPackaged: true },
  BrowserWindow: { fromWebContents: () => window },
  ipcMain: {
    handle: (name: string, handler: (event: IpcMainInvokeEvent, value?: unknown) => unknown) =>
      handlers.set(name, handler),
  },
}))
const { registerLoginomIpc } = await import("./ipc")
const calls: unknown[] = []
const binding: Loginom.SessionCompletionBinding = {
  attemptId: "trusted-attempt",
  generation: 1,
  chat: "a".repeat(64),
  sessionId: "observed-session",
  documentId: "own-document",
  account: "own-user",
  packagePath: "/own-user/result.lgp",
  saveOperationId: "save-1",
  mutationRevision: 2,
}
const receipt: Loginom.SessionCompletionReceipt = {
  version: 1,
  completionId: "completion-1",
  binding,
  status: "SUCCEEDED",
  packageClosed: true,
  loggedOut: true,
  reason: null,
}
const api: Loginom.API = {
  async read() {
    throw Error("unused")
  },
  async status() {
    throw Error("unused")
  },
  async check() {
    throw Error("unused")
  },
  async save() {
    throw Error("unused")
  },
  async cancelPending() {
    throw Error("unused")
  },
  async acknowledgeRecovery() {
    throw Error("unused")
  },
}
beforeEach(() => {
  handlers.clear()
  calls.length = 0
  registerLoginomIpc(api, {
    async sessionCompletionOptions(input) {
      calls.push(input)
      return binding
    },
    async finishOwnSession(input) {
      calls.push(input)
      return receipt
    },
  })
})
function event(url = "loginom-ai-agent-app://renderer/index.html", nested = false) {
  const frame = { url }
  return { sender: { mainFrame: frame }, senderFrame: nested ? { url } : frame } as unknown as IpcMainInvokeEvent
}

test("private session completion IPC forwards validated binding for the trusted top-level renderer", async () => {
  const target = { generation: 1, chat: binding.chat }
  expect(await handlers.get("loginom-session-completion-options")!(event(), target)).toEqual(binding)
  const request = { completionId: receipt.completionId, binding }
  expect(await handlers.get("loginom-finish-own-session")!(event(), request)).toEqual(receipt)
  expect(calls).toEqual([target, request])
  expect([...handlers.keys()].some((name) => name.includes("registration"))).toBe(false)
})

for (const target of [event("https://foreign.invalid"), event(undefined, true)])
  test("foreign and child frames cannot call completion IPC", () => {
    for (const method of ["loginom-session-completion-options", "loginom-finish-own-session"])
      expect(() => handlers.get(method)!(target, { completionId: receipt.completionId, binding })).toThrow(
        "LOGINOM_SENDER_INVALID",
      )
    expect(calls).toEqual([])
  })

test("malformed completion IPC cannot reach the privileged Host", () => {
  expect(() =>
    handlers.get("loginom-session-completion-options")!(event(), { generation: -1, chat: binding.chat }),
  ).toThrow("LOGINOM_SESSION_BINDING_INVALID")
  expect(() =>
    handlers.get("loginom-finish-own-session")!(event(), {
      completionId: "x",
      binding: { ...binding, saveOperationId: "" },
    }),
  ).toThrow("LOGINOM_SESSION_BINDING_INVALID")
  expect(calls).toEqual([])
})
