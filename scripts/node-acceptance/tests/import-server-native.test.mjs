import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import {parseExpectedOutputs} from '../expected-outputs.mjs';

test('native server cold oracles pass the production parser after destination binding',async()=>{
 for(const name of ['import-server-nodownload','import-server-wide']){
  const expected=JSON.parse(await readFile(new URL('../scenarios/'+name+'/expected.json',import.meta.url),'utf8'));
  expected.package_path='/own/run.lgp';
  for(const output of expected.outputs){
   if(output.output_node_type==='export_input')output.export_destination='/own/'+output.export_destination;
   else delete output.export_destination;
  }
  assert.doesNotThrow(()=>parseExpectedOutputs(expected),name);
 }
});

test('native server cases seed full files privately and retain CSV/Save/cold expectations',()=>{
 const result=spawnSync('python3',['-B','-c',`
import csv, importlib.util, json, runpy, subprocess, sys, tempfile
from pathlib import Path
from unittest.mock import patch
s=importlib.util.spec_from_file_location('runner','scripts/node-acceptance/run-check.py')
r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
for name in ['import-server-nodownload','import-server-wide']:
 c=r.scenario(name);e=r.expected_for(c,'/own/test.lgp')
 assert e==r.expected_for(c,'/own/test.lgp',cold=True)
 if name=='import-server-nodownload':
  assert e['outputs'][0]['output_node_type']=='export_input'
  assert [n['type'] for n in e['nodes']]==['imports.text','exports.text']
 subprocess.run([sys.executable,'-B',str(c['oracle']),'--case',name,'--check'],check=True)
 with tempfile.TemporaryDirectory() as directory:
  root=Path(directory);folder=root/'stage';folder.mkdir();workspace=root/'workspace';workspace.mkdir()
  instance=r.Runner.__new__(r.Runner)
  instance.out,instance.env,instance.options,instance.current=root,{},{},{}
  def phase(phase,command,*args,**kwargs):
   if phase=='server-inputs': subprocess.run(list(map(str,command)),check=True)
   if phase=='model':
    assert not list(workspace.iterdir()),'Server fixture leaked to model workspace'
    assert '--file' not in command,'Server fixture became an attachment'
    path=Path(instance.current['dataset'])
    assert '/own/'+path.name in command[-1]
    seed=json.loads((folder/'text-list-inputs.json').read_text())
    assert seed['native_server_import'] is True and seed['overwrite']=='reject'
    assert seed['books']==[{'fixture':str(path),'destination':'/own/'+path.name}]
    raise InterruptedError
  with patch.object(instance,'phase',side_effect=phase):
   try: instance.model(name,folder,root/'profile',workspace,'/own/test.lgp',{'package_directory':'/own'},root/'build')
   except InterruptedError: pass
   else: raise AssertionError('Model not reached')
  path=Path(instance.current['dataset'])
  with path.open(newline='') as handle:
   rows=csv.reader(handle,delimiter=',' if name.endswith('nodownload') else '\\t')
   header=next(rows);count=sum(1 for _ in rows)
  assert count==e['server_import']['records']
  assert header==[col['name'] for col in e['server_import']['columns']]
  assert json.loads((root/'fixtures/manifest.json').read_text())['bytes']==path.stat().st_size
  assert len(header)==(3 if name.endswith('nodownload') else 13)
with tempfile.TemporaryDirectory() as directory:
 root=Path(directory);(root/'fixtures').mkdir();(root/'model').mkdir()
 source=root/('native-import-'+'a'*20+'.txt');source.write_text('abc')
 r.write(root/'fixtures/manifest.json',{'bytes':3})
 event={'type':'tool_use','part':{'tool':'loginom_dock_node_apply','state':{'status':'completed',
        'output':json.dumps({'destination':'/own/export.csv','bytes':3})}}}
 (root/'model/model.stdout').write_text(json.dumps(event)+'\\n')
 instance=r.Runner.__new__(r.Runner);instance.current={'dataset':str(source),'native_server_fixture':True}
 def phase(name,command,*args,**kwargs):
  config=r.read(root/'dataset-cleanup-config.json')
  assert config['names']==[source.name] and config['native_server_import'] is True
 with patch.object(instance,'phase',side_effect=phase):
  instance.cleanup_d87(root,{'package_directory':'/own'},root/'build')
 assert not source.exists() and instance.current['dataset-cleanup']=='storage PASS; disk PASS'
`],{encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});

test('native fixture cleanup admits one scoped name only with the private fixture flag',async()=>{
 const source=await readFile(new URL('../d87-cleanup.mjs',import.meta.url),'utf8');
 const guard=source.slice(source.indexOf('const nativeNames='),source.indexOf('const directory ='));
 const own='native-import-'+'a'.repeat(20)+'.csv';
 assert.doesNotThrow(()=>runInNewContext(guard,{config:{native_server_import:true},names:[own]}));
 for(const [flag,names] of [[false,[own]],[true,['large.csv']],[true,['/foreign/'+own]],
   [true,[own,own]],[true,['native-import-'+ 'g'.repeat(20)+'.txt']]])
  assert.throws(()=>runInNewContext(guard,{config:{native_server_import:flag},names}),/D87_NAME_INVALID/);
 assert.doesNotThrow(()=>runInNewContext(guard,{config:{},names:['d87-original-E3.csv']}));
});
