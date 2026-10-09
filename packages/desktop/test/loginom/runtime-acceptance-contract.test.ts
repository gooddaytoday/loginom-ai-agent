import { expect, test } from "bun:test"
import { runInNewContext } from "node:vm"
import { nodeApiTools, textImportParametersSchema, groupingParametersSchema } from "../../../loginom-runtime/client/lib/node-api.mjs"
import { userNodeTool, createUserWorkflowBindings } from "../../../loginom-runtime/client/lib/user-workflow.mjs"
import { validateActionParameters } from "../../../loginom-runtime/client/lib/action-catalog.mjs"

// Evaluate the adapter's actual request declarations without importing its live
// entrypoint, reading credentials or launching Loginom. No request copy is kept here.
const source = await Bun.file(new URL("./runtime-acceptance.ts", import.meta.url)).text()
const declarations = ["policy", "identity", "importRequest", "groupRequest"].map((name) => {
  const indent = name === "policy" ? "" : "    "
  const match = new RegExp(`^${indent}const ${name} = (\\{[\\s\\S]*?^${indent}\\})$`, "m").exec(source)
  if (!match) throw Error(`ACCEPTANCE_DECLARATION_MISSING_${name}`)
  return `const ${name} = ${match[1]};`
}).join("\n")
const workspace = { document_id: "offline-document", workflow_ref: { workflow_id: "offline-workflow" } }
const requests = runInNewContext(`${declarations}\n({importRequest,groupRequest})`, {
  prepared: { workspace }, artifact: { artifact_id: "offline-artifact", upload: { destination: "/user/sales.csv" } },
  delivery: { output: { upload_operation_id: "offline-upload" } },
  imported: { node: { document_id: workspace.document_id, workflow_id: workspace.workflow_ref.workflow_id, node_id: "offline-import" } },
  label: "A", valueField: "amount",
}, { timeout: 1000 }) as { importRequest: Record<string, unknown>; groupRequest: Record<string, unknown> }

test("native acceptance import/group requests satisfy the public compact and host contracts", () => {
  const tool = nodeApiTools.find((item) => item.name === "dock_node_apply")!
  const bindings = createUserWorkflowBindings()
  bindings.remember({ ...workspace, workflow_ref: { ...workspace.workflow_ref,
    tab_tid: "offline-tab", prefix: "offline-prefix", navigation_path: [{ tid: "offline-path", label: "Offline" }] } })
  for (const [request, parameters] of [
    [requests.importRequest, textImportParametersSchema], [requests.groupRequest, groupingParametersSchema],
  ] as const) {
    expect(() => validateActionParameters(userNodeTool(tool).inputSchema, request)).not.toThrow()
    expect(() => validateActionParameters(parameters, request.parameters)).not.toThrow()
    expect(() => validateActionParameters(tool.inputSchema, bindings.expandNode(request))).not.toThrow()
  }
})

test("native acceptance resumes the retained operation through the public ID-only contract", () => {
  const expression = /call\(child, "dock_node_resume", (.*?)\)\n/.exec(source)?.[1]
  if (!expression) throw Error("ACCEPTANCE_RESUME_MISSING")
  const tool = nodeApiTools.find((item) => item.name === "dock_node_resume")!
  for (const request of [requests.importRequest, requests.groupRequest]) {
    const resume = runInNewContext(`(${expression})`, { request }, { timeout: 1000 }) as Record<string, unknown>
    expect(() => validateActionParameters(userNodeTool(tool).inputSchema, resume)).not.toThrow()
    expect(resume).toEqual({ operation_id: request.operation_id })
  }
})
