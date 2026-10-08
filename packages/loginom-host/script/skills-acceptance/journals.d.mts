export function collectExecutionJournals(profile: string, evidence: string, secrets?: string[]): Promise<{
  source: string
  name: string
  bytes: number
  sha256: string
}[]>
