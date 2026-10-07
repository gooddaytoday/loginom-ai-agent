// Shared by the standalone entry and artifact builder. Capabilities describe
// optional runtime contracts, not acceptance or the availability of credentials.
export function cliCapabilities(platform: string, arch: string, libc?: string): string[] {
  return platform === "linux" && arch === "x64" && libc === "glibc" ? ["shared-oauth-v1"] : []
}

export function requireCliCapabilities(actual: readonly string[] | undefined, expected: readonly string[]) {
  if (!actual || JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort()))
    throw new Error("LOGINOM_CANDIDATE_CAPABILITIES_MISMATCH")
}
