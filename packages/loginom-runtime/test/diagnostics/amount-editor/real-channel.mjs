import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import{pathToFileURL}from'node:url';import{resolve}from'node:path';
const[root,fixtureFile]=process.argv.slice(2),load=p=>import(pathToFileURL(resolve(root,p)));
const {prepareAmountEditor}=await load('src/acceptance/amount-editor-preparation.mjs'),{createNodeProcedure}=await load('client/lib/node-procedure.mjs');
const fixture=JSON.parse(await readFile(fixtureFile,'utf8'));const rows=[];
for(const mode of ['open','channel-field-drift','foreign-document','record-false','lost-reply-false','abort-at-record']){
 let state=structuredClone(fixture.before),gestures=0,reads=0,aborted=false;const records=[];
 const n=state.prepared_node_context,owner={document_id:n.document_id,workflow_id:n.workflow_id,node_id:n.node_id};
 const operation={id:'offline-original',action:{action_key:'acceptance.amount_capture',revision:'1'},deadline:100000,checkpoint:{workflow_ref:state.workflow_ref,document_id:state.dom_epoch.document}};
 const preparedNodeContext={document_id:owner.document_id,node:owner,workflow_ref:{...state.workflow_ref,workflow_id:owner.workflow_id,navigation_path:state.wizard.owner_context.path.slice(0,1).map(({tid,label})=>({tid,label}))}};
 const channel=createNodeProcedure({operation,preparedNodeContext,now:()=>1,maxSteps:24,targetOrigin:state.origin,targetBuild:state.loginom_build,
  record:async e=>{records.push(structuredClone(e));return structuredClone(e)},wrapMutation:(code,r)=>({code,r}),
  execute:async code=>{
   if(typeof code==='string'){reads++;const value=structuredClone(state);if(mode==='channel-field-drift')value.wizard.import_columns.fields[0].type='real';if(mode==='foreign-document')value.dom_epoch.document='foreign';return{status:'SUCCEEDED',output:value}}
   gestures++;assert(records.some(r=>r.phase==='node_observation_completed'));assert(records.some(r=>r.phase==='node_step_prepared'));
   if(mode==='lost-reply-false')throw false;
   state.wizard.import_column_editor={status:'observed',name:'Amount',index:1,property:'type',settings_applied:false};
   return {status:'SUCCEEDED',operation_id:code.r.id,action_key:'ui.act',action_revision:'1',effect_possible:true,cleanup_complete:true,output:structuredClone(state)};
  }});
 let result,error;try{result=await prepareAmountEditor({channel,owner,observe:async()=>structuredClone(state),current:()=>{if(aborted)throw false},record:async e=>{records.push(e);if(mode==='record-false')throw false;if(mode==='abort-at-record')aborted=true}})}catch(value){error={value}};
 if(mode==='open'){assert(result);assert.equal(gestures,1);assert(reads>=2);assert(records.findIndex(r=>r.phase==='node_observation_completed')<records.findIndex(r=>r.event==='amount_editor_preparation'))}
 else{assert(error);assert.equal(result,undefined);assert.equal(gestures,mode==='lost-reply-false'?1:0);if(['lost-reply-false','record-false','abort-at-record'].includes(mode))assert.equal(error.value,false)}
 if(mode==='lost-reply-false')assert.equal(operation.transportUncertain,true);
 rows.push({mode,pass:true,gestures,reads,transportUncertain:operation.transportUncertain===true});
}
console.log(JSON.stringify({pass:rows.length,rows,limits:'Real createNodeProcedure observe/perform/act and text-import opener. Historical raw state used only as offline fixture; browser/native/execute/persistence are named doubles, no live replay.'}));
