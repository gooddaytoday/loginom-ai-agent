import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {resolveDataPartitionReadSchema,verifyDataPartitionReadOutputs} from '../lib/datapartition-read-driver.mjs';
const field=(index,name,label=name,type='string')=>({index,name,label,type,data_kind:'Дискретный',data_kind_source:'fresh_native'});
const membership=field(0,'IsTestSet','Тестовое множество','boolean');
const retained=[0,1,2].map(port=>({port,schema:[field(0,'Old')],dynamic_schema:{kind:'data_partition_output_v1',role:['combined','training','test'][port],...(port===0?{membership:{name:'IsTestSet'}}:{})}}));
const current=[field(0,'ID','New ID','integer'),field(1,'New','New label'),field(2,'Flag','Flag','boolean')];
const outputs=()=>[0,1,2].map(port=>({port,port_guid:'port-'+port,schema:port===0?[membership,...current.map((f,index)=>({...f,index:index+1}))]:structuredClone(current)}));

test('DataPartition dynamic read admits fresh width and metadata without admitting another role or cached metadata',()=>{
 assert.deepEqual(resolveDataPartitionReadSchema(current,retained[1]).fields,current);
 assert.equal(verifyDataPartitionReadOutputs(outputs(),retained),true);
 assert.throws(()=>resolveDataPartitionReadSchema(current.map(f=>({...f,data_kind_source:'cached'})),retained[1]));
 assert.throws(()=>resolveDataPartitionReadSchema(current,{...retained[1],dynamic_schema:{...retained[1].dynamic_schema,role:'test'}}));
 assert.throws(()=>resolveDataPartitionReadSchema(current,{...retained[1],dynamic_schema:undefined}));
});

test('DataPartition dynamic contract rejects mismatched training/test/combined schemas and lost membership',()=>{
 const checks=[ports=>ports.pop(),ports=>ports[2].port_guid=ports[1].port_guid,
  ports=>ports[0].schema.shift(),ports=>ports[0].schema[0].type='integer',
  ports=>ports[1].schema[1].label='Stale',ports=>ports[2].schema.push(field(3,'Unexpected')),
  ports=>ports[2].schema[0].data_kind='Непрерывный'];
 for(const change of checks){const ports=outputs();change(ports);assert.throws(()=>verifyDataPartitionReadOutputs(ports,retained));}
 assert.throws(()=>verifyDataPartitionReadOutputs(outputs(),retained.map((r,index)=>index===2?{...r,dynamic_schema:undefined}:r)));
});
