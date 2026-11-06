import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { Product } from "@loginom-ai-agent/product"
import type { Loginom } from "@opencode-ai/schema/loginom"
import {
  createLoginomSettings,
  loginomBrowserMessage,
  watchLoginomApplication,
} from "../src/components/settings-loginom-state"

function setup(initial: Partial<Loginom.View> = {}) {
  let view: Loginom.View = {
    mode: "custom",
    endpoint: "http://loginom.test/mcp",
    hasApiKey: true,
    server: "custom",
    help: { state: "ready" },
    cloud: { connected: false },
    revision: 1,
    generation: 1,
    url: "http://loginom.test/app/",
    username: "user",
    folder: "/user",
    hasPassword: false,
    state: "ready",
    ...initial,
  }
  const checks: Loginom.Check[] = []
  const saves: Array<{ revision: number; validationId: string }> = []
  const closed: Loginom.View[] = []
  const api: Loginom.API = {
    cloudStart: async () => ({ ...view }),
    cloudCancel: async () => ({ ...view }),
    cloudDisconnect: async () => ({ ...view }),
    read: async () => ({ ...view }),
    status: async () => ({ ...view }),
    check: async (candidate) => {
      checks.push(candidate)
      return { help: { state: "ready" }, validationId: "checked", expiresAt: Date.now() + 10000 }
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
  test("Connect opens the full pending login URL exactly once", async () => {
    const f = setup({ mode: "cloud" })
    const opened: string[] = []
    const pending = { userCode: "TEST", verificationUrl: "https://loginom.ai/device?user_code=TEST", expiresAt: Date.now() + 60_000 }
    f.api.cloudStart = async () => ({ ...(await f.api.read()), cloud: { connected: false, pending } })
    try {
      await f.form.load()
      await f.form.connect((url) => { opened.push(url) })
      await f.form.connect((url) => { opened.push(url) })
      expect(opened).toEqual([pending.verificationUrl])
      expect(f.form.state.view?.cloud.pending).toEqual(pending)
    } finally { f.dispose() }
  })
  test("an unavailable opener preserves manual login and status polling", async () => {
    for (const asynchronous of [false, true]) {
      const f = setup({ mode: "cloud" })
      const pending = { userCode: "TEST", verificationUrl: "https://loginom.ai/device?user_code=TEST", expiresAt: 42 }
      f.api.cloudStart = async () => ({ ...(await f.api.read()), cloud: { connected: false, pending } })
      try {
        await f.form.load()
        await f.form.connect(() => {
          if (asynchronous) return Promise.reject(Error("opener unavailable"))
          throw Error("opener unavailable")
        })
        expect(f.form.state.view?.cloud.pending).toEqual(pending)
        expect(f.form.state.cloudBusy).toBe(false)
        f.update({ cloud: { connected: true } })
        await f.form.refresh()
        expect(f.form.state.view?.cloud.connected).toBe(true)
        expect(f.form.state.failed).toBe(false)
      } finally { f.dispose() }
    }
  })
  test("cancelled or disposed cloud starts never open their late login URL", async () => {
    for (const dispose of [false, true]) {
      const f = setup({ mode: "cloud" })
      const start = Promise.withResolvers<Loginom.View>()
      const opened: string[] = []
      f.api.cloudStart = () => start.promise
      await f.form.load()
      const previous = await f.api.read()
      const connecting = f.form.connect((url) => { opened.push(url) })
      if (dispose) f.dispose()
      else await f.form.cancelLogin()
      start.resolve({ ...previous, cloud: { connected: false,
        pending: { userCode: "OLD", verificationUrl: "https://loginom.ai/device?user_code=OLD", expiresAt: 42 } } })
      await connecting
      expect(opened).toEqual([])
      expect(f.form.state.view?.cloud.pending).toBeUndefined()
      if (!dispose) f.dispose()
    }
  })
  test("cloud settings save before sign-in without browser verification", async () => {
    const f = setup({ state: "connection-required", mode: "cloud", help: { state: "connection-required" } })
    try {
      await f.form.load()
      f.form.edit({ username: "other" })
      await f.form.submit(true)
      expect(f.checks[0]).toMatchObject({ mode: "cloud", verifyBrowser: false })
      expect(f.saves).toHaveLength(1)
      expect(f.closed[0].state).toBe("connection-required")
      expect(f.form.state.failed).toBe(false)
    } finally {
      f.dispose()
    }
  })
  test("deferred cloud activation stops when a connection is required", async () => {
    const f = setup({ state: "pending", revision: 2 })
    try {
      const saved = await f.api.read()
      f.update({ state: "connection-required", help: { state: "connection-required" } })
      const results: string[] = []
      const status = f.api.status
      let calls = 0
      f.api.status = () => (++calls > 1 ? Promise.reject(Error("unexpected polling")) : status())
      await watchLoginomApplication(
        f.api,
        saved,
        (result) => results.push(result),
        async () => {
          if (results.length > 0) throw Error("unexpected polling")
        },
      )
      expect(results).toEqual(["connection-required"])
    } finally {
      f.dispose()
    }
  })
  test("cloud sign-in is durable without applying the draft or its revision", async () => {
    const f = setup({ mode: "cloud" })
    f.api.cloudStart = async () => ({
      ...(await f.api.read()),
      revision: 2,
      cloud: { connected: true, email: "account@test.invalid" },
    })
    try {
      await f.form.load()
      f.form.edit({ username: "draft", password: "private", passwordMode: "replace" })
      await f.form.connect(() => {})
      expect(f.form.state.view?.cloud.email).toBe("account@test.invalid")
      expect(f.form.state.username).toBe("draft")
      expect(f.form.state.password).toBe("private")
      expect(f.form.state.baseline?.revision).toBe(1)
      expect(f.saves).toHaveLength(0)
      f.form.discard()
      expect(f.form.state.view?.cloud.connected).toBe(true)
    } finally {
      f.dispose()
    }
  })
  test("pending sign-in is cancelled only after accepted dirty close and stale status cannot restore it", async () => {
    const f = setup({
      cloud: {
        connected: false,
        pending: { userCode: "TEST", verificationUrl: "https://loginom.ai/device", expiresAt: 42 },
      },
    })
    let cancelled = 0
    f.api.cloudCancel = async () => {
      cancelled++
      return { ...(await f.api.read()), cloud: { connected: false } }
    }
    try {
      await f.form.load()
      const stale = Promise.withResolvers<Loginom.View>()
      const previous = await f.api.read()
      f.api.status = () => stale.promise
      const refresh = f.form.refresh()
      f.form.edit({ username: "draft" })
      expect(f.form.requestClose()).toBe(false)
      expect(cancelled).toBe(0)
      f.form.discard()
      expect(f.form.requestClose()).toBe(true)
      await Promise.resolve()
      await Promise.resolve()
      expect(cancelled).toBe(1)
      stale.resolve(previous)
      await refresh
      expect(f.form.state.view?.cloud.pending).toBeUndefined()
    } finally {
      f.dispose()
    }
  })
  test("closing during cloud start cancels it and disposal ignores late completion", async () => {
    const f = setup()
    const start = Promise.withResolvers<Loginom.View>()
    let cancellations = 0
    f.api.cloudStart = () => start.promise
    f.api.cloudCancel = async () => {
      cancellations++
      return f.api.read()
    }
    await f.form.load()
    const previous = await f.api.read()
    const connecting = f.form.connect(() => {})
    expect(f.form.busy()).toBe(false)
    expect(f.form.requestClose()).toBe(true)
    f.dispose()
    start.resolve({ ...previous, cloud: { connected: true } })
    await connecting
    expect(cancellations).toBe(1)
    expect(f.form.state.view?.cloud.connected).toBe(false)
  })
  test("logout is durable through discard and stale status", async () => {
    const f = setup({ cloud: { connected: true, email: "account@test.invalid" } })
    f.api.cloudDisconnect = async () => ({
      ...(await f.api.read()),
      cloud: { connected: false, failure: "LOGINOM_CLOUD_REVOKE_UNCONFIRMED" },
    })
    try {
      await f.form.load()
      const stale = Promise.withResolvers<Loginom.View>()
      const previous = await f.api.read()
      f.api.status = () => stale.promise
      const refresh = f.form.refresh()
      await f.form.disconnect()
      stale.resolve(previous)
      await refresh
      f.form.discard()
      expect(f.form.state.view?.cloud.connected).toBe(false)
      expect(f.form.state.view?.cloud.failure).toBe("LOGINOM_CLOUD_REVOKE_UNCONFIRMED")
      expect(f.saves).toHaveLength(0)
    } finally {
      f.dispose()
    }
  })
  test("mode changes preserve custom draft credentials and explicit checks always verify the browser", async () => {
    const f = setup()
    let starts = 0
    f.api.cloudStart = async () => {
      starts++
      return f.api.read()
    }
    try {
      await f.form.load()
      f.form.edit({ mode: "cloud" })
      expect(f.form.dirty()).toBe(true)
      f.form.edit({ mode: "custom" })
      expect(f.form.dirty()).toBe(false)
      f.form.edit({ endpoint: "https://custom.test/mcp", apiKey: "private-key", apiKeyMode: "replace" })
      f.form.edit({ mode: "cloud" })
      await f.form.submit(false)
      expect(f.checks[0]).toMatchObject({
        mode: "cloud",
        verifyBrowser: true,
        endpoint: "https://custom.test/mcp",
        apiKey: { operation: "replace", value: "private-key" },
      })
      f.form.edit({ mode: "custom" })
      expect(f.form.state.apiKey).toBe("private-key")
      expect(f.form.dirty()).toBe(true)
      expect(starts).toBe(0)
      f.dispose()
      expect(f.form.state.apiKey).toBe("")
    } finally {
      f.dispose()
    }
  })
  test("browser verification does not claim Help is ready", async () => {
    const f = setup({ help: { state: "connection-required" } })
    f.api.check = async () => ({
      validationId: "checked",
      expiresAt: 42,
      browser: { state: "verified" },
      help: { state: "connection-required" },
    })
    try {
      await f.form.load()
      await f.form.submit(false)
      expect(f.form.state.checkedHelp?.state).toBe("connection-required")
      expect(f.form.state.checkedBrowser?.state).toBe("verified")
      f.form.edit({ username: "draft" })
      expect(f.form.state.checkedHelp).toBeUndefined()
    } finally {
      f.dispose()
    }
  })
  test("accepted close and cleanup cancel a pending login once", async () => {
    const f = setup({
      cloud: {
        connected: false,
        pending: { userCode: "TEST", verificationUrl: "https://loginom.ai/device", expiresAt: 42 },
      },
    })
    const cancel = Promise.withResolvers<Loginom.View>()
    let calls = 0
    f.api.cloudCancel = () => {
      calls++
      return cancel.promise
    }
    await f.form.load()
    const previous = await f.api.read()
    expect(f.form.requestClose()).toBe(true)
    f.dispose()
    expect(calls).toBe(1)
    cancel.resolve({ ...previous, cloud: { connected: false } })
    await Promise.resolve()
    expect(f.form.state.password).toBe("")
  })
  test("cloud status retires a previous Help result while preserving browser verification", async () => {
    const f = setup({ mode: "cloud", help: { state: "connection-required" } })
    f.api.check = async () => ({
      help: { state: "connection-required" },
      browser: { state: "verified" },
      validationId: "checked",
      expiresAt: 42,
    })
    try {
      await f.form.load()
      await f.form.submit(false)
      f.update({ cloud: { connected: true }, help: { state: "ready" } })
      await f.form.refresh()
      expect((f.form.state.checkedHelp ?? f.form.state.view?.help)?.state).toBe("ready")
      expect(f.form.state.checkedBrowser?.state).toBe("verified")
    } finally {
      f.dispose()
    }
  })
  test("a stale status failure cannot replace successful disconnect feedback", async () => {
    const f = setup({ cloud: { connected: true } })
    const status = Promise.withResolvers<Loginom.View>()
    f.api.status = () => status.promise
    f.api.cloudDisconnect = async () => ({ ...(await f.api.read()), cloud: { connected: false } })
    try {
      await f.form.load()
      const refresh = f.form.refresh()
      await f.form.disconnect()
      status.reject(Error("LOGINOM_STATUS_UNAVAILABLE"))
      await refresh
      expect(f.form.state.failed).toBe(false)
      expect(f.form.state.view?.cloud.connected).toBe(false)
    } finally {
      f.dispose()
    }
  })
  test("refresh during disconnect cannot restore stale state, errors or lose the revoke warning", async () => {
    for (const result of ["connected", "error", "missing-revocation"]) {
      const f = setup({ cloud: { connected: true } })
      const original = structuredClone(await f.api.read())
      const disconnect = Promise.withResolvers<Loginom.View>()
      const status = Promise.withResolvers<Loginom.View>()
      void status.promise.catch(() => {})
      let reads = 0
      f.api.cloudDisconnect = () => disconnect.promise
      f.api.status = () => {
        reads++
        return status.promise
      }
      try {
        await f.form.load()
        const disconnecting = f.form.disconnect()
        const refreshing = f.form.refresh()
        disconnect.resolve({ ...original, cloud: { connected: false, failure: "LOGINOM_CLOUD_REVOKE_UNCONFIRMED" } })
        await disconnecting
        if (result === "error") status.reject(Error("LOGINOM_STATUS_UNAVAILABLE"))
        if (result !== "error") status.resolve({ ...original, cloud: { connected: result === "connected" } })
        await refreshing
        expect(f.form.state.view?.cloud.connected).toBe(false)
        expect(f.form.state.view?.cloud.failure).toBe("LOGINOM_CLOUD_REVOKE_UNCONFIRMED")
        expect(f.form.state.failed).toBe(false)
        expect(reads).toBe(0)
      } finally {
        f.dispose()
      }
    }
  })
  test("explicit browser checks before cloud sign-in never claim Help success", async () => {
    for (const browser of [
      { state: "verified" as const },
      { state: "failed" as const, failure: "LOGINOM_LOGIN_REJECTED" as const },
    ]) {
      const f = setup({ mode: "cloud", state: "connection-required", help: { state: "connection-required" } })
      f.api.check = async (candidate) => {
        f.checks.push(candidate)
        return { help: { state: "connection-required" }, browser, validationId: "checked", expiresAt: 42 }
      }
      try {
        await f.form.load()
        await f.form.submit(false)
        expect(f.checks[0].verifyBrowser).toBe(true)
        expect(f.form.state.message).toBe("loginom.ai.required")
        expect(f.form.state.checkedHelp?.state).toBe("connection-required")
        expect(f.form.state.checkedBrowser).toEqual(browser)
        expect(f.form.state.failed).toBe(false)
        expect(f.saves).toHaveLength(0)
      } finally {
        f.dispose()
      }
    }
  })
  test("browser status messages distinguish unchecked sign-in and keep account warnings compatible with saving", () => {
    expect(loginomBrowserMessage()).toBe("loginom.browserUnknown")
    expect(loginomBrowserMessage({ state: "unknown" })).toBe("loginom.browserUnknown")
    expect(loginomBrowserMessage({ state: "verified" })).toBe("loginom.browserVerified")
    expect(loginomBrowserMessage({ state: "failed", failure: "LOGINOM_ACCOUNT_MISMATCH" })).toBe(
      "loginom.browserAccountMismatch",
    )
    expect(loginomBrowserMessage({ state: "failed", failure: "LOGINOM_LOGIN_REJECTED" })).toBe(
      "loginom.invalidPassword",
    )
    expect(loginomBrowserMessage({ state: "failed", failure: "LOGINOM_LOGIN_UNAVAILABLE" })).toBe(
      "loginom.webUnavailable",
    )
    expect(loginomBrowserMessage({ state: "failed", failure: "LOGINOM_BROWSER_START_FAILED" })).toBe(
      "loginom.browserFailed",
    )
  })
  test("a browser warning keeps Help successful and still permits saving", async () => {
    const f = setup({ browser: { state: "unknown" } })
    const browser: Loginom.BrowserStatus = { state: "failed", failure: "LOGINOM_ACCOUNT_MISMATCH" }
    f.api.check = async () => ({
      help: { state: "ready" },
      validationId: "checked",
      expiresAt: Date.now() + 10000,
      browser,
    })
    try {
      await f.form.load()
      f.form.edit({ password: "replacement", passwordMode: "replace" })
      await f.form.submit(false)
      expect(f.form.state.message).toBe("loginom.helpChecked")
      expect(f.form.state.checkedBrowser).toEqual(browser)
      expect(f.form.state.failed).toBe(false)
      expect(f.form.canSave()).toBe(true)
      f.update({ browser })
      await f.form.submit(true)
      expect(f.saves).toHaveLength(1)
      expect(f.closed[0].browser).toEqual(browser)
      expect(f.form.state.password).toBe("")
    } finally {
      f.dispose()
    }
  })
  test("checking an unknown or failed browser never claims successful sign-in", async () => {
    for (const browser of [
      { state: "unknown" as const },
      { state: "failed" as const, failure: "LOGINOM_LOGIN_REJECTED" as const },
    ]) {
      const f = setup()
      f.api.check = async () => ({
        help: { state: "ready" },
        validationId: "checked",
        expiresAt: Date.now() + 10000,
        browser,
      })
      try {
        await f.form.load()
        await f.form.submit(false)
        expect(f.form.state.message).toBe("loginom.helpCheckedSaved")
        expect(f.form.state.checkedBrowser).toEqual(browser)
        f.form.edit({ username: "draft" })
        expect(f.form.state.checkedBrowser).toBeUndefined()
      } finally {
        f.dispose()
      }
    }
  })
  test("deferred activation reports Help ready with the separate current browser warning", async () => {
    const f = setup({ state: "pending", revision: 2, browser: { state: "unknown" } })
    try {
      const saved = await f.api.read()
      f.update({ state: "ready", generation: 2, browser: { state: "failed", failure: "LOGINOM_LOGIN_UNAVAILABLE" } })
      const notices: { result: string; browser?: Loginom.BrowserStatus }[] = []
      await watchLoginomApplication(
        f.api,
        saved,
        (result, current) => {
          notices.push({ result, browser: current?.browser })
        },
        async () => {},
      )
      expect(notices).toEqual([{ result: "ready", browser: { state: "failed", failure: "LOGINOM_LOGIN_UNAVAILABLE" } }])
    } finally {
      f.dispose()
    }
  })
  test("initial form uses the product connection defaults", () => {
    const f = setup()
    try {
      expect(f.form.state.mode).toBe("cloud")
      expect(f.form.state.url).toBe(Product.connection.url)
      expect(f.form.state.username).toBe(Product.connection.username)
    } finally {
      f.dispose()
    }
  })
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
      f.form.edit({ password: "replacement", passwordMode: "replace" })
      await f.form.submit(true)
      expect(f.saves).toHaveLength(1)
      expect(f.closed).toHaveLength(0)
      expect(f.form.state.failed).toBe(false)
      expect(f.form.state.message).toBeUndefined()
      expect(f.form.state.view?.recoveries).toEqual(ids)
      expect(f.form.state.baseline?.revision).toBe(2)
      expect(f.form.state.password).toBe("replacement")
    } finally {
      f.dispose()
    }
  })
  test("opening and reverting edits can close without confirmation or writes", async () => {
    const f = setup()
    try {
      await f.form.load()
      expect(f.form.state.password).toBe("")
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
        url: "http://other.test/",
        username: "other",
        password: "new-test-password",
        passwordMode: "replace",
      })
      await f.form.submit(false)
      expect(f.checks[0]).toEqual({
        mode: "custom",
        endpoint: "http://loginom.test/mcp",
        apiKey: { operation: "preserve" },
        verifyBrowser: true,
        revision: 1,
        url: "http://other.test/",
        username: "other",
        password: { operation: "replace", value: "new-test-password" },
      })
      expect(f.form.state.message).toBe("loginom.checked")
      expect(f.form.state.password).toBe("new-test-password")
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
      expect(f.form.state.apiKey).toBe("")
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
      f.form.edit({ password: "replacement", passwordMode: "replace" })
      await f.form.submit(true)
      expect(f.checks).toHaveLength(1)
      expect(f.saves).toEqual([{ revision: 1, validationId: "checked" }])
      expect(f.closed).toHaveLength(1)
      expect(f.form.state.password).toBe("")
      expect(f.form.dirty()).toBe(false)
      expect(f.form.requestClose()).toBe(true)
    } finally {
      f.dispose()
    }
  })
  test("a rejected Dock key keeps the form and draft; no persistence takes place", async () => {
    const f = setup()
    try {
      await f.form.load()
      f.api.check = async () => {
        throw Error("LOGINOM_KNOWLEDGE_AUTH_FAILED")
      }
      f.form.edit({ username: "draft" })
      await f.form.submit(true)
      expect(f.form.state.message).toBe("loginom.ai.invalidKey")
      expect(f.form.state.username).toBe("draft")
      expect(f.saves).toHaveLength(0)
      expect(f.closed).toHaveLength(0)
    } finally {
      f.dispose()
    }
  })
  test("storage failure does not close the form or clear the entered password", async () => {
    const f = setup()
    try {
      await f.form.load()
      f.api.save = async () => {
        throw Error("LOGINOM_STORE_WRITE_FAILED")
      }
      f.form.edit({ password: "replacement", passwordMode: "replace" })
      await f.form.submit(true)
      expect(f.closed).toHaveLength(0)
      expect(f.form.state.failed).toBe(true)
      expect(f.form.state.password).toBe("replacement")
    } finally {
      f.dispose()
    }
  })
  test("cannot close or submit again during a check", async () => {
    const f = setup()
    try {
      await f.form.load()
      const checking = Promise.withResolvers<Awaited<ReturnType<Loginom.API["check"]>>>()
      let calls = 0
      f.api.check = () => {
        calls++
        return checking.promise
      }
      f.form.edit({ password: "replacement", passwordMode: "replace" })
      const save = f.form.submit(true)
      expect(f.form.requestClose()).toBe(false)
      await f.form.submit(true)
      expect(calls).toBe(1)
      checking.resolve({ help: { state: "ready" }, validationId: "checked", expiresAt: Date.now() + 10000 })
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
      f.form.edit({ password: "replacement", passwordMode: "replace" })
      await f.form.submit(true)
      expect(f.closed).toHaveLength(0)
      expect(f.form.state.failed).toBe(true)
      expect(f.form.state.baseline?.revision).toBe(2)
      expect(f.form.state.password).toBe("replacement")
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
      f.form.edit({ password: "replacement", passwordMode: "replace" })
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
      f.form.edit({ password: "replacement", passwordMode: "replace", username: "draft" })
      f.update({ revision: 2, generation: 2, username: "external", failure: "LOGINOM_RUNTIME_START_FAILED" })
      await f.form.refresh()
      expect(f.form.state.username).toBe("draft")
      expect(f.form.state.password).toBe("replacement")
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
