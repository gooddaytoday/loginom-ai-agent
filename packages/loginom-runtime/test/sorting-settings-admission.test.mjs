import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const {checkSortingAdmission}=await import(process.env.SORTING_MODULE);
const binding={revision:1,harness:'sorting-before-close-v1',owner:'o',run:'r',lease:'o:r',chat:'c',admission:'a',generation:1,expires:Date.now()+600000,account:'account',session:'s',packagePath:'/account/test.lgp'};
const identity={session_id:'s',account:'account',package_path:'/account/test.lgp',document_id:'d',tab_tid:'tab',loginom_build:'7.4.2'};
function ordinary(type,keys) {
 const node={document_id:'d',workflow_id:'w',node_id:'n'},execution={status:'completed',execution_id:'d:1:2'};
 return {status:'SUCCEEDED',cleanup_complete:true,node,execution,
  configuration:{readback:{kind:'sorting',scope:'observed_before_verified_finish',values_are:'observed_ui_values',node,keys,receipt_ids:['a','b','c','d','e']}},
  output:{ports:[{port:0,port_guid:'p',row_count:1,schema:[{name:'Scalar',label:'Scalar',type}],fresh:true,execution_id:execution.execution_id}]}};
}
for(const [name,type,keys] of [
 ['valid-variant','variant',[{name:'Scalar',type:'variant',order:0,direction:'ASC',case_sensitive:false}]],
 ['valid-string','string',[{name:'Scalar',type:'string',order:0,direction:'ASC',case_sensitive:true}]],
 ['valid-integer','integer',[{name:'Scalar',type:'integer',order:0,direction:'ASC'}]],
])test(name,()=>{assert.equal(checkSortingAdmission(binding,identity,ordinary(type,keys)).settings.keys[0].name,'Scalar')});
for(const [name,type,keys] of [
 ['missing-variant-case','variant',[{name:'Scalar',type:'variant',order:0,direction:'ASC'}]],
 ['integer-case-present','integer',[{name:'Scalar',type:'integer',order:0,direction:'ASC',case_sensitive:false}]],
 ['unknown-key-type','variant',[{name:'Scalar',type:'unknown',order:0,direction:'ASC'}]],
 ['duplicate-keys','integer',[{name:'Scalar',type:'integer',order:0,direction:'ASC'},{name:'Scalar',type:'integer',order:1,direction:'DESC'}]],
])test(name+' must refuse an incomplete or contradictory settings proof',async()=>{
 const input=ordinary(type,keys);let accepted=false,error;
 try{checkSortingAdmission(binding,identity,input);accepted=true}catch(e){error={name:e.name,message:e.message}}
 await writeFile(join(process.env.REVIEW_RESULTS_DIR,name+'.json'),JSON.stringify({module:process.env.SORTING_MODULE,fixture:true,input,accepted,error},null,2)+'\n');
 assert.equal(accepted,false,'Sorting settings outside the accepted contract must not be admitted as complete');
});
