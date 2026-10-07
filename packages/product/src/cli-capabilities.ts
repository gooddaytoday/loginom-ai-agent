// Shared by the standalone entry and artifact builder. Capabilities describe
// optional runtime contracts, not acceptance or the availability of credentials.
export function cliCapabilities(platform: string, arch: string, libc?: string): string[] {
  return platform === "linux" && arch === "x64" && libc === "glibc" ? ["shared-oauth-v1"] : []
}
