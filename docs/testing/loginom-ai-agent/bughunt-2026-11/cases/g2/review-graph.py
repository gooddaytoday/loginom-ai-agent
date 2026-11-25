#!/usr/bin/env python3
"""Check run-check graph snapshots and compare node IDs between turns."""
import argparse
import json
from pathlib import Path

from oracle import DEPTHS, expectation, name


def key(node):
    return node['type'], node['label']


def check_snapshot(snapshot, contract):
    if not snapshot.get('location'):
        raise ValueError('Graph snapshot is missing a journal location')
    nodes = snapshot['nodes']
    ids = {key(node): node_id for node_id, node in nodes.items()}
    wanted = {node['id']: key(node) for node in contract['nodes']}
    if len(nodes) != len(ids):
        raise ValueError('Graph contains duplicate node selectors')
    wanted_keys = set(wanted.values())
    if ids.keys() != wanted_keys:
        raise ValueError(f'Missing nodes {wanted_keys - ids.keys()}. Extra nodes {ids.keys() - wanted_keys}.')

    reverse = {node_id: node for node, node_id in ids.items()}
    links = {(reverse[link['source']], link['output'], reverse[link['target']], link['input'])
             for link in snapshot['links']}
    if len(links) != len(snapshot['links']):
        raise ValueError('Graph contains duplicate links')
    unmatched = set(links)
    for link in contract['links']:
        source, target = wanted[link['source']], wanted[link['target']]
        matches = {actual for actual in unmatched
                   if actual[:3] == (source, link['output'], target)
                   and (actual[3] == link['input'] if 'input' in link else actual[3] in (1, 2))}
        if len(matches) != 1:
            raise ValueError(f'Expected one link {link}, found {sorted(matches)}')
        unmatched -= matches
    if unmatched:
        raise ValueError(f'Extra links {sorted(unmatched)}')
    return ids, links


def delta(previous, current):
    before_ids, before_links = previous
    after_ids, after_links = current
    before_by_id = {value: node for node, value in before_ids.items()}
    after_by_id = {value: node for node, value in after_ids.items()}
    common_ids = before_by_id.keys() & after_by_id.keys()
    identities = {node: (before_ids[node], after_ids[node])
                  for node in before_ids.keys() & after_ids.keys()
                  if before_ids[node] != after_ids[node]}
    if identities:
        raise ValueError(f'Recreated nodes {identities}')
    renamed = [(before_by_id[node_id], after_by_id[node_id]) for node_id in sorted(common_ids)
               if before_by_id[node_id] != after_by_id[node_id]]

    def edges(links, ids):
        return {(ids[source], output, ids[target], input_port): (source, output, target, input_port)
                for source, output, target, input_port in links}

    before_edges, after_edges = edges(before_links, before_ids), edges(after_links, after_ids)
    return {
        'preserved_nodes': sorted(after_by_id[node_id] for node_id in common_ids),
        'renamed_nodes': renamed,
        'added_nodes': sorted(after_by_id[node_id] for node_id in after_by_id.keys() - common_ids),
        'removed_nodes': sorted(before_by_id[node_id] for node_id in before_by_id.keys() - common_ids),
        'preserved_links': sorted(after_edges[edge] for edge in before_edges.keys() & after_edges.keys()),
        'added_links': sorted(after_edges[edge] for edge in after_edges.keys() - before_edges.keys()),
        'removed_links': sorted(before_edges[edge] for edge in before_edges.keys() - after_edges.keys()),
    }


def compare(chain, paths):
    previous = ({}, set())
    report = []
    for turn, path in enumerate(paths, 1):
        case = name(chain, turn)
        try:
            loaded = json.loads(path.read_text(encoding='utf-8'))
            contract = expectation(chain, turn)['graph']
            current = check_snapshot(loaded, contract)
            changes = delta(previous, current)
            if chain == 204 and turn == 2 and not changes['renamed_nodes']:
                raise ValueError('Renamed node has a different ID')
            if chain == 203 and turn == 4 and (changes['added_links'] or changes['removed_links']):
                raise ValueError('Re-execution moved a link')
            report.append({'case': case, 'status': 'PASS', 'location': loaded['location'], **changes})
            previous = current
        except (KeyError, OSError, TypeError, ValueError) as exc:
            report.append({'case': case, 'status': 'FAIL', 'detail': str(exc)})
            break
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('chain', type=int, choices=DEPTHS)
    parser.add_argument('snapshots', type=Path, nargs='+', help='Complete snapshots in turn order')
    args = parser.parse_args()
    if len(args.snapshots) > DEPTHS[args.chain]:
        parser.error('Too many snapshots for the selected chain')
    report = compare(args.chain, args.snapshots)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return int(report[-1]['status'] == 'FAIL')


if __name__ == '__main__':
    raise SystemExit(main())
