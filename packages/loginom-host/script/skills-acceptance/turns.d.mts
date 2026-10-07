export function acceptanceTurns(testcase: {
  id: string
  prompt: string
  input: string
  expected: { profile: string; result: unknown }
  setup?: unknown
  followup?: unknown
}): {
  prompt: string
  input: string
  expected: { profile: string; result: unknown }
  scenario: boolean
  verification?: "sales" | "import" | "calculator" | "execution"
}[]
