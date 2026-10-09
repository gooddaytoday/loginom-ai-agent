import { expect, test } from "bun:test"
import { runInNewContext } from "node:vm"
import { nodeApiTools, textImportParametersSchema } from "../../loginom-runtime/client/lib/node-api.mjs"
import { userNodeTool, createUserWorkflowBindings } from "../../loginom-runtime/client/lib/user-workflow.mjs"
import { validateActionParameters } from "../../loginom-runtime/client/lib/action-catalog.mjs"

// Validate the driver's actual request against the JavaScript runtime contracts
// without executing its live entrypoint, credentials, browser or signal targets.
test("owner-crash import uses the public compact request and host expansion", async () => {
  const source = await Bun.file(new URL("../script/cli-owner-crash.ts", import.meta.url)).text()
  const declaration = /const applied = await call\("dock_node_apply", (\{[\s\S]*?^    \})\)/m.exec(source)?.[1]
  if (!declaration) throw Error("CRASH_IMPORT_DECLARATION_MISSING")
  const workspace = { document_id: "offline-document", workflow_ref: { workflow_id: "offline-workflow" } }
  const request = runInNewContext(`(${declaration})`, {
    receipt: { workspace },
    artifact: { artifact_id: "offline-artifact", upload: { destination: "/user/sales.csv" } },
    delivery: { output: { upload_operation_id: "offline-upload" } },
  }, { timeout: 1000 })
  const tool = nodeApiTools.find((item) => item.name === "dock_node_apply")
  const bindings = createUserWorkflowBindings()
  bindings.remember({
    ...workspace,
    workflow_ref: {
      ...workspace.workflow_ref,
      tab_tid: "offline-tab", prefix: "offline-prefix",
      navigation_path: [{ tid: "offline-path", label: "Offline" }],
    },
  })
  expect(() => validateActionParameters(userNodeTool(tool).inputSchema, request)).not.toThrow()
  expect(() => validateActionParameters(textImportParametersSchema, request.parameters)).not.toThrow()
  expect(() => validateActionParameters(tool.inputSchema, bindings.expandNode(request))).not.toThrow()
})
