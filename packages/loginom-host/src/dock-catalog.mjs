import { browserRecoveryTool } from "../../loginom-runtime/client/lib/browser-recovery.mjs"
import { executorTools } from "../../loginom-runtime/client/lib/executor.mjs"
import { deliveryApiTools, nodeApiTools } from "../../loginom-runtime/client/lib/node-api.mjs"
import { serverDownloadTools } from "../../loginom-runtime/client/lib/storage-policy.mjs"
import { userActionTool, userNodeTool } from "../../loginom-runtime/client/lib/user-workflow.mjs"
import { workspaceObserveTool } from "../../loginom-runtime/client/lib/workspace.mjs"

// Match the managed executor-replay user-v1 profile. The runtime supplies the
// live catalog after preparation, including any recovery-lease browser tools.
export const dockWorkspaceTools = [
  workspaceObserveTool,
  ...executorTools.filter((tool) => tool.name !== "dock_ui_action").map(userActionTool),
  ...serverDownloadTools,
  ...deliveryApiTools,
  ...nodeApiTools.map(userNodeTool),
].map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations }))

export const dockWorkspaceToolsWithRecovery = [...dockWorkspaceTools, browserRecoveryTool]
