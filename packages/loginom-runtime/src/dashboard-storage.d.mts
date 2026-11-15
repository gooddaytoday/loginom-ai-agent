export function dashboardRequest(input: unknown, publish?: boolean): {
  directory: string
  content?: string
  expected?: { name: string; sourceHash: string } | null
}
