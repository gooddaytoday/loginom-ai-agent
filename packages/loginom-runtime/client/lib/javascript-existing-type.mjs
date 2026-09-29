import {readPreparedNodeContext, validatePreparedNodeContext} from './node-context.mjs';

// A caller-supplied node ref is not evidence of node type. Before Setting,
// inspect the exact rendered graph object bound to the prepared workflow.
export async function readJavascriptExistingGraphType(page, prepared, readNode = readPreparedNodeContext) {
  const before = await readNode(page, prepared);
  if (before?.verified !== true || before.surface !== 'graph')
    throw Error('JavaScript existing graph owner unavailable');
  const observed = await page.evaluate(binding => {
    const active = globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.();
    const model = active?.Controller?.FController;
    const diagram = model?.FDiagram;
    const nodes = diagram?.FNodes?.FCollection;
    const root = diagram?.FmxGraph?.container;
    const matches = Array.isArray(nodes) && nodes.length <= 200
      ? nodes.filter(node => node.FGuid === binding.node.node_id) : [];
    const native = matches[0], shape = native && diagram.FmxGraph.view.getState(native.FCell)?.shape?.node;
    if (matches.length !== 1 || !shape?.isConnected || !root?.contains(shape)
      || shape.getAttribute('data-tid') !== binding.graph_tid
      || native.FIconCls !== 'bg-vendor-icon-javascript')
      throw Error('Existing graph node is not the owned JavaScript type');
    return {node_id: native.FGuid, icon_class: native.FIconCls, graph_tid: shape.getAttribute('data-tid')};
  }, {...prepared, graph_tid: before.tid});
  const after = await readNode(page, prepared);
  if (JSON.stringify(before) !== JSON.stringify(after)
    || observed.node_id !== prepared.node.node_id || observed.graph_tid !== before.tid)
    throw Error('JavaScript existing graph type changed during inspection');
  return {verified: true, ...observed};
}

export function makeJavascriptExistingGraphTypeCode(prepared) {
  validatePreparedNodeContext(prepared);
  return `async page=>(${readJavascriptExistingGraphType.toString()})(page,${JSON.stringify(prepared)},${readPreparedNodeContext.toString()})`;
}
