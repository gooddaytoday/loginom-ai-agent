export function recordLocalDiagnostics(root: string, sessionId: string, events: unknown[], options?: {
  knownSecrets?: string[]
}): Promise<string>
