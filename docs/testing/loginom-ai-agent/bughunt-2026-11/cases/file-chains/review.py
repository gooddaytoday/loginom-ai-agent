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
            expected = runner.read(HERE.parent / case / 'expected.json')
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
            journal = folder / 'model.stdout'
            replies = runner.model_replies(runner.records(journal))
            for table in expected['tables']:
                selector = next(node for node in expected['graph']['nodes']
                                if node.get('label') == table['output_node_label'])
                node_id = ids[selector['id']]
                candidates = [(line, port) for line, reply in replies
                              for owner, port in runner.ports(reply)
                              if owner.get('status') == 'SUCCEEDED'
                              and owner.get('node', {}).get('node_id') == node_id
                              and port.get('port') == table['output_port']
                              and runner.port_path(owner, port)]
                if candidates:
                    line, port = candidates[-1]
                    checks.append(dict(case=case, location=f'{journal}:{line}', table=table,
                                       actual=port))
                else:
                    checks.append(dict(case=case, location=f'{journal}:1', table=table,
                                       code='TYPED_PORT_EVIDENCE_MISSING'))
    return checks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('run', type=Path)
    args = parser.parse_args()
    code = """
        import {readFileSync} from 'node:fs';
        import {pathToFileURL} from 'node:url';
        const {matchesExpectedOutput} = await import(pathToFileURL(process.argv[1]));
        const results = JSON.parse(readFileSync(0, 'utf8')).map(({actual, table, code, ...evidence}) => {
            const error = code ?? (matchesExpectedOutput(actual, table) ? null : 'TYPED_PORT_DIFFERS');
            const schema = actual?.schema?.map(({name, type}) => ({name, type}));
            return {...evidence, node: table?.output_node_label, code: error,
                    rows: actual?.row_count, schema};
        });
        console.log(JSON.stringify(results, null, 2));
        process.exitCode = results.some(result => result.code) ? 1 : 0;
    """
    checks = collect(args.run.resolve(), load_runner())
    return subprocess.run(['node', '--input-type=module', '-e', code,
                           str(ACCEPTANCE / 'expected-outputs.mjs')],
                          input=json.dumps(checks), text=True, check=False).returncode


if __name__ == '__main__':
    raise SystemExit(main())
