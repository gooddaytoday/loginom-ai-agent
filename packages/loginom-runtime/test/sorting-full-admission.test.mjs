import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const {captureSorting}=await import(process.env.SORTING_MODULE);
const binding={revision:1,harness:'sorting-before-close-v1',owner:'o',run:'r',lease:'o:r',chat:'c',admission:'a',generation:1,expires:Date.now()+600000,account:'account',session:'s',packagePath:'/account/test.lgp'};
const identity={session_id:'s',account:'account',package_path:'/account/test.lgp',document_id:'d',tab_tid:'tab',loginom_build:'7.4.2'};
const node={document_id:'d',workflow_id:'w',node_id:'n'},execution={status:'completed',execution_id:'d:1:2'};
const scenarios=[
 ['valid-variant','variant',[{name:'Scalar',type:'variant',order:0,direction:'ASC',case_sensitive:false}],true],
 ['valid-string','string',[{name:'Scalar',type:'string',order:0,direction:'ASC',case_sensitive:true}],true],
 ['valid-integer','integer',[{name:'Scalar',type:'integer',order:0,direction:'ASC'}],true],
 ['missing-variant-case','variant',[{name:'Scalar',type:'variant',order:0,direction:'ASC'}],false],
 ['integer-case-present','integer',[{name:'Scalar',type:'integer',order:0,direction:'ASC',case_sensitive:false}],false],
 ['unknown-key-type','variant',[{name:'Scalar',type:'unknown',order:0,direction:'ASC'}],false],
 ['duplicate-keys','integer',[{name:'Scalar',type:'integer',order:0,direction:'ASC'},{name:'Scalar',type:'integer',order:1,direction:'DESC'}],false],
];
for(const [name,type,keys,valid] of scenarios)test('actual captureSorting admission '+name,async()=>{
 const ordinary={status:'SUCCEEDED',cleanup_complete:true,node,execution,
  configuration:{readback:{kind:'sorting',scope:'observed_before_verified_finish',values_are:'observed_ui_values',node,keys,receipt_ids:['a','b','c','d','e']}},
  output:{ports:[{port:0,port_guid:'p',row_count:1,schema:[{name:'Scalar',label:'Scalar',type}],fresh:true,execution_id:execution.execution_id}]}};
 const stop=Error('REVIEW_BOUNDARY_NO_PAGE_OR_RPC');const calls=[];let rejection;
 try{await captureSorting({binding,identity,ordinary,browser:{async callTool(input){calls.push(input);throw stop}},record:async()=>{throw Error('record must not be reached')}})}catch(e){rejection=e}
 await writeFile(join(process.env.REVIEW_RESULTS_DIR,'full-'+name+'.json'),JSON.stringify({module:process.env.SORTING_MODULE,fixture:true,ordinary,browser_calls:calls.length,executed_Page:false,native_RPC:0,rejection:{name:rejection?.name,message:rejection?.message},stopped_at_review_boundary:rejection===stop},null,2)+'\n');
 assert.equal(calls.length,valid?1:0,'malformed settings must be refused before Page transport admission');
 if(valid)assert.equal(rejection,stop);
});
