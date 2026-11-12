import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

test('folder masks: frozen oracle, no CSV export, one Import per folder with mask only for 2+ CSV',()=>{
 const result=spawnSync('python3',['-B','-c',`
import importlib.util, copy, runpy
from pathlib import Path
s=importlib.util.spec_from_file_location('runcheck','scripts/node-acceptance/run-check.py')
r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
c=r.scenario('text-folder-masks');e=r.expected_for(c,'/own/run.lgp')
oracle=runpy.run_path(str(c['oracle']))['expected']
assert e==dict(oracle(),package_path='/own/run.lgp')
assert [o['output_node_label'] for o in e['outputs']]==list(r.TEXT_FOLDERS)
assert (c['data']/'transactions/README.txt').is_file()
assert '{{SOURCE_DIR}}' in c['prompt'].read_text()
d='/own/1 Silent Talk'
def reply(folder,path,node,rows):
 out=next(o for o in e['outputs'] if o['output_node_label']==folder)
 port=dict(port=0,port_kind='table',sample_complete=True,row_count=rows,schema=[],sample=[])
 return dict(status='SUCCEEDED',node=dict(node_id=node),configuration=dict(readback=dict(kind='text_import',
  node_title=dict(mode='custom',label=folder),source=dict(source_path=d+'/'+folder+'/'+path))),output=dict(ports=[port]))
paths=dict(transactions='*.csv',customers='*.csv',accounts='accounts.csv',beneficiaries='*.csv',devices='devices.csv',risk_reference='risk_rules.csv')
good=[(i,reply(f,paths[f],f,len(next(o for o in e['outputs'] if o['output_node_label']==f)['rows']))) for i,f in enumerate(r.TEXT_FOLDERS)]
r.port_path=lambda owner,port:'port'
def refused(replies,code):
 try:r.check_text_folder_masks(replies,d,c['data'],e,'/bin/false')
 except AssertionError as error:assert str(error).startswith(code),error
 else:raise AssertionError('passed: '+code)
# Values reach the shared typed matcher only after every structural check.
refused(good,'TEXT_FOLDER_PORT_VALUES')
refused(good[1:],'TEXT_FOLDER_IMPORTS')
for folder,path in [('accounts','*.csv'),('transactions','transactions_2026-09.csv')]:
 bad=copy.deepcopy(good);i=r.TEXT_FOLDERS.index(folder)
 bad[i]=(i,reply(folder,path,folder,len(next(o for o in e['outputs'] if o['output_node_label']==folder)['rows'])))
 refused(bad,'TEXT_FOLDER_SOURCE')
bad=copy.deepcopy(good);bad.append((9,reply('devices','devices.csv','other',3)))
refused(bad,'TEXT_FOLDER_IMPORT_RECREATED')
bad=copy.deepcopy(good);bad[0][1]['output']['ports'][0]['row_count']=1
refused(bad,'TEXT_FOLDER_ROW_COUNT')
call=lambda tool,path,out:dict(type='tool_use',part=dict(tool=tool,state=dict(input=dict(path=path),output=out)))
ev=[(1,call('loginom_dock_storage_source',d+'/transactions/*.csv','{"status":"FAILED"}')),
 (2,call('loginom_dock_storage_source',d+'/accounts/accounts.csv','{"status":"SUCCEEDED"}')),
 (3,call('loginom_dock_storage_list',d+'/customers','{"status":"SUCCEEDED"}'))]
assert r.folder_source_metrics(ev)==dict(folder_source_refusals=1,storage_list_calls=1)
`],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
