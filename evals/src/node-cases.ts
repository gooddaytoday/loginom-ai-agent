export const nodeCaseIds = [
  "crosstable-fixed-sum", "crosstable-sliding-average", "crosstable-reconfigure",
  "crosstable-multi-row-keys", "crosstable-min-max", "crosstable-sliding-source-refresh",
] as const

export function nodeCase(id: string) {
  if (!(nodeCaseIds as readonly string[]).includes(id)) throw Error(`unsupported node case: ${id}`)
  return {
    keys: id === "crosstable-multi-row-keys" ? ["Region", "Month"] : ["Region"],
    functions: id === "crosstable-min-max" ? ["min", "max"] : id === "crosstable-fixed-sum" || id === "crosstable-multi-row-keys" || id === "crosstable-sliding-source-refresh" ? ["sum"] : ["avg"],
    mode: id === "crosstable-sliding-average" || id === "crosstable-sliding-source-refresh" ? "sliding" : "fixed",
    native: ["crosstable-multi-row-keys", "crosstable-min-max", "crosstable-sliding-source-refresh"].includes(id),
  }
}
