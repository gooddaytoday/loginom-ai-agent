import copy
import unittest
from import_patch_evidence import verify_column_patch_observations


class ImportPatchEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.before = {'source': {'source_path': '/user/dock-p3/input.csv', 'encoding': 'UTF-8',
                                 'rows_to_skip': 0, 'first_line_as_title': True},
                       'format': {'delimiter': ';', 'decimal_separator': '.', 'null_marker': 'NULL', 'text_qualifier': '"'},
                       'columns': [{'name': f'Field{i}', 'label': f'Field{i}', 'type': 'string',
                                    'data_kind': 'Дискретный', 'used': True} for i in range(12)]}
        self.patch = {'columns': [{'name': 'Field11', 'label': 'Changed'}]}
        owner = {'status': 'observed', 'node': {'tid': 'node-one'}, 'path': [{'tid': 'workflow', 'label': 'Workflow'}]}
        source = {'wizard': {'stage': 'text_import_file', 'owner_context': owner,
                            'import_source': {'fields': {k: {'status': 'observed', 'value': str(v) if k == 'rows_to_skip' else v}
                                                       for k, v in self.before['source'].items()}}}}
        source['wizard']['import_source']['fields']['connection'] = {'status': 'observed', 'value': 'Локальное'}
        source['wizard']['import_source']['fields']['encoding']['value'] = 'UTF-8 (65001)'
        self.observations = [(1, source)]
        for start, changed in [(2, False), (11, True)]:
            for offset in (0, 8):
                fields = [dict(c, status='observed', index=i) for i, c in enumerate(self.before['columns'])][offset:offset+8]
                if changed and offset == 8:
                    fields[-1]['label'] = 'Changed'
                self.observations.append((start + offset // 8, {'wizard': {
                    'stage': 'text_import_format', 'owner_context': copy.deepcopy(owner),
                    'settings': {'fields': {k: {'status': 'observed', 'value': v} for k, v in self.before['format'].items()}},
                    'import_columns': {'fields': fields, 'page': {'status': 'complete_definition_page',
                        'schema_id': 'after' if changed else 'before', 'offset': offset, 'limit': 8,
                        'returned': len(fields), 'total_columns': 12, 'next_offset': 8 if offset == 0 else None}}}}))
        self.mutations = [(10, {'verb': 'click'}, {})]

    def verify(self):
        return verify_column_patch_observations(self.observations, self.mutations, self.before, self.patch)

    def test_complete_wide_patch_preserves_unspecified_properties(self):
        result = self.verify()
        self.assertTrue(result['passed'], result)
        self.assertTrue(result['baseline_verified'])
        self.assertFalse(result['settings_saved_verified'])

    def test_mutation_before_complete_baseline_fails(self):
        self.mutations[0] = (3, {'verb': 'click'}, {})
        self.assertFalse(self.verify()['passed'])

    def test_missing_final_page_fails(self):
        self.observations.pop()
        self.assertFalse(self.verify()['passed'])

    def test_revisiting_one_page_and_scrolling_does_not_erase_complete_baseline(self):
        self.observations.insert(3, (4, copy.deepcopy(self.observations[1][1])))
        self.mutations.insert(0, (5, {'verb': 'scroll_horizontal'},
                                 {'trace': [{'event': 'ui_scroll_applied', 'axis': 'horizontal', 'from': 0, 'to': 100}]}))
        self.assertTrue(self.verify()['passed'], self.verify())

    def test_unrequested_field_type_and_format_changes_fail(self):
        self.observations[-1][1]['wizard']['import_columns']['fields'][0]['type'] = 'real'
        self.observations[-1][1]['wizard']['settings']['fields']['delimiter']['value'] = ','
        result = self.verify()
        self.assertIn('definition_values', result['failures'])
        self.assertIn('format_delimiter', result['failures'])

    def test_baseline_must_match_known_original(self):
        self.observations[2][1]['wizard']['import_columns']['fields'][-1]['label'] = 'Already Changed'
        self.assertIn('baseline_definition_values', self.verify()['failures'])

    def test_foreign_owner_fails(self):
        self.observations[-1][1]['wizard']['owner_context']['node']['tid'] = 'foreign-node'
        self.assertIn('wizard_owner_changed', self.verify()['failures'])

    def test_source_and_format_patches_are_not_claimed_by_column_audit(self):
        self.patch['source'] = {'source_path': '/another.csv'}
        self.assertEqual(self.verify()['failures'], ['column_patch_required'])

    def test_unknown_patch_identity_fails(self):
        self.patch['columns'][0]['name'] = 'Unknown'
        self.assertEqual(self.verify()['failures'], ['patch_column_identity'])


if __name__ == '__main__':
    unittest.main()

class SourceFormatPatchEvidenceTests(unittest.TestCase):
    def setUp(self):
        ImportPatchEvidenceTests.setUp(self)
        self.patch.update(source={'encoding':'Windows-1251'}, format={'null_marker':'NA'})
        source=copy.deepcopy(self.observations[0][1])
        source['wizard']['import_source']['fields']['encoding']['value']='Кириллическая (1251)'
        self.observations.insert(3,(9,source))
        self.mutations.insert(0,(8,{'verb':'select_wizard_option'},{}))
        for step,state in self.observations:
            if step>10:
                state['wizard']['settings']['fields']['null_marker']['value']='NA'

    def verify(self):
        from import_patch_evidence import verify_import_patch_observations
        return verify_import_patch_observations(self.observations,self.mutations,self.before,self.patch)

    def test_partial_source_format_and_column_changes_preserve_other_values(self):
        result=self.verify();self.assertTrue(result['passed'],result)
        self.assertEqual(result['expected_settings']['source']['encoding'],'Windows-1251')
        self.assertEqual(result['expected_settings']['source']['source_path'],self.before['source']['source_path'])

    def test_previous_step_requires_observed_format_button_and_source_destination(self):
        wizard=self.observations[2][1]['wizard']
        wizard.update(root_tid='Wizard',root_ref='wizard')
        self.observations[2][1]['ui']={'elements':[dict(ref='previous',tid='Wizard;btnPrev',allowed_actions=['wizard_step'],wizard_step=dict(direction='previous',root_ref='wizard'))]}
        self.mutations.insert(0,(4,dict(verb='wizard_step',ref='previous',expected_stage='text_import_file'),{}))
        self.assertTrue(self.verify()['passed'],self.verify())
        self.observations[2][1]['ui']['elements'][0]['tid']='Other;btnPrev'
        self.assertIn('unexpected_configuration_transition',self.verify()['failures'])

    def test_baseline_after_source_change_cannot_certify_preservation(self):
        self.mutations[0]=(2,{'verb':'select_wizard_option'}, {})
        self.assertFalse(self.verify()['passed'])

    def test_unrequested_source_or_format_or_schema_changes_are_rejected(self):
        for variant in ('source','format','schema','connection'):
            self.setUp()
            if variant=='source':self.observations[3][1]['wizard']['import_source']['fields']['rows_to_skip']['value']='1'
            if variant=='connection':self.observations[3][1]['wizard']['import_source']['fields']['connection']['value']='Other'
            if variant=='format':self.observations[-1][1]['wizard']['settings']['fields']['delimiter']['value']=','
            if variant=='schema':self.observations[-1][1]['wizard']['import_columns']['fields'][0]['type']='real'
            self.assertFalse(self.verify()['passed'],variant)

class ReplacementSchemaEvidenceTests(unittest.TestCase):
    def setUp(self):
        SourceFormatPatchEvidenceTests.setUp(self)
        self.names=[c['name'] for c in reversed(self.before['columns'])]+['Extra']
        extra=dict(name='Extra',label='Count',type='integer',data_kind='Дискретный',used=True)
        self.patch['columns'].append(extra)
        self.patch['source']['source_path']='/user/dock-p3/replacement.csv'
        self.observations[3][1]['wizard']['import_source']['fields']['source_path']['value']=self.patch['source']['source_path']
        fields=[copy.deepcopy(c) for c in reversed(self.before['columns'])]+[extra]
        fields[0]['label']='Changed'
        for step,state in self.observations:
            if step<=10:continue
            definitions=state['wizard']['import_columns'];page=definitions['page'];offset=page['offset']
            definitions['fields']=[dict(c,status='observed',index=i) for i,c in enumerate(fields)][offset:offset+8]
            page.update(total_columns=len(fields),returned=len(definitions['fields']),next_offset=offset+8 if offset+8<len(fields) else None)

    def verify(self):
        from import_patch_evidence import verify_import_patch_observations
        return verify_import_patch_observations(self.observations,self.mutations,self.before,self.patch,source_names=self.names)

    def test_source_order_and_explicit_added_field_are_verified(self):
        result=self.verify();self.assertTrue(result['passed'],result)
        self.assertEqual([c['name'] for c in result['expected_settings']['columns']],self.names)

    def test_wrong_order_or_implicit_new_field_is_rejected(self):
        self.names.reverse();self.assertFalse(self.verify()['passed'])
        self.setUp();self.patch['columns'][-1].pop('type');self.assertFalse(self.verify()['passed'])
