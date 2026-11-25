type DockWorkspaceTool = {
  name: string
  description: string
  inputSchema: { type: "object"; [key: string]: unknown }
  annotations?: { readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: boolean }
}

export const dockWorkspaceTools: readonly DockWorkspaceTool[]
export const dockWorkspaceToolsWithRecovery: readonly DockWorkspaceTool[]
