import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { assertActionOutcome, validateActionParameters } from "../../../loginom-runtime/client/lib/action-catalog.mjs"
import { createActionRuntime, executorTools } from "../../../loginom-runtime/client/lib/executor.mjs"
import { deliveryApiTools, dispatchNodeApi, nodeApiTools } from "../../../loginom-runtime/client/lib/node-api.mjs"
import { validateNodeApplyRequest } from "../../../loginom-runtime/client/lib/node-apply.mjs"
import { describeNodeTypes } from "../../../loginom-runtime/client/lib/node-contracts.mjs"
import { createNodeOperationRunner } from "../../../loginom-runtime/client/lib/node-operation-runner.mjs"
import { nodeResultReply } from "../../../loginom-runtime/client/lib/node-result-reply.mjs"
import { createCandidateNodeSupport } from "../../../loginom-runtime/client/lib/node-support.mjs"
import { createSkillLoader, prepareTool } from "../../../loginom-runtime/client/lib/skill.mjs"
import { createStorageBinding, requireStorageDestination } from "../../../loginom-runtime/client/lib/storage-policy.mjs"
import { verifyTextImportSource } from "../../../loginom-runtime/client/lib/text-import-node.mjs"
import { compactActionResult } from "../../../loginom-runtime/client/lib/user-results.mjs"
import {
  createUserWorkflowBindings,
  userActionInventory,
  userActionTool,
  userNodeTool,
} from "../../../loginom-runtime/client/lib/user-workflow.mjs"
import { parseWorkspacePreparation, workspaceObserveTool } from "../../../loginom-runtime/client/lib/workspace.mjs"
import actionCatalog from "../../../loginom-runtime/executor/catalog-releases/2026.11.16-rest-save-linux-candidate/actions.json"
import catalogManifest from "../../../loginom-runtime/executor/catalog-releases/2026.11.16-rest-save-linux-candidate/manifest.json"
import selectorCatalog from "../../../loginom-runtime/executor/catalog-releases/2026.11.16-rest-save-linux-candidate/selectors.json"
import { gateGraph, output } from "./loginom-gate-graph"
import {
  doc,
  packagePath,
  salesCsv,
  salesFile,
  uploadGrant,
  uploadOperation,
  uploadPath,
  workflowRef,
} from "./loginom-gate-scenarios"

const targetOrigin = "https://loginom.invalid"
const targetBuild = catalogManifest.compatibility.loginom_build
const storage = { packages: "/gate", inputs: "/gate", exports: "/gate" }
const actions = new Map(actionCatalog.actions.map((action) => [action.action_key, action]))
const selectors = new Map(selectorCatalog.selectors.map((selector) => [selector.symbol, selector]))
const checkpoint = actionCatalog.actions.find((action) => action.action_key === "package.save_checkpoint")!
const fixtureTools = [
  prepareTool,
  workspaceObserveTool,
  ...executorTools
    .filter((tool) => ["dock_action_run", "dock_action_describe", "dock_operation_inspect"].includes(tool.name))
    .map(userActionTool),
  ...nodeApiTools.filter((tool) => ["dock_node_apply", "dock_node_wait"].includes(tool.name)).map(userNodeTool),
  ...deliveryApiTools.filter((tool) => tool.name === "dock_artifact_deliver"),
]
const jsonReply = (value: unknown) => ({ content: [{ type: "text", text: JSON.stringify(value) }] })
const success = (action_key: string, operation_id: string, output: object, phase = "verified") => ({
  status: "SUCCEEDED",
  action_key,
  action_revision: action_key === checkpoint.action_key ? checkpoint.revision : "1",
  operation_id,
  phase,
  effect_possible: false,
  cleanup_complete: true,
  error: null,
  trace: [],
  output,
})
const saveBrowser = () => {
  const calls: string[] = []
  const completed = new Map<string, ReturnType<typeof success>>()
  return {
    calls,
    async execute(code: string) {
      // The executor embeds the operation ID and phase in the browser request.
      const operation = /"operation_id":"([a-zA-Z0-9_.:-]+)"/.exec(code)?.[1]
      assert(operation, "The browser request must identify the Save operation")
      if (code.includes('"receipt_read":true')) {
        calls.push(`receipt:${operation}`)
        const receipt = completed.get(operation)
        return success(
          "operation.inspect",
          operation,
          receipt ? { state: "completed", receipt } : { state: "missing" },
          "observed",
        )
      }

      if (code.includes('"mode":"prepare"')) {
        calls.push(`prepare:${operation}`)
        return {
          ...success(checkpoint.action_key, operation, {}, "prepared"),
          status: "NOT_APPLIED",
          checkpoint: { workflow_ref: workflowRef, path: packagePath },
        }
      }

      assert(code.includes('"mode":"apply"'), "Expected the browser Save capability")
      calls.push(`apply:${operation}`)
      assert(!completed.has(operation), "Save may reach the browser only once")
      const outcome = {
        ...success(checkpoint.action_key, operation, {
          package_ref: { kind: "package", path: packagePath, active_identity: packagePath },
          save_completed: true,
          reopened: false,
          workflow_preserved: true,
          persisted_content_verified: false,
        }),
        effect_possible: true,
      }
      completed.set(operation, outcome)
      if (operation === "gate-write") throw Error("Browser transport disconnected after Save")
      return outcome
    },
  }
}

const admission = {
  artifact_id: "artifact-1",
  name: salesFile,
  bytes: Buffer.byteLength(salesCsv),
  sha256: createHash("sha256").update(salesCsv).digest("hex"),
  upload: { grant_id: uploadGrant, directory: "/gate/", overwrite: "reject", destination: uploadPath },
}

// Run the published user-v1 contracts over the actual calls. Only the Loginom
// workspace, file transfer and native node/action outcomes are simulated here.
export function gateRuntime(resources: string, graph?: ReturnType<typeof gateGraph>) {
  const workflows = createUserWorkflowBindings()
  const { nodeApplyHandlers } = createCandidateNodeSupport({ targetBuild, targetOrigin })
  const skill = createSkillLoader({ resources })
  assert("describeNodes" in skill && typeof skill.describeNodes === "function")
  const describeNodes = skill.describeNodes.bind(skill)
  let prepared = false
  let admitted = false
  let reads = 0
  const browser = saveBrowser()
  const saveRuntime = createActionRuntime({
    pinned: { actions, selectors, pins: {}, compatibility: catalogManifest.compatibility },
    execute: browser.execute,
    allowCandidate: true,
    targetOrigin,
    // @ts-expect-error The untyped executor infers its null callback default as the only return type.
    getStorageBinding: () =>
      createStorageBinding({
        sessionId: "gate-session",
        origin: targetOrigin,
        build: targetBuild,
        documentId: doc,
        account: "gate",
        directories: storage,
      }),
  })
  assert("run" in saveRuntime && typeof saveRuntime.run === "function")
  assert("inspect" in saveRuntime && typeof saveRuntime.inspect === "function")
  const { run, inspect } = saveRuntime
  const uploads: { operation_id: string; artifact: typeof admission; outcome: ReturnType<typeof success> }[] = []
  const jobs = createNodeOperationRunner({
    validate: (request: Record<string, unknown>, { fresh }: { fresh: boolean }) =>
      validateNodeApplyRequest(request, nodeApplyHandlers, { fresh }).handler.revision,
    progress: () => null,
    admitResume: undefined,
    run: async (request: Record<string, unknown>) => {
      if (request.operation_id === "gate-import") {
        const proof = verifyTextImportSource(request.parameters, uploads, undefined, undefined)
        assert.partialDeepStrictEqual(proof, { verified: true, source: { destination: uploadPath } })
      }
      if (graph) return graph.apply(request)
      assert.equal(request.operation_id, "gate-repeat")
      return output(request.operation_id, "filter", 8)
    },
  })
  const nodeRuntime = {
    tools: [...nodeApiTools, ...deliveryApiTools],
    startNodeApply: jobs.start,
    waitNodeApply: jobs.wait,
    async deliverArtifact(args: Record<string, unknown>) {
      assert(
        admitted && args.artifact_id === admission.artifact_id && args.upload_grant_id === admission.upload.grant_id,
        "Delivery requires the upload grant issued for the admitted file",
      )
      requireStorageDestination(uploadPath, storage, "inputs")
      const proof = { destination: uploadPath, bytes: admission.bytes, sha256: admission.sha256 }
      uploads.push({
        operation_id: uploadOperation,
        artifact: admission,
        outcome: {
          ...success("artifact.upload", uploadOperation, {
            artifact_id: admission.artifact_id,
            ...proof,
            server_copy_verification: {
              ...proof,
              status: "SUCCEEDED",
              bytes_verified: true,
              upload_completion_verified: true,
              verification_id: "gate-delivery:verify",
            },
          }),
          effect_possible: true,
        },
      })
      return {
        operation_id: args.operation_id,
        state: "settled",
        status: "ready",
        upload_operation_id: uploadOperation,
        outcome: {
          status: "SUCCEEDED",
          cleanup_complete: true,
          upload_completion_verified: true,
          upload_operation_id: uploadOperation,
          artifact_id: admission.artifact_id,
          ...proof,
        },
      }
    },
  }
  return {
    catalog: () => fixtureTools,
    saveBrowserCalls: browser.calls,
    admit(files: { name: string; data?: string }[]) {
      assert.deepEqual(files, [{ name: salesFile, data: Buffer.from(salesCsv).toString("base64") }])
      admitted = true
      return [admission]
    },
    async call(name: string, args: Record<string, unknown>) {
      const tool = fixtureTools.find((tool) => tool.name === name)
      assert(tool, `Unavailable user-v1 tool: ${name}`)
      const schema =
        name === "dock_action_run"
          ? { ...tool.inputSchema, properties: { ...tool.inputSchema.properties, parameters: checkpoint.input_schema } }
          : tool.inputSchema
      validateActionParameters(schema, args)
      if (name === "dock_prepare") {
        assert(!prepared)
        const draft = args.intent === "new_draft"
        assert(
          draft ? args.package_path === undefined : args.intent === "open_package" && args.package_path === packagePath,
        )
        const workspace = parseWorkspacePreparation(
          jsonReply({
            status: "READY",
            authenticated: true,
            target_verified: true,
            target: { loginom_build: targetBuild, origin: targetOrigin },
            loginom_account: "gate",
            document_id: doc,
            workflow_ref: workflowRef,
            created_draft: draft,
            package_ref: { path: draft ? null : packagePath, persisted: !draft, read_only: false },
          }),
          undefined,
        )
        workflows.remember(workspace)
        prepared = true
        return jsonReply({
          prepared,
          result_version: "user-v1",
          workspace,
          input_artifacts: [],
          knowledge: { available_actions: [checkpoint.action_key] },
        })
      }
      assert(prepared)
      if (name === "dock_action_describe") {
        assert(Array.isArray(args.node_types) && Array.isArray(args.modes))
        const cards = describeNodeTypes(args.node_types, {}, actions, nodeApplyHandlers, targetBuild)
        const delivered = userActionInventory({ node_types: await describeNodes(cards, args.modes) })
        workflows.rememberDescriptions(delivered, args.modes)
        return jsonReply(delivered)
      }
      if (name === "dock_node_apply" || name === "dock_node_wait" || name === "dock_artifact_deliver") {
        if (name === "dock_node_apply") {
          args = workflows.expandNode(args)
          const refusal = workflows.checkNodeDescription(args)
          if (refusal) return jsonReply(refusal)
        }
        const result = await dispatchNodeApi(nodeRuntime, name, args)
        if (name === "dock_artifact_deliver") workflows.rememberDelivery(result, args)
        const options = { userProfile: true, tool: name }
        return nodeResultReply(result, options)
      }
      let receipt
      if (name === "dock_workspace_observe") {
        reads++
        receipt = success(
          "workspace.observe",
          `gate-read-${reads}`,
          {
            authenticated: true,
            origin: targetOrigin,
            loginom_build: targetBuild,
            workflow_ref: workflowRef,
            package_identity: { path: packagePath, name: "Продажи.lgp" },
            graph_identity: { status: "observed", document_id: doc },
            nodes: [
              {
                node_id: "filter",
                node_ref: { kind: "node", node_label: "Фильтр", workflow_ref: workflowRef },
                label_text: "Фильтр",
                type: "transform.filter_data",
                ports: [],
              },
            ],
            links: [],
          },
          "observed",
        )
        if (reads > 1)
          receipt = {
            ...success("workspace.observe", receipt.operation_id, {}, "failed"),
            status: "FAILED",
            error: { code: "LOGINOM_UNAVAILABLE", message: "Loginom недоступен." },
          }
      } else if (name === "dock_action_run") {
        assert(typeof args.operation_id === "string" && args.action_key === checkpoint.action_key)
        receipt = await run(args.action_key, args.parameters, { operationId: args.operation_id })
      } else {
        assert(name === "dock_operation_inspect" && typeof args.operation_id === "string")
        receipt = await inspect({ operationId: args.operation_id })
      }
      return jsonReply(compactActionResult(assertActionOutcome(receipt)))
    },
  }
}
