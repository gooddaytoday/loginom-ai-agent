import copy
import unittest
from date_time_output_evidence import initial_output_mapping, expected_output, verify_output_mapping


def fixture():
    sources = [dict(record_id='i', name='Id', label='Id', type='integer', required=False),
               dict(record_id='a', name='Amount', label='Amount', type='integer', required=False),
               dict(record_id='y', name='DateA_Y_1', label='Дата (Год)', type='integer', required=True)]
    baseline = dict(source_fields=sources, target_fields=[dict(source=s, exclusion_source=None, name=name,
                    label=label, type=s['type'], excluded=False) for s, name, label in zip(sources,
                    ['Id', 'Amount', 'SavedYear'], ['Id', 'Amount', 'Сохранённый год'])])
    generated = {'y': dict(input='DateA', operation='year', configured_name=None, configured_label=None)}
    mapping = dict(fields=[dict(source=dict(kind='configured_field', name=name), name=renamed, label=label)
                          for name, renamed, label in [('Id', 'RowId', 'Строка'), ('Amount', 'Sales', 'Продажи'),
                                                       ('SavedYear', 'YearA', 'Год A')]])
    actual = copy.deepcopy(baseline)
    for field, wanted in zip(actual['target_fields'], mapping['fields']):
        field.update(name=wanted['name'], label=wanted['label'])
    return baseline, generated, mapping, actual


class DateTimeOutputEvidenceTests(unittest.TestCase):
    def test_saved_computed_and_passthrough_are_addressed_before_rename(self):
        before, generated, mapping, actual = fixture()
        result = verify_output_mapping(before, actual, generated, mapping)
        self.assertEqual([(f['name'], f['label']) for f in result], [('RowId', 'Строка'), ('Sales', 'Продажи'), ('YearA', 'Год A')])
        self.assertEqual(result[-1]['operation'], 'year')

    def test_request_only_changes_fail_for_every_field_and_property(self):
        before, generated, mapping, actual = fixture()
        for index in range(3):
            for key in ('name', 'label', 'excluded'):
                changed = copy.deepcopy(mapping)
                changed['fields'][index][key] = True if key == 'excluded' else 'Different'
                with self.subTest(index=index, key=key), self.assertRaises(ValueError):
                    verify_output_mapping(before, actual, generated, changed)

    def test_expected_does_not_depend_on_actual(self):
        before, generated, mapping, actual = fixture()
        expected = expected_output(before, generated, mapping)
        actual['target_fields'][0]['label'] = 'Wrong actual'
        self.assertEqual(expected, expected_output(before, generated, mapping))
        with self.assertRaises(ValueError): verify_output_mapping(before, actual, generated, mapping)

    def test_empty_parameters_and_no_mapping_preserve_saved_names_labels(self):
        before, generated, _, _ = fixture()
        verify_output_mapping(before, before, generated, {})
        actual = copy.deepcopy(before)
        actual['target_fields'][2]['label'] = 'Changed saved label'
        with self.assertRaises(ValueError): verify_output_mapping(before, actual, generated, {})

    def test_declared_transformation_name_precedes_output_override(self):
        before, generated, mapping, actual = fixture()
        generated['y'].update(configured_name='RequestedYear', configured_label='Requested year')
        mapping['fields'][2]['source']['name'] = 'RequestedYear'
        verify_output_mapping(before, actual, generated, mapping)
        mapping['fields'][2]['source']['name'] = 'SavedYear'
        with self.assertRaises(ValueError): verify_output_mapping(before, actual, generated, mapping)

    def test_exclusion_uses_native_service_label_and_cannot_exclude_generated(self):
        before, generated, _, _ = fixture()
        before['source_fields'][0]['label'] = 'Идентификатор'
        mapping = dict(fields=[dict(source=dict(kind='configured_field', name=n), **({'excluded': True} if n == 'Id' else {}))
                               for n in ['Id', 'Amount', 'SavedYear']])
        actual = copy.deepcopy(before)
        excluded = actual['target_fields'].pop(0)
        excluded.update(excluded=True, source=None, exclusion_source=actual['source_fields'][0], label='Id')
        actual['target_fields'].append(excluded)
        self.assertEqual(len(verify_output_mapping(before, actual, generated, mapping)), 2)
        for field in mapping['fields']: field['excluded'] = field['source']['name'] == 'SavedYear'
        with self.assertRaises(ValueError): expected_output(before, generated, mapping)

    def test_reject_missing_duplicate_foreign_fields_or_changed_sources(self):
        before, generated, mapping, actual = fixture()
        for mode in ('missing', 'duplicate', 'foreign', 'source_changed'):
            m, a = copy.deepcopy(mapping), copy.deepcopy(actual)
            if mode == 'missing': m['fields'].pop()
            if mode == 'duplicate': m['fields'][1]['source'] = m['fields'][0]['source']
            if mode == 'foreign': m['fields'][0]['source']['name'] = 'Foreign'
            if mode == 'source_changed': a['source_fields'][0]['name'] = 'Foreign'
            with self.subTest(mode=mode), self.assertRaises(ValueError): verify_output_mapping(before, a, generated, m)

    def test_baseline_is_first_complete_owned_output_phase_observation(self):
        owner = dict(document_id='d', workflow_id='w', node_id='n')
        mapping = dict(verified=True, inventory_complete=True, source_identity_verified=True,
                       mapping_wizard='DerivedDataSourceOutputSocketWizard', node_context=dict(owner, verified=True, output_port=dict(port=0)))
        observe = lambda m: dict(operation_id='op', phase='node_observation_completed', outcome=dict(output=dict(node_mapping=m)))
        events = [observe(dict(mapping, before_phase=True)), dict(operation_id='op', phase='node_phase_prepared', receipt=dict(phase='output_mapping')),
                  observe(dict(mapping, source_identity_verified=False)), observe(mapping), observe(dict(mapping, late=True))]
        self.assertIs(initial_output_mapping(events, 'op', owner), mapping)
        with self.assertRaises(ValueError): initial_output_mapping(events[:3], 'op', owner)
        with self.assertRaises(ValueError): initial_output_mapping(events, 'op', dict(owner, node_id='other'))


if __name__ == '__main__': unittest.main()
