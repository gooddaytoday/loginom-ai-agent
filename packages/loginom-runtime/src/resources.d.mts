export function verifyResources(
  root: string,
  options?: {
    nodeVersion?: string
    nodePath?: string
    manifestHash?: string
    signal?: AbortSignal
    cachePath?: string
    cacheVersion?: string
    forceHash?: boolean
    requireCache?: boolean
  },
): Promise<{
  manifest: { files: { path: string; sha256: string }[]; actionManifestSha256?: string }
  nodePath: string
  browserPath: string
  browserRoot: string
  browserHash: string
  manifestHash: string
  verification: { mode: string; hashedFiles: number; cachedFiles: number }
}>
