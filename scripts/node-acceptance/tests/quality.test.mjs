import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {checkQualityMain} from '../quality.mjs';

test('Quality catalog isolates tasks/data and fixes five final ordered ports',()=>{
 const script=`import importlib.util
from pathlib import Path
p=Path('scripts/node-acceptance/run-check.py'); s=importlib.util.spec_from_file_location('r',p); m=importlib.util.module_from_spec(s); s.loader.exec_module(m)
for name,counts in [('quality-default',[8,0,0,8,4]),('quality-spikes',[28,0,0,28,8])]:
 c=m.scenario(name); e=m.expected_for(c,'/own/quality.lgp')
 assert (c['source']/'oracle.py').is_file(), 'runner preflight requires source/oracle.py'
 assert c['export_count']==5 and c['prompt'].is_file()
 assert [o['output_port'] for o in e['outputs']]==[0,1,2,3,4]
 assert [len(o['rows']) for o in e['outputs']]==counts
 assert all(o['ordered'] and o['column_order']=='exact' for o in e['outputs'])
 assert c['expected_name']==('probe/' if name=='quality-spikes' else '')+'expected-update.json'
 assert (c['source']/c['quality_initial_name']).is_file()
 assert c['data'].is_dir() and len(list(c['data'].glob('*.csv')))==2
print('PASS')`;
 const r=spawnSync('python3',['-B','-c',script],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(r.status,0,r.stdout+r.stderr);
});
test('Quality audit uses stock exact typed matching and refuses substitutions or recreated nodes',async()=>{
 const root=new URL('../../../docs/node-development/nodes/research-quality/acceptance/',import.meta.url);
 const initial=JSON.parse(await readFile(new URL('expected.json',root))),updated=JSON.parse(await readFile(new URL('expected-update.json',root)));
 const round=(expected,execution,source)=>({status:'SUCCEEDED',cleanup_complete:true,node:{node_id:'quality'},execution:{status:'completed',execution_id:execution},configuration:source?{readback:{kind:'quality'}}:{status:'not_requested'},
  output:{ports:expected.outputs.map(o=>({port:o.output_port,fresh:true,execution_id:execution,freshness_basis:'completed_execution_port_source',
   schema:o.columns.map((f,index)=>({...f,index})),row_count:o.rows.length,sample_complete:true,precision:{numbers_verified:true},
   sample:o.rows.map(r=>o.columns.map(c=>{const value=r[c.name];return c.type==='variant'?{type:'variant',is_null:value===null,cell_type:value?.cell_type??'null',value:value?.cell_type==='real'?String(value.value):value?.value??null,precision:'exact_native',native:{tag:value===null?1:value.cell_type==='real'?5:8}}:{type:c.type,is_null:value===null,value:value===null?null:c.type==='integer'?String(value):value,precision:c.type==='real'?'17_significant_digits':c.type==='integer'?'exact_integer':'source_text',...(c.type==='real'&&value!==null?{representation:'binary64',decimal:String(value)}:{})};}))}))}});
 const imports=['diagnostic.csv','update.csv'].map(path=>({status:'SUCCEEDED',cleanup_complete:true,node:{node_id:'import'},execution:{status:'completed'},output:{ports:[]},configuration:{readback:{kind:'text_import',source:{source_path:path}}}}));
 const events=[...imports,round(initial,'first',true),round(updated,'last',false)];
 assert.equal(checkQualityMain(initial,updated,events).status,'PASS');
 for(const fault of ['null','subtype','ports','order','source','node']){
  const bad=structuredClone(events),last=bad[3];
  if(fault==='null')last.output.ports[0].sample[4][1]={type:'integer',is_null:false,value:0};
  if(fault==='subtype')last.output.ports[4].sample[1][8].cell_type='string';
  if(fault==='ports')last.output.ports[0].port=1;
  if(fault==='order')last.output.ports[4].schema.reverse();
  if(fault==='source')bad[1].configuration.readback.source.source_path='diagnostic.csv';
  if(fault==='node')last.node.node_id='new-quality';
  assert.throws(()=>checkQualityMain(initial,updated,bad),/QUALITY_/);
 }
});
