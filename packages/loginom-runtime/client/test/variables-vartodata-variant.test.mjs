import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeProcedure} from '../lib/node-procedure.mjs';

for(const mode of ['rows','columns','read'])test('VarToData opts into exact native Variant reading: '+mode,async()=>{
 const node={document_id:'doc',workflow_id:'flow',node_id:'node'};
 const binding={document_id:'doc',workflow_ref:{workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'crumb',label:'Scenario'}]},node};
 const operation={id:'rows',deadline:10000,action:{action_key:'node.apply',revision:'1'},parameters:{target:{type:'variables.to_table'},mode}};
 let calls=0;
 const channel=createNodeProcedure({operation,preparedNodeContext:binding,targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2',now:()=>1,
  record:async r=>structuredClone(r),wrapMutation:()=>assert.fail('read cannot mutate'),execute:async code=>{
   calls++;assert.match(code, /"typedVariants":true/);
   return {verified:true,cleanup_complete:true,node_context:{...node,verified:true},output:{port:0,fresh:true,execution_id:'execution',freshness_basis:'completed_execution_port_source'}};
  }});
 await channel.readOutputPort({port:0,sampleRows:8,requireExactNumbers:true,execution:{verified:true,owner_verified:true,status:'completed',execution_id:'execution',process_id:'1',process_record_id:'process'}});
 assert.equal(calls,1);assert.equal(operation.cleanupConfirmed,true);
});
