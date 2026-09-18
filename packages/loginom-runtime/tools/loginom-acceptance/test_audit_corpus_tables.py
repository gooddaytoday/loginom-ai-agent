import unittest
import hashlib
import tempfile
from pathlib import Path
from copy import deepcopy

from audit_corpus_tables import compare_table, audit_tables


def fixture():
    fields = {'category': 'string', 'average': 'real', 'count': 'integer'}
    expected = dict(fields=fields, keys=['category'], rows=[dict(category='A', average='12.34', count=2), dict(category='B', average='4.2', count=1)], sorting=[dict(name='average', direction='DESC')])
    rows = [[dict(type=fields[k], value=v, is_null=False, precision={'string': 'display_text', 'integer': 'exact_integer', 'real': '17_significant_digits'}[fields[k]]) for k, v in r.items()] for r in expected['rows']]
    table = dict(verified=True, complete=True, row_count=2, schema=[dict(name=k, type=v) for k, v in fields.items()], rows=rows)
    return table, expected


class FullTables(unittest.TestCase):
    def test_omitted_intermediates_are_explicit_and_require_checked_outputs(self):
        table, expected_table = fixture()
        table.update(node='final', port=0)
        expected_table['port'] = 0
        with tempfile.TemporaryDirectory() as directory:
            dataset = Path(directory)/'input.csv'
            dataset.write_text('source')
            digest = hashlib.sha256(dataset.read_bytes()).hexdigest()
            request = dict(run_id='run', task=dict(number=38, dataset_sha256=digest),
                           provider='xiaomi', model='mimo-v2.5', reasoning_effort='medium',
                           runtime_source_pin=dict(client_revision='pin'), package='/mimo/example.lgp')
            graph = dict(complete=True, foreign_links=[], nodes=[], links=[])
            execution = dict(verified=True, owner_verified=True)
            index = dict(run_id='run', task=38, session=dict(clientRevision='pin'),
                         model_started=False, settings_reapplied=False, package_saved=False,
                         prepare=dict(status='READY', package_ref=dict(path=request['package'])),
                         package_cleanup=dict(status='SUCCEEDED'), graph_before=graph, graph_after=graph,
                         results=dict(final=dict(node='final', table=table, execution=execution),
                                      intermediate=dict(table=None, execution=execution,
                                          read_scope='intermediate_settings_only',
                                          read_omission_reason='Large intermediate; final aggregate fully checked.',
                                          covered_by=['final'])))
            expected = dict(operator_reviewed=True, run_id='run', task=38,
                            dataset_sha256=digest, tables=dict(final=expected_table))
            diagnostic = deepcopy(index)
            diagnostic['read_only_diagnostic'] = True
            with self.assertRaisesRegex(ValueError, 'Diagnostic-only'):
                audit_tables(dataset, request, diagnostic, expected)
            report = audit_tables(dataset, request, index, expected)
            self.assertEqual(list(report['tables']), ['final'])
            self.assertIs(report['omitted_intermediate_tables']['intermediate']['full_table_read'], False)
            for patch in [dict(covered_by=['missing']), dict(covered_by=[]),
                          dict(read_omission_reason=''), dict(execution=dict(verified=False, owner_verified=True))]:
                invalid = deepcopy(index)
                invalid['results']['intermediate'].update(patch)
                with self.assertRaises(ValueError):
                    audit_tables(dataset, request, invalid, expected)

    def test_complete_table_and_ranking(self):
        table, expected = fixture()
        self.assertEqual(compare_table(table, expected)['rows_checked'], 2)

    def test_rejects_wrong_mean_duplicates_samples_and_rank(self):
        changes = [lambda t: t['rows'][0][1].update(value='12.35'),
                   lambda t: t['rows'].__setitem__(1, deepcopy(t['rows'][0])),
                   lambda t: t.update(complete=False), lambda t: t['rows'].reverse(),
                   lambda t: t['rows'].pop()]
        for change in changes:
            table, expected = fixture()
            change(table)
            with self.assertRaises(ValueError):
                compare_table(table, expected)

    def test_full_precision_noise_is_bounded(self):
        table, expected = fixture()
        table['rows'][0][1]['value'] = '12.340000000000002'
        compare_table(table, expected)
        table['rows'][0][1]['precision'] = 'display_text'
        with self.assertRaises(ValueError):
            compare_table(table, expected)

    def test_exact_decimal_does_not_require_a_duplicate_numeric_value(self):
        table, expected = fixture()
        for row in table['rows']:
            cell=row[1]
            cell['decimal']=cell.pop('value')
        self.assertEqual(compare_table(table,expected)['rows_checked'],2)
        table['rows'][0][1]['decimal']='12.35'
        with self.assertRaises(ValueError):compare_table(table,expected)


if __name__ == '__main__':
    unittest.main()
