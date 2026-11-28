import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { assertActionOutcome, validateActionParameters } from "../../../loginom-runtime/client/lib/action-catalog.mjs"
import { executorTools } from "../../../loginom-runtime/client/lib/executor.mjs"
import { deliveryApiTools, dispatchNodeApi, nodeApiTools } from "../../../loginom-runtime/client/lib/node-api.mjs"
import { validateNodeApplyRequest } from "../../../loginom-runtime/client/lib/node-apply.mjs"
import { describeNodeTypes } from "../../../loginom-runtime/client/lib/node-contracts.mjs"
import { createNodeOperationRunner } from "../../../loginom-runtime/client/lib/node-operation-runner.mjs"
import { nodeResultReply } from "../../../loginom-runtime/client/lib/node-result-reply.mjs"
import { createCandidateNodeSupport } from "../../../loginom-runtime/client/lib/node-support.mjs"
import { createSkillLoader, prepareTool } from "../../../loginom-runtime/client/lib/skill.mjs"
import { requireStorageDestination } from "../../../loginom-runtime/client/lib/storage-policy.mjs"
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
const actions = new Map<string, object>(actionCatalog.actions.map((action) => [action.action_key, action]))
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
const failure = (
  action: ReturnType<typeof success>,
  status: "FAILED" | "AMBIGUOUS",
  code: string,
  message: string,
) => ({
  ...action,
  status,
  phase: "failed",
  effect_possible: status === "AMBIGUOUS",
  cleanup_complete: status !== "AMBIGUOUS",
  error: { code, message },
})
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
  let uncertain: ReturnType<typeof success> | undefined
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
          receipt = failure(
            success("workspace.observe", receipt.operation_id, {}),
            "FAILED",
            "LOGINOM_UNAVAILABLE",
            "Loginom недоступен.",
          )
      } else if (name === "dock_action_run") {
        assert(typeof args.operation_id === "string" && args.action_key === checkpoint.action_key)
        assert(!uncertain, "Save was still awaiting reconciliation")
        const parameters = args.parameters as { path: string }
        requireStorageDestination(parameters.path, storage, "packages")
        const saved = {
          package_ref: { kind: "package", path: parameters.path, active_identity: parameters.path },
          save_completed: true,
          reopened: false,
          workflow_preserved: true,
          persisted_content_verified: false,
        }
        validateActionParameters(checkpoint.output_schema, saved)
        receipt = { ...success(checkpoint.action_key, args.operation_id, saved), effect_possible: true }
        if (args.operation_id === "gate-write") {
          uncertain = receipt
          receipt = failure(
            success(receipt.action_key, receipt.operation_id, {}),
            "AMBIGUOUS",
            "SAVE_UNCONFIRMED",
            "Ответ на запись потерян.",
          )
        }
      } else {
        assert(name === "dock_operation_inspect" && uncertain && args.operation_id === uncertain.operation_id)
        receipt = success(
          "operation.inspect",
          uncertain.operation_id,
          {
            operation_id: uncertain.operation_id,
            state: "resolved",
            effect_state: "verified",
            cleanup_confirmed: true,
            outcome: uncertain,
          },
          "observed",
        )
        uncertain = undefined
      }
      return jsonReply(compactActionResult(assertActionOutcome(receipt)))
    },
  }
}
