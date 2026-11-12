import test from 'node:test';
import assert from 'node:assert/strict';
import {logRegressionOutputColumns,configureLogRegressionOutputs,readLogRegressionOutputs} from '../lib/log-regression-output.mjs';

const configuration={fields:[{name:'X',label:'Фактор',type:'real',data_kind:'Непрерывный',usage_type:3},
 {name:'Response',label:'Цель',type:'string',data_kind:'Дискретный',usage_type:4}]};
const names=['Name','DisplayName','UniqueValues','Response_coefficients','Response_stdError','Response_wald',
 'Response_waldPValue','Response_oddsRatio','Response_lowerBound','Response_upperBound'];
const ctx={portExecution:{node:{node_id:'logistic'},execution_id:'execute'},execution:{execution_id:'execute'},receipt_id:'read'};
const read={ports:[1],sample_rows:100,require_exact_numbers:true};
const columns=()=>names.map((name,index)=>({index,name,label:'Native '+name,type:index<3?'string':'real',data_kind:index<3?'Дискретный':'Непрерывный'}));
const table=()=>({port:1,port_guid:'coefficients',schema:columns(),sample_complete:true,
 sample:[['<Константа>',null,null,0,0.48,0,1,null,null,null],['X','Фактор',null,Math.log(3),0.34,10.5,0.0012,3,1.54,5.83]]});

test('coefficient schema uses configured target and includes all ten native fields',async()=>{
 const mapped=await configureLogRegressionOutputs({},configuration,{},[]);
 assert.deepEqual(mapped.ports.map(p=>p.port),[0,1]);
 assert.deepEqual(logRegressionOutputColumns(configuration,1).map(f=>[f.name,f.type]),names.map((name,i)=>[name,i<3?'string':'real']));
 assert.deepEqual(mapped.ports[0].schema,logRegressionOutputColumns(configuration));
});

test('full native coefficient read retains labels, exact numbers and all NULLs',async()=>{
 const mapped=await configureLogRegressionOutputs({},configuration,{},[]),output=table(),before=structuredClone(output),calls=[];
 const result=await readLogRegressionOutputs({async readOutputPort(args){calls.push(args);return {output};}},read,ctx,mapped);
 assert.deepEqual(calls,[{port:1,execution:ctx.portExecution,sampleRows:100,requireExactNumbers:true}]);
 assert.equal(result.status,'complete');assert.equal(result.cleanup_complete,true);
 assert.equal(result.execution_id,'execute');assert.equal(result.evidence_ref,'read');
 assert.deepEqual(result.ports,[before]);
});

test('coefficient reader rejects missing, reordered, duplicated and mistyped fields',async()=>{
 const mapped=await configureLogRegressionOutputs({},configuration,{},[]);
 for(const change of [o=>o.schema.pop(),o=>o.schema.reverse(),o=>o.schema[2].type='real',
  o=>o.schema[4].name=o.schema[3].name,o=>o.schema[3].name='Target_coefficients',o=>o.schema[4].index=0]){
  const output=table();change(output);
  await assert.rejects(readLogRegressionOutputs({readOutputPort:async()=>({output})},read,ctx,mapped));
 }
});

test('both outputs use distinct native ports and propagate incomplete samples',async()=>{
 const mapped=await configureLogRegressionOutputs({},configuration,{},[]),coefficient=table();
 const prediction={port:0,port_guid:'predictions',schema:logRegressionOutputColumns(configuration).map((f,index)=>({...f,index})),sample:[],sample_complete:false};
 const channel={readOutputPort:async({port})=>({output:port===0?prediction:coefficient})};
 assert.equal((await readLogRegressionOutputs(channel,{...read,ports:[0,1]},ctx,mapped)).status,'partial');
 coefficient.port_guid='predictions';
 await assert.rejects(readLogRegressionOutputs(channel,{...read,ports:[0,1]},ctx,mapped),/distinct/);
 await assert.rejects(readLogRegressionOutputs(channel,{...read,ports:[2]},ctx,mapped));
});


for(const regrouped of [false,true])for(const mixed of [false,true])test('weighted predictions pin factor/target/passthrough order through native mapping, regrouped='+regrouped+', mixed='+mixed,async()=>{
 const c={mode:'enter',fields:[{name:'RowID',label:'RowID',type:'integer',usage_type:0},...configuration.fields,
  {name:'Note',label:'Note',type:'string',usage_type:0},{name:'Weight',label:'Weight',type:'real',usage_type:7}]};
 if(regrouped)c.fields=[c.fields[1],c.fields[2],c.fields[4],c.fields[0],c.fields[3]];
 const expected=['PredictionEvent','PredictionProbability','ActualEvent','Response_predicted','X','Response','RowID','Note','Weight'];
 assert.deepEqual(logRegressionOutputColumns(c).map(f=>f.name),expected);
 const schema=logRegressionOutputColumns(c),order=mixed?[...schema.slice(0,4),schema[6],schema[4],schema[5],...schema.slice(7)]:schema;
 const source_fields=schema.map((f,index)=>({...f,index,record_id:'s'+index,field_id:String(index)}));
 let mapping={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'DerivedDataSourceOutputSocketWizard',autosync:true,
  source_fields,target_fields:order.map((f,index)=>({...f,index,group_index:index,record_id:'p'+f.name,excluded:false,source:source_fields.find(s=>s.name===f.name)}))},selected;
 const actions=[],finished=[];
 const channel={async openOutputPort(port){assert.equal(port,0);},async observe(options){
  const offset=options.outputColumnPage?.offset??0,fields=mapping.target_fields.slice(offset,offset+8).map(f=>({...f,status:'observed',name_ref:f.record_id,selected:f.record_id===selected}));
  const s={node_mapping:structuredClone(mapping),wizard:{status:'observed',stage:'output_mapping',root_tid:'W',root_ref:'output',
   output_columns:{auto_sync:{status:'observed',value:mapping.autosync,ref:'auto'},fields,
    page:{status:'complete_definition_page',schema_id:'schema',offset,limit:8,total_columns:schema.length,returned:fields.length,next_offset:offset+fields.length===schema.length?null:offset+fields.length}}},
   ui:{elements:[{tid:'W;DerivedDataSourceOutputSocketWizard;btnAutoSyncThroughColumns',ref:'auto',allowed_actions:['click']},{tid:'W;DerivedDataSourceOutputSocketWizard;btnMoveMappingColumnUp',ref:'move',allowed_actions:['click']},...mapping.target_fields.map(f=>({ref:f.record_id,allowed_actions:['click']}))]}};
  assert.ok(options.ready(s),options.condition);return s;
 },async perform(options){
  const s=options.initialObservation;assert.ok(options.ready(s));const a=options.resolve(s);actions.push(a);
  if(a.ref==='auto'){mapping.autosync=false;return;}
  if(a.ref!=='move'){selected=a.ref;return;}
  const i=mapping.target_fields.findIndex(f=>f.record_id===selected);assert.ok(i>0);
  [mapping.target_fields[i-1],mapping.target_fields[i]]=[mapping.target_fields[i],mapping.target_fields[i-1]];
  mapping.target_fields=mapping.target_fields.map((f,index)=>({...f,index,group_index:index}));
 }};
 const result=await configureLogRegressionOutputs(channel,c,{},[],async(mode,port,definition)=>{finished.push(mode);assert.equal(port,true);assert.equal(definition.definition_complete,true);});
 assert.equal(mapping.autosync,false);assert.deepEqual(mapping.target_fields.map(f=>f.name),expected);
 assert.deepEqual(mapping.source_fields,source_fields);assert.deepEqual(finished,['done']);
 assert.equal(actions.some(a=>a.ref==='move'),mixed);assert.deepEqual(result.ports[0].schema.map(f=>f.name),expected);
 await configureLogRegressionOutputs({}, {...c,mode:'apply'},{},[],()=>assert.fail('apply must preserve saved output settings'));
});
