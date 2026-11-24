export type AcceptanceProbe = { condition: "P3" | "P5"; packagePath: string }
export function validAcceptanceProbe(value: unknown): value is AcceptanceProbe
