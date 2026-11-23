export function createRedactor(knownValues?: string[]): {
  redact(value: unknown, options?: { preserveJsonText?: boolean }): unknown
  prime(value: unknown): void
  text(raw: string): string
}
