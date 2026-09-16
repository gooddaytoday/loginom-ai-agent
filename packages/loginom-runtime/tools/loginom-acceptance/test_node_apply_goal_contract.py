import copy
from pathlib import Path
import unittest

from node_apply_goal_contract import verify_sales_goal_request
from upload_probe import FIXTURE, FIXTURE_SHA


class SalesGoalContractTests(unittest.TestCase):
    def setUp(self):
        self.run_id = '20260908-130000-1234abcd'
        self.directory = '/user/dock-p3'
        self.source = (Path(__file__).parent / FIXTURE).read_bytes()
        columns = [dict(name=name, label=name, type=kind, used=True, data_kind=data_kind)
                   for name, kind, data_kind in [
                       ('Id', 'integer', 'Непрерывный'), ('Region', 'string', 'Дискретный'),
                       ('Quantity', 'integer', 'Непрерывный'), ('UnitPrice', 'real', 'Непрерывный'),
                       ('Comment', 'string', 'Дискретный')]]
        self.request = dict(target=dict(kind='new', type='imports.text', label='Продажи'),
            mode='delimited', inputs=[], finish='execute',
            parameters=dict(source=dict(artifact_id='artifact', upload_operation_id='upload', bytes=230, sha256=FIXTURE_SHA),
                settings=dict(source=dict(source_path=self.directory+'/Dock-upload-'+self.run_id+'.csv',
                    encoding='UTF-8', rows_to_skip=0, first_line_as_title=True),
                    format=dict(delimiter=';', decimal_separator='.', text_qualifier='"', null_marker='\\N'), columns=columns)),
            mappings=[dict(direction='output', port=0, autosync=False, fields=[
                dict(source=dict(kind='configured_field', name=n), name=out, label=label)
                for n, out, label in [('UnitPrice', 'Price', 'Цена'), ('Id', 'Id', 'Id'),
                    ('Region', 'Region', 'Region'), ('Quantity', 'Quantity', 'Quantity'), ('Comment', 'Comment', 'Comment')]])],
            read=dict(ports=[0], sample_rows=10, require_exact_numbers=True))

    def audit(self):
        return verify_sales_goal_request(self.request, self.run_id, self.directory, self.source)

    def test_correct_task_does_not_claim_runtime_or_hermes_acceptance(self):
        result = self.audit()
        self.assertTrue(result['passed'], result)
        for key in ('runtime_verified', 'package_persistence_verified', 'hermes_acceptance_verified'):
            self.assertFalse(result[key])

    def test_six_to_ten_rows_and_explicit_same_source_names_are_equivalent(self):
        for column in self.request['parameters']['settings']['columns']:
            column['source_name'] = column['name']
        for sample in range(6, 11):
            self.request['read']['sample_rows'] = sample
            self.assertTrue(self.audit()['passed'])

    def test_wrong_but_internally_consistent_tasks_are_rejected(self):
        mutations = [
            lambda r: r['target'].update(label='Other'),
            lambda r: r.update(finish='done'),
            lambda r: r['parameters']['settings']['source'].update(source_path='/other/sales.csv'),
            lambda r: r['parameters']['settings']['source'].update(encoding='Windows-1251'),
            lambda r: r['parameters']['settings']['format'].update(null_marker='NULL'),
            lambda r: r['parameters']['settings']['columns'][0].update(type='real'),
            lambda r: r['parameters']['settings']['columns'][0].update(data_kind='Дискретный'),
            lambda r: r['parameters']['settings']['columns'][4].update(used=False),
            lambda r: r['parameters']['settings']['columns'].append(None),
            lambda r: r['mappings'][0].update(autosync=True),
            lambda r: r['mappings'][0]['fields'].reverse(),
            lambda r: r['mappings'][0]['fields'][0].update(label='UnitPrice'),
            lambda r: r['parameters']['source'].update(sha256='0'*64),
            lambda r: r['read'].update(sample_rows=5),
            lambda r: r['read'].update(require_exact_numbers=False),
        ]
        original = copy.deepcopy(self.request)
        for index, mutation in enumerate(mutations):
            with self.subTest(mutation=index):
                self.request = copy.deepcopy(original)
                mutation(self.request)
                self.assertFalse(self.audit()['passed'])

    def test_changed_fixture_cannot_be_replaced_by_request_hash(self):
        self.source = self.source.replace(b'12.5', b'12.6')
        self.assertIn('goal_fixture_bytes', self.audit()['failures'])

    def test_unchanged_mapping_names_and_labels_may_use_api_defaults(self):
        for field in self.request['mappings'][0]['fields']:
            field['excluded'] = False
            if field['source']['name'] != 'UnitPrice':
                field.pop('name'); field.pop('label')
        self.assertTrue(self.audit()['passed'], self.audit())


if __name__ == '__main__':
    unittest.main()
