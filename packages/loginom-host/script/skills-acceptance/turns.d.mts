export function acceptanceTurns(testcase: {
  id: string
  prompt: string
  input: string
  fixture?: string
  expected: { profile: string; result: unknown }
  setup?: unknown
  followup?: unknown
}): {
  prompt: string
  input: string
  fixture?: string
  expected: { profile: string; result: unknown }
  scenario: boolean
  verification?: "sales" | "import" | "calculator" | "execution" | "local-calculator"
}[]

export function prepareAcceptanceInputs(turns: ReturnType<typeof acceptanceTurns>, fixtures: Record<string, string>, paths: Record<string, string>): Promise<void>
export function acceptanceInputPath(turn: { input: string }, paths: Record<string, string>): string
export function acceptanceCliPermission(testcase: { id: string }, turn: { scenario: boolean }, path: string): { permission?: { external_directory: Record<string, "allow"> } }
