export type StartupDiagnostic = { name: string; code: string; message: string; cause?: StartupDiagnostic }
export function startupDiagnostic(error: unknown, knownSecrets?: string[]): StartupDiagnostic | undefined
