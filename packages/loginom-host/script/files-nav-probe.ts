import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { EventEmitter } from "node:events"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

// B6.1-E probe, no model: import a CSV once, then PROBE_REPEATS times export it (text and Excel, with the Host's
// automatic export-file read that goes to the "Files" storage and back to the scenario) and list the account folder
// with dock_storage_list. The signal is the failure code seen on the stand: "Export file read did not return to its
// workflow" (NODE_APPLY_STOPPED, AMBIGUOUS), "Another Dock operation remains pending" or STORAGE_SOURCE_REFUSED.
// Differential: run it against another resources directory (for example the v0.4.2 CLI release) with the same account.
// Prints one PROBE_STEP line per step and one PROBE_RESULT line. Environment:
//   LOGINOM_AI_AGENT_TEST_CONFIG, LOGINOM_AI_AGENT_TEST_RESOURCES (as wizard-ready-probe.ts)
//   PROBE_REPEATS (default 3), PROBE_VARIANTS (default "text,excel"; "acf" alone creates one research.auto_correlation node
//   after importing the acf-update series: red when its target phase stays pending, see below), PROBE_HEADLESS=0 for a visible browser,
//   PROBE_DRY=1 checks the configuration and prints the plan without touching the stand.
if (process.argv.includes("--help")) {
  console.log(
    "usage: bun script/files-nav-probe.ts  (env: LOGINOM_AI_AGENT_TEST_CONFIG, LOGINOM_AI_AGENT_TEST_RESOURCES, PROBE_REPEATS=3, PROBE_VARIANTS=text,excel, PROBE_HEADLESS=1, PROBE_STORAGE_PATH, PROBE_DRY=0)",
  )
  process.exit(0)
}
const headless = process.env.PROBE_HEADLESS !== "0"
const repeats = Number(process.env.PROBE_REPEATS ?? 3)
const variants = (process.env.PROBE_VARIANTS ?? "text,excel")
  .split(",")
  .filter((item) => item === "text" || item === "excel" || item === "acf" || item === "storage")
if (!Number.isInteger(repeats) || repeats < 1 || variants.length === 0) throw Error("PROBE_REPEATS_OR_VARIANTS_INVALID")
const probeStart = performance.now()
const steps: { step: string; ms: number; status: string; code: string | null; reason: string | null }[] = []
const elapsed = () => Math.round(performance.now() - probeStart)

const configPath = process.env.LOGINOM_AI_AGENT_TEST_CONFIG
const resourcePath = process.env.LOGINOM_AI_AGENT_TEST_RESOURCES
if (!configPath || !resourcePath) throw Error("TEST_CONFIG_AND_RESOURCES_REQUIRED")
const config = await Bun.file(configPath).json()
const user = config.workflow_profile?.loginom_user
const password = config.workflow_profile?.passwordless_login === true ? "" : config.workflow_profile?.password
const url = config.loginom_url
if (typeof user !== "string" || !user) throw Error("TEST_USER_REQUIRED")
if (typeof password !== "string") throw Error("TEST_PASSWORD_UNAVAILABLE")
if (typeof url !== "string" || !url) throw Error("TEST_URL_REQUIRED")
const storagePath = process.env.PROBE_STORAGE_PATH ?? `/${user}`
const resources = resolve(resourcePath)
const label = randomUUID().slice(0, 8)
const acf = variants.length === 1 && variants[0] === "acf"
const storageOnly = variants.length === 1 && variants[0] === "storage"
if (variants.includes("acf") && !acf) throw Error("PROBE_ACF_MUST_BE_ALONE")
if (variants.includes("storage") && !storageOnly) throw Error("PROBE_STORAGE_MUST_BE_ALONE")
if (process.env.PROBE_DRY === "1") {
  const plan = storageOnly
    ? "prepare, dock_storage_list"
    : acf
      ? "prepare, deliver, import, apply autocorrelation"
      : "prepare, deliver, import, then per repeat: export with file read, dock_storage_list"
  console.log(
    "PROBE_DRY " + JSON.stringify({ headless, repeats, variants, resources, folder: storagePath, label, plan }),
  )
  process.exit(0)
}

const { LoginomHost } = await import("../src/adapter")
const { connectionStore } = await import("../src/connection/connection-store")
const { credentials } = await import("../src/connection/credentials")
const { createLoginomHost } = await import("../src/host")
const { loginomHostPort } = await import("../src/host-port")
const { SessionV1 } = await import("../src/session-v1")

const directory = await mkdtemp(join(tmpdir(), "loginom-files-nav-probe-"))
const session = randomUUID()
const chat = createHash("sha256").update(session).digest("hex")
const root = join(directory, "profile")
const store = connectionStore(join(root, "connection"), credentials("linux"))
await store.stage({ generation: 1, revision: 1, url, username: user, apiKey: "", password })
await store.activate(1)
const host = await createLoginomHost({ root, resources, codec: credentials("linux"), headless })
const requests = new EventEmitter()
const replies = new EventEmitter()
const port = loginomHostPort(
  { postMessage: (value) => replies.emit("message", { data: value }), on: requests.on.bind(requests), start() {} },
  host,
)
LoginomHost.connect({
  postMessage: (value) => requests.emit("message", { data: value }),
  on: replies.on.bind(replies),
  start() {},
})

// A refusal is data here: the probe records its code and keeps going unless the workflow is blocked.
const failureText =
  /did not return to its workflow|Another Dock operation|STORAGE_SOURCE_REFUSED|readiness timeout|NODE_APPLY_STOPPED|AMBIGUOUS/
let blocked = false
try {
  await host.settled()
  const run = await LoginomHost.acquire(session)
  assert.ok(run)
  await host.runtime(1, chat)
  await run.scope("bind", { taskMessageID: SessionV1.MessageID.make("msg_original"), profile: "loginom-automation" })
  await run.tools()
  if (!storageOnly)
    await run.admit("original", [
      {
        name: "probe.csv",
        data: Buffer.from(
          acf
            ? "RowID,X\n1,1.0\n2,2.0\n3,4.0\n4,3.0\n5,6.0\n6,5.0\n7,8.0\n8,7.0\n"
            : "id,product,revenue\n1,A,80\n2,B,15\n3,C,5\n",
        ).toString("base64"),
      },
    ])
  const invoke = async (name: string, args: unknown) => {
    const result = (await run.call(name, args, "original")) as { content: { type: string; text?: string }[] }
    const text = result.content.find((block) => block.type === "text")?.text
    assert.ok(text)
    return JSON.parse(text) as Record<string, any>
  }
  const timed = async (step: string, call: () => Promise<Record<string, any>>) => {
    const started = performance.now()
    const result: Record<string, any> = await call().catch((error) => ({
      status: "THROWN",
      error: { code: String(error).slice(0, 120) },
    }))
    const error = result.error ?? result.output?.error
    const code = error?.code ?? null
    const reason = typeof error?.details?.reason === "string" ? error.details.reason : null
    const line = {
      step,
      ms: Math.round(performance.now() - started),
      status: String(result.status ?? result.state ?? ""),
      code: code && String(code).slice(0, 120),
      reason,
    }
    steps.push(line)
    console.log(
      "PROBE_STEP " +
        JSON.stringify({
          at: elapsed(),
          ...line,
          entries: result.output?.native_entry_count ?? null,
          message:
            code || failureText.test(JSON.stringify(result))
              ? String(result.error?.message ?? result.output?.error?.message ?? "").slice(0, 200)
              : null,
        }),
    )
    return result
  }
  const settle = async (operation_id: string, first: Record<string, any>, attempts = 6) => {
    let node = first
    for (let attempt = 0; node.state !== "settled" && attempt < attempts; attempt++)
      node = await invoke("dock_node_wait", { operation_id, timeout_ms: 60000 })
    return node
  }

  const prepared = await timed("prepare", () =>
    invoke("dock_prepare", { intent: "new_draft", operation_id: `fn-${label}-prepare` }),
  )
  assert.ok(prepared.prepared, "PREPARE_FAILED")
  await run.tools()
  if (storageOnly) {
    for (let index = 1; index <= repeats && !blocked; index++) {
      const listed = await timed(`storage-list-${index}`, () =>
        invoke("dock_storage_list", {
          operation_id: `fn-${label}-list-${index}`,
          path: storagePath,
          pattern: `*fn-${label}*`,
        }),
      )
      blocked = listed.status !== "SUCCEEDED"
    }
  } else {
    const artifact = prepared.input_artifacts[0]
    const delivered = await timed("deliver", () =>
      invoke("dock_artifact_deliver", {
        operation_id: `fn-${label}-deliver`,
        artifact_id: artifact.artifact_id,
        upload_grant_id: artifact.upload.grant_id,
        budget_ms: 120000,
      }),
    )
    // The node must be described before dock_node_apply admits it (the model described research.auto_correlation first in b5-1).
    await invoke(
      "dock_action_describe",
      acf
        ? { node_types: ["imports.text", "research.auto_correlation"], modes: ["delimited", "time_domain"] }
        : { node_types: ["imports.text", "exports.text", "exports.excel"], modes: ["delimited", "xlsx"] },
    )
    const document_id = prepared.workspace.document_id
    const workflow_ref = { workflow_id: prepared.workspace.workflow_ref.workflow_id }
    const imported = await timed("import", async () =>
      settle(
        `fn-${label}-import`,
        await invoke("dock_node_apply", {
          operation_id: `fn-${label}-import`,
          contract_revision: "1.0.0",
          document_id,
          workflow_ref,
          target: { kind: "new", type: "imports.text", label: "Probe CSV" },
          inputs: [],
          mode: "delimited",
          parameters: {
            source: {
              kind: "verified_delivery",
              artifact_id: artifact.artifact_id,
              upload_operation_id: delivered.output?.upload_operation_id,
              bytes: delivered.output?.bytes,
              sha256: delivered.output?.sha256,
            },
            settings: {
              source: {
                source_path: delivered.output?.destination,
                encoding: "UTF-8",
                rows_to_skip: 0,
                first_line_as_title: true,
              },
              format: {
                delimiter: ",",
                decimal_separator: ".",
                null_marker: "",
                text_qualifier: '"',
                auto_detect_columns: acf ? "none" : "new",
              },
              // acf: the column set the model sent in b5-1/b5-2 (RowID integer, X real)
              ...(acf
                ? {
                    columns: [
                      {
                        source_name: "RowID",
                        name: "RowID",
                        label: "RowID",
                        type: "integer",
                        data_kind: "Непрерывный",
                        used: true,
                      },
                      { source_name: "X", name: "X", label: "X", type: "real", data_kind: "Непрерывный", used: true },
                    ],
                  }
                : {}),
            },
          },
          finish: "execute",
          read: { ports: [0], sample_rows: 100, require_exact_numbers: true },
        }),
      ),
    )
    assert.equal(imported.status, "SUCCEEDED", "IMPORT_FAILED")
    const inputs = [
      {
        source: { document_id, workflow_id: workflow_ref.workflow_id, node_id: imported.node.node_id },
        output: 0,
        input: 0,
      },
    ]

    if (acf) {
      // Same call as b5-1 acf-series-1. Red = the target phase never settles (pending_phase "target", execution not_requested).
      // Suspect: readAutoCorrelationRowCount in auto-correlation-preflight.mjs polls the upstream Preview row count until the operation deadline.
      const stem = `fn-${label}-acf`
      const applied = await timed("acf-node", async () => {
        const first = await invoke("dock_node_apply", {
          operation_id: stem,
          contract_revision: "1.0.0",
          document_id,
          workflow_ref,
          target: { kind: "new", type: "research.auto_correlation", label: "Autocorrelation X" },
          inputs,
          mode: "time_domain",
          parameters: { autocorrelation: { field: "X", lag_count: 4 } },
          finish: "execute",
          read: { ports: [0], sample_rows: 20, require_exact_numbers: true },
        })
        const node = await settle(stem, first, 3)
        if (node.state === "settled") return node
        const cancelled = await invoke("dock_node_cancel", { operation_id: stem })
        return {
          status: "ACF_TARGET_PENDING",
          error: {
            code: "ACF_TARGET_PENDING",
            message: `pending_phase=${JSON.stringify(node.pending_phase ?? node.phase ?? null)} cancel=${String(cancelled.status ?? cancelled.state ?? "")}`,
          },
        }
      })
      if (applied.status !== "SUCCEEDED") blocked = true
    }
    for (let index = 1; index <= repeats && !blocked && !acf; index++)
      for (const variant of variants) {
        const stem = `fn-${label}-${variant}-${index}`
        if (variant === "acf" || variant === "storage") continue
        const destination = `/${user}/${stem}.${variant === "text" ? "csv" : "xlsx"}`
        const applied = await timed(`export-${variant}-${index}`, async () =>
          settle(
            stem,
            await invoke("dock_node_apply", {
              operation_id: stem,
              contract_revision: "1.0.0",
              document_id,
              workflow_ref,
              target: {
                kind: "new",
                type: variant === "text" ? "exports.text" : "exports.excel",
                label: `Export ${variant} ${index}`,
              },
              inputs,
              mode: variant === "text" ? "delimited" : "xlsx",
              parameters:
                variant === "text"
                  ? {
                      destination,
                      overwrite: "replace",
                      encoding: "UTF-8",
                      delimiter: ",",
                      header: "names",
                      bom: false,
                      line_ending: "LF",
                      decimal_separator: ".",
                      text_qualifier: '"',
                    }
                  : {
                      excel_export: {
                        destination,
                        header: "labels",
                        number_format: "general",
                        overwrite: "reject",
                        sheet_name: "Data",
                      },
                    },
              finish: "execute",
              read: { ports: [], require_exact_numbers: false, sample_rows: 0 },
            }),
          ),
        )
        if (applied.status !== "SUCCEEDED") {
          // The stand's failure: the operation stays pending, so the next node_apply is rejected. Stop here.
          blocked = true
          break
        }
        const listed = await timed(`storage-list-${variant}-${index}`, () =>
          invoke("dock_storage_list", { operation_id: `${stem}-list`, path: storagePath, pattern: `*${stem}*` }),
        )
        if (listed.status !== "SUCCEEDED") {
          blocked = true
          break
        }
      }
  }
  await run.release()
} catch (error) {
  console.log("PROBE_FAIL " + JSON.stringify({ at: elapsed(), error: String(error).slice(0, 200) }))
  process.exitCode = 1
} finally {
  const failed = steps.filter((item) => item.code || (item.status && !["SUCCEEDED", "settled"].includes(item.status)))
  console.log(
    "PROBE_RESULT " +
      JSON.stringify({
        headless,
        resources: resources.split("/").slice(-2).join("/"),
        repeats,
        variants,
        blocked,
        total_ms: elapsed(),
        steps: steps.length,
        failed: failed.length,
        first_failure: failed[0] ?? null,
        slowest: [...steps].sort((a, b) => b.ms - a.ms).slice(0, 3),
      }),
  )
  if (failed.length > 0) process.exitCode = 1
  LoginomHost.disconnect()
  await port.close()
  await host.close()
}
