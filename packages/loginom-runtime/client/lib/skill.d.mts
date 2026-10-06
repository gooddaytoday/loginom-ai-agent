export const prepareTool: {
  name: "dock_prepare"
  description: string
  inputSchema: { type: "object"; properties: Record<string, unknown>; additionalProperties: false }
  annotations: { readOnlyHint: false; destructiveHint: false; openWorldHint: true }
}

export function createSkillLoader(input: { resources: string }): {
  prepare(): Promise<{
    directory: string
    main: string
    detail: {
      revision: string
      source: "bundled"
      files: { path: string; sha256: string }[]
      content_sha256: string
      content: string
    }
  }>
}
