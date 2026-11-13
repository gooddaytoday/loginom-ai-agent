export function verifyResources(
  root: string,
  options?: {
    nodeVersion?: string
    nodePath?: string
    manifestHash?: string
    signal?: AbortSignal
  },
): Promise<{
  manifest: { files: { path: string; sha256: string }[]; actionManifestSha256?: string }
  nodePath: string
  browserPath: string
  browserRoot: string
  browserHash: string
  manifestHash: string
}>
