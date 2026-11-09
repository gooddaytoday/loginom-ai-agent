import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

test('file-list scenario keeps task/inputs public and frozen oracle/expectations private',()=>{
 const r=spawnSync('python3',['-B','-c',`
import importlib.util, runpy
s=importlib.util.spec_from_file_location('run-check','scripts/node-acceptance/run-check.py')
r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
c=r.scenario('text-multi-file-list');e=r.expected_for(c,'/own/list.lgp')
assert c['prompt'].name=='task-multi-file-list.md' and c['prompt'].is_file()
assert c['input_files']==['sales_2026-02.csv','sales_2026-01.csv','returns_2026-01.csv']
assert all((c['data']/f).is_file() for f in c['input_files'])
assert c['base'] is None and c.get('export_count',1)==1
oracle=runpy.run_path(str(c['oracle']))['expected']()
assert e==dict(oracle,package_path='/own/list.lgp')
assert r.expected_for(c,'/own/list.lgp',cold=True)==e
owner=dict(status='SUCCEEDED',node=dict(node_id='same'),configuration=dict(readback=dict(kind='text_import',
 source=dict(source_path='/own/sales_2026-02.csv｜/own/sales_2026-01.csv',file_info='Имя файла',parallel_processing=False))),
 output=dict(ports=[dict(port=0,schema=[],sample=[])]))
r.check_text_multi_file_list([(1,owner)])
for key,value in [('source_path','/own/sales_2026-01.csv｜/own/sales_2026-02.csv'),('file_info','Нет'),('parallel_processing',True)]:
 import copy
 bad=copy.deepcopy(owner);bad['configuration']['readback']['source'][key]=value
 try:r.check_text_multi_file_list([(1,bad)])
 except AssertionError:pass
 else:raise AssertionError(key)
`],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
});
