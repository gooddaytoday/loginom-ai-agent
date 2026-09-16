"""Model-free business, coverage and fail-closed preparation regressions."""
import copy
import json
import tempfile
import unittest
import argparse
import subprocess
import shutil
import os
from datetime import datetime
from calendar import monthrange
from pathlib import Path
from unittest.mock import patch
from date_time_goal_oracle import FIXTURES, OPS, expected, frozen, projection, source_rows, render
from date_time_goal_evidence import full_port, graph, save_checkpoint
from date_time_admission import check, GATES
from date_time_sales_acceptance import audit


def public_port(table, port=0):
    """Synthetic schema-valid public data; never labels this as live evidence."""
    def cell(column, value):
        kind = column['type']
        result = dict(type=kind, is_null=value is None, value=None if value is None else str(value),
                      precision='millisecond' if kind == 'datetime' else 'exact_integer' if kind == 'integer' else 'exact_decimal')
        if kind == 'datetime':
            result.update(representation='local_datetime', timezone='unspecified')
        return result
    return dict(port=port, port_guid='fixture-port-'+str(port), fresh=True, execution_id='fixture-execution',
        schema=[dict(c, index=i) for i, c in enumerate(table['schema'])], row_count=len(table['rows']),
        sample=[[cell(c, v) for c, v in zip(table['schema'], row)] for row in table['rows']],
        sample_rows=len(table['rows']), sample_complete=True,
        precision=dict(numbers_verified=True, limitations=[], strings='verbatim'))


class DateTimeSalesPreparation(unittest.TestCase):
    def test_frozen_full_ten_rows_and_both_dates(self):
        data = frozen()
        self.assertEqual(data, expected((FIXTURES/'sales.csv').read_bytes()))
        self.assertEqual((len(data['calendar']['rows']), len(data['calendar']['schema'])), (10, 27))
        self.assertEqual(data['empty']['rows'], [])
        self.assertEqual(data['empty']['schema'], data['calendar']['schema'])
        self.assertEqual({(f['input'], f['operation']) for f in projection() if 'operation' in f},
                         {(source, op) for source in ('DateA', 'DateB') for op in OPS})

    def test_business_totals_independently_enumerated(self):
        value = frozen()
        self.assertEqual(value['month']['rows'], [[None, None, 42], [2023, 12, 10], [2024, 1, 50],
            [2024, 2, 15], [2024, 3, 70], [2024, 4, 30], [2024, 12, 90], [2025, 1, 100]])
        self.assertEqual(value['quarter']['rows'], [[None, None, 42], [2023, 4, 10],
            [2024, 1, 135], [2024, 2, 30], [2024, 4, 90], [2025, 1, 100]])
        self.assertEqual(sum(r[-1] for r in value['month']['rows']), 407)

    def test_boundary_values_and_asymmetric_nulls(self):
        value = frozen()['calendar']; names = [f['name'] for f in value['schema']]
        rows = [dict(zip(names, r)) for r in value['rows']]
        self.assertEqual(rows[1]['A_month_end'], '2024-02-29T00:00:00.000')
        self.assertEqual(rows[0]['B_year_end'], '2024-12-31T00:00:00.000')
        self.assertEqual(rows[2]['A_quarter_start'], '2024-04-01T00:00:00.000')
        self.assertEqual(rows[2]['B_quarter_end'], '2024-03-31T00:00:00.000')
        self.assertIsNone(rows[8]['B_year']); self.assertEqual(rows[8]['SavedYearA'], 2024)
        self.assertIsNone(rows[9]['SavedYearA']); self.assertEqual(rows[9]['B_quarter'], 2)

    def test_compacted_source_keeps_declared_semantic_cases(self):
        rows = source_rows((FIXTURES/'sales.csv').read_bytes())
        self.assertEqual(len(rows), 10)
        for field in ('DateA', 'DateB'):
            dates = [datetime.fromisoformat(r[field]) for r in rows if r[field] is not None]
            self.assertEqual({d.year for d in dates}, {2023, 2024, 2025})
            self.assertTrue(any((d.month, d.day) == (2, 29) for d in dates))
            self.assertTrue(any((d.month, d.day) == (1, 1) for d in dates))
            self.assertTrue(any((d.month, d.day) == (12, 31) for d in dates))
            self.assertTrue(any(d.month in (1, 4, 7, 10) and d.day == 1 for d in dates))
            self.assertTrue(any(d.month in (3, 6, 9, 12) and d.day == monthrange(d.year, d.month)[1] for d in dates))
            self.assertTrue(any(d.day == monthrange(d.year, d.month)[1] for d in dates))
        for a, b in ((True, True), (True, False), (False, True)):
            self.assertTrue(any((r['DateA'] is None, r['DateB'] is None) == (a, b) for r in rows))
        self.assertTrue(any(r['Amount'] < 0 for r in rows))
        self.assertEqual(sum(r['DateA'] is not None and r['DateA'].startswith('2024-02') for r in rows), 2)

    def test_names_labels_exclusion_and_order_are_frozen(self):
        value = frozen()
        self.assertEqual([f['name'] for f in value['calendar']['schema']][:3], ['RowId', 'SalesAmount', 'A_date'])
        self.assertEqual(value['calendar']['schema'][13], dict(name='SavedYearA', label='Год сохранённой даты A', type='integer'))
        self.assertEqual(value['excluded'], [dict(name='DateB', label='DateB', type='datetime', excluded=True)])
        self.assertEqual(value['initial']['schema'][13]['name'], 'A_year')

    def test_source_rejects_duplicate_ids_or_missing_cells(self):
        data = (FIXTURES/'sales.csv').read_bytes()
        for changed in (data.replace(b'10;NULL', b'9;NULL'), data.replace(b'10;NULL;2024-06-30 23:59:59;2', b'10;NULL')):
            with self.assertRaises(ValueError):
                source_rows(changed)

    def test_complete_read_requires_full_current_execution(self):
        table = frozen()['calendar']
        port = public_port(table)
        self.assertTrue(full_port(port, table, 'fixture-execution'))
        for change in ({'sample_rows': 9}, {'sample': port['sample'][:9]}, {'truncated': True},
                       {'row_count': 11}, {'sample_complete': False}, {'fresh': False}, {'execution_id': 'old-execution'}):
            self.assertFalse(full_port(dict(port, **change), table, 'fixture-execution'))
        self.assertTrue(full_port(public_port(frozen()['empty']), frozen()['empty'], 'fixture-execution'))
        changed = copy.deepcopy(port); changed['schema'][0]['label'] = 'wrong'
        self.assertFalse(full_port(changed, table, 'fixture-execution'))
        oversized = copy.deepcopy(table); oversized['rows'] += table['rows'][:2]
        self.assertFalse(full_port(public_port(oversized), oversized, 'fixture-execution'))

    def test_actual_public_schema_accepts_every_positive_fixture_and_rejects_oversize(self):
        runtime = Path.home()/'.loginom-dock/current/runtime/node'
        node = os.environ.get('DOCK_TEST_NODE') or (str(runtime) if runtime.is_file() else shutil.which('node'))
        self.assertIsNotNone(node, 'Node is required for the real public schema compatibility gate')
        value = frozen()
        ports = [public_port(value[key]) for key in ('source', 'initial', 'calendar', 'empty', 'month', 'quarter')]
        ports += [public_port(dict(schema=value['source']['schema'], rows=[])), public_port(value['source'], port=1)]
        result = subprocess.run([node, str(Path(__file__).with_name('date-time-public-fixture-schema.mjs'))],
            input=json.dumps(ports), text=True, capture_output=True, timeout=30, check=True)
        self.assertEqual(json.loads(result.stdout), dict(positive_results=8, positive_reads=8, oversize_rejections=4, live_evidence=False))

    def test_natural_prompt_has_no_api_recipe_or_hidden_reopen(self):
        text = render('20260913-120000-1234abcd')
        self.assertNotIn('__', text)
        # Prompt revision 2 explicitly clarifies the excluded source contract.
        # Keep this one approved recipe exact; do not allow unrelated API recipes.
        clarification = ('В запросах node.apply запись mappings.fields для исключения DateB задавай ровно как '
            '{"source":{"kind":"configured_field","name":"DateB"},"excluded":true}')
        self.assertEqual(text.count(clarification), 1)
        remaining = text.replace(clarification, '')
        for token in ('node.apply', 'sample_rows', 'package.save_as', 'package.save_checkpoint', 'operation_id', 'fault injection'):
            self.assertNotIn(token, remaining)
        self.assertIn('Повторное открытие сохранённого пакета выполнит отдельная независимая диагностика', text)

    def test_absent_admission_and_fake_passes_refuse_without_launch(self):
        with tempfile.TemporaryDirectory() as tmp:
            for value in ({}, {'gates': {g: {'status': 'passed', 'path': 'missing', 'sha256': '0'*64} for g in GATES}}):
                r = check(value, Path(tmp))
                self.assertFalse(r['passed']); self.assertFalse(r['model_started'])
                self.assertTrue(set(GATES) <= set(r['checks']))
                self.assertTrue(all(not r['checks'][g]['passed'] for g in GATES))

    def test_full_auditor_does_not_accept_summary_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            r = audit({}, {'events': [], 'calls': [], 'tools': [], 'summary': 'All passed'}, '', {}, Path(tmp), {}, Path(tmp))
            self.assertFalse(r['passed']); self.assertFalse(r['node_admitted'])
            self.assertFalse(r['checks']['all_required_components']['passed'])

    def test_graph_has_exact_six_nodes_five_connections(self):
        value = graph()
        self.assertEqual(len(value['nodes']), 6); self.assertEqual(len(value['links']), 5)
        self.assertIn('Нет_продаж|Output_Data[0]|Пустой_календарь|Input_Data[0]', value['links'])
        self.assertNotIn('Нет_продаж|Output_Data[1]|Пустой_календарь|Input_Data[0]', value['links'])

    def test_no_save_or_extra_save_is_rejected(self):
        with self.assertRaises(ValueError):
            save_checkpoint([], [], '/test-3/new.lgp', '2')
        events = [dict(phase='prepared', action_key='package.save_as')]*2
        with self.assertRaises(ValueError):
            save_checkpoint(events, [], '/test-3/new.lgp', '2')

    def test_runner_gate_precedes_auth_or_runtime_setup(self):
        import run
        args = argparse.Namespace(goal='date-time-sales', date_time_admission=FIXTURES/'admission.pending.json')
        with patch('run.connection') as auth, patch('run.validate_inputs') as validate:
            with self.assertRaises(ValueError):
                run.execute(args)
            auth.assert_not_called(); validate.assert_not_called()


if __name__ == '__main__':
    unittest.main()
