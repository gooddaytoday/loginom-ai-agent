export type FileIdentity = { canonical_path: string; size: number; mtime: number; ctime: number; file_id: string }
export type ReferenceSnapshot = FileIdentity & { sha256: string }
export type ReferenceSlot = { grant: string; chat: string; userMessage: string; generation: number; name: string; directory: string; path: string }
export type FileReference = Pick<ReferenceSlot, "grant" | "chat" | "userMessage" | "generation" | "name"> & { snapshot: ReferenceSnapshot }
export type StreamOptions = { signal?: AbortSignal; onProgress?: (bytes: number) => void | Promise<void> }
export function referenceUploadBudget(size: number): number
export function inspectReferenceFile(path: string): Promise<FileIdentity>
export function verifyReferenceFile(snapshot: ReferenceSnapshot, options?: StreamOptions): Promise<ReferenceSnapshot>
export function stageReferenceFile(source: string, expected: FileIdentity, slot: ReferenceSlot, options?: StreamOptions & { sha256?: string }): Promise<FileReference>
