import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseExpectedOutputs,selectColdOutputReads,matchExpectedOutputs,resolveExportInput} from '../expected-outputs.mjs';

const fixture=caseName=>{
 const expected=JSON.parse(readFileSync(new URL(`../../../docs/testing/loginom-ai-agent/stability-2026-10-20/${caseName}/expected-demo.json`,import.meta.url)));
 // The accepted oracle change #337 removes this unrequested type from nodes.
 expected.nodes=expected.nodes.filter(n=>n.type!=='datamining.lin_regression');
 return expected;
};
const table=(want,id,port,type='programming.javascript')=>({node:{node_id:id},type,output_port:port,
 execution:{execution_id:id},data:{row_count:want.rows.length,sample_complete:true,precision:{numbers_verified:true},
 schema:want.columns.map(c=>({name:c.name,label:c.label??c.name,type:c.type})),
 sample:want.rows.map(r=>want.columns.map(c=>({type:c.type,value:c.type==='integer'?String(r[c.name]):r[c.name],is_null:r[c.name]===null})))}});
const graph=()=>({complete:true,nodes:[
 {type:'imports.text',ref:{node_id:'source'},outputs:[0]},
 {type:'programming.javascript',ref:{node_id:'calculator'},outputs:[0,1,2]},
 {type:'exports.text',ref:{node_id:'export'},outputs:[]}],
 links:[{source:'calculator',output:2,target:'export',input:0}]});

for(const caseName of ['n9','n10','n12']){
 test(`${caseName}: coefficient values and tolerance survive type/port-independent selection`,()=>{
  const expected=fixture(caseName),before=structuredClone(expected);
  const outputs=parseExpectedOutputs(expected).outputs;
  assert.deepEqual(expected,before);
  assert.equal(outputs[1].output_node_type,'table_content');
  assert.equal(Object.hasOwn(outputs[1],'output_port'),false);
  const {output_node_type,output_port,...original}=before.outputs[1];
  const {output_node_type:selector,...content}=outputs[1];
  assert.deepEqual(content,original);
  for(const type of ['programming.javascript','transform.calculator','transform.reform_columns']){
   for(const port of [0,2,4]){
    const a=table(outputs[1],'coefficient-table',port,type);
    a.data.sample.reverse();
    const match=matchExpectedOutputs([a],[outputs[1]])[0];
    assert.equal(match.node.node_id,'coefficient-table');assert.equal(match.output_port,port);
   }
  }
  for(const [rowIndex,row] of outputs[1].rows.entries()){
   const valueColumn=outputs[1].columns.findIndex(c=>c.type==='real');
   const tolerance=outputs[1].columns[valueColumn].tolerance;
   const good=table(outputs[1],'coefficients',2);
   good.data.sample[rowIndex][valueColumn].value+=tolerance.abs/2;
   assert.equal(matchExpectedOutputs([good],[outputs[1]]).length,1);
   const bad=table(outputs[1],'coefficients',2);
   bad.data.sample[rowIndex][valueColumn].value+=0.01;
   assert.throws(()=>matchExpectedOutputs([bad],[outputs[1]]),/COLD_OUTPUT_NOT_UNIQUELY_MATCHED/);
  }
 });
 test(`${caseName}: missing, extra, incomplete and renamed coefficient tables fail`,()=>{
  const want=parseExpectedOutputs(fixture(caseName)).outputs[1];
  const a=table(want,'coefficients',2);
  assert.throws(()=>matchExpectedOutputs([],[want]));
  for(const change of [b=>b.data.sample.pop(),b=>b.data.row_count++,
   b=>b.data.sample[0][0].value='WrongFeature',b=>b.data.sample[1][0].value='<Константа>',
   b=>b.data.schema[1].name='Other',b=>b.data.schema[1].type='integer',
   b=>b.data.sample_complete=false,b=>b.data.precision.numbers_verified=false]){
   const bad=structuredClone(a);change(bad);assert.throws(()=>matchExpectedOutputs([bad],[want]));
  }
  for(const id of ['other-table','coefficients'])for(const wrong of [false,true]){
   const extra=table(want,id,3);extra.content_candidate=true;
   if(wrong)extra.data.sample[0][1].value+=100;
   assert.throws(()=>matchExpectedOutputs([a,extra],[want],{allowExtraPortReads:true}));
  }
  const unrelated=table({...want,columns:[{name:'Other',type:'string'}],rows:[{Other:'extra'}]},'extra',0);
  assert.throws(()=>matchExpectedOutputs([a,unrelated],[want],{allowExtraPortReads:true}));
 });
}

test('cold discovery inspects every available port and keeps the saved export binding',()=>{
 const outputs=parseExpectedOutputs(fixture('n10')).outputs;
 const exportInput=resolveExportInput(graph());
 const reads=selectColdOutputReads(graph(),outputs,{exportInput});
 assert.deepEqual(reads.map(r=>[r.node.ref.node_id,r.ports]),[
  ['source',[{port:0,content_candidate:true}]],
  ['calculator',[{port:2,content_candidate:false},{port:0,content_candidate:true},{port:1,content_candidate:true}]]]);
 const actual=reads.flatMap(r=>r.ports.map(p=>{
  const want=r.node.ref.node_id==='calculator'&&p.port===2?outputs[0]
   :r.node.ref.node_id==='calculator'&&p.port===0?outputs[1]
   :{columns:[{name:'Unrelated',type:'real'}],rows:[{Unrelated:123}]};
  return {...table(want,r.node.ref.node_id,p.port,r.node.type),content_candidate:p.content_candidate};
 }));
 const matches=matchExpectedOutputs(actual,outputs,{exportInput,allowExtraPortReads:true,
  exportCsv:{header:'names',columns:outputs[0].columns.map(c=>c.name)}});
 assert.deepEqual(matches.map(m=>[m.node.node_id,m.output_port]),[['calculator',2],['calculator',0]]);
 const missing=actual.filter(a=>!(a.node.node_id==='calculator'&&a.output_port===0));
 assert.throws(()=>matchExpectedOutputs(missing,outputs,{exportInput,allowExtraPortReads:true}));
 const extra={...table(outputs[1],'extra-table',0),content_candidate:true};
 assert.throws(()=>matchExpectedOutputs([...actual,extra],outputs,{exportInput,allowExtraPortReads:true}));
});

test('explicit Regression requirements and ordinary output-port selectors stay strict',()=>{
 const expected=fixture('n9');expected.nodes.push({type:'datamining.lin_regression'});
 const want=parseExpectedOutputs(expected).outputs[1];
 assert.equal(want.output_node_type,'datamining.lin_regression');assert.equal(want.output_port,1);
 assert.throws(()=>matchExpectedOutputs([table(want,'javascript',1)],[want]));
 assert.throws(()=>matchExpectedOutputs([table(want,'regression',0,'datamining.lin_regression')],[want]));
 assert.equal(matchExpectedOutputs([table(want,'regression',1,'datamining.lin_regression')],[want]).length,1);
 const content={...want,output_node_type:'table_content'};delete content.output_port;
 for(const patch of [{output_port:0},{output_node_label:'Coefficients'},{export_destination:'/x.csv'}])
  assert.throws(()=>parseExpectedOutputs({...expected,outputs:[{...content,...patch}]}));
 const ordinary={...want,columns:[{name:'Value',type:'real'}],rows:[{Value:1}]};
 assert.equal(parseExpectedOutputs({...expected,nodes:[],outputs:[ordinary]}).outputs[0].output_node_type,'datamining.lin_regression');
 const reads=selectColdOutputReads(graph(),[{...ordinary,output_node_type:'programming.javascript'}]);
 assert.deepEqual(reads.map(r=>[r.node.ref.node_id,r.ports]),[['calculator',[{port:1,content_candidate:false}]]]);
});
