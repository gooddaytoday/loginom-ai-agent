export function closeSlotUserSession(input: { username: string; name: string }): Promise<{
  outcome: "confirmed" | "not_applied" | "unknown"
  data: { closed?: true; code?: string }
}>
