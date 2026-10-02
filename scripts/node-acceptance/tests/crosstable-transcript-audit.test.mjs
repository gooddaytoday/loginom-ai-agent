import test from 'node:test';
import assert from 'node:assert/strict';
import {auditCrossTableTranscript} from '../crosstable-transcript-audit.mjs';
const node=id=>({document_id:'doc',workflow_id:'wf',node_id:id});
const reply=(op,id,exec)=>({operation_id:op,state:'settled',status:'SUCCEEDED',cleanup_complete:true,effect_possible:true,node:node(id),
 configuration:{status:'applied'},execution:{status:'completed',execution_id:exec},output:{ports:[{port:0,port_guid:'p-'+id,fresh:true,execution_id:exec,sample_complete:true,sample_rows:4,row_count:4,schema:[]}]}});
function events(){
 const result=[];let id=0;
 const tool=(tool,input,r)=>result.push({type:'tool_use',part:{id:'t'+id++,tool:'loginom_'+tool,state:{status:'completed',input,output:JSON.stringify(r)}}});
 tool('dock_node_apply',{operation_id:'import',target:{kind:'new',type:'imports.text'},parameters:{source:{upload_operation_id:'old'}}},reply('import','source','i1'));
 for(const [op,n] of [['fixed','f'],['sliding','s']])tool('dock_node_apply',{operation_id:op,target:{kind:'new',type:'transform.cross_table'},inputs:[{source:node('source'),input:0,output:0}]},reply(op,n,'e-'+n));
 tool('dock_node_apply',{operation_id:'update',target:{kind:'existing',type:'imports.text',ref:node('source')},parameters:{source:{upload_operation_id:'new'}}},reply('update','source','i2'));
 for(const [op,n] of [['fixed','f'],['sliding','s']]){const r=reply('read-'+op,n,'fresh-'+n);r.configuration.status='not_requested';tool('dock_node_read',{operation_id:'read-'+op,source_operation_id:op},r);}
 return result;
}
test('original GUIDs, source replacement and both complete fresh reads pass',()=>{assert.equal(auditCrossTableTranscript(events()).status,'PASS');});
test('reconfiguration, recreation, wrong source receipt and stale/partial reads fail',()=>{
 for(const mutate of [xs=>xs[4].part.tool='loginom_dock_node_apply',xs=>xs[4].part.state.input.target={type:'transform.cross_table',kind:'existing'},
  xs=>xs[4].part.state.input.source_operation_id='other',xs=>xs.pop(),
  xs=>{const p=xs[4].part.state,r=JSON.parse(p.output);r.node.node_id='replacement';p.output=JSON.stringify(r)},
  xs=>{const p=xs[4].part.state,r=JSON.parse(p.output);r.execution.execution_id='e-f';p.output=JSON.stringify(r)},
  xs=>{const p=xs[4].part.state,r=JSON.parse(p.output);r.output.ports[0].sample_complete=false;p.output=JSON.stringify(r)},
  xs=>xs[3].part.state.input.parameters.source.upload_operation_id='old',
  xs=>xs[3].part.state.input.target.ref.workflow_id='foreign',
  xs=>{const p=xs[3].part.state.input;p.source=p.parameters.source;delete p.parameters;}]){
  const xs=events();mutate(xs);assert.throws(()=>auditCrossTableTranscript(xs));
 }
});
test('source path replacement uses the canonical parameters.settings envelope',()=>{
 const xs=events();
 for(const [index,path] of [[0,'/worker/base.csv'],[3,'/worker/update.csv']])xs[index].part.state.input.parameters={settings:{source:{source_path:path}}};
 assert.equal(auditCrossTableTranscript(xs).status,'PASS');
 xs[3].part.state.input.parameters.settings.source.source_path='/worker/base.csv';
 assert.throws(()=>auditCrossTableTranscript(xs),/unchanged/);
});
test('reordering the same source identity is not a replacement',()=>{
 const xs=events();
 xs[0].part.state.input.parameters.source={artifact_id:'csv-old',upload_operation_id:'old'};
 xs[3].part.state.input.parameters.source={upload_operation_id:'old',artifact_id:'csv-old'};
 assert.throws(()=>auditCrossTableTranscript(xs),/unchanged/);
});
test('queued requests need successful settled wait receipts',()=>{
 const xs=events();const r=JSON.parse(xs[2].part.state.output);
 xs[2].part.state.output=JSON.stringify({operation_id:'sliding',state:'running'});
 xs.splice(3,0,{type:'tool_use',part:{id:'wait',tool:'loginom_dock_node_wait',state:{status:'completed',input:{operation_id:'sliding'},output:JSON.stringify(r)}}});
 assert.equal(auditCrossTableTranscript(xs).status,'PASS');
});
