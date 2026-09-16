import copy
import unittest
from import_output_evidence import verify_table_output_observations, equal_number
from node_procedure_evidence import bound_table_dialogs


class TableOutputEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.table = dict(view_guid='view', port_guid='port', table_tid='Table')
        expected = [dict(name='Id', label='Id', type='integer', used=True), dict(name='Text', label='Text', type='string', used=True)]
        self.request = dict(read=dict(ports=[0], sample_rows=10), parameters=dict(settings=dict(columns=expected,
            source=dict(first_line_as_title=True, rows_to_skip=0), format=dict(delimiter=';', text_qualifier='"', null_marker='NULL', decimal_separator='.'))))
        self.source = b'Id;Text\n9007199254740993;""\n2;NULL\n'
        node=dict(verified=True,document_id='doc',workflow_id='flow',node_id='node')
        def state(elements=()):
            return dict(prepared_node_context=node,node_outputs=dict(verified=True,node_context=node,tables=[dict(self.table, active=True)]), ui=dict(elements=list(elements)))
        graph = state();graph['node_outputs'].update(surface='graph', ports=[dict(index=0, port_guid='port', active=True)])
        before_add = state([dict(ref='add', viewer_card=dict(kind='add', port_guid='port')), dict(viewer_vendor=dict(kind='table', selected=True))]);before_add['node_outputs']['tables']=[]
        before_enter = state([dict(ref='enter', viewer_card=dict(kind='enter', port_guid='port', view_guid='view'))])
        readback = state([dict(ref='apply_format', tid='Table;ModalWindow_BrowseFormat;btnApply')])
        readback['table_settings'] = dict(format=dict(metadata_fields=[dict(source_index=0, name_key='Id', format_string='0')],
             selected_numeric=dict(source_index=0, name_key='Id', **{k:dict(status='observed', value=v) for k,v in dict(format_string='0', formatting=True, custom=True).items()})))
        filtered = state([dict(ref='apply_filter', tid='Table;ModalWindow_BrowseFilter;btnApply')]);filtered['table_settings']=dict(filter=dict(enabled=dict(status='observed', value=False)))
        page = state();page['node_table']=dict(verified=True,node_context=node, table=self.table, schema_id='schema', row_total=2, column_total=2, null_display=True,
          columns=[dict(index=i, **{k:c[k] for k in ('name','label','type')}) for i,c in enumerate(expected)],
          rows=[dict(index=0, record_id='r0', cells=[dict(column=0, is_null=False, text='9007199254740993'),dict(column=1,is_null=False,text='')]),
                dict(index=1, record_id='r1', cells=[dict(column=0, is_null=False, text='2'),dict(column=1,is_null=True,text=None)])])
        self.observations=[(2,graph),(3,before_add),(5,before_enter),(7,readback),(9,filtered),(11,page)]
        self.mutations=[(1,dict(verb='show_process_node'),{}),(4,dict(verb='click',ref='add'),{}),(6,dict(verb='enter_table',ref='enter'),{}),
                        (8,dict(verb='click',ref='apply_format'),{}),(10,dict(verb='click',ref='apply_filter'),{})]
        self.checkpoint=dict(execution=dict(execution_id='execution'),output=dict(ports=[dict(port=0,port_guid='port',execution_id='execution',row_count=2,sample_rows=2,sample_complete=True,
          sample=[[dict(type='integer',is_null=False,value='9007199254740993'),dict(type='string',is_null=False,value='')],
                  [dict(type='integer',is_null=False,value='2'),dict(type='string',is_null=True,value=None)]])]))

    def audit(self):
        return verify_table_output_observations(self.observations,self.mutations,self.request,self.source,self.checkpoint,'execution')

    def test_independent_source_values_and_ui_chain_pass(self):
        self.assertEqual(self.audit(), [])

    def test_empty_numeric_is_null_but_empty_string_is_not(self):
        self.source = b'Id;Text\n;""\n2;NULL\n'
        raw = self.observations[-1][1]['node_table']['rows'][0]['cells'][0]
        typed = self.checkpoint['output']['ports'][0]['sample'][0][0]
        raw.update(is_null=True, text=None)
        typed.update(is_null=True, value=None)
        self.assertEqual(self.audit(), [])
        raw.update(is_null=False, text='0')
        typed.update(is_null=False, value='0')
        self.assertTrue(self.audit())

    def test_old_checkpoint_execution_cannot_wrap_a_fresh_port(self):
        self.checkpoint['execution']['execution_id'] = 'old-execution'
        self.assertIn('output_checkpoint_execution_identity', self.audit())

    def test_non_ascii_source_is_decoded_using_requested_code_page(self):
        for encoding, codec, value in [('Windows-1251', 'cp1251', 'Строка;Ёж'),
                                        ('Windows-1252', 'cp1252', 'Ångström;été'),
                                        ('UTF-16 LE', 'utf-16-le', 'Строка;Ёж'),
                                        ('UTF-16 BE', 'utf-16-be', 'Строка;Ёж')]:
            with self.subTest(encoding=encoding):
                self.request['parameters']['settings']['source']['encoding'] = encoding
                self.source = ('Id;Text\n9007199254740993;"' + value + '"\n2;NULL\n').encode(codec)
                self.observations[-1][1]['node_table']['rows'][0]['cells'][1]['text'] = value
                self.checkpoint['output']['ports'][0]['sample'][0][1]['value'] = value
                self.assertEqual(self.audit(), [])
                self.request['parameters']['settings']['source']['encoding'] = 'UTF-8'
                self.assertTrue(self.audit(), 'wrong encoding must not accept these bytes')

    def test_unknown_encoding_and_malformed_bytes_are_refused(self):
        self.request['parameters']['settings']['source']['encoding'] = 'auto'
        self.assertIn('source_fixture_parse', self.audit())
        self.request['parameters']['settings']['source']['encoding'] = 'UTF-16 LE'
        self.source = b'\x00'
        self.assertIn('source_fixture_parse', self.audit())

    def test_tsv_preamble_and_quoted_tab_are_verified_against_bytes(self):
        settings = self.request['parameters']['settings']
        settings['format']['delimiter'] = '\t'
        settings['source']['rows_to_skip'] = 2
        self.source = b'Ignored one\nIgnored two\nId\tText\n9007199254740993\t"one\ttwo"\n2\tNULL\n'
        self.observations[-1][1]['node_table']['rows'][0]['cells'][1]['text'] = 'one\ttwo'
        self.checkpoint['output']['ports'][0]['sample'][0][1]['value'] = 'one\ttwo'
        self.assertEqual(self.audit(), [])
        settings['source']['rows_to_skip'] = 1
        self.assertTrue(self.audit())

    def test_headerless_import_keeps_the_first_data_row_after_native_field_renaming(self):
        settings = self.request['parameters']['settings']
        settings['source']['first_line_as_title'] = False
        for index, column in enumerate(settings['columns']):
            column['source_name'] = 'COL' + str(index + 1)
        self.source = self.source.split(b'\n', 1)[1]
        self.assertEqual(self.audit(), [])
        settings['source']['first_line_as_title'] = True
        self.assertTrue(self.audit())

    def test_summary_cannot_replace_pages(self):
        self.observations.pop();self.assertIn('verified_table_pages_missing',self.audit())

    def test_rounded_large_integer_is_rejected(self):
        self.checkpoint['output']['ports'][0]['sample'][0][0]['value']='9007199254740992'
        self.assertIn('source_output_value_0_0',self.audit())

    def test_null_and_empty_are_not_interchangeable(self):
        self.checkpoint['output']['ports'][0]['sample'][0][1]['value']=None
        self.assertIn('source_output_value_0_1',self.audit())

    def test_stale_table_is_rejected(self):
        self.observations[1][1]['node_outputs']['tables']=[self.table]
        self.assertIn('new_table_owner_or_vendor',self.audit())

    def test_wrong_executed_port_is_rejected(self):
        self.observations[0][1]['node_outputs']['ports'][0]['port_guid']='other'
        self.assertIn('table_not_bound_to_executed_output_zero',self.audit())

    def test_native_page_of_another_node_is_rejected(self):
        self.observations[-1][1]['node_table']['node_context']=dict(verified=True,document_id='doc',workflow_id='flow',node_id='other')
        self.assertIn('native_data_node_owner',self.audit())

    def test_enabled_filter_is_rejected(self):
        self.observations[-2][1]['table_settings']['filter']['enabled']['value']=True
        self.assertIn('table_filter_not_disabled',self.audit())

    def test_missing_cell_or_format_fails(self):
        self.observations[-1][1]['node_table']['rows'][0]['cells'].pop()
        self.observations[3][1]['table_settings']['format']['selected_numeric']['format_string']['value']='0.00'
        self.assertIn('table_page_coverage',self.audit());self.assertIn('numeric_format_readback_0',self.audit())

    def test_foreign_execution_fails(self):
        self.checkpoint['output']['ports'][0]['execution_id']='old'
        self.assertIn('typed_output_identity',self.audit())

    def test_later_mutation_invalidates_reading(self):
        self.mutations.append((12,dict(verb='click',ref='unknown'),{}))
        self.assertIn('unexpected_mutation_after_filter',self.audit())

    def test_binary_comparison_keeps_sign_of_zero_and_rejects_nonfinite(self):
        self.assertFalse(equal_number('-0','0'));self.assertFalse(equal_number('nan','nan'));self.assertTrue(equal_number('1.25','1.25'))

    def test_modal_exception_requires_exact_active_owner(self):
        s=dict(node_outputs=dict(verified=True,tables=[dict(self.table,active=True)]), node_table_dialog=dict(table=self.table,kind='format'),
               ui=dict(dialogs=[dict(identity=dict(anchor_tid='Table;ModalWindow_BrowseFormat'))]))
        self.assertTrue(bound_table_dialogs(s))
        for change in [lambda x:x['ui']['dialogs'].append(dict(identity=dict(anchor_tid='msgbox'))),
                       lambda x:x['node_outputs']['tables'][0].update(port_guid='other'),lambda x:x['node_outputs'].update(verified=False)]:
            changed=copy.deepcopy(s);change(changed);self.assertFalse(bound_table_dialogs(changed))


if __name__ == '__main__':
    unittest.main()

class TableReturnEvidenceTests(unittest.TestCase):
    audit = TableOutputEvidenceTests.audit
    def setUp(self):
        TableOutputEvidenceTests.setUp(self)
        self.path = [dict(tid='scenario', label='Сценарий')]
        source = copy.deepcopy(self.observations[-1][1])
        source['prepared_node_context']['surface'] = 'views'
        source['node_outputs']['surface'] = 'views'
        source['workflow_navigation'] = dict(status='observed', control_ref='parent', control_tid='scenario', path=self.path, current_path=self.path+[dict(tid='table',label='Таблица')])
        source['ui']['elements'] = [dict(ref='parent', tid='scenario', allowed_actions=['click'])]
        final = copy.deepcopy(source)
        final.pop('node_table')
        final['prepared_node_context']['surface'] = 'graph'
        final['node_outputs'].update(surface='graph', tables=[], ports=[dict(port_guid='port', active=True)])
        final['navigation_context'] = dict(status='observed',path=self.path)
        self.observations += [(12,source),(14,final)]
        self.mutations += [(13,dict(verb='click',ref='parent'),{})]
        self.checkpoint['output']['workflow_return'] = dict(verified=True,source_table=self.table,node_context=final['prepared_node_context'],workflow_path=self.path,execution_started=False,reopen_performed=False)

    def test_return_and_source_output_pass(self):
        self.assertEqual(self.audit(), [])

    def test_return_rejects_foreign_or_unproven_navigation(self):
        for variant in ('port','node','path','button','proof','extra_action','missing_final'):
            with self.subTest(variant=variant):
                self.setUp()
                before=self.observations[-2][1];final=self.observations[-1][1]
                if variant=='port':final['node_outputs']['ports'][0]['port_guid']='foreign'
                if variant=='node':final['prepared_node_context']['node_id']='foreign'
                if variant=='path':final['navigation_context']['path']=[]
                if variant=='button':before['ui']['elements'][0]['tid']='foreign'
                if variant=='proof':self.checkpoint['output']['workflow_return']['execution_started']=True
                if variant=='extra_action':self.mutations.append((15,dict(verb='click',ref='parent'),{}))
                if variant=='missing_final':self.observations.pop()
                self.assertTrue(self.audit())


class BooleanDateTimeEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.f=TableOutputEvidenceTests();self.f.setUp()
        columns=[dict(name='Flag',label='Flag',type='boolean',used=True),dict(name='Moment',label='Moment',type='datetime',used=True)]
        self.f.request['parameters']['settings']['columns']=columns
        self.f.source=b'Flag;Moment\ntrue;29.02.2024 23:59:58.123\nfalse;01.01.2000 00:00:00.001\n'
        mask='yyyy-mm-dd hh:nn:ss.zzz'
        self.f.observations[3][1]['table_settings']['format']=dict(metadata_fields=[dict(source_index=1,name_key='Moment',format_string=mask)],selected_datetime=dict(source_index=1,name_key='Moment',**{k:dict(status='observed',value=v) for k,v in dict(format_string=mask,formatting=True,custom=True).items()}))
        table=self.f.observations[-1][1]['node_table']
        table['columns']=[dict(index=i,**{k:c[k] for k in ('name','label','type')}) for i,c in enumerate(columns)]
        values=[(True,'Истина','2024-02-29T23:59:58.123'),(False,'Ложь','2000-01-01T00:00:00.001')]
        sample=[]
        for i,(boolean,label,date) in enumerate(values):
            table['rows'][i]['cells']=[dict(column=0,is_null=False,text=label),dict(column=1,is_null=False,text=date.replace('T',' '))]
            sample.append([dict(type='boolean',is_null=False,value=boolean,precision='exact_boolean'),dict(type='datetime',is_null=False,value=date,precision='millisecond',timezone='unspecified')])
        self.f.checkpoint['output']['ports'][0]['sample']=sample

    def test_source_boolean_and_millisecond_dates(self):
        self.assertEqual(self.f.audit(), [])

    def test_wrong_value_mask_or_timezone_is_rejected(self):
        for kind in ['boolean','rounded_date','missing_mask','wrong_mask','timezone','wrong_label']:
            with self.subTest(kind=kind):
                self.setUp();sample=self.f.checkpoint['output']['ports'][0]['sample']
                if kind=='boolean':sample[1][0]['value']=True
                if kind=='rounded_date':sample[0][1]['value']='2024-02-29T23:59:58.000'
                if kind=='missing_mask':self.f.observations[3][1]['table_settings']['format'].pop('selected_datetime')
                if kind=='wrong_mask':self.f.observations[3][1]['table_settings']['format']['metadata_fields'][0]['format_string']='YYYY-MM-DD HH:mm:ss.SSS'
                if kind=='timezone':sample[0][1]['timezone']='UTC'
                if kind=='wrong_label':self.f.observations[-1][1]['node_table']['rows'][0]['cells'][0]['text']='Ложь'
                self.assertTrue(self.f.audit())

class SingleAppliedFormatEvidenceTests(unittest.TestCase):
    def setUp(self):
        parent=BooleanDateTimeEvidenceTests();parent.setUp();self.f=parent.f
        self.f.request['parameters']['settings']['columns'][0]['used']=False
        fmt=self.f.observations[3][1]['table_settings']['format']
        fmt['selected_datetime']['source_index']=0
        fmt['metadata_fields']=[dict(source_index=0,name_key='Moment',format_string='')]
        table=self.f.observations[-1][1]['node_table'];table['column_total']=1
        table['columns']=[dict(table['columns'][1],index=0)]
        for row in table['rows']:row['cells']=[dict(row['cells'][1],column=0)]
        table['applied_format']=dict(verified=True,table=self.f.table,source='applied_table_format_ui_cache',result='ok',modal_tid='Table;ModalWindow_BrowseFormat',fields=[dict(index=0,key='Moment',type='datetime',mask='yyyy-mm-dd hh:nn:ss.zzz')])
        sample=self.f.checkpoint['output']['ports'][0]['sample']
        self.f.checkpoint['output']['ports'][0]['sample']=[[row[1]] for row in sample]

    def test_single_column_requires_applied_cache_and_preapply_ui(self):
        self.assertEqual(self.f.audit(), [])

    def test_wrong_or_missing_applied_cache_does_not_replace_readback(self):
        for kind in ['absent','cancel','mask','table','field','index','modal','preapply_input']:
            with self.subTest(kind=kind):
                self.setUp();table=self.f.observations[-1][1]['node_table'];proof=table['applied_format']
                if kind=='absent':table.pop('applied_format')
                if kind=='cancel':proof['result']='cancel'
                if kind=='mask':proof['fields'][0]['mask']='yyyy-mm-dd'
                if kind=='table':proof['table']={**proof['table'],'view_guid':'foreign'}
                if kind=='field':proof['fields'][0]['key']='other'
                if kind=='index':proof['fields'][0]['index']=1
                if kind=='modal':proof['modal_tid']='other'
                if kind=='preapply_input':self.f.observations[3][1]['table_settings']['format']['selected_datetime']['format_string']['value']='yyyy-mm-dd'
                self.assertTrue(self.f.audit())


class TableFormatRestorationEvidenceTests(unittest.TestCase):
    audit = TableOutputEvidenceTests.audit

    def setUp(self):
        TableReturnEvidenceTests.setUp(self)
        self.observations = [(n*10, s) for n, s in self.observations]
        self.mutations = [(n*10, a, r) for n, a, r in self.mutations]
        self.observations[-2][1].pop('node_table')
        template = copy.deepcopy(self.observations[-2][1])
        template['ui'] = dict(elements=[], dialogs=[])
        template.pop('workflow_navigation')
        self.original_fields = [dict(index=i, source_index=i, name_key=c['name'], label=c['label'], type=c['type'],
            format_string='0.00' if i == 0 else '') for i,c in enumerate(self.request['parameters']['settings']['columns'])]
        self.original_settings = dict(formatting=True,custom=True,format_string='0.00',thousands=False,
                                      scientific=False,decimal_digits='',currency='')
        def format_state(mask):
            state = copy.deepcopy(template)
            fields = copy.deepcopy(self.original_fields);fields[0]['format_string'] = mask
            settings = dict(self.original_settings, format_string=mask)
            state['node_table_dialog'] = dict(table=self.table,kind='format')
            state['table_settings'] = dict(status='observed',kind='format',format=dict(
                page=dict(status='complete_definition_page',schema_id='format-schema',offset=0,limit=8,total_columns=2,returned=2,next_offset=None),
                metadata_fields=fields,
                selected_numeric=dict(source_index=0,name_key='Id',**{k:dict(status='observed',value=v) for k,v in settings.items()})))
            state['ui'] = dict(dialogs=[dict(identity=dict(anchor_tid='Table;ModalWindow_BrowseFormat'))],elements=[
                dict(ref='mask',tid='Table;ModalWindow_BrowseFormat;BrowseFormat;FormatPanel;edtFormat',allowed_actions=['fill','press']),
                dict(ref='apply_format',tid='Table;ModalWindow_BrowseFormat;btnApply',allowed_actions=['click'])])
            return state
        self.observations = [(n,format_state('0') if n == 70 else s) for n,s in self.observations]
        available = copy.deepcopy(template)
        available['ui']['elements'] = [dict(ref='format',tid='Table;btnDataGridFormat',allowed_actions=['click'])]
        self.observations += [(67,format_state('0.00')),(68,format_state('0.00')),(111,available),
                              (113,format_state('0')),(115,format_state('0.00')),(117,format_state('0.00')),(119,copy.deepcopy(template))]
        self.observations.sort(key=lambda row:row[0])
        self.mutations += [(69,dict(verb='fill',ref='mask',text='0'),{}),(112,dict(verb='click',ref='format'),{}),
                           (114,dict(verb='fill',ref='mask',text='0.00'),{}),(116,dict(verb='press',ref='mask',key='Tab'),{}),
                           (118,dict(verb='click',ref='apply_format'),{})]
        self.mutations.sort(key=lambda row:row[0])
        self.checkpoint['output']['format_restoration'] = dict(table=self.table,restored=True,fields=[
            dict(index=i,definition_index=i,key=f['name_key'],label=f['label'],type=f['type'],**({'mask':f['format_string']} if i == 0 else {}))
            for i,f in enumerate(self.original_fields)])

    def state(self, step):
        return next(s for n,s in self.observations if n == step)

    def test_precision_read_restore_and_return_pass_without_a_verified_summary_flag(self):
        self.assertNotIn('verified',self.checkpoint['output']['format_restoration'])
        self.assertEqual(self.audit(),[])

    def test_second_apply_needs_raw_restoration_not_only_checkpoint_flags(self):
        for variant in ['no_original','no_restored','only_flag','wrong_table','wrong_mask','wrong_order','wrong_key',
                        'wrong_index','wrong_source_index','wrong_type','wrong_other_field_mask','wrong_settings','unobserved_settings']:
            with self.subTest(variant=variant):
                self.setUp()
                if variant=='no_original':self.observations=[(n,s) for n,s in self.observations if n not in (67,68)]
                if variant=='no_restored':self.observations=[(n,s) for n,s in self.observations if n not in (115,117)]
                if variant=='only_flag':self.checkpoint['output']['format_restoration']={'restored':True}
                if variant=='wrong_table':self.checkpoint['output']['format_restoration']={**self.checkpoint['output']['format_restoration'],'table':{**self.table,'view_guid':'foreign'}}
                final=self.state(117) if variant!='no_restored' else self.state(113)
                fmt=final['table_settings']['format'];fields=fmt['metadata_fields']
                if variant=='wrong_mask':fields[0]['format_string']='0.000'
                if variant=='wrong_order':fields.reverse()
                if variant=='wrong_key':fields[0]['name_key']='Other'
                if variant=='wrong_index':fields[0]['index']=1
                if variant=='wrong_source_index':fields[0]['source_index']=1
                if variant=='wrong_type':fields[0]['type']='real'
                if variant=='wrong_other_field_mask':fields[1]['format_string']='unexpected'
                if variant=='wrong_settings':fmt['selected_numeric']['custom']['value']=False
                if variant=='unobserved_settings':fmt['selected_numeric']['format_string']['status']='unobserved'
                self.assertTrue(self.audit())

    def test_restoration_requires_its_own_owner_and_no_foreign_or_later_mutations(self):
        for variant in ['foreign_node','foreign_dialog','foreign_control','unallowed_control','missing_close','late_cells',
                        'edit_after_readback','extra_apply','extra_action','extra_before_restore','no_workflow_return']:
            with self.subTest(variant=variant):
                self.setUp()
                if variant=='foreign_node':
                    for n,s in self.observations:
                        if 111<=n<=119:
                            s['prepared_node_context']={**s['prepared_node_context'],'node_id':'foreign'}
                            s['node_outputs']['node_context']={**s['prepared_node_context']}
                if variant=='foreign_dialog':self.state(117)['node_table_dialog']={'table':{**self.table,'port_guid':'foreign'},'kind':'format'}
                if variant=='foreign_control':self.state(113)['ui']['elements'][0]['tid']='Other;ModalWindow_BrowseFormat;BrowseFormat;edtFormat'
                if variant=='unallowed_control':self.state(113)['ui']['elements'][0]['allowed_actions']=[]
                if variant=='missing_close':
                    for n,s in self.observations:
                        if n>118:s['ui']['dialogs']=[{'title':'Format still open'}]
                if variant=='late_cells':self.state(119)['node_table']=copy.deepcopy(self.state(110)['node_table'])
                if variant=='edit_after_readback':
                    self.observations=[(n,s) for n,s in self.observations if n!=117]
                if variant=='extra_apply':
                    self.observations.append((118.5,copy.deepcopy(self.state(117))))
                    self.mutations.append((118.75,dict(verb='click',ref='apply_format'),{}))
                if variant=='extra_action':self.mutations.append((131,dict(verb='click',ref='unknown'),{}))
                if variant=='extra_before_restore':self.mutations.append((111.5,dict(verb='click',ref='unknown'),{}))
                if variant=='no_workflow_return':self.checkpoint['output'].pop('workflow_return')
                self.observations.sort(key=lambda row:row[0]);self.mutations.sort(key=lambda row:row[0])
                self.assertTrue(self.audit())
