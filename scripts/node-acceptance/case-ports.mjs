import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { matchesExpectedOutput, parseExpectedOutputs } from './expected-outputs.mjs';

export function checkCasePorts(expected, candidates) {
  const {outputs} = parseExpectedOutputs(expected);
  for (const want of outputs) {
    // Compare the final read on the intended node port. Earlier good values
    // cannot hide a later re-run with the wrong settings.
    const observed = candidates.findLast(row => row.type === want.output_node_type
      && (want.output_node_label === undefined || row.label === want.output_node_label)
      && row.port === (want.output_port ?? 0));
    if (!observed) throw Error('CASE_PORT_OUTPUT_MISSING: ' + want.output_node_type);
    if (!matchesExpectedOutput(observed.data, want)) throw Error('CASE_PORT_OUTPUT_MISMATCH: ' + want.output_node_type);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [expected, candidates] = process.argv.slice(2).map(path => JSON.parse(readFileSync(path, 'utf8')));
  checkCasePorts(expected, candidates);
}
