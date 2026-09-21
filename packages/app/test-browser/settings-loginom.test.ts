import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import type { Loginom } from "@loginom-ai-agent/schema/loginom"
import { createLoginomSettings, watchLoginomApplication } from "../src/components/settings-loginom-state"

function setup(initial: Partial<Loginom.View> = {}) {
  let view: Loginom.View = {
    revision: 1,
    generation: 1,
    url: "http://loginom.test/app/",
    username: "user",
    folder: "/user",
    hasApiKey: true,
    hasPassword: false,
    state: "ready",
    ...initial,
  }
  const checks: Loginom.Candidate[] = []
  const saves: Array<{ revision: number; validationId: string }> = []
  const closed: Loginom.View[] = []
  const api: Loginom.API = {
    read: async () => ({ ...view }),
    status: async () => ({ ...view }),
    check: async (candidate) => {
      checks.push(candidate)
      return { validationId: "checked", expiresAt: Date.now() + 10000 }
    },
    save: async (input) => {
      saves.push(input)
      view = { ...view, revision: view.revision + 1, generation: view.generation + 1 }
      return { ...view }
    },
    cancelPending: async () => ({ ...view, state: "ready" }),
    acknowledgeRecovery: async () => ({ ...view, state: "ready" }),
  }
  const root = createRoot((dispose) => ({
    dispose,
    form: createLoginomSettings(
      api,
      (current) => closed.push(current),
      async () => {},
    ),
  }))
  return {
    ...root,
    api,
    checks,
    saves,
    closed,
    update: (next: Partial<Loginom.View>) => {
      view = { ...view, ...next }
    },
  }
}

describe("Loginom settings", () => {
  test("recovery sends cloneable IDs across the Desktop bridge", async () => {
    const ids = ["11111111-1111-4111-8111-111111111111"]
    const f = setup({ state: "recoverable-error", recoveries: [...ids] })
    const acknowledged: Array<{ revision: number; ids: readonly string[] }> = []
    f.api.acknowledgeRecovery = async (input) => {
      acknowledged.push(structuredClone(input))
      f.update({ state: "ready", recoveries: [] })
      return f.api.read()
    }
    try {
      await f.form.load()
      await f.form.recover()
      expect(acknowledged).toEqual([{ revision: 1, ids }])
      expect(f.form.state.failed).toBe(false)
      expect(f.form.state.view?.state).toBe("ready")
      expect(f.form.state.view?.recoveries).toEqual([])
    } finally {
      f.dispose()
    }
  })
  test("saved settings awaiting recovery keep the recovery notice without a server failure", async () => {
    const ids = ["11111111-1111-4111-8111-111111111111"]
    const f = setup({ state: "recoverable-error", recoveries: ids })
    try {
      await f.form.load()
      f.form.edit({ apiKey: "replacement" })
      await f.form.submit(true)
      expect(f.saves).toHaveLength(1)
      expect(f.closed).toHaveLength(0)
      expect(f.form.state.failed).toBe(false)
      expect(f.form.state.message).toBeUndefined()
      expect(f.form.state.view?.recoveries).toEqual(ids)
      expect(f.form.state.baseline?.revision).toBe(2)
      expect(f.form.state.apiKey).toBe("replacement")
    } finally {
      f.dispose()
    }
  })
  test("opening and reverting edits can close without confirmation or writes", async () => {
    const f = setup()
    try {
      await f.form.load()
      expect(f.form.state.apiKey).toBe("")
      expect(f.form.requestClose()).toBe(true)
      f.form.edit({ username: "changed" })
      expect(f.form.requestClose()).toBe(false)
      expect(f.form.state.confirmClose).toBe(true)
      f.form.continueEditing()
      expect(f.form.state.username).toBe("changed")
      f.form.edit({ username: "user" })
      expect(f.form.dirty()).toBe(false)
      expect(f.form.requestClose()).toBe(true)
      expect(f.saves).toHaveLength(0)
    } finally {
      f.dispose()
    }
  })
  test("check uses all draft values without saving or closing; edits clear its result", async () => {
    const f = setup()
    try {
      await f.form.load()
      f.form.edit({
        apiKey: "new-test-key",
        url: "http://other.test/",
        username: "other",
        password: "new-test-password",
        passwordMode: "replace",
      })
      await f.form.submit(false)
      expect(f.checks[0]).toEqual({
        revision: 1,
        url: "http://other.test/",
        username: "other",
        apiKey: { operation: "replace", value: "new-test-key" },
        password: { operation: "replace", value: "new-test-password" },
      })
      expect(f.form.state.message).toBe("loginom.checked")
      expect(f.form.state.apiKey).toBe("new-test-key")
      expect(f.saves).toHaveLength(0)
      expect(f.closed).toHaveLength(0)
      f.form.edit({ username: "another" })
      expect(f.form.state.message).toBeUndefined()
    } finally {
      f.dispose()
    }
  })
  test("unchanged secrets are preserved, never replaced by the visual mask", async () => {
    const f = setup({ hasPassword: true })
    try {
      await f.form.load()
      await f.form.submit(false)
      expect(f.form.state.message).toBe("loginom.checkedSaved")
      expect(f.checks[0].apiKey).toEqual({ operation: "preserve" })
      expect(f.checks[0].password).toEqual({ operation: "preserve" })
      await f.form.submit(true)
      expect(f.saves).toHaveLength(0)
    } finally {
      f.dispose()
    }
  })
  test("save validates automatically, clears the draft and allows close", async () => {
    const f = setup()
    try {
      await f.form.load()
      f.form.edit({ apiKey: "replacement" })
      await f.form.submit(true)
      expect(f.checks).toHaveLength(1)
      expect(f.saves).toEqual([{ revision: 1, validationId: "checked" }])
      expect(f.closed).toHaveLength(1)
      expect(f.form.state.apiKey).toBe("")
      expect(f.form.dirty()).toBe(false)
      expect(f.form.requestClose()).toBe(true)
    } finally {
      f.dispose()
    }
  })
  test("rejected key keeps the form and draft; no persistence takes place", async () => {
    const f = setup()
    try {
      await f.form.load()
      f.api.check = async () => {
        throw Error("LOGINOM_KNOWLEDGE_AUTH_FAILED")
      }
      f.form.edit({ apiKey: "incorrect" })
      await f.form.submit(true)
      expect(f.form.state.message).toBe("loginom.invalidKey")
      expect(f.form.state.apiKey).toBe("incorrect")
      expect(f.saves).toHaveLength(0)
      expect(f.closed).toHaveLength(0)
    } finally {
      f.dispose()
    }
  })
  test("storage failure does not close the form or clear the entered key", async () => {
    const f = setup()
    try {
      await f.form.load()
      f.api.save = async () => {
        throw Error("LOGINOM_STORE_WRITE_FAILED")
      }
      f.form.edit({ apiKey: "replacement" })
      await f.form.submit(true)
      expect(f.closed).toHaveLength(0)
      expect(f.form.state.failed).toBe(true)
      expect(f.form.state.apiKey).toBe("replacement")
    } finally {
      f.dispose()
    }
  })
  test("cannot close or submit again during a check", async () => {
    const f = setup()
    try {
      await f.form.load()
      const checking = Promise.withResolvers<{ validationId: string; expiresAt: number }>()
      let calls = 0
      f.api.check = () => {
        calls++
        return checking.promise
      }
      f.form.edit({ apiKey: "replacement" })
      const save = f.form.submit(true)
      expect(f.form.requestClose()).toBe(false)
      await f.form.submit(true)
      expect(calls).toBe(1)
      checking.resolve({ validationId: "checked", expiresAt: Date.now() + 10000 })
      await save
      expect(f.closed).toHaveLength(1)
    } finally {
      f.dispose()
    }
  })
  test("waits for immediate activation and reports failure without closing", async () => {
    const f = setup()
    try {
      await f.form.load()
      const current = await f.api.read()
      f.api.save = async () => ({ ...current, state: "starting", revision: 2 })
      f.api.status = async () => ({ ...current, revision: 2, failure: "LOGINOM_RUNTIME_START_FAILED" })
      f.form.edit({ apiKey: "replacement" })
      await f.form.submit(true)
      expect(f.closed).toHaveLength(0)
      expect(f.form.state.failed).toBe(true)
      expect(f.form.state.baseline?.revision).toBe(2)
      expect(f.form.state.apiKey).toBe("replacement")
    } finally {
      f.dispose()
    }
  })
  test("pending save closes with a distinct pending result", async () => {
    const f = setup()
    try {
      await f.form.load()
      const current = await f.api.read()
      f.api.save = async () => ({ ...current, state: "pending", revision: 2 })
      f.form.edit({ apiKey: "replacement" })
      await f.form.submit(true)
      expect(f.closed[0].state).toBe("pending")
      expect(f.form.requestClose()).toBe(true)
    } finally {
      f.dispose()
    }
  })
  test("status refresh preserves a dirty draft and its original revision", async () => {
    const f = setup()
    try {
      await f.form.load()
      f.form.edit({ apiKey: "replacement", username: "draft" })
      f.update({ revision: 2, generation: 2, username: "external", failure: "LOGINOM_RUNTIME_START_FAILED" })
      await f.form.refresh()
      expect(f.form.state.username).toBe("draft")
      expect(f.form.state.apiKey).toBe("replacement")
      expect(f.form.state.baseline?.revision).toBe(1)
      expect(f.form.state.view?.revision).toBe(2)
      f.form.discard()
      expect(f.form.requestClose()).toBe(true)
    } finally {
      f.dispose()
    }
  })
  test("deferred failure is observable after the settings controller is disposed", async () => {
    const f = setup({ state: "pending", revision: 2 })
    const saved = await f.api.read()
    f.dispose()
    f.update({ state: "ready", failure: "LOGINOM_RUNTIME_START_FAILED" })
    const results: string[] = []
    await watchLoginomApplication(
      f.api,
      saved,
      (result) => results.push(result),
      async () => {},
    )
    expect(results).toEqual(["failed"])
  })
  test("deferred success requires the new generation; cancellation retires the notification", async () => {
    const f = setup({ state: "pending", revision: 2 })
    try {
      const saved = await f.api.read()
      const results: string[] = []
      f.update({ state: "ready", generation: 2 })
      await watchLoginomApplication(
        f.api,
        saved,
        (result) => results.push(result),
        async () => {},
      )
      f.update({ revision: 3 })
      await watchLoginomApplication(
        f.api,
        saved,
        (result) => results.push(result),
        async () => {},
      )
      expect(results).toEqual(["ready", "superseded"])
    } finally {
      f.dispose()
    }
  })
})
