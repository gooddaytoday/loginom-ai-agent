import importlib.util
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[3]
CASES = ROOT / 'docs/testing/loginom-ai-agent/bughunt-2026-11/i1'
SPEC = importlib.util.spec_from_file_location('run_check', ROOT / 'scripts/node-acceptance/run-check.py')
run_check = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(run_check)


class BughuntI103GraphTests(unittest.TestCase):
    def test_table_bound_rest_query_passes_the_case_graph(self):
        # LAB-2046: query_parameters bind input fields only (base_url has no query), and the
        # handler inserts its own URL-encoding JavaScript before REST, so imports.text never
        # links to REST directly. Observed in l2046-i103-a with the expected CSV.
        observed = json.loads((Path(__file__).parent / 'fixtures/bughunt-i1/bh-i103-graph-observed.json').read_text())
        for variant in ('cases', 'offline'):
            expected = json.loads((CASES / variant / 'bh-i103/expected.json').read_text())
            run_check.validate_graph_contract(expected['graph'])
            run_check.check_case_graph(expected['graph'], observed)

    def test_case_graph_still_requires_its_nodes(self):
        observed = json.loads((Path(__file__).parent / 'fixtures/bughunt-i1/bh-i103-graph-observed.json').read_text())
        observed['nodes'] = {k: v for k, v in observed['nodes'].items() if v['type'] != 'integration.rest_request'}
        expected = json.loads((CASES / 'cases/bh-i103/expected.json').read_text())
        with self.assertRaisesRegex(AssertionError, 'CASE_GRAPH_NODE_MISSING'):
            run_check.check_case_graph(expected['graph'], observed)


if __name__ == '__main__':
    unittest.main()
