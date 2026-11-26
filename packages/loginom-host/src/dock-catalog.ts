import { browserRecoveryToolName } from "../../loginom-runtime/client/lib/browser-recovery.mjs"

// Managed user-v1 Dock names. Only the prepared runtime supplies full schemas.
const workspaceToolNames = [
  "dock_action_describe",
  "dock_action_run",
  "dock_artifact_deliver",
  "dock_artifact_delivery_cancel",
  "dock_artifact_delivery_resume",
  "dock_artifact_delivery_status",
  "dock_node_apply",
  "dock_node_cancel",
  "dock_node_delete",
  "dock_node_read",
  "dock_node_resume",
  "dock_node_status",
  "dock_node_stop",
  "dock_node_wait",
  "dock_operation_inspect",
  "dock_operation_recover",
  "dock_storage_download_cancel",
  "dock_storage_download_cleanup",
  "dock_storage_download_start",
  "dock_storage_download_status",
  "dock_storage_download_wait",
  "dock_storage_list",
  "dock_storage_source",
  "dock_workspace_observe",
]

export function dockBootstrapTools(browserRecovery: boolean) {
  const names = browserRecovery ? [...workspaceToolNames, browserRecoveryToolName] : workspaceToolNames
  return names.map((name) => ({ name, description: "Call dock_prepare.", inputSchema: { type: "object" as const } }))
}
