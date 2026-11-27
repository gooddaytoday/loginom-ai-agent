import type { Page } from "@playwright/test"
import { mockWorkspace } from "./workspace"

const directory = "/fixture/Documents/Loginom AI Agent/Без проекта/Запуск"
export const filename = "Учебный.lgp"
export const sessionID = "ses_documentation_wizard"
export const output = `${directory}/Учебный — описание.pdf`
const model = { id: "test-model", modelID: "test-model", providerID: "test", name: "Test Model" }

export async function mockDocumentPackage(
  page: Page,
  mode: "ready" | "unconfirmed" | "unknown" | "failed" | "stopped",
) {
  await mockWorkspace(page, { name: "Documentation", seed: { locale: "ru" } })
  const admitted = Promise.withResolvers<unknown>()
  const stopped = Promise.withResolvers<unknown>()
  let waitCalls = 0
  await page.route(/\/api\/model(?:\?|$)/, (route) => route.fulfill({ json: { data: [model] } }))
  await page.route(/\/api\/rpc\/loginom\.runner\/ready(?:\?|$)/, (route) => route.fulfill({ json: { output: {} } }))
  await page.route(/\/api\/rpc\/loginom\.runner\/prepareDocumentation(?:\?|$)/, (route) =>
    route.fulfill({ json: { output: { directory, filename } } }),
  )
  await page.route(/\/api\/session$/, (route) =>
    route.request().method() === "POST" ? route.fulfill({ json: { data: { id: sessionID } } }) : route.fallback(),
  )
  await page.route(/\/api\/rpc\/loginom\.runner\/start(?:\?|$)/, (route) => {
    admitted.resolve(route.request().postDataJSON())
    return route.fulfill({ json: { output: { granted: true } } })
  })
  await page.route(`**/api/experimental/session/${sessionID}/wait`, async (route) => {
    if (mode === "unknown" && ++waitCalls === 1) return route.abort()
    if (mode === "stopped") await stopped.promise
    return route.fulfill({ status: 204 })
  })
  await page.route(new RegExp(`/api/session/${sessionID}/interrupt(?:\\?|$)`), (route) => {
    stopped.resolve(new URL(route.request().url()).searchParams.get("resume"))
    return route.fulfill({ json: { interrupted: true } })
  })
  await page.route(`**/api/session/${sessionID}/context`, (route) => {
    const complete = mode === "ready" || mode === "unknown" || mode === "unconfirmed"
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
        data: [
          ...(mode === "failed" ? [] : [assistant]),
          { type: "idle", outcome: mode === "stopped" ? "interrupted" : mode === "failed" ? "failed" : "succeeded" },
        ],
      },
    })
  })
  return { admitted: admitted.promise, stopped: stopped.promise }
}
