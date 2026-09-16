import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyDateTimeReceipt,verifyDateTimeDraft} from '../lib/date-time-continuation.mjs';
function fixture(){
 const matrix=Array.from({length:29},(_,i)=>({record_id:String(i),func:i,iso:false,first:false,last:false,number:false,string:false,string_format:'original'}));
 const expected=structuredClone(matrix);expected[5].number=true;
 const baseline={verified:true,inventory_complete:true,node_context:{verified:true,surface:'wizard',document_id:'doc',workflow_id:'flow',node_id:'node',tid:'tid'},fields:[{name:'DateA',record_id:'a',type:'datetime',count:0}],selected:{name:'DateA',record_id:'a'}};
 const progress={signature:'sig',node:{id:'node'},baseline,expected:[{name:'DateA',matrix}],pending:{field:'DateA',field_record_id:'a',ref:'flag',before:structuredClone(matrix),expected,cell:{record_id:'5',func:5,iso:false,key:'number',checked:true}},step:{operation_id:'op',step:3,internal_operation_id:'op:n3',signature:'click-sig',action:{verb:'click',ref:'flag'}}};
 const state={signature:'sig',node:{id:'node'},pending:{phase:'configure'},request:{operation_id:'op',target:{type:'transform.date_time'}}};
 const reference={id:'op:n3',signature:'click-sig',action_key:'ui.act'};
 const stored={state:'completed',receipt:{status:'SUCCEEDED',cleanup_complete:true,action_key:'ui.act',operation_id:'op:n3',error:null,trace:[{event:'ui_preconditions_verified',verb:'click',refs:['flag']},{event:'ui_gesture_applied',verb:'click'}]}};
 return {progress,state,reference,stored,current:structuredClone(baseline),matrices:[{name:'DateA',matrix:structuredClone(expected)}]};
}
test('original successful click and all native cells prove only the pending flag',()=>{
 const f=fixture();assert.equal(verifyDateTimeReceipt(f.progress,f.state,f.reference,f.stored).status,'SUCCEEDED');
 assert.deepEqual(verifyDateTimeDraft(f.progress,f.current,f.matrices),f.matrices);
 assert.equal(f.state.pending.phase,'configure');assert.equal(f.progress.expected[0].matrix[5].number,false);
});
for(const [name,change] of Object.entries({
 foreignOperation:f=>f.state.request.operation_id='other',foreignSignature:f=>f.state.signature='other',foreignNode:f=>f.state.node.id='other',
 foreignReceipt:f=>f.reference.id='other',wrongReceiptSignature:f=>f.reference.signature='other',unfinished:f=>f.stored.state='pending',
 uncertain:f=>f.stored.receipt.status='AMBIGUOUS',unclean:f=>f.stored.receipt.cleanup_complete=false,missingGesture:f=>f.stored.receipt.trace.pop(),
 duplicateGesture:f=>f.stored.receipt.trace.push({event:'ui_gesture_applied',verb:'click'}),wrongRef:f=>f.progress.step.action.ref='other',
 collateralPending:f=>f.progress.pending.expected[7].last=true,wrongCell:f=>f.progress.pending.cell.func=6,
 changedBaseline:f=>f.progress.pending.before[2].string_format='changed',
}))test('receipt refuses '+name,()=>{const f=fixture();change(f);assert.throws(()=>verifyDateTimeReceipt(f.progress,f.state,f.reference,f.stored));assert.equal(f.state.pending.phase,'configure');});
for(const [name,change] of Object.entries({
 foreignDocument:f=>f.current.node_context.document_id='other',foreignOwner:f=>f.current.node_context.node_id='other',
 wrongSurface:f=>f.current.node_context.surface='workflow',unverified:f=>f.current.verified=false,incomplete:f=>f.current.inventory_complete=false,
 foreignField:f=>f.current.selected.record_id='other',changedInventory:f=>f.current.fields[0].type='string',
 missingRow:f=>f.matrices[0].matrix.pop(),missingField:f=>f.matrices.pop(),extraFlag:f=>f.matrices[0].matrix[2].last=true,
 changedFormat:f=>f.matrices[0].matrix[8].string_format='changed',unappliedFlag:f=>f.matrices[0].matrix[5].number=false,
}))test('draft refuses '+name,()=>{const f=fixture();change(f);assert.throws(()=>verifyDateTimeDraft(f.progress,f.current,f.matrices));});

test('inspection acknowledges canonical journal URLs and keeps configure pending',async()=>{
 const {inspectDateTimeConfigure}=await import('../lib/date-time-continuation.mjs');
 const {createRedactor}=await import('../lib/redact.mjs');const f=fixture(),events=[];
 f.progress.reference=f.reference;f.state.deadline=1000;f.state.configure_deadline=1000;f.state.pending.deadline=1000;
 f.stored.receipt.output={origin:'http://example.test'};
 const channel={observe:async()=>({wizard:{stage:'date_time'},node_date_time:{...f.current,matrix:f.matrices[0].matrix}})};
 const options={channel,operation:{id:'op',nodeApply:f.state},progress:f.progress,readReceipt:async()=>f.stored,record:async e=>{const saved=createRedactor().redact(e);events.push(saved);return saved;},now:()=>1};
 assert.equal((await inspectDateTimeConfigure(options)).verified,true);
 assert.equal((await inspectDateTimeConfigure(options)).verified,true);
 assert.equal(events.filter(e=>e.phase==='node_step_completed').length,1);
 assert.equal(events[0].outcome.output.origin,'http://example.test/');assert.equal(f.state.pending.phase,'configure');
});

for(const kind of ['deadline','missing_receipt','missing_draft'])test('inspection refuses '+kind+' before live gestures',async()=>{
 const {inspectDateTimeConfigure}=await import('../lib/date-time-continuation.mjs');const f=fixture();
 f.progress.reference=f.reference;f.state.deadline=100;f.state.configure_deadline=100;f.state.pending.deadline=100;
 if(kind==='missing_draft')delete f.progress.pending;
 let reads=0,gestures=0;
 const options={channel:{observe:async()=>{gestures++;throw Error('unexpected UI access');}},operation:{id:'op',nodeApply:f.state},progress:f.progress,
 readReceipt:async()=>{reads++;return null;},record:async e=>e,now:()=>kind==='deadline'?100:1};
 await assert.rejects(inspectDateTimeConfigure(options));assert.equal(gestures,0);assert.equal(reads,kind==='missing_receipt'?1:0);
 assert.equal(f.state.pending.phase,'configure');
});
