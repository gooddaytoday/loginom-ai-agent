// Shared by the standalone entry and artifact builder. Capabilities describe
// optional runtime contracts, not acceptance or the availability of credentials.
export function cliCapabilities(platform: string, arch: string): string[] {
  return platform === "linux" && arch === "x64" ? ["shared-oauth-v1"] : []
}
