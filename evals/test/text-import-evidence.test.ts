import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { cp, mkdtemp, rm } from "node:fs/promises"
import { evalsRoot } from "../src/config"
import { validateNodeAttempt } from "../src/node-evals"

async function rejectionFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "text-import-refusal-"))
  const task = path.join(root, "txt-ambiguous-headers"), attempt = path.join(root, "attempt")
  await cp(path.join(evalsRoot, "drafts/text-import/txt-ambiguous-headers"), task, { recursive: true })
  const spec = await Bun.file(path.join(task, "SPEC.json")).json()
  const file = spec.inputs[0], destination = "/eval/ambiguous_headers.txt"
  const workspace = { status: "READY", ownership_verified: true, loginom_account: "eval",
    document_id: "doc", workflow_ref: { workflow_id: "flow" } }
  const artifact = { artifact_id: "file", name: path.basename(file.path), bytes: file.bytes, sha256: file.sha256,
    upload: { grant_id: "grant", destination } }
  const calls = [
    { tool: "loginom_dock_prepare", input: {}, output: { workspace, input_artifacts: [artifact] } },
    { tool: "loginom_dock_artifact_deliver", input: { artifact_id: "file", upload_grant_id: "grant" },
      output: { status: "SUCCEEDED", cleanup_complete: true, output: { artifact_id: "file", destination,
        bytes: file.bytes, sha256: file.sha256, upload_operation_id: "upload", upload_completion_verified: true, cleanup_complete: true } } },
    { tool: "loginom_dock_node_apply", input: { operation_id: "reject", document_id: "doc", workflow_ref: { workflow_id: "flow" },
      target: { kind: "new", type: "imports.text" }, mode: "delimited", finish: "execute", inputs: [],
      parameters: { source: { artifact_id: "file", upload_operation_id: "upload" },
        settings: { ...spec.settings, source: { ...spec.settings.source, source_path: destination }, columns: spec.columns } } },
      output: { operation_id: "reject", state: "settled", status: "NOT_APPLIED", action_key: "request.validate",
        phase: "request_rejected", request_rejected: true, effect_possible: false, cleanup_complete: true,
        error: { code: "REQUEST_REJECTED", message: "Duplicate source column names" } } },
  ]
  async function write() {
    await Bun.write(path.join(attempt, "events.jsonl"), calls.map((call, i) => JSON.stringify({ type: "tool_use",
      part: { id: `call-${i}`, tool: call.tool, state: { status: "completed", input: call.input,
        output: JSON.stringify(call.output), time: { start: i * 10, end: i * 10 + 1 } } } })).join("\n") + "\n")
  }
  await write()
  return { root, task, attempt, calls, write }
}

test("text import request validation can PASS without a fictitious package and detects changed source/refusal", async () => {
  const f = await rejectionFixture()
  try {
    expect(await validateNodeAttempt(f.task, f.attempt)).toEqual({ errors: [], failures: [] })
    f.calls[1]!.output.output!.sha256 = "0".repeat(64)
    await f.write()
    expect((await validateNodeAttempt(f.task, f.attempt)).failures.join(" ")).toContain("source")
  } finally { await rm(f.root, { recursive: true, force: true }) }
})
