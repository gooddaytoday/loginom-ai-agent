import test from 'node:test';
import assert from 'node:assert/strict';
import {parseExpectedOutputs,resolveExportInput,matchExpectedOutputs} from '../expected-outputs.mjs';

const output={output_node_type:'export_input',columns:[{name:'Code',type:'string'}],rows:[{Code:'A'}],ordered:true};
const node=(id,type,outputs=[0])=>({ref:{node_id:id},type,label:id,outputs});
const graph=()=>({complete:true,nodes:[node('filter','transform.filter_data'),node('rename','transform.reform_columns',[0,1]),node('export','exports.text',[])],
 links:[{source:'filter',output:0,target:'rename',input:0},{source:'rename',output:1,target:'export',input:0}]});
const actual=(id,port,name='Code')=>({node:{node_id:id},type:id==='filter'?'transform.filter_data':'transform.reform_columns',output_port:port,
 data:{schema:[{name,label:name,type:'string'}],row_count:1,sample_complete:true,precision:{numbers_verified:true},sample:[[{type:'string',is_null:false,value:'A'}]]}});

test('export_input parses in both forms and forbids explicit output ports or labels',()=>{
 const base={package_path:'/own/export.lgp',nodes:[]};
 for(const multiple of [false,true]){
  const wrap=o=>({...base,...(multiple?{outputs:[o]}:o)});
  assert.equal(parseExpectedOutputs(wrap(output)).outputs[0].output_node_type,'export_input');
  for(const options of [{output_port:0},{output_port:1},{output_node_label:'rename'},{output_port:undefined},{output_node_label:undefined}])
   assert.throws(()=>parseExpectedOutputs(wrap({...output,...options})));
 }
});

test('export input follows the immediate renamed table and connected port after a filter',()=>{
 const binding=resolveExportInput(graph());
 assert.equal(binding.node.ref.node_id,'rename');assert.equal(binding.output_port,1);
 assert.equal(matchExpectedOutputs([actual('rename',1)],[output],{exportInput:binding}).length,1);
 for(const a of [actual('filter',0),actual('rename',0),actual('other-rename',1),actual('rename',1,'OriginalCode')])
  assert.throws(()=>matchExpectedOutputs([a],[output],{exportInput:binding}));
 assert.throws(()=>matchExpectedOutputs([actual('rename',1)],[output]));
});

test('missing or ambiguous export, connection, source and port refuse before output reading',()=>{
 for(const change of [g=>g.complete=false,g=>g.nodes.pop(),g=>g.nodes.push(node('second-export','exports.text',[])),
  g=>g.links.pop(),g=>g.links.push({...g.links[1]}),g=>g.links[1].input=1,
  g=>g.links[1].source='missing',g=>g.nodes.push({...g.nodes[1]}),
  g=>g.links[1].output=2,g=>g.links[1].output=-1,g=>g.links[1].output=0.5]){
  const g=graph();change(g);assert.throws(()=>resolveExportInput(g),/COLD_EXTRA_OR_MISSING_OUTPUT_NODE/);
 }
});

test('export from filter output 1 preserves the connected port for cold readback lookup',()=>{
 const g={complete:true,nodes:[node('filter','transform.filter_data',[0,1]),node('export','exports.text',[])],
  links:[{source:'filter',output:1,target:'export',input:0}]};
 const readback=actual('filter',1),binding=resolveExportInput(g);
 const [match]=matchExpectedOutputs([readback],[output],{exportInput:binding});
 assert.equal(match.output_port,1);
 assert.equal([readback].find(a=>a.node.node_id===match.node.node_id&&a.output_port===match.output_port),readback);
});

test('ordinary outputs retain type, label and port matching beside an export input',()=>{
 const binding=resolveExportInput(graph()),ordinary={...output,output_node_type:'transform.filter_data',output_node_label:'Original',output_port:0};
 const filter={...actual('filter',0),label:'Original'};
 assert.equal(matchExpectedOutputs([filter,actual('rename',1)],[ordinary,output],{exportInput:binding}).length,2);
 assert.throws(()=>matchExpectedOutputs([{...filter,label:'Wrong'},actual('rename',1)],[ordinary,output],{exportInput:binding}));
});
