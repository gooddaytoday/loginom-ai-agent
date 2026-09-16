import copy
import json
from pathlib import Path
import unittest
from decimal import Decimal
import rendered_results as rr

VIEW='MF;TF-1;ViewsForm;BrowseView'
FORMAT={'decimal_separator':'.','grouping_separator':None}
EXPECTED=json.loads(Path(__file__).with_name('fixtures').joinpath('data-pipeline/expected.json').read_text())


def snapshot(stage='import'):
    schema,_=rr.target_table(EXPECTED,stage)
    records=[{'data_column':{'view_key':VIEW,'column_key':c['name'],'declared_type':c['type'],'type_status':'observed'}} for c in schema]
    for i,row in enumerate(EXPECTED[stage]['rows']):
        for c in schema:
            value=row[c['name']]
            records.append({'data_cell':{'view_key':VIEW,'column_key':c['name'],'row_index':i,'header_observed':True,
                'display_text':'<null>' if value is None else str(value),'null_marker_present':value is None,
                'text_complete':True,'redacted':False}})
    return {'authenticated':True,'workflow_ref':{'prefix':'MF;TF-1'},'ui':{'table_cells':records}}


class RenderedResultsTest(unittest.TestCase):
    def compare(self, value, stage='import'):
        return rr.compare(value,VIEW,EXPECTED,stage,FORMAT)

    def test_all_three_expected_tables_match_but_do_not_admit_complete_result(self):
        for stage in ('import','calculator','group'):
            report=self.compare(snapshot(stage),stage)
            self.assertTrue(report['rendered_rows_match'],report)
            self.assertFalse(report['complete_result_verified']);self.assertFalse(report['numeric_format_attested'])

    def test_preserves_empty_null_whitespace_types_and_duplicate_counts(self):
        mutations=[lambda cs:cs[0]['data_column'].update(declared_type='real'),
                   lambda cs:cs[9]['data_cell'].update(null_marker_present=True),
                   lambda cs:cs[14]['data_cell'].update(null_marker_present=False,display_text=''),
                   lambda cs:cs[6]['data_cell'].update(display_text=' Север '),
                   lambda cs:cs[5]['data_cell'].update(display_text='2'),
                   lambda cs:cs.append(copy.deepcopy(cs[-1])),
                   lambda cs:cs.pop(),
                   lambda cs:cs[5]['data_cell'].update(row_index=True),
                   lambda cs:cs[5]['data_cell'].update(text_complete=False),
                   lambda cs:cs[5]['data_cell'].update(header_observed=False),
                   lambda cs:cs[5]['data_cell'].update(redacted=True)]
        for mutate in mutations:
            value=snapshot();mutate(value['ui']['table_cells'])
            self.assertFalse(self.compare(value)['rendered_rows_match'])

    def test_row_order_is_irrelevant_but_repeated_row_cannot_replace_a_missing_one(self):
        value=snapshot()
        for record in value['ui']['table_cells']:
            if 'data_cell' in record:record['data_cell']['row_index']=5-record['data_cell']['row_index']
        self.assertTrue(self.compare(value)['rendered_rows_match'])
        cells=[r['data_cell'] for r in value['ui']['table_cells'] if 'data_cell' in r]
        original={c['column_key']:c for c in cells if c['row_index']==0}
        for c in cells:
            if c['row_index']==1:
                c.update({k:v for k,v in original[c['column_key']].items() if k!='row_index'})
        self.assertFalse(self.compare(value)['rendered_rows_match'])

    def test_requires_explicit_numeric_format_and_never_rounds(self):
        report=rr.compare(snapshot(),VIEW,EXPECTED,'import')
        self.assertEqual(report['reason'],'numeric_format_required')
        value=snapshot();value['ui']['table_cells'][8]['data_cell']['display_text']='12.500000000001'
        self.assertFalse(self.compare(value)['rendered_rows_match'])
        self.assertEqual(rr.number('1\u202f234,50','real',{'decimal_separator':',','grouping_separator':'\u202f'}),Decimal('1234.5'))
        self.assertEqual(rr.number('-1.25e-2','real',FORMAT),Decimal('-.0125'))
        for text in ('NaN','Infinity',' 12.5','12.5 ','1,25','1e999',''):
            with self.assertRaises(rr.Unverifiable):rr.number(text,'real',FORMAT)
        with self.assertRaises(rr.Unverifiable):rr.number('12.0','integer',FORMAT)
        with self.assertRaises(rr.Unverifiable):rr.number('12 34,50','real',{'decimal_separator':',','grouping_separator':' '})

    def test_missing_duplicate_or_foreign_column_and_truncated_cell_fail(self):
        for mutate in [lambda rs:rs.pop(0),lambda rs:rs.append(copy.deepcopy(rs[0])),
                       lambda rs:rs[0]['data_column'].update(view_key='other'),
                       lambda rs:rs[0]['data_column'].update(type_status='ambiguous'),
                       lambda rs:rs[5]['data_cell'].update(display_text='x'*2049)]:
            value=snapshot();mutate(value['ui']['table_cells']);self.assertFalse(self.compare(value)['rendered_rows_match'])

    def test_diagnostic_ignores_unbound_and_model_supplied_table_claims(self):
        data={'tools':[],'events':[],'domain_proof':snapshot()}
        self.assertEqual(rr.diagnose(data,EXPECTED,'')['observations'],[])
        result={'status':'SUCCEEDED','operation_id':'read','output':snapshot()}
        data['tools']=[{'session_id':'s','tool_call_id':'c','row':2,'tool':'dock_workspace_observe','result':result}]
        data['calls']=[{'session_id':'s','tool_call_id':'c','row':1,'tool':'dock_workspace_observe','arguments':{}}]
        self.assertEqual(rr.diagnose(data,EXPECTED,'')['observations'],[])
        data['events']=[{'phase':'observation_completed','operation_id':'read','outcome':copy.deepcopy(result)}]
        reports=rr.diagnose(data,EXPECTED,'')['observations']
        self.assertEqual(len(reports),3);self.assertEqual(reports[0]['reason'],'numeric_format_required')
        data['tools'][0]['result']['output']['ui']['table_cells'][0]['data_column']['declared_type']='real'
        self.assertEqual(rr.diagnose(data,EXPECTED,'')['observations'],[])


    def test_diagnostic_requires_unique_reply_within_session(self):
        result={'status':'SUCCEEDED','operation_id':'read','output':snapshot()}
        reply={'session_id':'s','tool_call_id':'c','row':2,'tool':'dock_workspace_observe','result':result}
        evidence={'tools':[reply],
                  'calls':[{'session_id':'s','tool_call_id':'c','row':1,'tool':'dock_workspace_observe','arguments':{}}],
                  'events':[{'phase':'observation_completed','operation_id':'read','outcome':copy.deepcopy(result)}]}
        self.assertEqual(len(rr.diagnose(evidence,EXPECTED,'')['observations']),3)
        for conflict in ('identical','different_output','failed','different_tool'):
            with self.subTest(conflict=conflict):
                data=copy.deepcopy(evidence);duplicate=copy.deepcopy(reply);duplicate['row']=3
                if conflict=='different_output':
                    duplicate['result']['output']['ui']['table_cells'][0]['data_column']['declared_type']='real'
                elif conflict=='failed':duplicate['result']={'status':'FAILED'}
                elif conflict=='different_tool':duplicate['tool']='dock_ui_action'
                data['tools'].append(duplicate)
                self.assertEqual(rr.diagnose(data,EXPECTED,'')['observations'],[])
        # A reused tool-call ID in another session must neither reject this
        # receipt nor supply a matching call for that unrelated reply.
        data=copy.deepcopy(evidence);foreign=copy.deepcopy(reply);foreign['session_id']='other'
        data['tools'].insert(0,foreign)
        self.assertEqual(len(rr.diagnose(data,EXPECTED,'')['observations']),3)
        data['tools']=[foreign]
        self.assertEqual(rr.diagnose(data,EXPECTED,'')['observations'],[])

    def test_literal_null_string_and_empty_result_are_not_guessed(self):
        expected=copy.deepcopy(EXPECTED);expected['import']['rows'][0]['Comment']='<null>'
        value=snapshot();value['ui']['table_cells'][9]['data_cell']['display_text']='<null>'
        report=rr.compare(value,VIEW,expected,'import',FORMAT)
        self.assertTrue(report['rendered_rows_match'])
        value['ui']['table_cells'][9]['data_cell']['null_marker_present']=True
        self.assertFalse(rr.compare(value,VIEW,expected,'import',FORMAT)['rendered_rows_match'])
        expected['import']['rows']=[];expected['import']['row_count']=0
        value=snapshot();value['ui']['table_cells']=value['ui']['table_cells'][:5]
        report=rr.compare(value,VIEW,expected,'import',FORMAT)
        self.assertTrue(report['rendered_rows_match']);self.assertFalse(report['complete_result_verified'])

    def test_inactive_or_malformed_context_never_matches(self):
        for value in ({}, {'ui':[]}, {'authenticated':True,'workflow_ref':[]}, snapshot()):
            if value.get('workflow_ref')=={'prefix':'MF;TF-1'}:value['workflow_ref']['prefix']='MF;TF-2'
            self.assertFalse(self.compare(value)['rendered_rows_match'])
