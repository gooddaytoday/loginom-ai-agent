import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {checkSortingModes,observeSortingSaved} from '../sorting-modes.mjs';
const oracle=JSON.parse(readFileSync(new URL('../../../docs/node-development/nodes/sorting/acceptance/modes/expected.json',import.meta.url)));
const expected=mode=>({sorting_mode:mode,sorting_stages:oracle.cases[mode].stages.map(s=>({...s,column_order:'exact'}))});
const receipt=(mode,stage)=>{
 const o=expected(mode).sorting_stages[stage],id='exec-'+stage;
 return {status:'SUCCEEDED',cleanup_complete:true,node:{node_id:'one'},execution:{status:'completed',execution_id:id},
  configuration:{readback:{kind:'sorting',mode:'keys',keys:[{name:'Word',type:'string',direction:'ASC',case_sensitive:mode==='case'&&stage===0},{name:'RowID',type:'integer',direction:'ASC'}],
   options:{chkLocaleAware:{value:true,switch_pressed:false},chkBufferWhole:{value:false,switch_pressed:false},cbxMaxThreadCount:{value:mode==='threads'?[1,2][stage]:mode==='auto'?[2,0][stage]:0,switch_pressed:false}}}},
  output:{ports:[{port:0,fresh:true,freshness_basis:'completed_execution_port_source',execution_id:id,sample_complete:true,precision:{numbers_verified:true},row_count:o.rows.length,
   schema:o.columns.map(({name,type})=>({name,type})),sample:o.rows.map(r=>o.columns.map(c=>({type:c.type,is_null:r[c.name]===null,value:r[c.name]===null?null:c.type==='integer'?String(r[c.name]):r[c.name]})))}]}};
};
for(const mode of ['case','threads','auto'])test('sorting '+mode+' checks both complete typed ordered stages and same-node literal options',()=>{
 const replies=[receipt(mode,0),receipt(mode,1)];assert.equal(checkSortingModes(expected(mode),replies).stages_verified,2);
 for(const change of [r=>r.shift(),r=>r.reverse(),r=>r[1].node.node_id='other',r=>r[1].configuration.readback.options.chkLocaleAware.value=false,
  r=>r[1].output.ports[0].sample.reverse(),r=>r[0].output.ports[0].sample[0][1].is_null=false,r=>r[1].output.ports[0].sample.pop(),
  r=>r[1].output.ports[0].schema.reverse(),r=>r[1].output.ports[0].fresh=false,r=>r[1].configuration.readback.options.chkBufferWhole.value=true,
  r=>r[0].configuration.readback.keys[0].case_sensitive=!r[0].configuration.readback.keys[0].case_sensitive,
  r=>r[1].configuration.readback.keys[0].case_sensitive=!r[1].configuration.readback.keys[0].case_sensitive]){
  const candidate=structuredClone(replies);change(candidate);assert.throws(()=>checkSortingModes(expected(mode),candidate));
 }
 if(mode!=='case')for(const change of [r=>r[1].configuration.readback.options.cbxMaxThreadCount.value=4,r=>r[0].configuration.readback.options.cbxMaxThreadCount.switch_pressed=true]){
  const candidate=structuredClone(replies);change(candidate);assert.throws(()=>checkSortingModes(expected(mode),candidate));
 }
 if(mode==='case')for(const change of [r=>r[1].configuration.readback.options.cbxMaxThreadCount.value=2,r=>r[1].configuration.readback.options.cbxMaxThreadCount.switch_pressed=true]){
  const candidate=structuredClone(replies);change(candidate);assert.throws(()=>checkSortingModes(expected(mode),candidate));
 }
});

function savedFixture(mode,change=()=>{},cancel={verified:true,cleanup_complete:true,settings_applied:false}){
 const configuration={...receipt(mode,1).configuration.readback,verified:true};change(configuration);
 const graph={prepared_node_context:{verified:true,surface:'graph',document_id:'doc',workflow_id:'flow',node_id:'sort'},wizard:{status:'absent'}};
 const state={wizard:{stage:'sorting'},node_sorting:configuration},calls=[];
 const channel={observe:async spec=>{
  const value=spec.condition==='cold sorting selection'?graph:state;
  if(value===state)assert.equal(spec.readSorting,true);
  assert.ok(spec.ready(value));return structuredClone(value);
 },perform:async()=>assert.fail('cold probe must not configure settings')};
 const load=async path=>{
  if(path==='client/lib/node-graph-selection.mjs')return {selectPreparedGraphNode:async(ch,s)=>{assert.equal(ch,channel);assert.deepEqual(s,graph);calls.push('select');}};
  if(path==='client/lib/node-wizard-open.mjs')return {openPreparedWizard:async ch=>{assert.equal(ch,channel);calls.push('open');}};
  if(path==='client/lib/sorting-procedure.mjs')return {advanceSortingInputColumns:async(ch,r)=>{assert.equal(ch,channel);assert.deepEqual(r,{target:{kind:'existing',ref:graph.prepared_node_context}});calls.push('advance');}};
  if(path==='client/lib/node-wizard-close.mjs')return {closePreparedWizard:async ch=>{assert.equal(ch,channel);calls.push('cancel');return cancel;}};
  assert.fail('Unexpected cold dependency '+path);
 };
 return {calls,run:()=>observeSortingSaved({load,channel,mode})};
}
test('cold Sorting reads saved literal settings and cancels without applying',async()=>{
 for(const mode of ['case','threads','auto']){
  const f=savedFixture(mode);const proof=await f.run();assert.equal(proof.settings_applied,false);
  assert.equal(proof.options.cbxMaxThreadCount.value,mode==='threads'?2:0);
  assert.deepEqual(f.calls,['select','open','advance','cancel']);
 }
});
test('cold Sorting refuses wrong maximum and variable binding and still cancels',async()=>{
 for(const mode of ['threads','auto'])for(const change of [c=>c.options.cbxMaxThreadCount.value=4,c=>c.options.cbxMaxThreadCount.switch_pressed=true]){
  const f=savedFixture(mode,change);await assert.rejects(f.run(),/SORTING_MODES_SAVED_SETTINGS/);
  assert.deepEqual(f.calls,['select','open','advance','cancel']);
 }
});
test('cold Sorting refuses unconfirmed Cancel',async()=>{
 for(const change of [c=>c.verified=false,c=>c.cleanup_complete=false,c=>c.settings_applied=true]){
  const cancel={verified:true,cleanup_complete:true,settings_applied:false};change(cancel);
  const f=savedFixture('threads',()=>{},cancel);await assert.rejects(f.run(),/SORTING_MODES_CANCEL/);
  assert.deepEqual(f.calls,['select','open','advance','cancel']);
 }
});
test('sorting modes register original tasks and fixture, private oracle stages and final cold output',()=>{
 const r=spawnSync('python3',['-B','-c',`import importlib.util
s=importlib.util.spec_from_file_location('r','scripts/node-acceptance/run-check.py');r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
for mode in ['case','threads','auto']:
 c=r.scenario('sorting-'+mode);e=r.expected_for(c,'/own/test.lgp')
 assert c['prompt'].name=='task-'+mode+'.md' and c['input_files']==['modes.csv'] and c['export_count']==2 and c['base'] is None
 assert e['sorting_mode']==mode and len(e['sorting_stages'])==2 and e['outputs']==[e['sorting_stages'][-1]]
 assert all(o['ordered'] and o['column_order']=='exact' and len(o['rows'])==10 and all(f['label_any'] for f in o['columns']) for o in e['sorting_stages'])
 assert r.expected_for(c,'/own/test.lgp',cold=True)==e
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(r.status,0,r.stdout+r.stderr);
});
