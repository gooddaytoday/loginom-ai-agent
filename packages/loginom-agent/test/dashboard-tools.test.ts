// The dashboard's tools (B2.9e): the two `dashboard_draft` cases of 0.4
// `v0.4.0:packages/opencode/test/tool/dashboard.test.ts` on the plugin's tool itself, as 0.4 called its tool, plus the
// Location's own draft server, which `close` stops. On a server — where the tool exists and that the plugin's unload
// stops the server — `server/test/loginom-dashboard-draft.test.ts`.
// Each case's folder and resources are its own, under a temporary data root (`fixture/dashboard-folder.ts`).
import { expect, test } from "bun:test"
import { join } from "node:path"
import type { ToolContext } from "@opencode/plugin/promise/tool"
import { Agent } from "@opencode/schema/agent"
import { Session } from "@opencode/schema/session"
import { SessionMessage } from "@opencode/schema/session-message"
import { Tool } from "@opencode/schema/tool"
import { dashboardTools } from "../src/dashboard-tools"
import { dashboardFolder, link, served } from "./fixture/dashboard-folder"
import { temporaryData } from "./fixture/temporary-data"

// Builds run the template's compiler and bundler as child processes.
const timeout = 120_000

const call = (): ToolContext => ({
  sessionID: Session.ID.create(),
  agent: Agent.ID.make("build"),
  messageID: SessionMessage.ID.create(),
  id: Tool.CallID.make(`call_${crypto.randomUUID()}`),
  signal: new AbortController().signal,
  progress: async () => {},
})

test("dashboard_draft reports missing installation resources", async () => {
  await using data = await temporaryData()
  const tools = dashboardTools(data.directory, undefined)
  await expect(tools.draft.execute({}, call())).rejects.toThrow("DASHBOARD_RESOURCES_MISSING")
  // Outside the CodeMode catalog, whatever the transforms do: the model calls it by name.
  expect(tools.draft.options).toEqual({ codemode: false })
})

test(
  "dashboard_draft limits the complete diagnostic output to whole UTF-8 code points",
  async () => {
    await using folder = await dashboardFolder()
    await Bun.write(
      join(folder.work, "src/main.tsx"),
      Array.from({ length: 150 }, (_, index) => `const ошибка${index} = отсутствует𝒳${index};`).join("\n"),
    )
    const tools = dashboardTools(folder.work, folder.resources)
    const result = await tools.draft.execute({}, call())
    const output = String(result.content)
    expect(Buffer.byteLength(output)).toBeLessThanOrEqual(8192)
    expect(Buffer.byteLength(output)).toBeGreaterThan(8188)
    expect(output).toStartWith("Сборка не удалась. Исправьте код и вызовите dashboard_draft снова.\n")
    expect(output).toContain("отсутствует𝒳")
    expect(output).not.toContain("�")
    await tools.close()
  },
  timeout,
)

test(
  "a Location's draft server serves its drafts until close, and no draft starts it again",
  async () => {
    await using folder = await dashboardFolder()
    const tools = dashboardTools(folder.work, folder.resources)
    const result = await tools.draft.execute({}, call())
    expect(String(result.content)).toContain("Проверка типов и сборка: успешно.\nСамопроверка страницы: успешно")
    const url = link(result.content)
    expect(url).toBeString()
    expect(await served(url!)).toBe(200)
    await tools.close()
    expect(await served(url!)).toBe("refused")
    await expect(tools.draft.execute({}, call())).rejects.toThrow("Черновик остановлен")
  },
  timeout,
)
