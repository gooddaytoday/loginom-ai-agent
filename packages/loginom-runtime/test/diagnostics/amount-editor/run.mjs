import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';import{resolve}from'node:path';
const root=resolve(process.argv[2]);const {prepareAmountEditor}=await import(pathToFileURL(root+'/src/acceptance/amount-editor-preparation.mjs'));
const rows=[];
for(const mode of ['open','already-open','foreign-node','wrong-stage','dirty-pending','ambiguous-field','wrong-index','field-drift','lost-reply-false','abort-before-gesture']){
 const owner={document_id:'doc',workflow_id:'wf',node_id:'node'},field={index:1,name:'Amount',label:'Amount',type:'real',data_kind:'continuous',used:true,status:'observed',cell_refs:{type:'cell'}};
 const state={prepared_node_context:{verified:true,surface:'wizard',...owner,tid:'wizard'},wizard:{status:'observed',stage:'text_import_format',root_tid:'wizard',owner_context:{status:'observed',node:{tid:'node'},path:[{tid:'wf',label:'workflow'}]},import_columns:{fields:[field]}},ui:{elements:[{ref:'cell',tid:'typecell',allowed_actions:['double_click']}]}};
 const editor={status:'observed',name:'Amount',index:1,property:'type',settings_applied:false};
 if(mode==='already-open')state.wizard.import_column_editor=editor;
 if(mode==='foreign-node')state.prepared_node_context.node_id='other';if(mode==='wrong-stage')state.wizard.stage='text_import_file';if(mode==='dirty-pending')state.pending=true;
 if(mode==='ambiguous-field')state.wizard.import_columns.fields.push({...field,index:2});if(mode==='wrong-index')field.index=2;
 let gestures=0,records=0,aborted=false;const channel={async observe(request){assert(request.ready(state));return structuredClone(state)},async perform(request){assert(request.ready(state));request.identity(state);assert.deepEqual(request.resolve(state),{verb:'double_click',ref:'cell'});gestures++;if(mode==='lost-reply-false')throw false;state.wizard.import_column_editor=editor;if(mode==='field-drift')field.type='string';return{output:state}}};
 let result,error;try{result=await prepareAmountEditor({channel,owner,observe:async()=>state,current:()=>{if(aborted)throw false},record:async()=>{records++;if(mode==='abort-before-gesture')aborted=true}})}catch(value){error={value}};
 if(['open','already-open'].includes(mode)){assert.equal(result,state);assert.equal(gestures,mode==='open'?1:0)}else{assert(error);assert.equal(result,undefined);if(['lost-reply-false','abort-before-gesture'].includes(mode))assert.equal(error.value,false);else assert.equal(error.value.message,'LOGINOM_AMOUNT_EDITOR_PREPARATION_UNAVAILABLE');assert.equal(gestures,['field-drift','lost-reply-false'].includes(mode)?1:0)}
 rows.push({mode,pass:true,gestures,records});
}
console.log(JSON.stringify({pass:rows.length,rows,limits:'Real fixed preparation + original text-import opener; procedure/native/Page/SDK/records are named doubles. No current native gates or complete provider proof.'}));
