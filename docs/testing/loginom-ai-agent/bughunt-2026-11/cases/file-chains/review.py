#!/usr/bin/env python3
"""Check typed Loginom output receipts for turns with no requested file export."""

import argparse
import importlib.util
import json
from pathlib import Path


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
            if 'port_outputs' not in expected:
                continue
            journal = folder / 'model.stdout'
            replies = runner.model_replies(runner.records(journal))
            checks.extend(dict(check, case=case) for check in runner.check_case_port_outputs(
                expected['port_outputs'], graph, replies, journal))
    return checks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('run', type=Path)
    args = parser.parse_args()
    checks = collect(args.run.resolve(), load_runner())
    print(json.dumps(checks, ensure_ascii=False, indent=2))
    return int(not checks or any(check['code'] for check in checks))


if __name__ == '__main__':
    raise SystemExit(main())
