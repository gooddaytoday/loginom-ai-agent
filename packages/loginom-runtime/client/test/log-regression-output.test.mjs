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
