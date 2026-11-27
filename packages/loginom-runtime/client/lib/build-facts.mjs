export function nodeBuildFacts(result) {
  const outcome = result.outcome, node = outcome?.output;
  if (result.state !== 'settled' || outcome?.status !== 'SUCCEEDED'
      || outcome.cleanup_complete !== true || !result.operation_id) return;
  const ref = outcome.action_key === 'node.apply' ? node?.node :
    outcome.action_key === 'node.delete' ? node?.deleted_node?.ref : undefined;
  if (!ref) return;
  const { document_id, workflow_id, node_id } = ref;
  const facts = { kind: 'node', document_id, workflow_id, operation_id: result.operation_id };
  const id = node.execution?.execution_id;
  if (node.execution?.status !== 'completed' || !id) return facts;
  facts.execution = { source: 'node.execution', execution_id: id, node_id };
  const ports = node.output?.ports;
  if (node.output?.execution_id !== id || ports?.length !== 1) return facts;
  const [port] = ports;
  if (port.fresh === true && port.execution_id === id && port.freshness_basis === 'completed_execution_port_source'
      && port.port_guid && Number.isSafeInteger(port.port) && port.port >= 0
      && Number.isSafeInteger(port.row_count) && port.row_count >= 0) {
    facts.final_port_rows = { source: 'node.output.port', execution_id: id, port: port.port,
      port_guid: port.port_guid, count: port.row_count };
  }
  return facts;
}

export function saveBuildFacts(outcome, admission) {
  if (!admission || outcome?.status !== 'SUCCEEDED' || outcome.cleanup_complete !== true
      || outcome.action_key !== admission.action_key || outcome.output?.package_ref?.path !== admission.path) return;
  const { output, trace } = outcome;
  const path = output.package_ref.path;
  if (output.package_ref.kind !== 'package' || output.package_ref.active_identity !== path) return;
  const facts = { kind: 'save', document_id: admission.document_id, workflow_id: admission.workflow_id, operation_id: outcome.operation_id };
  const source = output.save_completed === true ? 'save_completed' :
    output.save_completed === undefined && trace?.some(event => event.event === 'save_flow_completed' && event.path === path)
      ? 'executor.save_flow_completed' : undefined;
  if (source) facts.save_completed = { source };
  const reopened = trace?.findLast(event => event.event === 'reopened_package_observed' &&
    event.actual_path === path && event.requested_path === path && event.path_matches === true && event.graph_matches === true);
  if (output.reopened === true && reopened) {
    facts.reopened = { source: 'reopened' };
    facts.package_path = { source: 'executor.reopened_package_observed', path };
  }
  const graph = reopened ?? trace?.findLast(event => event.event === 'open_saved_package_observed' &&
    event.actual_path === path && event.requested_path === path && event.workflow_matches === true &&
    event.path_matches === true && event.graph_matches === true);
  const navigation = graph?.workflow_ref?.navigation_path?.map(part => part.label) ?? admission.navigation;
  if (Array.isArray(graph?.graph?.nodes) && navigation?.at(-1)) {
    facts.node_count = { source: 'executor.save_graph', count: graph.graph.nodes.length, navigation: navigation.filter(Boolean) };
  }
  return facts;
}
