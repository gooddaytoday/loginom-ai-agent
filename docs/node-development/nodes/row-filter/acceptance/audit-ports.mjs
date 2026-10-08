import {matchesExpectedOutput} from '../../../../../scripts/node-acceptance/expected-outputs.mjs';

export function auditPorts(actual, expected, binding) {
  const need = (ok, reason) => { if (!ok) throw Error(reason); };
  need(actual?.node?.node_id === binding.node_id && actual?.node?.document_id === binding.document_id,
    'FILTER_FOREIGN_NODE');
  const execution = actual.execution;
  need(execution?.status === 'completed' && execution.verified === true && execution.owner_verified === true
    && typeof execution.execution_id === 'string' && execution.execution_id === binding.execution_id, 'FILTER_STALE_EXECUTION');
  const ports = actual.ports;
  need(Array.isArray(ports) && ports.length === 2 && ports[0].port === 0 && ports[1].port === 1,
    'FILTER_BOTH_PORTS_REQUIRED');
  need(ports.every(port => port.fresh === true && port.execution_id === execution.execution_id)
    && ports[0].port_guid && ports[1].port_guid && ports[0].port_guid !== ports[1].port_guid,
    'FILTER_PORT_EXECUTION_IDENTITY');
  for (const port of ports) {
    need(matchesExpectedOutput(port, {columns: expected.columns, rows: expected.full_ports[port.port]}),
      'FILTER_VALUES_SCHEMA_OR_PARTITION:' + port.port);
  }
  return {status: 'PASS', execution_id: execution.execution_id, rows: ports.map(port => port.row_count)};
}
