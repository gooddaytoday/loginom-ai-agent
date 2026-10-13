export type StorageNavigationElement = {
  ref: string
  tid: string
  label?: string
  allowed_actions: string[]
  interaction?: { state: string }
  storage_entry?: { kind?: string; bytes?: number }
  scroll?: unknown
}
export type StorageNavigationSnapshot = {
  observation_id: string
  authenticated: boolean
  origin: string
  loginom_build: string
  dom_epoch: { document: string; revision: number }
  workflow_ref: unknown
  active_tab_ref?: string
  package_identity?: unknown
  geometry?: unknown
  file_storage?: { status: string; directory?: string | null }
  ui: { elements: StorageNavigationElement[]; dialogs: unknown[]; masks: unknown[] }
}
export type StorageNavigationReceipt = {
  status: string
  phase?: string
  effect_possible?: boolean
  cleanup_complete?: boolean
  operation_id?: string
  error?: { code?: string; message?: string }
  trace?: { event: string; code?: string }[]
}
export function rebindStorageNavigation(
  original: StorageNavigationSnapshot, fresh: StorageNavigationSnapshot,
  element: StorageNavigationElement, verb: string,
): StorageNavigationElement
export function navigateStorageWithFreshObservation(options: {
  snapshot: StorageNavigationSnapshot
  element: StorageNavigationElement
  verb?: string
  extra?: Record<string, unknown>
  observe: (snapshot: StorageNavigationSnapshot, element: StorageNavigationElement) => Promise<StorageNavigationSnapshot>
  act: (snapshot: StorageNavigationSnapshot, element: StorageNavigationElement, verb: string, extra: Record<string, unknown>) => Promise<StorageNavigationReceipt>
  record: (event: Record<string, unknown>) => Promise<unknown>
}): Promise<StorageNavigationReceipt>
