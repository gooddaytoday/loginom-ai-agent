import assert from "node:assert/strict"

export function verifyPreservedGraph(source, saved, calculator) {
  const nodes = saved.modules.flatMap(module => module.workflow_nodes)
  const links = saved.modules.flatMap(module => module.links)
  assert.ok(source.modules.some(module => module.workflow_nodes.some(node => node.guid.toLowerCase() === calculator.toLowerCase())), "EDITED_NODE_NOT_ORIGINAL")
  for (const module of source.modules) {
    assert.ok(module.workflow_nodes.every(node => nodes.some(saved => saved.guid.toLowerCase() === node.guid.toLowerCase())), "ORIGINAL_NODE_MISSING")
    assert.ok(module.links.every(link => links.some(saved => ["source_node_guid", "source_port_guid", "target_node_guid", "target_port_guid"].every(key => saved[key].toLowerCase() === link[key].toLowerCase()))), "ORIGINAL_LINK_CHANGED")
  }
}

export function verifyLocalFileAnswer(id, tools, path, text, markdown) {
  if (id === "text-read") {
    assert.ok(tools.some(tool => tool.tool === "read" && tool.state.status === "completed" && tool.state.input.filePath === path), "PATH_READ_NOT_VERIFIED")
    assert.equal(text.trim(), "PATH-74-АБВ-37")
  }
  if (id === "docs-after-edit") {
    assert.ok(tools.some(tool => tool.tool === "package_docs_run" && tool.state.status === "completed" && tool.state.input.operation === "extract" && tool.state.input.lgp === path), "MODIFIED_DOC_SOURCE_NOT_VERIFIED")
    assert.ok(tools.some(tool => tool.tool === "package_docs_run" && tool.state.status === "completed" && tool.state.input.operation === "emit" && tool.state.input.lgp === path && tool.state.input.format === "md"), "MODIFIED_DOC_EMIT_SOURCE_NOT_VERIFIED")
    // This is a tripwire for the known refusal, alongside manual review of the document.
    const formula = markdown?.split(/\n\s*\n/).some(paragraph =>
      !/(?:нельзя|невозможно|отсутству|не\s+(?:указан|подтвержд|представлен)|cannot\s+(?:verify|confirm))/iu.test(paragraph) &&
      /\bamount\s*\*\s*3(?![\p{L}\p{N}_]|\.\d)/u.test(paragraph.replace(/[`\[\]\\]/g, "")))
    assert.ok(markdown?.includes("amount_double") && formula, "MODIFIED_DOC_FACTS_NOT_VERIFIED")
  }
}

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
