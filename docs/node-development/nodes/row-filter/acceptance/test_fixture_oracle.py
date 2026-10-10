import copy
import json
import unittest
from fixture_oracle import ROOT, expectations, load_fixture, verify_ports


def receipt(case):
    binding = dict(document_id='owned-document', workflow_id='owned-workflow', node_id='owned-filter',
                   execution_id='new-execution', source_sha256=case['source_sha256'], port_guids={'0': 'port-0', '1': 'port-1'})
    ports = []
    for expected in case['expected_ports']:
        sample = []
        for row in expected['rows']:
            cells = []
            for column in case['columns']:
                value, kind = row[column['name']], column['type']
                precision = 'exact_null' if value is None else dict(integer='exact_integer', real='17_significant_digits',
                                                                  boolean='exact_boolean', datetime='millisecond', string='exact_string')[kind]
                cells.append(dict(type=kind, value=str(value) if kind == 'integer' and value is not None else value,
                                  is_null=value is None, precision=precision,
                                  **({'timezone': 'unspecified'} if kind == 'datetime' else {})))
            sample.append(cells)
        ports.append(dict(port=expected['port'], port_guid='port-'+str(expected['port']),
                          node={k: binding[k] for k in ('document_id', 'workflow_id', 'node_id')},
                          execution_id=binding['execution_id'], source_sha256=binding['source_sha256'], fresh=True,
                          schema=case['columns'], sample_complete=True, filter_enabled=False, row_count=len(sample), sample=sample))
    return copy.deepcopy(ports), binding


class OracleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bundle = expectations()

    def test_all_106_valid_cases_and_reordered_rows(self):
        for case in self.bundle['golden_cases'] + self.bundle['cases']:
            with self.subTest(case=case['name']):
                ports, binding = receipt(case)
                for p in ports:
                    p['sample'].reverse()
                self.assertTrue(verify_ports(case, ports[::-1], binding)['passed'])

    def test_plan_and_or_ids(self):
        case = self.bundle['cases'][0]
        self.assertEqual([[r['RowID'] for r in p['rows']] for p in case['expected_ports']], [[2, 3, 4, 6], [1, 5]])

    def test_string_sentinels(self):
        entries = json.loads((ROOT/'manifest.json').read_text())['fixtures']
        rows = load_fixture(next(e for e in entries if e['path'] == 'fixtures/strings.csv'))
        self.assertEqual([r['Text'] for r in rows], ['A', 'a', '', None, 'null', 'say "A"'])
        self.assertIsNone(rows[2]['Value'])
        self.assertEqual(rows[0]['Value'], 0)
        cases = self.bundle['cases']
        case = next(c for c in cases if c['name'] == "string_=_'A'_True")
        self.assertEqual([r['RowID'] for r in case['expected_ports'][0]['rows']], [1])
        case = next(c for c in cases if c['name'] == "string_=_'A'_False")
        self.assertEqual([r['RowID'] for r in case['expected_ports'][0]['rows']], [1, 2])

    def test_header_only_preserves_both_schemas(self):
        case = self.bundle['cases'][-1]
        ports, binding = receipt(case)
        self.assertEqual([p['row_count'] for p in ports], [0, 0])
        self.assertEqual([c['name'] for c in case['columns']], ['Id', 'Amount', 'Flag', 'When', 'Text'])
        ports[1]['schema'] = []
        with self.assertRaises(ValueError):
            verify_ports(case, ports, binding)

    def test_existing_90_cases_unchanged(self):
        from row_filter_matrix import cases
        original = json.loads((ROOT/'partition-expected.json').read_text())['matrix']
        self.assertEqual(cases(), original)
        self.assertEqual(len(self.bundle['golden_cases']), 90)

    def test_wrong_port_binding_even_for_empty_outputs(self):
        case = self.bundle['cases'][-1]
        ports, binding = receipt(case)
        ports[0]['port_guid'], ports[1]['port_guid'] = ports[1]['port_guid'], ports[0]['port_guid']
        with self.assertRaisesRegex(ValueError, 'node_execution_source_binding'):
            verify_ports(case, ports, binding)

    def test_manifest_and_byte_tamper(self):
        for entry in json.loads((ROOT/'manifest.json').read_text())['fixtures']:
            with self.subTest(fixture=entry['path']):
                self.assertEqual(len(load_fixture(entry)), entry['rows'])
                broken = dict(entry, sha256='0'*64)
                with self.assertRaisesRegex(ValueError, 'fixture_bytes'):
                    load_fixture(broken)

    def test_missing_duplicate_and_replaced_rows(self):
        case = next(c for c in self.bundle['golden_cases'] if c['name'] == 'all_records')
        base, binding = receipt(case)
        # Removing only one of the true duplicate records must still fail.
        for kind in ('lost_duplicate', 'extra_duplicate', 'replace'):
            ports = copy.deepcopy(base)
            rows = ports[0]['sample']
            duplicate = next(i for i, r in enumerate(rows) if r[0]['value'] == '6')
            if kind == 'lost_duplicate':
                rows.pop(duplicate)
            elif kind == 'extra_duplicate':
                rows.append(copy.deepcopy(rows[duplicate]))
            else:
                rows[0] = copy.deepcopy(rows[duplicate])
            ports[0]['row_count'] = len(rows)
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                verify_ports(case, ports, binding)

    def test_identity_completeness_and_precision_corruptions(self):
        case = self.bundle['cases'][0]
        base, binding = receipt(case)
        def mutate(label, ports):
            if label == 'wrong_port':
                ports[0]['port'], ports[1]['port'] = 1, 0
            elif label == 'missing_port':
                ports.pop()
            elif label == 'duplicate_port':
                ports[1]['port'] = 0
            elif label == 'same_guid':
                ports[1]['port_guid'] = ports[0]['port_guid']
            elif label == 'foreign_guid':
                ports[1]['port_guid'] = 'foreign-port'
            elif label in ('node_id', 'document_id', 'workflow_id'):
                ports[0]['node'][label] = 'foreign'
            elif label == 'execution':
                ports[1]['execution_id'] = 'old-execution'
            elif label == 'source':
                ports[0]['source_sha256'] = 'unrelated-source'
            elif label == 'schema':
                ports[0]['schema'].reverse()
            elif label == 'count':
                ports[0]['row_count'] += 1
            elif label == 'precision':
                ports[0]['sample'][0][0]['precision'] = 'rounded'
            else:
                ports[0][label] = label == 'filter_enabled'
        for label in ('wrong_port', 'missing_port', 'duplicate_port', 'same_guid', 'foreign_guid', 'node_id', 'document_id', 'workflow_id',
                      'execution', 'source', 'schema', 'count', 'precision', 'sample_complete', 'fresh', 'filter_enabled'):
            ports = copy.deepcopy(base)
            mutate(label, ports)
            with self.subTest(corruption=label), self.assertRaises(ValueError):
                verify_ports(case, ports, binding)

    def test_null_empty_zero_substitutions(self):
        case = next(c for c in self.bundle['cases'] if c['name'] == 'text_not_null')
        base, binding = receipt(case)
        for before, after, kind in [(None, '', 'string'), ('', None, 'string'), ('', 0, 'string'),
                                    (None, 0, 'integer'), ('0', None, 'integer'), ('0', False, 'integer')]:
            ports = copy.deepcopy(base)
            cell = next(cell for p in ports for row in p['sample'] for cell in row if cell['type'] == kind and cell['value'] == before)
            cell.update(value=after, is_null=after is None,
                        precision='exact_null' if after is None else 'exact_integer' if kind == 'integer' else 'exact_string')
            with self.subTest(before=before, after=after, kind=kind), self.assertRaises(ValueError):
                verify_ports(case, ports, binding)

    def test_unanchored_binding_rejected(self):
        case = self.bundle['cases'][0]
        ports, binding = receipt(case)
        with self.assertRaises(ValueError):
            verify_ports(case, ports, {})

    def test_generated_expectations_are_reproducible(self):
        self.assertEqual(json.loads((ROOT/'fixture-expected.json').read_text()), self.bundle)

    def test_null_datetime_requires_unspecified_timezone(self):
        case = next(c for c in self.bundle['golden_cases'] if c['name'] == 'all_records')
        for timezone in (None, 'UTC'):
            ports, binding = receipt(case)
            cell = next(row[3] for p in ports for row in p['sample'] if row[0]['value'] == '5')
            self.assertTrue(cell['is_null'])
            if timezone is None:
                del cell['timezone']
            else:
                cell['timezone'] = timezone
            with self.subTest(timezone=timezone), self.assertRaisesRegex(ValueError, 'datetime_timezone'):
                verify_ports(case, ports, binding)

    def test_datetime_fraction_cannot_be_truncated(self):
        case = next(c for c in self.bundle['golden_cases'] if c['name'] == 'all_records')
        for fraction in ('000900', '0000009', '0000'):
            ports, binding = receipt(case)
            cell = ports[0]['sample'][0][3]
            cell['value'] = cell['value'].split('.')[0] + '.' + fraction
            with self.subTest(fraction=fraction), self.assertRaisesRegex(ValueError, 'datetime_precision'):
                verify_ports(case, ports, binding)

    def test_every_required_cell_field_is_present_even_for_null(self):
        case = next(c for c in self.bundle['golden_cases'] if c['name'] == 'all_records')
        for null in (True, False):
            for key in ('value', 'type', 'is_null', 'precision'):
                ports, binding = receipt(case)
                cell = next(cell for p in ports for row in p['sample'] for cell in row
                            if cell['type'] == 'datetime' and cell['is_null'] == null)
                del cell[key]
                with self.subTest(null=null, missing=key), self.assertRaisesRegex(ValueError, 'required_cell_fields'):
                    verify_ports(case, ports, binding)

    def test_string_precision_is_required_for_empty_and_nonempty(self):
        case = next(c for c in self.bundle['cases'] if c['name'] == 'text_not_null')
        for empty in (True, False):
            for precision in (None, 'rounded', 'display_text'):
                ports, binding = receipt(case)
                cell = next(cell for p in ports for row in p['sample'] for cell in row
                            if cell['type'] == 'string' and not cell['is_null'] and (cell['value'] == '') == empty)
                if precision is None:
                    del cell['precision']
                else:
                    cell['precision'] = precision
                with self.subTest(empty=empty, precision=precision), self.assertRaises(ValueError):
                    verify_ports(case, ports, binding)


if __name__ == '__main__':
    unittest.main()
