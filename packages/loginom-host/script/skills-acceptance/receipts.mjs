export function completedDockReceipts(tools) {
  return tools
    .filter((tool) => tool.tool.startsWith("loginom_dock_") && tool.state.status === "completed")
    .flatMap((tool) =>
      tool.state.output
        .split("\n\n")
        // Dock tools can append human-readable advice after their JSON receipts.
        .filter((text) => text.trimStart().startsWith("{"))
        .map((text) => ({ tool, body: JSON.parse(text) })),
    )
}
