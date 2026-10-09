import copy
import unittest
import oracle


class OracleGuards(unittest.TestCase):
    def setUp(self):
        self.want = oracle.expected('/LAB64-calculator/test.lgp')
        self.execution = dict(status='completed', execution_id='fresh-1', verified=True, owner_verified=True)
        sample = []
        for row in self.want['rows']:
            cells = []
            for column in oracle.COLUMNS:
                value = row[column['name']]
                cell = dict(type=column['type'], value=str(value) if column['type'] == 'integer' else value,
                            is_null=value is None)
                if column['type'] == 'datetime':
                    cell.update(precision='millisecond', representation='local_datetime', timezone='unspecified')
                cells.append(cell)
            sample.append(cells)
        self.port = dict(execution_id='fresh-1', fresh=True, row_count=6, sample_complete=True,
                         precision=dict(numbers_verified=True), schema=oracle.COLUMNS, sample=sample)

    def test_exact_values_and_row_permutation(self):
        oracle.verify_table(self.port, self.want, self.execution)
        self.port['sample'].reverse()
        oracle.verify_table(self.port, self.want, self.execution)

    def test_rejects_stale_substituted_missing_and_wrong_schema(self):
        changes = [lambda p: p.update(execution_id='old'), lambda p: p.update(fresh=False),
                   lambda p: p['sample'][0][2].update(value=75.0),
                   lambda p: p['sample'][0][7].update(value=None, is_null=True),
                   lambda p: p['sample'].pop(), lambda p: p['schema'].reverse()]
        for change in changes:
            with self.subTest(change=change):
                port = copy.deepcopy(self.port)
                change(port)
                with self.assertRaises(ValueError):
                    oracle.verify_table(port, self.want, self.execution)

    def test_cold_requires_identity_and_confirmed_cleanup(self):
        result = dict(status='PASS', path=self.want['package_path'], settingsReapplied=False,
                      cleanup=dict(package_closed=True, logged_out=True),
                      node=dict(document_id='d', workflow_id='w', node_id='n'),
                      execution=self.execution, output=dict(ports=[self.port]))
        oracle.verify_cold(result, self.want['package_path'])
        for change in [lambda r: r['cleanup'].update(logged_out=False),
                       lambda r: r['execution'].update(owner_verified=False),
                       lambda r: r.update(path='/foreign.lgp')]:
            bad = copy.deepcopy(result)
            change(bad)
            with self.assertRaises(ValueError):
                oracle.verify_cold(bad, self.want['package_path'])


if __name__ == '__main__':
    unittest.main()
