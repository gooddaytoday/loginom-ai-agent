/** PREPARED draft only. No route to admission, recovery, release or live mutation. */
export function prepareLab57CleanupProposal(input: unknown) {
  const value = input as { binding?: { task?: string } }
  const missing = ["LEGACY_GUARD_PARENT_BIRTH_UNCAPTURED", "SERVER_CESSATION_UNPROVEN", "FRESH_OPERATOR_GUARDS_REQUIRED"]
  if (value?.binding?.task !== "01a1375d-ce4a-7c35-a3a3-94cf64a8b589") missing.push("ORIGINAL_LEASE_BINDING_CHANGED")
  return { status: "PREPARED", applied: false, readiness: "NOT_READY", missing }
}
