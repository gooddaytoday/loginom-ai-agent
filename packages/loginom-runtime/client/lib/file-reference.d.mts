export type FileIdentity = { canonical_path: string; size: number; mtime: number; ctime: number; mtime_ns: string; ctime_ns: string; file_id: string }
export type ReferenceSnapshot = FileIdentity & { sha256: string | null }
export type FileReference = { grant: string; chat: string; userMessage: string; generation: number; name: string; snapshot: ReferenceSnapshot }
export function referenceUploadBudget(size: number): number
export function inspectReferenceFile(path: string): Promise<FileIdentity>
export function openReferenceFile(snapshot: ReferenceSnapshot, options?: { signal?: AbortSignal }): Promise<{ verify(): Promise<ReferenceSnapshot>; close(): Promise<void> }>
export function verifyReferenceFile(snapshot: ReferenceSnapshot, options?: { signal?: AbortSignal }): Promise<ReferenceSnapshot>
