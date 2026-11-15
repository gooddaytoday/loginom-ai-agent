import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeProcedure} from '../lib/node-procedure.mjs';

const node={document_id:'doc',workflow_id:'flow',node_id:'node'};
const binding={document_id:'doc',workflow_ref:{workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'crumb',label:'Scenario'}]},node};
const execution={verified:true,owner_verified:true,status:'completed',execution_id:'execution',process_id:'1',process_record_id:'process'};

async function dispatched(type,requireExactNumbers,route='apply'){
 const operation=route==='apply'?{id:'op',deadline:10000,action:{action_key:'node.apply',revision:'1'},parameters:{},nodeApply:{request:{target:{type}}}}
  :{id:'op',deadline:10000,action:{action_key:'node.read',revision:'1'},parameters:{target:{type},parameters:{}}};
 let code;
 const channel=createNodeProcedure({operation,preparedNodeContext:binding,targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2',now:()=>1,
  record:async r=>structuredClone(r),wrapMutation:()=>assert.fail('read cannot mutate'),execute:async c=>{code=c;
   return {verified:true,cleanup_complete:true,node_context:{...node,verified:true},output:{port:0,fresh:true,execution_id:'execution',freshness_basis:'completed_execution_port_source'}};}});
 await channel.readOutputPort({port:0,sampleRows:15,requireExactNumbers,execution});
 const start=code.indexOf('{"port":0,"sampleRows":15');let depth=0,end=start;
 for(;end<code.length;end++){if(code[end]==='{')depth++;if(code[end]==='}'&&--depth===0)break;}
 const request=JSON.parse(code.slice(start,end+1));
 return request;
}

// LAB-1135: exact Collapse read refused unverified_precision on Variant Values.
for(const route of ['apply','read'])test('exact Collapse/Replacement port read carries the native subtype opt-in: '+route,async()=>{
 assert.equal((await dispatched('transform.collapse_columns',true,route)).typedVariants,true);
 const replace=await dispatched('transform.replace_columns',true,route);
 assert.equal(replace.typedVariants,true);assert.equal(replace.variantEmptyIsNull,true);
 assert.equal(Object.hasOwn(await dispatched('transform.collapse_columns',true,route),'variantEmptyIsNull'),false);
});
test('ordinary Collapse/Replacement reads and other types keep their previous request',async()=>{
 for(const type of ['transform.collapse_columns','transform.replace_columns']){
  const request=await dispatched(type,false);
  assert.equal(Object.hasOwn(request,'typedVariants'),false);assert.equal(Object.hasOwn(request,'variantEmptyIsNull'),false);
 }
 const other=await dispatched('transform.calculator',true);
 assert.equal(Object.hasOwn(other,'typedVariants'),false);
});


for(const route of ['apply','read'])test('Text Import always uses the shared typed Variant reader: '+route,async()=>{
 for(const exact of [false,true])assert.equal((await dispatched('imports.text',exact,route)).typedVariants,true);
});

for(const route of ['apply','read'])test('Grouping exact read preserves Variant subtypes: '+route,async()=>{
 const request=await dispatched('transform.group_data',true,route);
 assert.equal(request.typedVariants,true);
 assert.equal(Object.hasOwn(request,'variantEmptyIsNull'),false);
 assert.equal(Object.hasOwn(await dispatched('transform.group_data',false,route),'typedVariants'),false);
});
