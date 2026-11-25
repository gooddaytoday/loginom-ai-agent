import type { Buffer } from 'node:buffer'
import type { BigIntStats } from 'node:fs'

export type FileStatIdentity = { size: number; mtime: number; ctime: number; file_id: string }
export type FileIdentity = FileStatIdentity & { canonical_path: string; mtime_ns: string; ctime_ns: string }
export type ReferenceSnapshot = FileIdentity & { sha256: string | null }
export type FileReference = { grant: string; chat: string; userMessage: string; generation: number; name: string; snapshot: ReferenceSnapshot }
export function fileStatIdentity(stat: BigIntStats): FileStatIdentity
export function referenceUploadBudget(size: number): number
export function inspectReferenceFile(path: string): Promise<FileIdentity>
export function openReferenceFile(snapshot: ReferenceSnapshot, options?: { signal?: AbortSignal }): Promise<{
  verify(): Promise<ReferenceSnapshot>;
  readBytes(maxBytes: number): Promise<Buffer>;
  close(): Promise<void>;
}>
export function verifyReferenceFile(snapshot: ReferenceSnapshot, options?: { signal?: AbortSignal }): Promise<ReferenceSnapshot>
