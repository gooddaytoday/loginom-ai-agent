import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

test('file info uses frozen absolute/relative expectations, present datetime and one Import',()=>{
 const result=spawnSync('python3',['-B','-c',`
import importlib.util, copy
s=importlib.util.spec_from_file_location('runcheck','scripts/node-acceptance/run-check.py')
r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
c=r.scenario('text-file-info');e=r.expected_for(c,'/own/run.lgp')
assert c['prompt'].read_bytes()==(r.REPO/'docs/node-development/nodes/text-import/acceptance/task-file-info.md').read_bytes()
assert c['input_files']==['sales_2026-01.csv','sales_2026-02.csv'] and c['text_list_sources']
assert c['export_count']==2 and c['lgd_initial']=='expected-absolute-path.json'
assert c['expected_name']=='expected-relative-path.json' and c['text_file_info']
assert all((c['data']/name).is_file() for name in c['input_files'])
assert r.expected_for(c,'/own/run.lgp',cold=True)==e
absolute=r.bind_source_dir(r.read(c['source']/c['lgd_initial']),'/own')['outputs'][0]
relative=e['outputs'][0]
assert all(row['FileName'].startswith('/own/') for row in absolute['rows'])
assert all('/' not in row['FileName'] for row in relative['rows'])
for output in [absolute,relative]:
 assert output['columns'][-1]==dict(name='FileTime',type='datetime',label_any=True,comparison='present')
 assert len(output['rows'])==5 and all(row['FileTime'] is True for row in output['rows'])
owner=dict(status='SUCCEEDED',node=dict(node_id='same'),configuration=dict(readback=dict(kind='text_import',
 source=dict(source_path='/own/sales_2026-01.csv｜/own/sales_2026-02.csv',file_info='Абсолютный путь, Время модификации'))),
 output=dict(ports=[dict(port=0,schema=[],sample=[])]))
second=copy.deepcopy(owner);second['configuration']['readback']['source']['file_info']='Относительный путь, Время модификации'
r.check_text_file_info([(1,owner),(2,second)])
for key,value in [('node_id','new'),('file_info','Относительный путь'),('source_path','/own/other.csv')]:
 bad=copy.deepcopy(second)
 if key=='node_id':bad['node'][key]=value
 else:bad['configuration']['readback']['source'][key]=value
 try:r.check_text_file_info([(1,owner),(2,bad)])
 except AssertionError:pass
 else:raise AssertionError(key)
`],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
