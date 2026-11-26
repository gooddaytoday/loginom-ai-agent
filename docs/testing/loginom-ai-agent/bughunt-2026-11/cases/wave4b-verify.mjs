import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { matchVariableInventoryOutput, parseExpectedVariableInventory } from '../../../../../scripts/node-acceptance/expected-outputs.mjs';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const readLines = path => readFileSync(path, 'utf8').trimEnd().split('\n');
const inventory = turn => parseExpectedVariableInventory(read(new URL(`./bh-w45-t${turn}/expected.json`, import.meta.url)));

export function verifyLimit(lines, want) {
  let latest;
  for (const [index, line] of lines.entries()) {
    const {type, part} = JSON.parse(line);
    if (type !== 'tool_use' || !['loginom_dock_node_apply', 'loginom_dock_node_wait', 'loginom_dock_node_read'].includes(part.tool)
        || part.state?.status !== 'completed' || !part.state.output?.startsWith('{')) continue;
    const receipt = JSON.parse(part.state.output.split('\n\n', 1)[0]);
    const readback = receipt.configuration?.readback;
    if (receipt.status !== 'SUCCEEDED' || receipt.cleanup_complete !== true
        || readback?.kind !== 'variables_calculator' || !receipt.node?.node_id
        || !['document_id', 'workflow_id', 'node_id'].every(key => receipt.node[key] === readback.node?.[key])
        || receipt.execution?.status !== 'completed') continue;
    const port = receipt.output?.variable_ports?.find(item => item.port === want.port);
    if (port) latest = {port, execution: receipt.execution, line: index + 1};
  }
  assert(latest, 'W45_LIMIT_READ_MISSING');
  assert.equal(latest.port.execution_id, latest.execution.execution_id, 'W45_LIMIT_STALE_READ');
  matchVariableInventoryOutput(latest.port, want);
  return latest.line;
}

export function verifyControl(graph, want, observation) {
  const nodeId = type => {
    const nodes = Object.entries(graph.nodes).filter(([, node]) => node.type === type);
    assert.equal(nodes.length, 1, 'W45_GRAPH_NODE_COUNT:' + type);
    return nodes[0][0];
  };
  const source = nodeId(want.source.type);
  const target = nodeId(want.target.type);
  const imported = nodeId('imports.text');
  nodeId('variables.user');
  assert.equal(Object.keys(graph.nodes).length, 4, 'W45_GRAPH_EXTRA_NODE');
  assert.equal(graph.links.length, 2, 'W45_GRAPH_LINK_COUNT');
  const isTable = edge => edge?.source === imported && edge.target === target && edge.output === 0 && edge.input === 0 && !edge.kind;
  assert.equal(graph.links.filter(isTable).length, 1, 'W45_GRAPH_TABLE_LINK');
  const edge = graph.links.find(link => !isTable(link));
  if (typeof edge !== 'string') {
    assert(edge?.source === source && edge.target === target && edge.output === want.output
           && edge.input === want.input && edge.kind === want.kind, 'W45_GRAPH_CONTROL_LINK');
    return;
  }
  const from = observation?.nodes?.find(node => node.node_id === source);
  const to = observation?.nodes?.find(node => node.node_id === target);
  const output = from?.variable_outputs?.find(port => port.kind === 'variables' && port.port === want.output);
  const input = to?.variable_inputs?.find(port => port.kind === want.kind && port.port === want.input);
  assert(output && input && observation.graph_identity?.native_prefix, 'W45_GRAPH_CONTROL_PORTS_MISSING');
  assert.equal(edge, `${observation.graph_identity.native_prefix}${from.node_ref.node_label}|Output_Var-${output.native_index}|${to.node_ref.node_label}|Input_ControlVar`,
               'W45_GRAPH_CONTROL_LINK');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scenario = process.argv[2];
  assert(scenario, 'Usage: node wave4b-verify.mjs RUN_DIR/bh-w45-t5');
  const limit = join(scenario, 'bh-w45-t2', 'model.stdout');
  console.log(`bh-w45-t2 Limit PASS: model.stdout:${verifyLimit(readLines(limit), inventory(2).outputs[0])}`);
  for (const turn of [4, 5]) {
    const stage = join(scenario, `bh-w45-t${turn}`);
    if (!existsSync(stage)) continue;
    const graph = read(join(stage, 'graph-observed.json'));
    const [, path, line] = /^(.*):(\d+)$/.exec(graph.location);
    const event = JSON.parse(readLines(join(scenario, 'profile', path))[Number(line) - 1]);
    verifyControl(graph, inventory(turn).links[0], event.outcome?.output);
    console.log(`bh-w45-t${turn} control graph PASS`);
  }
}
