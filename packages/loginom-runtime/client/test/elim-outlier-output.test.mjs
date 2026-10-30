import test from 'node:test';
import assert from 'node:assert/strict';
import {alignElimOutlierOutput,readElimOutlierOutputs} from '../lib/elim-outlier-output.mjs';
const schema=[{name:'RowID',label:'ID',type:'integer',data_kind:'Непрерывный'},{name:'X',label:'X',type:'real',data_kind:'Непрерывный'},{name:'Note',label:'Note',type:'string',data_kind:'Дискретный'}];
test('three outputs retain exact input names, labels, types and order, including an empty anomaly port',async()=>{
 const ports=[0,1,2].map(port=>({port,schema})),calls=[];
 const result=await readElimOutlierOutputs({readOutputPort:async options=>{calls.push(options);return {output:{port:options.port,port_guid:'p'+options.port,schema:schema.map(({data_kind,...f})=>f),sample_complete:true,rows:options.port===1?[]:[[22,100,'keep_22']]}};}},{ports:[0,1,2],sample_rows:100,require_exact_numbers:true},{portExecution:{execution_id:'e'},execution:{execution_id:'e'},receipt_id:'r'},{ports});
 assert.equal(result.verified,true);assert.equal(result.cleanup_complete,true);assert.equal(result.ports.length,3);assert.deepEqual(result.ports[1].rows,[]);assert.deepEqual(result.ports[0].schema,schema);assert.ok(calls.every(c=>c.requireExactNumbers&&c.execution.execution_id==='e'));
 for(const actual of [[schema[1],schema[0],schema[2]],schema.slice(1),schema.map(f=>f.name==='X'?{...f,type:'integer'}:f)])assert.throws(()=>alignElimOutlierOutput(actual,schema));
});
test('output reader refuses cross-port native identity reuse',async()=>{
 await assert.rejects(readElimOutlierOutputs({readOutputPort:async()=>({output:{port_guid:'same',schema,sample_complete:true}})},{ports:[0,1]}, {execution:{execution_id:'e'}},{ports:[0,1].map(port=>({port,schema}))}),/distinct native ports/);
});
