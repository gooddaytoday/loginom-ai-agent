#!/usr/bin/env python3
"""Fixed bounded qualification coordinator; ordinary public gates stay closed.

This entry requires the exact private operation/owner binding on clean reviewed
source. It does not accept a ready/PASS flag or replace public preparation.
"""
import argparse
import importlib.util
from pathlib import Path
from common import read_private


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--issue', required=True)
    parser.add_argument('--operator', type=Path, required=True)
    parser.add_argument('--directory', type=Path, required=True)
    parser.add_argument('--previous-processes', type=Path, required=True)
    parser.add_argument('--evidence-dir', type=Path, required=True)
    parser.add_argument('--source-sha', required=True)
    parser.add_argument('--operation-id', required=True)
    parser.add_argument('--parent-binding-file', type=Path, required=True)
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location('bounded_accounts', Path(__file__).with_name('provision-accounts.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    # Clean source and exact owner operation binding are checked in prepare_pair
    # before any operator credential read, allocation or possible Loginom action.
    return module.prepare_pair(args.issue, args.operator, args.directory, read_private(args.previous_processes),
        args.evidence_dir, args.source_sha, parent_binding_file=args.parent_binding_file, operation_id=args.operation_id)


if __name__ == '__main__':
    try: main()
    except Exception as error:
        print(str(error) if isinstance(error, RuntimeError) else 'BOUNDED_QUALIFICATION_UNKNOWN', file=__import__('sys').stderr)
        raise SystemExit(1)
