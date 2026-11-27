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

const productDescriptions = {
  loginom_file_admit: "permissionRead",
  loginom_file_profile: "permissionRead",
  loginom_file_scan: "permissionRead",
  loginom_file_sample: "permissionRead",
  dashboard_publish: "permissionPublish",
  dashboard_delete: "permissionDelete",
  shell: "permissionShell",
} as const

const coreActions: readonly string[] = ["read", "glob", "grep", "edit", "external_directory", "webfetch", "websearch"]

export function permissionDescription(request: Pick<PermissionRequest, "action" | "resources">) {
  if (Object.hasOwn(productDescriptions, request.action)) {
    // SAFETY: The own-key check above rules out inherited and missing properties.
    return productDescriptions[request.action as keyof typeof productDescriptions]
  }

  switch (conversationScope(request)) {
    case "scopeSave":
      return "permissionSave"
    case "scopeExport":
      return "permissionExport"
  }

  if (coreActions.includes(request.action)) return "permissionAction"
}

export function packageLocation(path: string | undefined) {
  if (!path) return {}
  const separator = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))
  const root = separator === 0 || (separator === 2 && path[1] === ":")

  return {
    name: path.slice(separator + 1),
    folder: separator < 0 ? undefined : path.slice(0, separator + Number(root)),
  }
}
