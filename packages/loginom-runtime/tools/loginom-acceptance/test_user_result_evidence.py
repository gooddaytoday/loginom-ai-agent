import json
import os
from pathlib import Path
import shutil
import subprocess
import unittest
from copy import deepcopy
from evidence import PREFIX
from user_result_evidence import normalize_user_evidence, project_node


def fixture():
    state={'status':'READY','target_verified':True,'ownership_verified':True,'document_id':'doc','session_id':'dock','operation_id':'prep','workflow_ref':{'workflow_id':'flow','tab_tid':'tab','prefix':'p','navigation_path':[{'tid':'path'}]}}
    request={'operation_id':'node','document_id':'doc','workflow_ref':{'workflow_id':'flow'},'target':{'kind':'existing','ref':{'node_id':'n','document_id':'doc','workflow_id':'flow'}},'parameters':{}}
    expanded=deepcopy(request);expanded['workflow_ref']=state['workflow_ref']
    outcome={'status':'SUCCEEDED','cleanup_complete':True,'output':{'node':{'document_id':'doc','workflow_id':'flow','node_id':'n'},'configuration':{'readback':{'node':{'document_id':'doc','workflow_id':'flow','node_id':'n'},'receipt_ids':['node:configure'],'source':{'source_path':'/test/a.csv'}}},'output':{'status':'complete','ports':[{'schema':[],'sample':[[{'value':str(i),'precision':'exact_integer','is_null':False}] for i in range(6)],'sample_complete':True}]}}}
    snapshot={'operation_id':'node','attempt':1,'state':'settled','outcome':outcome,'error':None}
    calls=[{'session_id':'caller','tool_call_id':'p','row':1,'tool':PREFIX+'dock_prepare','arguments':{'operation_id':'prep'}},{'session_id':'caller','tool_call_id':'n','row':3,'tool':PREFIX+'dock_node_apply','arguments':request}]
    replies=[{**calls[0],'row':2,'result':{'result_version':'user-v1','prepared':True,'sessionId':'dock','workspace':state}}, {**calls[1],'row':4,'result':project_node(snapshot)}]
    events=[{'event':'workspace_prepared','session_id':'dock','state':state},{'phase':'node_apply_prepared','operation_id':'node','session_id':'dock','request':expanded},{'phase':'completed','operation_id':'node','action_key':'node.apply','outcome':outcome}]
    return {'calls':calls,'tools':replies,'events':events}


class UserResultTests(unittest.TestCase):
    def test_actual_port_projection_preserves_freshness_and_limits(self):
        node=os.environ.get('LOGINOM_NODE') or shutil.which('node')
        self.assertIsNotNone(node)
        script="""
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {compactNodeResult}=await import(pathToFileURL(process.argv[1]));
process.stdout.write(JSON.stringify(compactNodeResult(JSON.parse(readFileSync(0,'utf8')))));
"""
        for count in (2,1,0):
            e=fixture();outcome=e['events'][2]['outcome'];port=outcome['output']['output']['ports'][0]
            port.update(port=0,port_guid='port-guid',fresh=True,execution_id='execution',
                freshness_basis='completed_execution_port_source',
                schema=[dict(index=0,name='Value',label='Value',type='integer',data_kind='Непрерывный')],
                row_count=2,sample=[[dict(type='integer',value=str(i),precision='exact_integer',
                    representation='decimal_integer',is_null=False)] for i in (1,2)][:count],
                sample_rows=count,sample_complete=count==2,
                precision=dict(numbers_verified=True,limitations=[],strings='data source text'))
            if count<2:
                source=['small','x'*(512*1024+1)] if count else ['x'*(512*1024+1),'small']
                self.assertGreater(len(source[count].encode('utf-8')),512*1024)
                port['schema'][0].update(type='string',data_kind='Дискретный')
                port.update(sample=[[dict(type='string',value=value,precision='source_text',
                    representation='data_source_string',is_null=False)] for value in source[:count]],
                    read_limit='preview_cell_or_byte_budget')
            snapshot=dict(operation_id='node',attempt=1,state='settled',outcome=outcome,error=None)
            reply=json.loads(subprocess.run([node,'--input-type=module','-e',script,
                str(Path(__file__).resolve().parents[2]/'client/lib/user-results.mjs')],
                input=json.dumps(snapshot),capture_output=True,text=True,check=True,timeout=10).stdout)
            with self.subTest(count=count):
                if count==2:
                    self.assertEqual(project_node(snapshot),reply)
                    e['tools'][1]['result']=reply
                    self.assertTrue(normalize_user_evidence(e)[1]['passed'])
                else:
                    # Partial-preview advice has a separate historical projection limit.
                    self.assertEqual(project_node(snapshot)['output']['ports'],reply['output']['ports'])

    def test_port_metadata_and_sample_changes_are_rejected(self):
        e=fixture();outcome=e['events'][2]['outcome'];port=outcome['output']['output']['ports'][0]
        port.update(freshness_basis='completed_execution_port_source',read_limit='preview_cell_or_byte_budget')
        e['tools'][1]['result']=project_node(dict(operation_id='node',attempt=1,state='settled',outcome=outcome,error=None))
        e['tools'][1]['result']['output']['ports'][0].update({key:port[key] for key in ('freshness_basis','read_limit')})
        before=deepcopy(e)
        self.assertTrue(normalize_user_evidence(e)[1]['passed']);self.assertEqual(e,before)
        for key in ('freshness_basis','read_limit'):
            for removed in (False,True):
                damaged=deepcopy(e);public_port=damaged['tools'][1]['result']['output']['ports'][0]
                if removed:del public_port[key]
                else:public_port[key]='foreign'
                with self.subTest(key=key,removed=removed):self.assertFalse(normalize_user_evidence(damaged)[1]['passed'])
        for count in (0,5):
            damaged=deepcopy(e);public_port=damaged['tools'][1]['result']['output']['ports'][0]
            public_port.update(sample=public_port['sample'][:count],sample_rows=count,sample_complete=False)
            with self.subTest(count=count):self.assertFalse(normalize_user_evidence(damaged)[1]['passed'])

    def test_exact_projection_resolves_only_from_preparation_without_editing_input(self):
        e=fixture();before=deepcopy(e);normalized,r=normalize_user_evidence(e)
        self.assertTrue(r['passed']);self.assertEqual(e,before)
        self.assertEqual(normalized['calls'][1]['arguments'],e['events'][1]['request'])
        self.assertEqual(normalized['tools'][1]['result']['outcome'],e['events'][2]['outcome'])
        self.assertEqual(len(e['tools'][1]['result']['output']['ports'][0]['sample']),6)

    def test_native_projection_retains_typed_cells_and_rejects_omissions(self):
        e=fixture();outcome=e['events'][2]['outcome'];port=outcome['output']['output']['ports'][0]
        cell=dict(type='integer',value='9223372036854775807',representation='decimal_integer',precision='exact_integer',is_null=False)
        port.update(sample=[[cell]],exact_table=True,read_coverage='full',read_consistency='stable',cell_precision='exact',binding={'node_id':'n'},limitations=[])
        snapshot=dict(operation_id='node',attempt=1,state='settled',outcome=outcome,error=None)
        e['tools'][1]['result']=project_node(snapshot)
        self.assertTrue(normalize_user_evidence(e)[1]['passed'])
        self.assertEqual(e['tools'][1]['result']['output']['ports'][0]['sample'][0][0],cell)
        for key in ('exact_table','read_coverage','read_consistency','cell_precision','binding'):
            damaged=deepcopy(e);del damaged['tools'][1]['result']['output']['ports'][0][key]
            with self.subTest(key=key):self.assertFalse(normalize_user_evidence(damaged)[1]['passed'])
        for key in ('type','representation'):
            damaged=deepcopy(e);del damaged['tools'][1]['result']['output']['ports'][0]['sample'][0][0][key]
            with self.subTest(key=key):self.assertFalse(normalize_user_evidence(damaged)[1]['passed'])

    def test_unallocated_rejection_before_corrected_same_id_does_not_expand_invalid_request(self):
        import json
        e=fixture()
        for c in e['calls'][1:]:c['row']+=2
        for r in e['tools'][1:]:r['row']+=2
        call=deepcopy(e['calls'][1]);call.update(row=3,tool_call_id='refused');call['arguments']['parameters']={'invalid':True}
        error=dict(status='FAILED',action_key='request.validate',operation_id=None,phase='request_rejected',effect_possible=False,request_rejected=True,trace=[],error=dict(code='REQUEST_REJECTED'),output=dict(operation=dict(operation_id=None,state='idle',outcome=None,cleanup_confirmed=True,effect_state='none')))
        reply={**deepcopy(call),'row':4,'result':{'isError':True,'error':json.dumps(error)}}
        e['calls'].insert(1,call);e['tools'].insert(1,reply)
        self.assertTrue(normalize_user_evidence(e)[1]['passed'])
        error['effect_possible']=True;reply['result']['error']=json.dumps(error)
        self.assertFalse(normalize_user_evidence(e)[1]['passed'])

    def test_rejects_changed_public_evidence(self):
        def field(path,value):
            def mutate(e):
                obj=e
                for k in path[:-1]:obj=obj[k]
                obj[path[-1]]=value
            return mutate
        cases=[
          field(['calls',1,'arguments','document_id'],'foreign'),
          field(['calls',1,'arguments','workflow_ref','workflow_id'],'stale'),
          field(['calls',1,'arguments','target','ref','node_id'],'foreign'),
          field(['tools',1,'result','configuration','readback','source','source_path'],'/other.csv'),
          field(['tools',1,'result','configuration','readback','receipt_ids'],['old:configure']),
          field(['tools',1,'result','configuration','readback','node','node_id'],'other'),
          field(['tools',1,'result','output','ports',0,'sample'],[]),
          field(['events',0,'session_id'],'foreign'),
          field(['tools',0,'row'],5),
        ]
        for mutate in cases:
            e=fixture();mutate(e)
            with self.subTest(mutate=mutate):self.assertFalse(normalize_user_evidence(e)[1]['passed'])

    def test_preparation_after_declaration_is_not_proof(self):
        e=fixture();e['events'][0],e['events'][1]=e['events'][1],e['events'][0]
        self.assertFalse(normalize_user_evidence(e)[1]['passed'])

    def test_missing_readback_is_rejected(self):
        e=fixture();del e['tools'][1]['result']['configuration']
        self.assertFalse(normalize_user_evidence(e)[1]['passed'])

    def test_diagnostic_evidence_remains_unchanged(self):
        e={'calls':[],'tools':[],'events':[]};self.assertEqual(normalize_user_evidence(e)[0],e)

if __name__=='__main__':unittest.main()
