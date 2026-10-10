"""Node-specific evidence audit; oracle files stay outside model context."""
import argparse
import json
from pathlib import Path
from fixture_oracle import expectations, verify_ports

parser = argparse.ArgumentParser()
parser.add_argument('--case', required=True)
parser.add_argument('--actual', type=Path, required=True, help='JSON list of two complete native port records')
parser.add_argument('--binding', type=Path, required=True, help='independently audited node/execution/source identity')
args = parser.parse_args()
bundle = expectations()
matches = [c for c in bundle['golden_cases'] + bundle['cases'] if c['name'] == args.case]
if len(matches) != 1:
    raise ValueError('one_case_required')
print(json.dumps(verify_ports(matches[0], json.loads(args.actual.read_text()), json.loads(args.binding.read_text()))))
