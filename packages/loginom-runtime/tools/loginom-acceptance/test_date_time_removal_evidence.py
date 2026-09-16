import copy
import unittest
from date_time_removal_evidence import verify_removals, verify_source_fetch


def fixture():
    source = dict(record_id='year-source', name='DateA_Y_1', label='Дата (Год)', type='integer', required=True)
    target = dict(record_id='year-target', field_id='0', name='RenamedYear', label='Год A', type='integer', data_kind='Дискретный', excluded=False, inherited=False, exclusion_source=None, required=False, index=0, group_index=0, source=source)
    retained_source = dict(record_id='date-source', name='DateA', required=False, type='datetime', label='Дата')
    retained = dict(target, record_id='date-target', field_id='1', name='DateA', label='Дата', type='datetime', index=1, group_index=1, source=retained_source)
    node = dict(node_id='node')
    baseline = dict(verified=True, inventory_complete=True, source_identity_verified=True, mapping_wizard='DerivedDataSourceOutputSocketWizard', node_context=node, autosync=True, source_fields=[source, retained_source], target_fields=[target, retained])
    origin = dict(field='DateA', operation='year', source=source, target=target)
    orphan = dict(target, source=None)
    before = dict(baseline, mapping_wizard='DerivedDataSourceMappingEngineOutputPortWizard', source_fields=[retained_source], target_fields=[orphan, retained])
    after = dict(before, autosync=False, target_fields=[dict(retained, index=0, group_index=0)])
    return dict(request=dict(target=dict(kind='existing'), parameters=dict(fields=[dict(field=dict(name='DateA'), transformations=[])])),
                config=dict(configuration=dict(input_fields=[dict(name='DateA', label='Дата')]), removed_outputs=[origin], inline_mapping=dict(native_mapping=dict(after, autosync=True), removed=[dict(target=orphan, origin=origin, after=after)])),
                opening=dict(preconfiguration=dict(native_mapping=baseline, close=dict(draft_discarded=True, settings_applied=False, cleanup_complete=True))),
                first=dict(DateA=[dict(func=4, iso=False, first=False, last=False, number=True, string=False)]),
                raw_maps=[baseline, before, after], operations=dict(year=(4, 'number', 'Y', 'Год', 'integer')))


class DateRemovalEvidenceTests(unittest.TestCase):
    def test_native_autosync_extension_preserves_the_complete_original_prefix(self):
        f = fixture()
        after = f['opening']['preconfiguration']['native_mapping']
        before = dict(after, source_fields=[], target_fields=[dict(after['target_fields'][0], source=None)])
        fetch = dict(before=before, after=after)
        verify_source_fetch(fetch, after, [before, after])
        for mode in ('renamed_old', 'fixed', 'renamed_added', 'generated', 'inherited'):
            b, a = copy.deepcopy(before), copy.deepcopy(after)
            if mode == 'renamed_old': a['target_fields'][0]['name'] = 'Other'
            if mode == 'fixed': b['autosync'] = a['autosync'] = False
            if mode == 'renamed_added': a['target_fields'][1]['name'] = 'Other'
            if mode == 'generated': a['target_fields'][1]['source']['required'] = True
            if mode == 'inherited': a['target_fields'][1]['inherited'] = True
            with self.subTest(mode=mode), self.assertRaises(ValueError):
                verify_source_fetch(dict(before=b, after=a), a, [b, a])

    def test_real_transition_shape_requires_exact_original_owner_and_preserved_remainder(self):
        verify_removals(**fixture())
        for mode in ('committed', 'missing_original', 'wrong_origin', 'wrong_deleted_identity', 'missing_before', 'changed_other_source', 'lost_autosync'):
            f = copy.deepcopy(fixture())
            # Detach projections from raw observations before injecting corruption.
            f['config'] = copy.deepcopy(f['config'])
            f['opening'] = copy.deepcopy(f['opening'])
            if mode == 'lost_autosync': f['config']['inline_mapping']['native_mapping']['autosync'] = False
            if mode == 'committed': f['opening']['preconfiguration']['close']['settings_applied'] = True
            if mode == 'missing_original': f['raw_maps'].pop(0)
            if mode == 'wrong_origin': f['config']['removed_outputs'][0]['operation'] = 'quarter'
            if mode == 'wrong_deleted_identity': f['config']['inline_mapping']['removed'][0]['target']['field_id'] = 'other'
            if mode == 'missing_before': f['raw_maps'].pop(1)
            if mode == 'changed_other_source':
                f['raw_maps'][-1] = copy.deepcopy(f['raw_maps'][-1])
                f['raw_maps'][-1]['source_fields'][0]['name'] = 'Foreign'
                f['config']['inline_mapping']['removed'][0]['after'] = copy.deepcopy(f['raw_maps'][-1])
            with self.subTest(mode=mode), self.assertRaises(ValueError): verify_removals(**f)


if __name__ == '__main__': unittest.main()
