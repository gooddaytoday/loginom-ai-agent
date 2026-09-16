import copy
import json
from pathlib import Path
import unittest

import import_settings_evidence as ise

EXPECTED = json.loads(Path(__file__).with_name('fixtures').joinpath('data-pipeline/expected.json').read_text())


def snapshot():
    prefix = 'MF;TF-1'
    path = [{'ref': str(i), 'tid': prefix + ';cnrNaviMode;b.s_' + '>'.join(['p', 'w', 'n', 's'][:i+1]),
             'label': name} for i, name in enumerate(('Package', 'Workflow', 'Import', 'Settings'))]
    values = {'delimiter': ';', 'text_qualifier': 'Двойная кавычка (")',
              'decimal_separator': 'Точка (.)', 'null_marker': '\\N'}
    return {'authenticated': True, 'origin': 'http://test', 'loginom_build': 'build',
            'workflow_ref': {'prefix': prefix}, 'package_identity': {'name': 'Package'},
            'active_tab_ref': 'tab', 'dom_epoch': {'document': 'doc', 'revision': 1},
            'ui': {'dialogs': [], 'masks': []},
            'wizard': {'status': 'observed', 'stage': 'text_import_format',
                       'root_tid': prefix + ';WizrdMCF', 'root_ref': 'wizard',
                       'owner_context': {'status': 'observed', 'node': copy.deepcopy(path[-2]), 'path': path},
                       'settings': {'status': 'draft_ui_values', 'applied_verified': False,
                                    'fields': {key: {'status': 'observed', 'value': value,
                                                     'value_length_utf16': len(value), 'truncated': False,
                                                     'value_kind': 'displayed_input_text',
                                                     'source_tid': prefix + ';WizrdMCF;ImportTextFileParamsWizard;' + ise.FIELD_OWNERS[key] + ';ValueControl',
                                                     'input_ref': key + '-input', 'owner_ref': key + '-owner'}
                                               for key, value in values.items()}},
                       'import_columns': {'status': 'rendered_draft_columns', 'complete': False,
                                          'settings_applied': False, 'truncated': False,
                                          'fields': [{'index': i, 'status': 'observed', 'used': True, **column}
                                                     for i, column in enumerate(EXPECTED['schema'])]}}}


def source_snapshot():
    state = snapshot(); wizard = state['wizard']; wizard['stage'] = 'text_import_file'
    values = {'source_path': '/test/source.csv', 'connection': 'Локальное',
              'encoding': 'UTF-8 (65001)', 'rows_to_skip': '0'}
    fields = {key: {'status': 'observed', 'value': value, 'value_length_utf16': len(value),
                    'truncated': False, 'value_kind': 'displayed_input_text',
                    'input_ref': key, 'owner_ref': key + '-owner'} for key, value in values.items()}
    fields['first_line_as_title'] = {'status': 'observed', 'value': True,
                                    'value_kind': 'loginom_ext_checkbox', 'owner_ref': 'header', 'display_ref': 'header-display'}
    wizard['import_source'] = {'status': 'draft_ui_values', 'settings_applied': False,
                               'file_bytes_verified': False, 'schema_complete': False, 'fields': fields}
    return state


def mapping_snapshot():
    state = snapshot(); wizard = state['wizard']; wizard['stage'] = 'output_mapping'
    fields = [{**column, 'status': 'observed', 'label': column['name'], 'row_ref': 'row-' + str(i),
               'name_ref': 'name-' + str(i), 'label_ref': 'label-' + str(i),
               'source': {'status': 'rendered_source', 'identity_verified': False,
                          'label': column['name'], 'type': column['type'], 'cell_ref': 'source-' + str(i)}}
              for i, column in enumerate(EXPECTED['schema'])]
    wizard['output_columns'] = {'status': 'rendered_rows', 'complete': False,
                                'settings_applied': False, 'fields': fields}
    return state


class ImportSettingsEvidenceTests(unittest.TestCase):
    def configured_mapping_snapshot(self):
        state=mapping_snapshot();mapping=state['wizard']['output_columns']
        mapping['auto_sync']={'status':'observed','value':False,'ref':'auto-sync'}
        mapping['definition_coverage']={'status':'complete_configured_rows','count':5,
            'body_ref':'mapping-body','container_ref':'mapping-container','filter_ref':'mapping-filter',
            'table_mode_ref':'table-mode','first_row_ref':'row-0','last_row_ref':'row-4','source_identity_verified':False}
        return state

    def test_configured_mapping_preserves_observed_auto_sync_without_source_claim(self):
        for auto in (False,True):
            state=self.configured_mapping_snapshot();state['wizard']['output_columns']['auto_sync']['value']=auto
            proof=ise.configured_mapping_compare(state,EXPECTED)
            self.assertTrue(proof['configured_import_mapping_match']);self.assertEqual(proof['auto_sync'],auto)
            self.assertFalse(proof['source_identity_verified']);self.assertFalse(proof['complete'])
            self.assertFalse(proof['package_persistence_verified'])

    def test_configured_mapping_rejects_unknown_bounds_and_auto_sync(self):
        for mode in ('partial','count','unknown','endpoint','collision','empty_filter','source_claim','auto_missing',
                     'auto_ambiguous','auto_integer','auto_collision','context','editor'):
            with self.subTest(mode=mode):
                state=self.configured_mapping_snapshot();mapping=state['wizard']['output_columns'];coverage=mapping['definition_coverage']
                context=ise.configured_mapping_compare(state,EXPECTED)['context']
                if mode=='partial':coverage['status']='partial'
                if mode=='count':coverage['count']=4
                if mode=='unknown':coverage['extra']=True
                if mode=='endpoint':coverage['last_row_ref']='row-3'
                if mode=='collision':coverage['body_ref']='row-0'
                if mode=='empty_filter':coverage['filter_ref']=''
                if mode=='source_claim':coverage['source_identity_verified']=True
                if mode=='auto_missing':mapping.pop('auto_sync')
                if mode=='auto_ambiguous':mapping['auto_sync']['status']='ambiguous'
                if mode=='auto_integer':mapping['auto_sync']['value']=1
                if mode=='auto_collision':mapping['auto_sync']['ref']='table-mode'
                if mode=='context':state['active_tab_ref']='other'
                if mode=='editor':state['wizard']['column_parameters']={}
                self.assertFalse(ise.configured_mapping_compare(state,EXPECTED,context)['configured_import_mapping_match'])

    def test_configured_mapping_diagnostic_is_journal_bound(self):
        state=self.configured_mapping_snapshot()
        call={'session_id':'s','tool_call_id':'c','tool':'dock_workspace_observe','row':1}
        outcome={'status':'SUCCEEDED','operation_id':'op','output':state}
        evidence={'calls':[call],'tools':[{**call,'row':2,'result':outcome}],
                  'events':[{'phase':'observation_completed','operation_id':'op','outcome':copy.deepcopy(outcome)}]}
        proof=ise.diagnose(evidence,EXPECTED,'')['observations'][0]
        self.assertTrue(proof['rendered_import_mapping_match'])
        self.assertTrue(proof['configured_mapping_diagnostics']['configured_import_mapping_match'])
        evidence['tools'][0]['result']['output']['wizard']['output_columns']['auto_sync']['value']=True
        self.assertEqual(ise.diagnose(evidence,EXPECTED,'')['observations'],[])

    def configured_snapshot(self):
        state = snapshot(); columns = state['wizard']['import_columns']
        for field in columns['fields']: field['header_ref'] = 'header-' + str(field['index'])
        columns['definition_coverage'] = {'status': 'complete_configured_columns', 'count': 5,
                                          'grid_ref': 'grid', 'container_ref': 'container', 'body_ref': 'body',
                                          'first_header_ref': 'header-0', 'last_header_ref': 'header-4',
                                          'source_schema_verified': False}
        return state

    def test_configured_schema_bounds_are_not_source_schema(self):
        state = self.configured_snapshot()
        proof = ise.configured_schema_compare(state, EXPECTED)
        self.assertTrue(proof['configured_import_schema_match'])
        self.assertFalse(proof['source_schema_verified']); self.assertFalse(proof['complete'])
        self.assertFalse(proof['package_persistence_verified'])
        state['wizard']['import_columns']['fields'].reverse()
        self.assertTrue(ise.configured_schema_compare(state, EXPECTED, proof['context'])['configured_import_schema_match'])

    def test_configured_schema_rejects_partial_forged_bounds_and_collisions(self):
        changes = ({'status': 'partial'}, {'count': 4}, {'count': True}, {'grid_ref': ''},
                   {'container_ref': 'grid'}, {'body_ref': 'header-0'}, {'first_header_ref': 'header-1'},
                   {'last_header_ref': 'header-3'}, {'source_schema_verified': True}, {'extra': True})
        for change in changes:
            with self.subTest(change=change):
                state = self.configured_snapshot(); state['wizard']['import_columns']['definition_coverage'].update(change)
                self.assertFalse(ise.configured_schema_compare(state, EXPECTED)['configured_import_schema_match'])
                self.assertTrue(ise.compare(state, EXPECTED)['rendered_import_settings_match'])
        for mode in ('missing', 'header_collision', 'missing_header', 'context', 'editor', 'mask', 'index', 'schema'):
            state = self.configured_snapshot(); columns = state['wizard']['import_columns']
            context = ise.configured_schema_compare(state, EXPECTED)['context']
            if mode == 'missing': columns.pop('definition_coverage')
            if mode == 'header_collision': columns['fields'][1]['header_ref'] = columns['fields'][0]['header_ref']
            if mode == 'missing_header': columns['fields'][0].pop('header_ref')
            if mode == 'context': state['active_tab_ref'] = 'other'
            if mode == 'editor': state['wizard']['import_column_editor'] = {}
            if mode == 'mask': state['ui']['masks'] = [{}]
            if mode == 'index': columns['fields'][0]['index'] = 8
            if mode == 'schema': columns['fields'][0]['type'] = 'real'
            self.assertFalse(ise.configured_schema_compare(state, EXPECTED, context)['configured_import_schema_match'], mode)

    def test_configured_schema_diagnostic_requires_bound_native_coverage(self):
        state = self.configured_snapshot()
        call = {'session_id':'s', 'tool_call_id':'c', 'tool':'dock_workspace_observe', 'row':1}
        outcome = {'status':'SUCCEEDED', 'operation_id':'op', 'output':state}
        evidence = {'calls':[call], 'tools':[{**call, 'row':2, 'result':outcome}],
                    'events':[{'phase':'observation_completed', 'operation_id':'op', 'outcome':copy.deepcopy(outcome)}]}
        proof = ise.diagnose(evidence, EXPECTED, '')['observations'][0]
        self.assertTrue(proof['rendered_import_settings_match'])
        self.assertTrue(proof['configured_schema_diagnostics']['configured_import_schema_match'])
        evidence['tools'][0]['result']['output']['wizard']['import_columns']['definition_coverage']['count'] = 4
        self.assertEqual(ise.diagnose(evidence, EXPECTED, '')['observations'], [])

    def test_source_is_ui_only_with_explicit_path(self):
        report = ise.source_compare(source_snapshot(), EXPECTED, '/test/source.csv')
        self.assertTrue(report['rendered_import_source_match'])
        self.assertFalse(report['file_bytes_verified']); self.assertFalse(report['complete'])
        for path in (None, 'source.csv', '/test/../source.csv', '//test/source.csv', '/test/',
                     '/test/./source.csv', '/test\\source.csv', 'https://server/source.csv', '/test/a?token=b'):
            self.assertEqual(ise.source_compare(source_snapshot(), EXPECTED, path)['reason'], 'invalid_expected_source_path')
        self.assertEqual(ise.source_compare(source_snapshot(), EXPECTED, '/other/source.csv')['reason'], 'source_field_mismatch:source_path')

    def test_source_fields_and_context_fail_closed(self):
        context = ise.source_compare(source_snapshot(), EXPECTED, '/test/source.csv')['context']
        for key in ('source_path', 'connection', 'encoding', 'rows_to_skip'):
            for change in ({'value': 'wrong'}, {'status': 'redacted'}, {'status': 'ambiguous'},
                           {'truncated': True}, {'value_length_utf16': 999}, {'input_ref': None}):
                state = source_snapshot(); state['wizard']['import_source']['fields'][key].update(change)
                self.assertFalse(ise.source_compare(state, EXPECTED, '/test/source.csv')['rendered_import_source_match'])
        for mode in ('header', 'duplicate', 'context', 'mask', 'editor'):
            state = source_snapshot(); fields = state['wizard']['import_source']['fields']
            if mode == 'header': fields['first_line_as_title']['value'] = False
            if mode == 'duplicate': fields['encoding']['input_ref'] = fields['source_path']['input_ref']
            if mode == 'context': state['active_tab_ref'] = 'other'
            if mode == 'mask': state['ui']['masks'] = [{}]
            if mode == 'editor': state['wizard']['import_column_editor'] = {}
            self.assertFalse(ise.source_compare(state, EXPECTED, '/test/source.csv', context)['rendered_import_source_match'])

    def test_mapping_is_rendered_only(self):
        report = ise.mapping_compare(mapping_snapshot(), EXPECTED)
        self.assertTrue(report['rendered_import_mapping_match'])
        self.assertFalse(report['source_identity_verified']); self.assertFalse(report['complete'])
        state = mapping_snapshot(); state['wizard']['output_columns']['fields'].reverse()
        self.assertTrue(ise.mapping_compare(state, EXPECTED)['rendered_import_mapping_match'])

    def test_mapping_rejects_wrong_source_schema_and_ambiguity(self):
        for mode in ('name', 'type', 'source_label', 'source_type', 'ambiguous', 'redacted', 'truncated',
                     'source_ambiguous', 'source_redacted', 'source_truncated', 'duplicate_name',
                     'duplicate_row', 'duplicate_source', 'missing', 'bounded', 'editor', 'context'):
            with self.subTest(mode=mode):
                state = mapping_snapshot(); mapping = state['wizard']['output_columns']; fields = mapping['fields']
                context = ise.mapping_compare(state, EXPECTED)['context']
                if mode == 'name': fields[0]['name'] = 'Other'
                if mode == 'type': fields[0]['type'] = 'string'
                if mode == 'source_label': fields[0]['source']['label'] = 'Other'
                if mode == 'source_type': fields[0]['source']['type'] = 'string'
                if mode == 'ambiguous': fields[0]['status'] = 'ambiguous'
                if mode == 'redacted': fields[0]['redacted'] = True
                if mode == 'truncated': fields[0]['truncated'] = True
                if mode == 'source_ambiguous': fields[0]['source']['status'] = 'ambiguous'
                if mode == 'source_redacted': fields[0]['source']['redacted'] = True
                if mode == 'source_truncated': fields[0]['source']['truncated'] = True
                if mode == 'duplicate_name': fields[1]['name'] = fields[0]['name']
                if mode == 'duplicate_row': fields[1]['row_ref'] = fields[0]['row_ref']
                if mode == 'duplicate_source': fields[1]['source']['cell_ref'] = fields[0]['source']['cell_ref']
                if mode == 'missing': fields.pop()
                if mode == 'bounded': mapping['status'] = 'bounded'
                if mode == 'editor': state['wizard']['column_parameters'] = {}
                if mode == 'context': state['active_tab_ref'] = 'other'
                self.assertFalse(ise.mapping_compare(state, EXPECTED, context)['rendered_import_mapping_match'])

    def test_diagnose_dispatches_source_and_mapping_without_inference(self):
        for state, verdict in ((source_snapshot(), 'rendered_import_source_match'),
                               (mapping_snapshot(), 'rendered_import_mapping_match')):
            call = {'session_id': 's', 'tool_call_id': 'c', 'tool': 'dock_workspace_observe', 'row': 1}
            outcome = {'status': 'SUCCEEDED', 'operation_id': 'op', 'output': state}
            evidence = {'calls': [call], 'tools': [{**call, 'row': 2, 'result': outcome}],
                        'events': [{'phase': 'observation_completed', 'operation_id': 'op', 'outcome': copy.deepcopy(outcome)}]}
            report = ise.diagnose(evidence, EXPECTED, '', expected_source_path='/test/source.csv')
            self.assertTrue(report['observations'][0][verdict])
            if state['wizard']['stage'] == 'text_import_file':
                self.assertFalse(ise.diagnose(evidence, EXPECTED, '')['observations'][0][verdict])

    def test_fixture_match_stays_incomplete(self):
        state = snapshot(); report = ise.compare(state, EXPECTED)
        self.assertTrue(report['rendered_import_settings_match'])
        self.assertFalse(report['complete']); self.assertFalse(report['node_persistence_verified'])
        self.assertFalse(report['package_persistence_verified']); self.assertTrue(report['missing_proofs'])
        self.assertTrue(ise.compare(state, EXPECTED, report['context'])['rendered_import_settings_match'])
        state['wizard']['import_columns']['fields'].reverse()
        self.assertTrue(ise.compare(state, EXPECTED)['rendered_import_settings_match'])

    def test_context_binding(self):
        context = ise.compare(snapshot(), EXPECTED)['context']
        for key in ('origin', 'loginom_build', 'active_tab_ref', 'package_identity'):
            state = snapshot(); state[key] = 'foreign'
            self.assertEqual(ise.compare(state, EXPECTED, context)['reason'], 'context_changed')
        for mode in ('owner', 'path', 'root', 'stage', 'auth', 'document', 'editor', 'mask', 'dialog'):
            with self.subTest(mode=mode):
                state = snapshot(); wizard = state['wizard']
                if mode == 'owner': wizard['owner_context']['status'] = 'ambiguous'
                if mode == 'path': wizard['owner_context']['path'][-1]['tid'] = 'foreign'
                if mode == 'root': wizard['root_tid'] = 'MF;TF-2;WizrdMCF'
                if mode == 'stage': wizard['stage'] = 'output_mapping'
                if mode == 'auth': state['authenticated'] = False
                if mode == 'document': state['dom_epoch']['document'] = 'other'
                if mode == 'editor': wizard['import_column_editor'] = {'status': 'observed'}
                if mode == 'mask': state['ui']['masks'] = [{}]
                if mode == 'dialog': state['ui']['dialogs'] = [{}]
                self.assertFalse(ise.compare(state, EXPECTED, context)['rendered_import_settings_match'])

    def test_fields_exact_and_observed(self):
        for key in snapshot()['wizard']['settings']['fields']:
            for change in ({'value': '?'}, {'status': 'ambiguous'}, {'truncated': True},
                           {'value_length_utf16': 999}, {'input_ref': None}, {'value_kind': 'guessed'}, {'source_tid': 'foreign'}):
                with self.subTest(key=key, change=change):
                    state = snapshot(); state['wizard']['settings']['fields'][key].update(change)
                    self.assertFalse(ise.compare(state, EXPECTED)['rendered_import_settings_match'])
        state = snapshot(); state['wizard']['settings']['fields']['decimal_separator']['value'] = '.'
        state['wizard']['settings']['fields']['decimal_separator']['value_length_utf16'] = 1
        self.assertTrue(ise.compare(state, EXPECTED)['rendered_import_settings_match'])
        for value in (',', ' .', '. ', 'Не задано (.)', 'Точка', '..'):
            field=state['wizard']['settings']['fields']['decimal_separator']
            field.update(value=value,value_length_utf16=len(value))
            self.assertFalse(ise.compare(state, EXPECTED)['rendered_import_settings_match'])
        state = snapshot(); fields = state['wizard']['settings']['fields']
        fields['decimal_separator']['input_ref'] = fields['delimiter']['input_ref']
        self.assertEqual(ise.compare(state, EXPECTED)['reason'], 'duplicate_setting_input')

    def test_only_exact_first_server_crumb_can_have_empty_label(self):
        state = snapshot(); owner = state['wizard']['owner_context']
        for crumb in owner['path']:
            crumb['tid'] = crumb['tid'].replace('b.s_p', 'b.s_Сервер')
        owner['node'] = copy.deepcopy(owner['path'][-2])
        owner['path'][0]['label'] = ''
        self.assertTrue(ise.compare(state, EXPECTED)['rendered_import_settings_match'])
        for index in range(1, len(owner['path'])):
            changed = copy.deepcopy(state)
            changed['wizard']['owner_context']['path'][index]['label'] = ''
            self.assertFalse(ise.compare(changed, EXPECTED)['rendered_import_settings_match'])
        for root_name in ('Другой', 'СерверX'):
            changed = copy.deepcopy(state); changed_owner = changed['wizard']['owner_context']
            for crumb in changed_owner['path']:
                crumb['tid'] = crumb['tid'].replace('b.s_Сервер', 'b.s_' + root_name)
            changed_owner['node'] = copy.deepcopy(changed_owner['path'][-2])
            self.assertEqual(ise.compare(changed, EXPECTED)['reason'], 'owner_path_mismatch')

    def test_text_qualifier_literal_and_native_label_are_exact(self):
        for value, matches in [('"', True), ('Двойная кавычка (" )', False),
                               (' "', False), ('" ', False), ('“', False), ('""', False)]:
            state = snapshot(); field = state['wizard']['settings']['fields']['text_qualifier']
            field.update(value=value, value_length_utf16=len(value))
            self.assertEqual(ise.compare(state, EXPECTED)['rendered_import_settings_match'], matches)

    def test_delimiter_reopened_display_label_is_exact(self):
        for label, matches in (('Точка с запятой', True), ('Точка с запятой ', False),
                               ('точка с запятой', False), ('Semicolon', False)):
            state = snapshot(); field = state['wizard']['settings']['fields']['delimiter']
            field.update(value=label, value_length_utf16=len(label))
            self.assertEqual(ise.compare(state, EXPECTED)['rendered_import_settings_match'], matches)

    def test_columns_reject_incomplete_duplicate_and_wrong_schema(self):
        for mode in ('truncated', 'ambiguous', 'index', 'name', 'type', 'used', 'missing', 'extra', 'bool_index', 'complete'):
            with self.subTest(mode=mode):
                state = snapshot(); columns = state['wizard']['import_columns']; fields = columns['fields']
                if mode == 'truncated': columns['truncated'] = True
                if mode == 'ambiguous': fields[0]['status'] = 'unobserved_or_ambiguous'
                if mode == 'index': fields[1]['index'] = fields[0]['index']
                if mode == 'name': fields[1]['name'] = fields[0]['name']
                if mode == 'type': fields[0]['type'] = 'string'
                if mode == 'used': fields[0]['used'] = False
                if mode == 'missing': fields.pop()
                if mode == 'extra': fields.append(copy.deepcopy(fields[0]))
                if mode == 'bool_index': fields[0]['index'] = False
                if mode == 'complete': columns['complete'] = True
                self.assertFalse(ise.compare(state, EXPECTED)['rendered_import_settings_match'])

    def test_diagnose_only_unique_bound_receipts(self):
        result = {'status': 'SUCCEEDED', 'operation_id': 'op', 'output': snapshot()}
        call = {'session_id': 's', 'tool_call_id': 'c', 'tool': 'dock_workspace_observe', 'row': 1}
        evidence = {'calls': [call], 'tools': [{**call, 'row': 2, 'result': result}],
                    'events': [{'phase': 'observation_completed', 'operation_id': 'op', 'outcome': copy.deepcopy(result)}]}
        report = ise.diagnose(evidence, EXPECTED, '')
        self.assertEqual(report['observations'][0]['operation_id'], 'op')
        self.assertTrue(report['observations'][0]['rendered_import_settings_match']); self.assertFalse(report['complete'])
        for mode in ('reply', 'event', 'unbound', 'session', 'changed'):
            data = copy.deepcopy(evidence)
            if mode == 'reply': data['tools'] *= 2
            if mode == 'event': data['events'] *= 2
            if mode == 'unbound': data['events'] = []
            if mode == 'session': data['calls'][0]['session_id'] = 'other'
            if mode == 'changed': data['tools'][0]['result']['output']['wizard']['settings']['fields']['delimiter']['value'] = ','
            self.assertEqual(ise.diagnose(data, EXPECTED, '')['observations'], [], mode)

    def test_malformed_never_matches(self):
        for state in (None, {}, {'wizard': []}, snapshot()):
            if state and isinstance(state.get('wizard'), dict): state['wizard']['import_columns']['fields'] = None
            self.assertFalse(ise.compare(state, EXPECTED)['rendered_import_settings_match'])
