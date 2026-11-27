import type { PermissionRequest } from "@opencode/client/promise"

export function conversationScope(request: Pick<PermissionRequest, "action" | "resources">) {
  switch (request.action) {
    case "edit":
      return "scopeWrite"
    case "external_directory":
      return "scopeRead"
    case "loginom_dock_action_run":
    case "dashboard_publish":
      return "scopeSave"
    case "loginom_dock_prepare":
      return request.resources.every((resource) => resource === "local_package") ? "scopeSave" : undefined
    case "loginom_dock_node_apply":
      return request.resources.every((resource) => resource.startsWith("exports.")) ? "scopeExport" : undefined
    case "webfetch":
    case "websearch":
      return "scopeWeb"
  }
}
