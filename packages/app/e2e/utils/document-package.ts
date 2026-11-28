import type { Page } from "@playwright/test"
import { Match } from "effect"
import { mockWorkspace } from "./workspace"

const directory = "/fixture/Documents/Loginom AI Agent/Без проекта/Запуск"

export const filename = "Учебный.lgp"

export const sessionID = "ses_documentation_wizard"

export const output = `${directory}/Учебный — описание.pdf`

const model = { id: "test-model", modelID: "test-model", providerID: "test", name: "Test Model" }

export async function mockDocumentPackage(
  page: Page,
  mode:
    | "ready"
    | "unconfirmed"
    | "unknown"
    | "failed"
    | "stopped"
    | "timeout"
    | "cancel-before-start"
    | "lost-admission"
    | "lost-copy",
) {
  await mockWorkspace(page, { name: "Documentation", seed: { locale: "ru" } })
  const admitted = Promise.withResolvers<unknown>()
  const preparing = Promise.withResolvers<unknown>()
  const stopped = Promise.withResolvers<unknown>()
  const creating = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const removed = Promise.withResolvers<void>()
  const copyFinished = Promise.withResolvers<unknown>()
  const waitRelease = Promise.withResolvers<void>()
  let waitCalls = 0
  await page.route(/\/api\/model(?:\?|$)/, (route) => route.fulfill({ json: { data: [model] } }))
  await page.route(/\/api\/rpc\/loginom\.runner\/ready(?:\?|$)/, (route) => route.fulfill({ json: { output: {} } }))
  await page.route(/\/api\/rpc\/loginom\.runner\/prepareDocumentation(?:\?|$)/, (route) => {
    preparing.resolve(route.request().postDataJSON().input.runID)

    if (mode === "lost-copy") return route.abort()

    return route.fulfill({ json: { output: { directory, filename } } })
  })
  await page.route(/\/api\/session$/, async (route) => {
    if (route.request().method() !== "POST") return route.fallback()

    if (mode === "cancel-before-start") {
      creating.resolve()
      await release.promise
    }

    return route.fulfill({ json: { data: { id: sessionID } } })
  })
  await page.route(new RegExp(`/api/session/${sessionID}(?:\\?|$)`), (route) => {
    if (route.request().method() !== "DELETE") return route.fallback()

    removed.resolve()

    return route.fulfill({ status: 204 })
  })
  await page.route(/\/api\/rpc\/loginom\.runner\/finishDocumentation(?:\?|$)/, (route) => {
    copyFinished.resolve(route.request().postDataJSON())

    return route.fulfill({ json: { output: {} } })
  })
  await page.route(/\/api\/rpc\/loginom\.runner\/start(?:\?|$)/, async (route) => {
    admitted.resolve(route.request().postDataJSON())

    if (mode === "lost-admission") {
      await release.promise

      return route.abort()
    }

    return route.fulfill({ json: { output: { granted: true } } })
  })
  await page.route(`**/api/experimental/session/${sessionID}/wait`, async (route) => {
    waitCalls += 1

    if (mode === "unknown" && waitCalls === 1) return route.abort()

    if (mode === "timeout") {
      if (waitCalls === 1) await waitRelease.promise
      else waitRelease.resolve()
    }

    if (mode === "stopped" || mode === "lost-admission") await stopped.promise

    return route.fulfill({ status: 204 })
  })
  await page.route(new RegExp(`/api/session/${sessionID}/interrupt(?:\\?|$)`), (route) => {
    stopped.resolve(new URL(route.request().url()).searchParams.get("resume"))

    return route.fulfill({ json: { interrupted: true } })
  })
  await page.route(`**/api/session/${sessionID}/context`, (route) => {
    const complete = mode === "ready" || mode === "unknown" || mode === "unconfirmed" || mode === "timeout"

    const outcome = Match.value(mode).pipe(
      Match.when("stopped", () => "interrupted"),
      Match.when("lost-admission", () => "interrupted"),
      Match.when("failed", () => "failed"),
      Match.orElse(() => "succeeded"),
    )

    const assistant = {
      type: "assistant",
      content: [
        { type: "text", text: `Saved Word and PDF. ${output}` },
        ...(complete
          ? [
              {
                type: "tool",
                name: "package_docs_run",
                executed: true,
                state: {
                  status: "completed",
                  input: { operation: "emit", format: "pdf" },
                  content: [{ type: "text", text: JSON.stringify({ output }) }],
                },
              },
            ]
          : []),
      ],
    }

    return route.fulfill({
      json: {
        data: [...(mode === "failed" ? [] : [assistant]), { type: "idle", outcome }],
      },
    })
  })

  return {
    admitted: admitted.promise,
    preparing: preparing.promise,
    stopped: stopped.promise,
    creating: creating.promise,
    release: release.resolve,
    removed: removed.promise,
    copyFinished: copyFinished.promise,
  }
}
