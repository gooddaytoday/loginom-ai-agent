import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {verifyDataPartitionOutputSources,verifyDataPartitionOutputKinds} from '../lib/datapartition-output.mjs';
const input=[{name:'RowID',label:'ID',type:'integer',data_kind:'Дискретный'},
 {name:'Flag',label:'Flag',type:'boolean',data_kind:'Дискретный'}];
const membership={name:'IsTestSet',label:'Тестовое множество',type:'boolean',data_kind:'Дискретный',required:true};

test('DataPartition distinguishes membership from inherited boolean payload',()=>{
 assert.deepEqual(verifyDataPartitionOutputSources([membership,...input],input,0),membership);
 assert.equal(verifyDataPartitionOutputSources(input,input,1),null);
 assert.equal(verifyDataPartitionOutputSources(input,input,2),null);
});

test('DataPartition source binding refuses wrong port, lost/extra/reordered fields and changed metadata',()=>{
 for(const [fields,port] of [[input,0],[[membership,...input],1],[[membership,...input],2],[[membership,input[1]],0],
  [[membership,...input,{...input[0],name:'Extra'}],0],[[membership,...input.toReversed()],0],
  [[{...membership,type:'integer'},...input],0],[[membership,{...input[0],label:'Other'},input[1]],0],
[[membership,...input,input[0]],0],
  [[membership,...input],3]])assert.throws(()=>verifyDataPartitionOutputSources(fields,input,port));
});

test('DataPartition verifies native target data kinds separately from source identities',()=>{
 const targets=[membership,...input].map(f=>({...f,source:{...f,record_id:f.name}}));
 verifyDataPartitionOutputKinds(targets,input,{...membership,record_id:membership.name});
 assert.throws(()=>verifyDataPartitionOutputKinds(targets.map(f=>({...f,data_kind:'Непрерывный'})),input,{...membership,record_id:membership.name}));
});
