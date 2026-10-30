import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

// Execute the acceptance entrypoint in an isolated process so its transport
// fixture cannot replace supervisor for other host tests.
async function run(options: { fail?: boolean; closeFail?: boolean; pair?: boolean } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "artifact-acceptance-test-"))
  try {
    const login = { api_key: "fixture-key", url: "https://example.invalid", username: "fixture", password: "fixture-password" }
    await writeFile(join(directory, "config.json"), JSON.stringify(options.pair ? { loginom: login } : {
      api_key: login.api_key, loginom_url: login.url, workflow_profile: { loginom_user: login.username, password: login.password },
    }))
    await writeFile(join(directory, "resource-manifest.json"), JSON.stringify({ node: "unused" }))
    await writeFile(join(directory, "preload.ts"), `
import { mock } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createHash } from "node:crypto"
mock.module(${JSON.stringify(new URL("../src/supervisor.ts", import.meta.url).pathname)}, () => ({
  supervise: async options => {
    await writeFile(${JSON.stringify(join(directory, "connection.json"))}, JSON.stringify(options.connection))
    const artifacts = ["csv", "tsv"].map(extension => {
      const text = extension === "csv" ? "Item,Qty\\nA,5\\nA,10\\nB,25\\n" : "Item\\tQty\\nA\\t5\\nA\\t10\\nB\\t25\\n"
      return { name: "sales." + extension, artifact_id: extension, bytes: Buffer.byteLength(text),
        sha256: createHash("sha256").update(text).digest("hex"), upload: { grant_id: extension } }
    })
    return {
      request: async (kind, request) => {
        if (kind === "admit") return {}
        const { name, arguments: args } = request
        if (${Boolean(options.fail)} && name === "dock_prepare") throw Error("ORIGINAL_ACCEPTANCE_FAILURE")
        let body = { status: "SUCCEEDED", state: "settled", cleanup_complete: true }
        if (name === "dock_prepare") Object.assign(body, { prepared: true, input_artifacts: artifacts,
          workspace: { document_id: "document", workflow_ref: { workflow_id: "workflow" } } })
        if (name === "dock_artifact_deliver") {
          await writeFile(${JSON.stringify(join(directory, "budget.json"))}, JSON.stringify(args.budget_ms))
          Object.assign(body, { output: { ...artifacts.find(a => a.artifact_id === args.artifact_id),
            upload_completion_verified: true, upload_operation_id: args.operation_id } })
        }
        if (name === "dock_node_apply") body = { state: "running" }
        if (name === "dock_node_wait") {
          if (args.operation_id === "import") Object.assign(body, { node: { node_id: "source" }, output: { ports: [{ row_count: 3 }] } })
          else {
            const extension = args.operation_id.endsWith("tsv") ? "tsv" : "csv"
            Object.assign(body, { output: { file_artifacts: [{ ...artifacts.find(a => a.artifact_id === extension),
              destination: "/fixture/artifact-download-" + options.chat + "." + extension,
              execution_id: "execution", verification_id: "verification" }] } })
          }
        }
        const content = [{ type: "text", text: JSON.stringify(body) }]
        if (name === "dock_action_run") {
          Object.assign(body, { output: { save_completed: true } })
          content[0].text = JSON.stringify(body)
          content.push({ type: "text", text: JSON.stringify({ kind: "dock_saved_package_state", modified: false }) })
        }
        const structuredContent = structuredClone(body)
        if (name === "dock_node_wait") delete structuredContent.output?.ports
        return { result: { content, structuredContent } }
      },
      close: async () => {
        await writeFile(${JSON.stringify(join(directory, "closed"))}, "yes")
        if (${Boolean(options.closeFail)}) throw Error("CLEANUP_FIXTURE_FAILURE")
        const attempt = join(options.stateDir, "generations/1/chats", options.chat, "attempts/fixture")
        await mkdir(attempt, { recursive: true })
        await writeFile(join(attempt, "package-cleanup.json"), JSON.stringify({ status: "SUCCEEDED",
          package_closed: true, logged_out: true, unsaved_changes_discarded: false }))
      },
    }
  },
}))
`)
    const child = Bun.spawn([process.execPath, "--preload", join(directory, "preload.ts"),
      new URL("../script/artifact-download-acceptance.ts", import.meta.url).pathname], {
      env: { ...process.env, LOGINOM_AI_AGENT_TEST_CONFIG: join(directory, "config.json"),
        LOGINOM_AI_AGENT_TEST_RESOURCES: directory, LOGINOM_AI_AGENT_TEST_DELIVERY_BUDGET_MS: "1000" },
      stdout: "pipe", stderr: "pipe",
    })
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    const connection = JSON.parse(await readFile(join(directory, "connection.json"), "utf8").catch(() => "null"))
    const closed = await readFile(join(directory, "closed"), "utf8").catch(() => "")
    const budget = JSON.parse(await readFile(join(directory, "budget.json"), "utf8").catch(() => "null"))
    const evidence = /Private acceptance evidence: (.+)/.exec(stdout)?.[1]
    if (evidence) await rm(evidence, { recursive: true, force: true })
    return { code, stdout, stderr, connection, closed, budget }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test("acceptance reads compact text ports, exports and Save through cleanup", async () => {
  for (const pair of [false, true]) {
    const result = await run({ pair })
    expect(result.stderr).toBe("")
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('"passed":true')
    expect(result.connection.password).toBe("fixture-password")
    expect(result.budget).toBe(1000)
  }
})

test("acceptance preserves the original failure when cleanup also fails", async () => {
  const result = await run({ fail: true, closeFail: true })
  expect(result.code).toBe(1)
  expect(result.closed).toBe("yes")
  expect(result.stderr).toContain("ORIGINAL_ACCEPTANCE_FAILURE")
  expect(result.stderr).toContain("CLEANUP_FIXTURE_FAILURE")
})

test("acceptance fails when only cleanup fails", async () => {
  const result = await run({ closeFail: true })
  expect(result.code).toBe(1)
  expect(result.closed).toBe("yes")
  expect(result.stderr).toContain("CLEANUP_FIXTURE_FAILURE")
  expect(result.stdout).not.toContain('"passed":true')
})
