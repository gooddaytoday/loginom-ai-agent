export const nodeCaseIds = [
  "crosstable-fixed-sum", "crosstable-sliding-average", "crosstable-reconfigure",
  "crosstable-multi-row-keys", "crosstable-min-max", "crosstable-sliding-source-refresh",
  "crosstable-string-counts-null", "crosstable-column-cartesian", "crosstable-multi-facts", "crosstable-local-variable-bindings",
] as const

export const coverageCaseIds = nodeCaseIds.slice(6) as readonly string[]

export function nodeCase(id: string) {
  if (!(nodeCaseIds as readonly string[]).includes(id)) throw Error(`unsupported node case: ${id}`)
  const coverage = coverageCaseIds.includes(id)
  const facts = id === "crosstable-string-counts-null"
    ? [{ name: "Text", type: "string", functions: ["count", "unique_count", "null_count"], mask: 386 }]
    : id === "crosstable-multi-facts"
      ? [{ name: "Amount", type: "real", functions: ["sum"], mask: 1 }, { name: "Units", type: "integer", functions: ["max"], mask: 8 }]
      : [{ name: "Amount", type: "real", functions: id === "crosstable-local-variable-bindings" ? ["sum", "count"] : ["sum"], mask: id === "crosstable-local-variable-bindings" ? 3 : 1 }]
  return {
    coverage,
    facts,
    dimensions: id === "crosstable-column-cartesian" ? ["Category", "Channel"] : ["Category"],
    keys: id === "crosstable-multi-row-keys" ? ["Region", "Month"] : ["Region"],
    functions: id === "crosstable-min-max" ? ["min", "max"] : id === "crosstable-fixed-sum" || id === "crosstable-multi-row-keys" || id === "crosstable-sliding-source-refresh" ? ["sum"] : ["avg"],
    mode: ["crosstable-sliding-average", "crosstable-sliding-source-refresh", "crosstable-local-variable-bindings"].includes(id) ? "sliding" : "fixed",
    native: coverage || ["crosstable-multi-row-keys", "crosstable-min-max", "crosstable-sliding-source-refresh"].includes(id),
  }
}
