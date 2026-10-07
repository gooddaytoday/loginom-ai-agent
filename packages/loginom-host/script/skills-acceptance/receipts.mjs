export function completedDockReceipts(tools) {
  return tools
    .filter((tool) => tool.tool.startsWith("loginom_dock_") && tool.state.status === "completed")
    .flatMap((tool) =>
      tool.state.output
        .split("\n\n")
        // Inspect appends human-readable advice after its JSON receipts.
        .filter((text) => tool.tool !== "loginom_dock_operation_inspect" || text.trimStart().startsWith("{"))
        .map((text) => ({ tool, body: JSON.parse(text) })),
    )
}
