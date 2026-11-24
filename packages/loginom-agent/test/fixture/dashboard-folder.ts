// A dashboard to draft (B2.9e), 0.4 `publicationFolder` of `v0.4.0:packages/opencode/test/tool/dashboard.test.ts`: the
// dashboard package prepares the folder from a snapshot (`prepareDashboard`) under the server's data root, which points
// at a temporary directory of its own (`temporaryData`), the installation's resources beside it. A draft builds with the
// template's own dependencies — `npm ci` in `packages/dashboard/template` and the pinned Node in
// `LOGINOM_AI_AGENT_TEST_NODE`, as 0.4's unit job had them — and the runtime client's Playwright (`npm ci` in
// `packages/loginom-runtime/client`). The page check is a script that reports success: no browser runs.
import { existsSync } from "node:fs"
import { mkdir, symlink } from "node:fs/promises"
import { join, resolve } from "node:path"
import { prepareDashboard } from "@loginom-ai-agent/dashboard/agent/folder"
import { Dashboard } from "../../src/dashboard"
import { temporaryData } from "./temporary-data"

const template = resolve(import.meta.dir, "../../../dashboard/template")
const playwright = resolve(import.meta.dir, "../../../loginom-runtime/client/node_modules/playwright-core")

export async function dashboardFolder() {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node || !existsSync(join(template, "node_modules")) || !existsSync(playwright))
    throw Error(
      "A draft needs LOGINOM_AI_AGENT_TEST_NODE, `npm ci` in packages/dashboard/template and in packages/loginom-runtime/client",
    )
  const data = await temporaryData()
  const resources = join(data.directory, "resources")
  for (const directory of ["bin", "dashboard", "browsers", "runtime/client/node_modules"])
    await mkdir(join(resources, directory), { recursive: true })
  await symlink(node, join(resources, "bin/node"))
  await symlink(template, join(resources, "dashboard/template"), "dir")
  await symlink(playwright, join(resources, "runtime/client/node_modules/playwright-core"), "dir")
  await Bun.write(
    join(resources, "resource-manifest.json"),
    JSON.stringify({ node: "bin/node", browser: "browsers/chrome" }),
  )
  for (const name of ["dashboard/draft.js", "browsers/chrome"]) await Bun.write(join(resources, name), "fixture")
  await Bun.write(
    join(resources, "dashboard/selfcheck.mjs"),
    'console.log(JSON.stringify({ ok: true, state: "ready", errors: [] }))',
  )
  const id = crypto.randomUUID()
  const folder = await prepareDashboard({
    readPublication: async () => null,
    id,
    origin: "http://127.0.0.1:0",
    dashboards: Dashboard.root(),
    template,
    fetch: Object.assign(
      async () =>
        Response.json({
          id,
          created: new Date().toISOString(),
          published: false,
          nodeName: "Заказы",
          binding: {
            packagePath: "/fixture/orders-" + id + ".lgp",
            workflowGuid: crypto.randomUUID(),
            nodeGuid: crypto.randomUUID(),
          },
          parameters: [],
          sample: { schema: [{ name: "total", type: "number" }], rows: [[7]] },
        }),
      { preconnect: () => undefined },
    ),
  })
  return { work: folder.directory, resources, [Symbol.asyncDispose]: () => data[Symbol.asyncDispose]() }
}

// The draft's link in a tool's output, and what that link answers now.
export const link = (output: unknown) =>
  String(output).match(/^Черновик: (http:\/\/localhost:\d+\/[a-f0-9]{64}\/)$/m)?.[1]
export const served = (url: string) =>
  fetch(url).then(
    (response) => response.status,
    () => "refused",
  )
