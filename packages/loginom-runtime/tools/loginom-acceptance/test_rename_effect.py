import copy
import unittest
import rename_effect
import json
from pathlib import Path
import subprocess


def fixture():
    def state(obs,label,value):
        return {'observation_id':obs,'workflow_ref':{'prefix':'MF;TF-1'},'links':[],
                'nodes':[{'node_ref':{'node_label':label},'ports':[{'tid':'MF;TF-1;Graph;'+label+';Output_Data-0'}]}],
                'ui':{'truncated':dict(nodes=False,ports=False,links=False),'elements':[
                    {'ref':'editor','value':value,'signature':{'tag':'textarea'},'identity':{'anchor_tid':'MF;TF-1;ModelForm;cmpDiagram'}}]}}
    tools=[{'row':10,'tool_call_id':'observe','result':{'output':state('before','Текстовый_файл','Текстовый файл')}}]
    calls=[];events=[]
    for row,verb,obs,out in [(11,'fill','before',state('filled','Текстовый_файл','Источник')),(13,'press','filled',state('after','Источник','Источник'))]:
        action={'ref':'editor','verb':verb,**({'text':'Источник'} if verb=='fill' else {'key':'Enter'})}
        calls.append({'row':row,'tool':'dock_ui_action','tool_call_id':str(row),'arguments':{'observation_id':obs,'action':action}})
        result={'operation_id':str(row),'status':'SUCCEEDED','cleanup_complete':True,'output':out,
                'trace':[{'event':'ui_preconditions_verified','verb':verb,'refs':['editor']},{'event':'ui_gesture_applied','verb':verb}]}
        tools.append({'row':row+1,'tool_call_id':str(row),'result':result})
        events.append({'phase':'completed','operation_id':str(row),'outcome':copy.deepcopy(result)})
    return tools,calls,events

class RenameEffect(unittest.TestCase):
    def test_graph_pages_bind_native_projection_and_preserve_omission_flags(self):
        raw=fixture()[0][0]['result']
        raw.update(status='SUCCEEDED',operation_id='observe')
        raw['output']['ui']['elements']=[
            {'ref':'body','scope':'graph','signature':{'tag':'g'}},
            {'ref':'toolbar','scope':'workflow'},
            {'ref':'editor','scope':'graph_editor','value':'name'}]
        raw['output']['ui']['dialogs']=[{'ref':'blocking-dialog'}]
        script="""import {createObservationPages} from './client/lib/observation-pages.mjs';
let text='';for await(const part of process.stdin)text+=part;
console.log(JSON.stringify(createObservationPages().retain(JSON.parse(text),{scope:'graph'})));"""
        result=subprocess.run(['node','--input-type=module','-e',script],
            cwd=Path(__file__).resolve().parents[2],input=json.dumps(raw),text=True,capture_output=True,check=True)
        page=json.loads(result.stdout)
        self.assertTrue(rename_effect.journal_equal(raw,page))
        self.assertEqual([e['ref'] for e in page['output']['ui']['elements']],['body','editor'])
        for mode in ('dialog_absence','omitted_elements','foreign_scope','injected','changed_value','missing'):
            with self.subTest(mode=mode):
                bad=copy.deepcopy(page);ui=bad['output']['ui']
                if mode=='dialog_absence':ui['truncated']['dialogs']=False
                if mode=='omitted_elements':ui['truncated']['elements']=False
                if mode=='foreign_scope':bad['output']['page']['scope']='all'
                if mode=='injected':ui['elements'].append({'ref':'toolbar','scope':'workflow'})
                if mode=='changed_value':ui['elements'][1]['value']='other'
                if mode=='missing':ui['elements'].pop()
                self.assertFalse(rename_effect.journal_equal(raw,bad))

    def test_real_pager_wizard_priority_is_bound_without_accepting_reordering(self):
        items=[('plain',{}),('step',{'wizard_step':{'direction':'next'},'allowed_actions':['wizard_step']}),
               ('field',{'wizard_field':{},'allowed_actions':['set_wizard_field']}),
               ('option',{'allowed_actions':['select_wizard_option']}),
               ('picker',{'wizard_combo':{'kind':'picker','field':{'scope':'import_column'}}}),
               ('menu',{'role':'menuitem'}),('dialog',{'signature':{'tag':'button','dialog_ref':'dialog-1'}}),
               ('other_picker',{'wizard_combo':{'kind':'picker','field':{'scope':'other'}}}),
               ('field_without_action',{'wizard_field':{'name':'null_marker'}}),
               ('finish',{'allowed_actions':['finish_wizard']})]
        script="""import {createObservationPages} from './client/lib/observation-pages.mjs';
let text='';for await(const part of process.stdin)text+=part;
console.log(JSON.stringify(createObservationPages().retain(JSON.parse(text))));"""
        for observed in (True,False):
            with self.subTest(observed=observed):
                raw=fixture()[0][0]['result'];raw.update(status='SUCCEEDED',operation_id='observe')
                raw['output']['nodes']=[];raw['output']['wizard']={'status':'observed' if observed else 'absent'}
                raw['output']['ui']['elements']=[{'ref':name,'signature':{'tag':'button'},**data} for name,data in items]
                result=subprocess.run(['node','--input-type=module','-e',script],
                    cwd=Path(__file__).resolve().parents[2],input=json.dumps(raw),text=True,capture_output=True,check=True)
                page=json.loads(result.stdout)
                self.assertTrue(rename_effect.journal_equal(raw,page))
                order=[e['ref'] for e in page['output']['ui']['elements']]
                self.assertEqual(order,['menu','dialog','picker','option','step','finish','field','plain','other_picker','field_without_action'] if observed else [name for name,_ in items])
                for mode in ('reorder','duplicate','changed_priority','changed_scope','missing'):
                    bad=copy.deepcopy(page)
                    elements=bad['output']['ui']['elements']
                    if mode=='reorder':elements[0],elements[1]=elements[1],elements[0]
                    if mode=='duplicate':elements[1]=copy.deepcopy(elements[0])
                    if mode=='changed_priority':elements[0]['allowed_actions']=['set_wizard_field']
                    if mode=='changed_scope':bad['output']['page']['scope']='dialogs'
                    if mode=='missing':elements.pop()
                    self.assertFalse(rename_effect.journal_equal(raw,bad),mode)

    def test_exact_compact_identity_fallback_does_not_override_contradictions(self):
        self.assertEqual(rename_effect.element_anchor({'tid':'exact'}),'exact')
        self.assertEqual(rename_effect.element_anchor({'tid':'exact','identity':{'anchor_tid':'other'}}),'other')
        self.assertIsNone(rename_effect.element_anchor({'tid':'exact','identity':None}))
        self.assertIsNone(rename_effect.element_anchor({'tid':'exact','identity':{}}))
        data=fixture()
        for tool in data[0]:
            element=tool['result']['output']['ui']['elements'][0]
            element['tid']=element.pop('identity')['anchor_tid']
        for event,tool in zip(data[2],data[0][1:]):event['outcome']=copy.deepcopy(tool['result'])
        self.assertIsNotNone(self.proof(data))
        data[0][0]['result']['output']['ui']['elements'][0]['identity']={'anchor_tid':'foreign'}
        self.assertIsNone(self.proof(data))

    def test_process_metadata_bound_to_real_pager_without_execution_admission(self):
        raw=fixture()[0][0]['result'];raw.update(status='SUCCEEDED',operation_id='observe')
        raw['output']['ui']['elements'][0]['process_row']={'record_id':'1','path':'Root>Активация_узлов','record_index':0,'panel_ref':'panel','grid_ids':['tree','table']}
        raw['output']['process_console']={'status':'rendered_process_inventory',
            'top_level_complete':True,'execution_verified':False,'owner_verified':False,
            'details_complete':False,'rows':[{'record_id':'1','rendered_state':'completed','path':'Root>Активация_узлов'}]}
        script="""import {createObservationPages} from './client/lib/observation-pages.mjs';
let text='';for await(const part of process.stdin)text+=part;
console.log(JSON.stringify(createObservationPages().retain(JSON.parse(text))));"""
        result=subprocess.run(['node','--input-type=module','-e',script],cwd=Path(__file__).resolve().parents[2],input=json.dumps(raw),text=True,capture_output=True,check=True)
        page=json.loads(result.stdout)
        self.assertTrue(rename_effect.journal_equal(raw,page))
        for mode in ('omit','claim','change_row','changed_action_binding'):
            bad=copy.deepcopy(page)
            if mode=='omit':del bad['output']['process_console']
            if mode=='claim':bad['output']['process_console']['execution_verified']=True
            if mode=='change_row':bad['output']['process_console']['rows'][0]['record_id']='foreign'
            if mode=='changed_action_binding':bad['output']['ui']['elements'][0]['process_row']['record_id']='foreign'
            self.assertFalse(rename_effect.journal_equal(raw,bad),mode)

    def test_node_context_metadata_bound_to_real_pager_and_journal(self):
        raw=fixture()[0][0]['result'];raw.update(status='SUCCEEDED',operation_id='observe')
        raw['output']['node_context']={'status':'observed','kind':'node','opening_verified':False,
            'panel_ref':'panel','node':{'ref':'node','tid':'own>node','label':'Изменение'},
            'path':[{'ref':'node','tid':'own>node','label':'Изменение'}]}
        script="""import {createObservationPages} from './client/lib/observation-pages.mjs';
let text='';for await(const part of process.stdin)text+=part;
console.log(JSON.stringify(createObservationPages().retain(JSON.parse(text))));"""
        result=subprocess.run(['node','--input-type=module','-e',script],cwd=Path(__file__).resolve().parents[2],input=json.dumps(raw),text=True,capture_output=True,check=True)
        page=json.loads(result.stdout)
        self.assertTrue(rename_effect.journal_equal(raw,page))
        for mode in ('omit','claim','node','path','kind'):
            bad=copy.deepcopy(page)
            if mode=='omit':del bad['output']['node_context']
            if mode=='claim':bad['output']['node_context']['opening_verified']=True
            if mode=='node':bad['output']['node_context']['node']['tid']='foreign'
            if mode=='path':bad['output']['node_context']['path'][0]['tid']='foreign'
            if mode=='kind':bad['output']['node_context']['kind']='workflow'
            self.assertFalse(rename_effect.journal_equal(raw,bad),mode)

    def test_table_settings_metadata_bound_to_real_pager_and_journal(self):
        raw=fixture()[0][0]['result'];raw.update(status='SUCCEEDED',operation_id='observe')
        raw['output']['table_settings']={'status':'observed','kind':'filter',
            'filter':{'predicates_complete':True,'effective_filter_verified':False},
            'settings_applied':False,'result_complete':False,'execution_verified':False}
        script="""import {createObservationPages} from './client/lib/observation-pages.mjs';
let text='';for await(const part of process.stdin)text+=part;
console.log(JSON.stringify(createObservationPages().retain(JSON.parse(text))));"""
        result=subprocess.run(['node','--input-type=module','-e',script],cwd=Path(__file__).resolve().parents[2],input=json.dumps(raw),text=True,capture_output=True,check=True)
        page=json.loads(result.stdout)
        self.assertTrue(rename_effect.journal_equal(raw,page))
        for mode in ('missing','changed'):
            bad=copy.deepcopy(page)
            if mode=='missing':del bad['output']['table_settings']
            else:bad['output']['table_settings']['result_complete']=True
            self.assertFalse(rename_effect.journal_equal(raw,bad))

    def test_actual_runtime_all_pages_compact_only_redundant_identity(self):
        raw=fixture()[0][0]['result'];raw.update(status='SUCCEEDED',operation_id='observe')
        elements=[]
        for i in range(8):
            elements.append({'ref':f'ui-{i}','tid':f'tid-{i}','signature':{'tag':'textarea'},
                             'identity':{'anchor_tid':f'tid-{i}','path':[]}})
        del elements[1]['tid']
        elements[2]['identity']['anchor_tid']='contradiction'
        elements[3]['identity']['path']=['child']
        elements[4]['identity']['extra']='preserve'
        del elements[5]['identity']['path']
        raw['output']['ui']['elements']=elements
        script="""import {createObservationPages} from './client/lib/observation-pages.mjs';
let text='';for await(const part of process.stdin)text+=part;
const raw=JSON.parse(text),p=createObservationPages({maxRecords:3});let page=p.retain(structuredClone(raw)),pages=[];
while(true){pages.push(page);if(!page.output.page.next_cursor)break;page=p.next(page.output.page.next_cursor,structuredClone(raw));}
console.log(JSON.stringify(pages));"""
        result=subprocess.run(['node','--input-type=module','-e',script],cwd=Path(__file__).resolve().parents[2],input=json.dumps(raw),text=True,capture_output=True,check=True)
        pages=json.loads(result.stdout);self.assertGreater(len(pages),1)
        for page in pages:self.assertTrue(rename_effect.journal_equal(raw,page))
        delivered=[e for page in pages for e in page['output']['ui']['elements']]
        self.assertNotIn('identity',delivered[0])
        for i in range(1,6):self.assertEqual(delivered[i]['identity'],elements[i]['identity'])
        bad=copy.deepcopy(pages[0]);bad['output']['ui']['elements'][0]['identity']={'anchor_tid':'forged','path':[]}
        self.assertFalse(rename_effect.journal_equal(raw,bad))
        bad=copy.deepcopy(pages[0]);bad['output']['ui']['elements'][1].pop('identity')
        self.assertFalse(rename_effect.journal_equal(raw,bad))

    def proof(self,data):return rename_effect.prove(*data,8,'Источник')
    def test_real_fill_and_commit_receipts(self):self.assertIsNotNone(self.proof(fixture()))
    def test_host_observation_metadata_does_not_change_journal_effect(self):
        data=fixture()
        for e in data[2]:
            e['outcome']['output'].pop('observation_id')
            e['outcome']['output']['origin']='https://fixture.invalid/'
        for t in data[0][1:]:t['result']['output']['origin']='https://fixture.invalid'
        self.assertIsNotNone(self.proof(data))
        data[2][-1]['outcome']['output']['nodes'][0]['node_ref']['node_label']='Other'
        self.assertIsNone(self.proof(data))

    def test_hidden_label_during_edit_uses_last_full_snapshot(self):
        data=fixture();baseline=copy.deepcopy(data[0][0]);baseline.update(row=9,tool_call_id='baseline')
        baseline['result']['output']['observation_id']='baseline'
        data[0].insert(0,baseline)
        data[0][1]['result']['output']['nodes']=[]
        data[0][2]['result']['output']['nodes']=[]
        data[2][0]['outcome']=copy.deepcopy(data[0][2]['result'])
        self.assertIsNotNone(self.proof(data))
        data[0][0]['result']['output']['nodes'][0]['ports']=[]
        self.assertIsNone(self.proof(data))

    def test_missing_gesture_journal_and_wrong_editor_fail(self):
        for case in ('trace','journal','editor','path','value'):
            data=fixture()
            if case=='trace':data[0][1]['result']['trace']=[]
            elif case=='journal':data[2].pop()
            elif case=='editor':data[1][1]['arguments']['action']['ref']='other'
            elif case=='path':data[0][0]['result']['output']['ui']['elements'][0]['identity']['anchor_tid']='other'
            else:data[0][1]['result']['output']['ui']['elements'][0]['value']='other'
            self.assertIsNone(self.proof(data))
    def test_changed_ports_and_incomplete_graph_fail(self):
        for case in ('ports','truncated'):
            data=fixture();out=data[0][-1]['result']['output']
            if case=='ports':out['nodes'][0]['ports']=[]
            else:out['ui']['truncated']['nodes']=True
            data[2][-1]['outcome']=copy.deepcopy(data[0][-1]['result'])
            self.assertIsNone(self.proof(data))

    def test_actual_runtime_projection_matches_journal_but_changed_effects_do_not(self):
        data=fixture()
        root=Path(__file__).resolve().parents[2]
        # Exercise actual JS serialization; the verifier is independent Python.
        script="""import { createObservationPages } from './client/lib/observation-pages.mjs';
let text=''; for await (const part of process.stdin) text+=part;
const values=JSON.parse(text); console.log(JSON.stringify(values.map(value=>createObservationPages().retain(value))));"""
        raw=[copy.deepcopy(t['result']) for t in data[0]]
        for value in raw:
            value['output'].pop('observation_id',None)
            value['output']['graph_identity']={'status':'observed','container_ref':'diagram-ref','container_tid':'MF;TF-1;ModelForm;cmpDiagram','native_prefix':'MF;TF-7;Graph;'}
            value['output']['wizard']={'status':'observed','title':'Настройка форматов импорта','stage':'text_import_format','controls':{'btnNext':{'status':'observed','enabled':True}}}
            value['output']['ui']['elements'][0]['signature']['large']='x'*1000
            value['output']['ui']['table_cells']=[{'text':'  value  ','data_cell':{'view_key':'v','column_key':'Comment','row_index':0,'display_text':'  value  ','text_complete':True,'null_marker_present':False,'header_observed':True,'redacted':False}}]
        result=subprocess.run(['node','--input-type=module','-e',script],cwd=root,input=json.dumps(raw),text=True,capture_output=True,check=True)
        projected=json.loads(result.stdout)
        for source,reply in zip(raw,projected):self.assertTrue(rename_effect.journal_equal(source,reply))
        for mutate in [lambda r:r['output']['nodes'][0]['node_ref'].update(node_label='Different'),
                       lambda r:r['output']['ui']['elements'][0].update(value='Different'),
                       lambda r:r['output']['ui']['truncated'].update(nodes=True),
                       lambda r:r['output']['page'].update(total_records=999),
                       lambda r:r['output']['page'].update(full_dom_complete=True),
                       lambda r:r['output']['ui']['table_cells'][0]['data_cell'].update(null_marker_present=True),
                       lambda r:r['output']['ui']['table_cells'][0]['data_cell'].update(row_index=1),
                       lambda r:r['output']['wizard'].update(title='Wrong title'),
                       lambda r:r['output']['wizard'].update(stage='done'),
                       lambda r:r['output'].pop('wizard'),
                       lambda r:r['output'].pop('graph_identity'),
                       lambda r:r['output']['graph_identity'].update(native_prefix='MF;TF-9;Graph;'),
                       lambda r:r['output']['graph_identity'].update(container_tid='MF;TF-9;ModelForm;cmpDiagram'),
                       lambda r:r.update(status='AMBIGUOUS')]:
            bad=copy.deepcopy(projected[-1]);mutate(bad)
            self.assertFalse(rename_effect.journal_equal(raw[-1],bad))

if __name__=='__main__':unittest.main()

class ContinuationProjection(unittest.TestCase):
    def test_all_pages_match_their_native_receipt_and_reject_changed_offset_content(self):
        root=Path(__file__).resolve().parents[2]
        raw={'status':'SUCCEEDED','operation_id':'read','output':{'nodes':[],'links':[],
          'graph_identity':{'status':'unobserved'},'active_tab_ref':'tab-incarnation-1','navigation_context':{'status':'observed','kind':'workflow','path':[{'tid':'path','label':'Scenario'}]},
          'file_storage':{'status':'observed','directory':'/test'},
          'ui':{'elements':[{'ref':f'ui-{i}','label':f'cell {i}','signature':{'tag':'td','private':'hidden'}} for i in range(70)],
                'dialogs':[],'masks':[],'messages':[],'table_cells':[], 'truncated':{}}}}
        script="""import {createObservationPages} from './client/lib/observation-pages.mjs';
let text='';for await(const part of process.stdin)text+=part;
const raw=JSON.parse(text),pages=createObservationPages(),out=[];
let page=pages.retain(structuredClone(raw));out.push(page);
while(page.output.page.next_cursor){page=pages.next(page.output.page.next_cursor,structuredClone(raw));out.push(page);}
console.log(JSON.stringify(out));"""
        result=subprocess.run(['node','--input-type=module','-e',script],cwd=root,input=json.dumps(raw),text=True,capture_output=True,check=True)
        pages=json.loads(result.stdout)
        self.assertEqual([p['output']['page']['offset'] for p in pages],[0,32,64])
        for reply in pages:
            self.assertTrue(rename_effect.journal_equal(raw,reply))
            for mutate in [lambda r:r['output'].update(active_tab_ref='other-tab'),
                           lambda r:r['output']['navigation_context'].update(path=[]),
                           lambda r:r['output'].pop('active_tab_ref'),
                           lambda r:r['output']['page'].update(offset=True),
                           lambda r:r['output']['page'].update(offset=-1),
                           lambda r:r['output']['page'].update(offset=999),
                           lambda r:r['output']['page'].update(offset=r['output']['page']['offset']+1),
                           lambda r:r['output']['ui']['elements'][0].update(label='changed'),
                           lambda r:r['output']['file_storage'].update(directory='/wrong')]:
                changed=copy.deepcopy(reply);mutate(changed)
                self.assertFalse(rename_effect.journal_equal(raw,changed))
        changed=copy.deepcopy(pages[-1]);changed['output']['page']['captured_snapshot_complete']=True
        self.assertFalse(rename_effect.journal_equal(raw,changed))
        changed=copy.deepcopy(pages[-1]);changed['output']['ui']['truncated']['elements']=False
        self.assertFalse(rename_effect.journal_equal(raw,changed))
