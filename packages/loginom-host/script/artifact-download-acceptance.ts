import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { supervise } from "../src/supervisor"
import { inputStore } from "../src/inputs"

// Source/runtime acceptance. Uses the public compact Dock tools through the
// real private Host transport; no browser calls, manufactured receipts or LLM.
const configPath = process.env.LOGINOM_AI_AGENT_TEST_CONFIG
const resourcesPath = process.env.LOGINOM_AI_AGENT_TEST_RESOURCES
assert.ok(configPath && resourcesPath, "Set LOGINOM_AI_AGENT_TEST_CONFIG and LOGINOM_AI_AGENT_TEST_RESOURCES")
const config = JSON.parse(await readFile(configPath, "utf8"))
assert.ok(typeof config.api_key === "string" && config.api_key.length > 0, "Test credentials required")
const resources = resolve(resourcesPath)
const manifest = JSON.parse(await readFile(join(resources, "resource-manifest.json"), "utf8"))
const url = process.env.LOGINOM_AI_AGENT_TEST_URL ?? config.loginom_url
const username = process.env.LOGINOM_AI_AGENT_TEST_USER ?? config.workflow_profile?.loginom_user
assert.ok(typeof url === "string" && typeof username === "string", "Explicit Loginom URL and account required")
const directory = await mkdtemp(join(tmpdir(), "loginom-artifact-acceptance-"))
const csv = "Item,Qty\nA,5\nA,10\nB,25\n"
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex")
assert.equal(digest(csv), "3e54a7b66ce89ba9f5f6228df2123f10ce9fd8cad80413ea3321294b8287d26b")
const results = []
console.log(`Private acceptance evidence: ${directory}`)

for (const headless of [true, false]) {
  const chat = `${headless ? "headless" : "headed"}-${randomUUID()}`
  const packagePath = `/${username}/artifact-download-${chat}.lgp`
  const child = await supervise({
    node: join(resources, manifest.node),
    entry: join(resources, "runtime/src/managed-entry.mjs"),
    resources,
    stateDir: directory,
    generation: 1,
    chat,
    headless,
    endpoint: manifest.endpoint,
    actionManifestUri: manifest.actionManifestUri,
    actionManifestSha256: manifest.actionManifestSha256,
    connection: { apiKey: config.api_key, password: "", url, username },
    acceptanceCleanupPackage: packagePath,
  })
  const receipts = { sequence: 0 }
  async function invoke(name: string, args: Record<string, unknown>) {
    const envelope = await child.request("call", { name, arguments: args })
    assert.ok(envelope && typeof envelope === "object" && "result" in envelope)
    const serialized = JSON.stringify(envelope.result)
    assert.equal(serialized.includes(config.api_key), false, "Secret in receipt")
    const reply = JSON.parse(serialized)
    await writeFile(join(directory, `${chat}-${++receipts.sequence}-${name}.json`), serialized + "\n", { mode: 0o600 })
    assert.equal(reply.isError ?? false, false, `Tool failed: ${name}`)
    const body =
      reply.structuredContent ?? JSON.parse(reply.content.find((item: { type: string }) => item.type === "text").text)
    console.log(
      JSON.stringify({ mode: headless ? "headless" : "headed", tool: name, status: body.status, state: body.state }),
    )
    return { body, reply }
  }
  async function call(name: string, args: Record<string, unknown>) {
    return (await invoke(name, args)).body
  }
  async function node(request: Record<string, unknown> & { operation_id: string }) {
    const started = await call("dock_node_apply", request)
    const result = await (async () => {
      if (started.state !== "running") return started
      const deadline = Date.now() + 660000
      while (Date.now() < deadline) {
        const current = await call("dock_node_wait", { operation_id: request.operation_id, timeout_ms: 10000 })
        if (current.state !== "running") return current
      }
      throw Error("Node acceptance deadline expired")
    })()
    assert.equal(result.status, "SUCCEEDED", JSON.stringify(result))
    assert.equal(result.cleanup_complete, true)
    return result
  }
  const outcome = await (async () => {
    try {
      const files = await inputStore(join(directory, "inputs")).admit(
        chat,
        "original-attachment",
        [
          { name: "sales.csv", data: Buffer.from(csv).toString("base64") },
          { name: "sales.tsv", data: Buffer.from(csv.replaceAll(",", "\t")).toString("base64") },
        ],
        `/${username}`,
      )
      await child.request("admit", { userMessage: "original-attachment", files })
      const prepared = await call("dock_prepare", { intent: "new_draft", operation_id: "prepare" })
      assert.equal(prepared.prepared, true)
      assert.equal(prepared.input_artifacts.length, 2)
      const deliveries = []
      for (const artifact of prepared.input_artifacts) {
        const operation = artifact.name.endsWith(".tsv") ? "deliver-tsv" : "deliver-csv"
        const started = await call("dock_artifact_deliver", {
          operation_id: operation,
          artifact_id: artifact.artifact_id,
          upload_grant_id: artifact.upload.grant_id,
          budget_ms: 120000,
        })
        const delivery = await (async () => {
          if (started.state !== "running") return started
          const deadline = Date.now() + 150000
          while (Date.now() < deadline) {
            const current = await call("dock_artifact_delivery_status", { operation_id: operation })
            if (current.state !== "running") return current
            await new Promise((resolve) => setTimeout(resolve, 250))
          }
          throw Error("Delivery acceptance deadline expired")
        })()
        assert.equal(delivery.status, "SUCCEEDED", JSON.stringify(delivery))
        assert.equal(delivery.cleanup_complete, true)
        assert.equal(delivery.output.upload_completion_verified, true)
        assert.equal(delivery.output.bytes, artifact.bytes)
        assert.equal(delivery.output.sha256, artifact.sha256)
        deliveries.push({ artifact, delivery })
      }
      const source = deliveries.find((item) => item.artifact.name.endsWith(".csv"))!
      const identity = {
        contract_revision: "1.0.0",
        document_id: prepared.workspace.document_id,
        workflow_ref: { workflow_id: prepared.workspace.workflow_ref.workflow_id },
      }
      await call("dock_action_describe", { node_types: ["imports.text", "exports.text"] })
      const imported = await node({
        ...identity,
        operation_id: "import",
        target: { kind: "new", type: "imports.text", label: "Sales", position: { x: 220, y: 160 } },
        inputs: [],
        mode: "delimited",
        finish: "execute",
        parameters: {
          source: {
            artifact_id: source.artifact.artifact_id,
            upload_operation_id: source.delivery.output.upload_operation_id,
          },
          settings: {
            columns: [
              { name: "Item", type: "string" },
              { name: "Qty", type: "integer" },
            ],
          },
        },
      })
      assert.equal(imported.output.ports[0].row_count, 3)
      const exports = []
      for (const extension of ["csv", "tsv"]) {
        const destination: string = `/${username}/artifact-download-${chat}.${extension}`
        const exported = await node({
          ...identity,
          operation_id: `export-${extension}`,
          target: {
            kind: "new",
            type: "exports.text",
            label: `Export ${extension}`,
            position: { x: 620, y: extension === "csv" ? 160 : 360 },
          },
          inputs: [{ source: imported.node, output: 0, input: 0 }],
          mode: "delimited",
          finish: "execute",
          parameters: { destination, delimiter: extension === "csv" ? "," : "\t" },
        })
        const artifact = exported.output.file_artifacts[0]
        const expected = extension === "csv" ? csv : csv.replaceAll(",", "\t")
        assert.equal(artifact.destination, destination)
        assert.equal(artifact.bytes, Buffer.byteLength(expected))
        assert.equal(artifact.sha256, digest(expected))
        assert.ok(artifact.execution_id && artifact.verification_id)
        exports.push(artifact)
      }
      const saved = await invoke("dock_action_run", {
        action_key: "package.save_checkpoint",
        operation_id: "save",
        parameters: { path: packagePath, conflict_policy: "fail" },
      })
      assert.equal(saved.body.status, "SUCCEEDED", JSON.stringify(saved.body))
      assert.equal(saved.body.output.save_completed, true)
      const advice = saved.reply.content
        .filter((item: { type: string }) => item.type === "text")
        .map((item: { text: string }) => JSON.parse(item.text))
        .find((item: { kind?: string }) => item.kind === "dock_saved_package_state")
      assert.equal(advice?.modified, false, "Saved package must be clean")
      return { chat, headless, deliveries, exports, packagePath }
    } finally {
      await child.close()
    }
  })()
  const attempts = join(directory, "generations/1/chats", chat, "attempts")
  const names = await readdir(attempts)
  assert.equal(names.length, 1)
  const attempt = join(attempts, names[0])
  const cleanup = JSON.parse(await readFile(join(attempt, "package-cleanup.json"), "utf8"))
  assert.equal(cleanup.status, "SUCCEEDED", JSON.stringify(cleanup))
  assert.equal(cleanup.package_closed, true)
  assert.equal(cleanup.logged_out, true)
  assert.equal(cleanup.unsaved_changes_discarded, false)
  results.push({ ...outcome, cleanup, attempt })
  await writeFile(join(directory, "results.json"), JSON.stringify(results, null, 2) + "\n", { mode: 0o600 })
}
console.log(
  JSON.stringify({ passed: true, directory, modes: results.map((item) => (item.headless ? "headless" : "headed")) }),
)
