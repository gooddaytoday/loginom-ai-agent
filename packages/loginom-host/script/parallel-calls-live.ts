import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { EventEmitter } from "node:events"
import { mkdtemp, readdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { LoginomHost } from "../src/adapter"
import { connectionStore } from "../src/connection/connection-store"
import { credentials } from "../src/connection/credentials"
import { createLoginomHost } from "../src/host"
import { loginomHostPort } from "../src/host-port"
import { supervise } from "../src/supervisor"

// Isolated source acceptance. Never opens or acknowledges the user's Desktop profile.
const configPath = process.env.LOGINOM_AI_AGENT_TEST_CONFIG
const resourcePath = process.env.LOGINOM_AI_AGENT_TEST_RESOURCES
if (!configPath || !resourcePath) throw Error("TEST_CONFIG_AND_RESOURCES_REQUIRED")
const config = await Bun.file(configPath).json()
if (config.workflow_profile?.passwordless_login !== true) throw Error("TEST_PASSWORD_UNAVAILABLE")
const resources = resolve(resourcePath)
const manifest = await Bun.file(join(resources, "resource-manifest.json")).json()
const directory = await mkdtemp(join(tmpdir(), "loginom-parallel-live-"))
const session = randomUUID()
const chat = createHash("sha256").update(session).digest("hex")
const path = `/${config.workflow_profile.loginom_user}/parallel-${session}.lgp`
const root = join(directory, "profile")
const connection = {
  generation: 1,
  revision: 1,
  url: config.loginom_url as string,
  username: config.workflow_profile.loginom_user as string,
  apiKey: config.api_key as string,
  password: "",
}
const store = connectionStore(join(root, "connection"), credentials("linux"))
await store.stage(connection)
await store.activate(1)
const host = await createLoginomHost({ root, resources, codec: credentials("linux"), headless: true })
const child = supervise({
  node: join(resources, "bin", process.platform === "win32" ? "node.exe" : "node"),
  entry: join(resources, "runtime/src/managed-entry.mjs"),
  resources,
  stateDir: directory,
  generation: 1,
  chat,
  connection,
  endpoint: manifest.endpoint,
  actionManifestUri: manifest.actionManifestUri,
  actionManifestSha256: manifest.actionManifestSha256,
  acceptanceCleanupPackage: path,
  headless: true,
})
const requests = new EventEmitter()
const replies = new EventEmitter()
const port = loginomHostPort(
  {
    postMessage: (value) => replies.emit("message", { data: value }),
    on: requests.on.bind(requests),
    start() {},
  },
  {
    ...host,
    // The real managed child uses its existing acceptance-only saved-package cleanup.
    runtime: (generation, target) => (target === chat ? child : host.runtime(generation, target)),
  },
)
LoginomHost.connect({
  postMessage: (value) => requests.emit("message", { data: value }),
  on: replies.on.bind(replies),
  start() {},
})
console.log(`Private acceptance evidence: ${directory}`)
try {
  await host.settled()
  const run = await LoginomHost.acquire(session)
  assert.ok(run)
  const bytes = Buffer.from("product,revenue\nA,80\nB,15\nC,5\n")
  await run.admit("original", [{ name: "parallel.csv", data: bytes.toString("base64") }])
  const invoke = async (name: string, args: unknown) => {
    const result = (await run.call(name, args, "original")) as {
      isError?: boolean
      content: { type: string; text?: string }[]
    }
    assert.notEqual(result.isError, true, name)
    const text = result.content.find((block) => block.type === "text")?.text
    assert.ok(text)
    assert.ok(!text.includes(connection.apiKey))
    await Bun.write(join(directory, `${name}.json`), JSON.stringify(result))
    return JSON.parse(text) as {
      prepared?: boolean
      status?: string
      state?: string
      cleanup_complete?: boolean
      workspace?: { document_id: string; workflow_ref: { workflow_id: string } }
      node_types?: { type: string }[]
      input_artifacts?: { artifact_id: string; upload: { grant_id: string } }[]
      output?: {
        upload_completion_verified?: boolean
        sha256?: string
        save_completed?: boolean
        upload_operation_id?: string
      }
    }
  }
  const prepared = await invoke("dock_prepare", { intent: "new_draft", operation_id: "prepare-parallel" })
  assert.equal(prepared.prepared, true)
  assert.equal(prepared.input_artifacts?.length, 1)
  const artifact = prepared.input_artifacts![0]!
  const results = await Promise.all([
    invoke("dock_artifact_deliver", {
      operation_id: "deliver-parallel",
      artifact_id: artifact.artifact_id,
      upload_grant_id: artifact.upload.grant_id,
      budget_ms: 90000,
    }),
    invoke("dock_action_describe", { node_types: ["imports.text", "transform.calculator"] }),
  ])
  assert.equal(results[0].status, "SUCCEEDED")
  assert.equal(results[0].output?.upload_completion_verified, true)
  assert.equal(results[0].output?.sha256, createHash("sha256").update(bytes).digest("hex"))
  assert.deepEqual(results[1].node_types?.map((node) => node.type).sort(), ["imports.text", "transform.calculator"])
  assert.deepEqual(host.journal.pending(), [])
  assert.deepEqual(await readdir(join(root, "recovery")), [])
  // node.apply restores the prepared workflow from the storage tab before importing.
  const imported = await invoke("dock_node_apply", {
    operation_id: "import-parallel",
    contract_revision: "1.0.0",
    document_id: prepared.workspace?.document_id,
    workflow_ref: { workflow_id: prepared.workspace?.workflow_ref.workflow_id },
    target: { kind: "new", type: "imports.text", label: "Parallel regression CSV" },
    inputs: [],
    mode: "delimited",
    parameters: {
      source: { artifact_id: artifact.artifact_id, upload_operation_id: results[0].output?.upload_operation_id },
      settings: {
        columns: [
          { name: "product", type: "string" },
          { name: "revenue", type: "integer" },
        ],
      },
    },
    finish: "execute",
  })
  const completed = { node: imported }
  for (let attempt = 0; completed.node.state !== "settled" && attempt < 4; attempt++) {
    completed.node = await invoke("dock_node_wait", { operation_id: "import-parallel", timeout_ms: 60000 })
  }
  assert.equal(completed.node.status, "SUCCEEDED")
  assert.equal(completed.node.cleanup_complete, true)
  const saved = await invoke("dock_action_run", {
    action_key: "package.save_checkpoint",
    operation_id: "save-parallel",
    parameters: { path, conflict_policy: "fail" },
  })
  assert.equal(saved.status, "SUCCEEDED")
  assert.equal(saved.output?.save_completed, true)
  assert.deepEqual(await readdir(join(root, "recovery")), [])
  await run.release()
} finally {
  LoginomHost.disconnect()
  await port.close()
  await (await child).close()
  await host.close()
}
const attempts = join(directory, "generations/1/chats", chat, "attempts")
const names = await readdir(attempts)
assert.equal(names.length, 1)
const cleanup = await Bun.file(join(attempts, names[0]!, "package-cleanup.json")).json()
assert.equal(cleanup.status, "SUCCEEDED")
assert.equal(cleanup.package_closed, true)
assert.equal(cleanup.logged_out, true)
assert.equal(cleanup.unsaved_changes_discarded, false)
assert.equal(cleanup.package_path, path)
assert.equal(cleanup.save_operation_id, "save-parallel")
await Bun.write(
  join(directory, "summary.json"),
  JSON.stringify(
    {
      status: "SUCCEEDED",
      parallel_upload_and_describe: true,
      recovery_records: 0,
      subsequent_save: true,
      cleanup,
      resources,
    },
    null,
    2,
  ),
)
console.log("Parallel upload/describe, subsequent save, journal and cleanup verified")
