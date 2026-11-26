#!/usr/bin/env python3
"""Check typed Loginom output receipts for turns with no requested file export."""

import argparse
import importlib.util
import json
from pathlib import Path
import subprocess


HERE = Path(__file__).resolve().parent
ACCEPTANCE = HERE.parents[5] / 'scripts' / 'node-acceptance'


def load_runner():
    spec = importlib.util.spec_from_file_location('run_check', ACCEPTANCE / 'run-check.py')
    runner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runner)
    return runner


def collect(run, runner):
    report = runner.read(run / 'results.json')
    checks = []
    for scenario in report['runs']:
        if scenario['scenario'] not in {'bh-w47', 'bh-w48', 'bh-w49', 'bh-w50'}:
            continue
        previous = {}
        for turn in scenario.get('turns', []):
            if turn['status'] != 'PASS':
                continue
            case = turn['case']
            folder = run / scenario['scenario'] / case
            case_spec = runner.scenario(case, cases=HERE.parent)
            expected = runner.expected_for(case_spec, scenario['package'])
            graph = runner.read(folder / 'graph-observed.json')
            ids = {}
            for selector in expected['graph']['nodes']:
                ids[selector['id']] = next(
                    key for key, value in graph['nodes'].items()
                    if value['type'] == selector['type']
                    and ('label' not in selector or value['label'] == selector['label'])
                )
            changes = [key for key, node_id in previous.items() if ids.get(key) != node_id]
            if changes:
                checks.append(dict(case=case, code='PRESERVED_NODE_CHANGED', nodes=changes,
                                   location=graph['location']))
            previous = ids
            if case_spec.get('output_mode') != 'ports':
                continue
            journal = folder / 'model.stdout'
            replies = runner.model_replies(runner.records(journal))
            candidates = []
            for line, reply in replies:
                for owner, port in runner.ports(reply):
                    node = graph['nodes'].get(owner.get('node', {}).get('node_id'))
                    if node and owner.get('status') == 'SUCCEEDED' and runner.port_path(owner, port):
                        candidates.append(dict(node, port=port.get('port'), data=port, line=line))
            for table in expected['outputs']:
                checks.append(dict(case=case, location=str(journal),
                                   expected=dict(expected, outputs=[table]), candidates=candidates))
    return checks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('run', type=Path)
    args = parser.parse_args()
    checks = collect(args.run.resolve(), load_runner())
    code = """
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {checkCasePorts} = await import(pathToFileURL(process.argv[2]));
const checks = JSON.parse(readFileSync(0, 'utf8'));
const results = checks.map(({expected, candidates, ...evidence}) => {
    if (!expected) return evidence;
    const [want] = expected.outputs;
    const observed = candidates.findLast(row => row.type === want.output_node_type
        && row.label === want.output_node_label && row.port === (want.output_port ?? 0));
    let code = null;
    try { checkCasePorts(expected, candidates); }
    catch (error) { code = error.message.split(':')[0]; }
    return {...evidence, location: evidence.location + ':' + (observed?.line ?? 1),
            node: want.output_node_label, code, rows: observed?.data.row_count};
});
console.log(JSON.stringify(results, null, 2));
process.exitCode = results.length === 0 || results.some(result => result.code) ? 1 : 0;
"""
    return subprocess.run(['node', '--input-type=module', '-e', code, 'file-chains-review',
                           str(ACCEPTANCE / 'case-ports.mjs')],
                          input=json.dumps(checks), text=True, check=False).returncode


if __name__ == '__main__':
    raise SystemExit(main())
