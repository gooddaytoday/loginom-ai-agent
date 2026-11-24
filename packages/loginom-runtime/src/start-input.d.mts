export type AcceptanceProbe = { condition: "P3" | "P5"; packagePath: string } | { condition: "P1" | "P2"; packagePath: string; inputSha256: string }
export function validAcceptanceProbe(value: unknown): value is AcceptanceProbe
