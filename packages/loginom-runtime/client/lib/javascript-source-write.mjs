import {javascriptSourceIdentity} from './javascript-source-read.mjs';
import {observeJavascriptSource} from './javascript-source-browser.mjs';
import {inspectJavascriptModulePolicy} from './javascript-module-policy.mjs';

const need=(condition,message)=>{if(!condition)throw Error(message);};
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);

// Internal one-shot editor boundary. The owning node driver opens the wizard
// and must separately finish or discard it; this function never commits it.
export function createJavascriptSourceWriter({page,context,owner,epoch,deadline,record}) {
  need(owner&&same(Object.keys(owner).sort(),['document_id','node_id','operation_id','ui_epoch','workflow_id'])
    &&['document_id','node_id','operation_id','workflow_id'].every(key=>typeof owner[key]==='string'&&owner[key].length>0&&owner[key].length<=256)
    &&Number.isSafeInteger(owner.ui_epoch)&&owner.ui_epoch>=0
    &&Number.isSafeInteger(epoch)&&epoch>=0,'Invalid source writer owner');
  need(Number.isSafeInteger(deadline)&&deadline>Date.now(),'Invalid source writer deadline');
  need(context?.build==='7.4.2'&&process.platform==='linux','JavaScript source writer requires validated Linux Loginom 7.4.2');
  need(page&&typeof page.evaluateHandle==='function'&&typeof page.evaluate==='function'
    &&typeof page.mouse?.click==='function'&&typeof page.keyboard?.press==='function'
    &&typeof page.keyboard?.insertText==='function'&&typeof record==='function','Invalid source writer dependencies');
  const identity=Object.freeze({...owner});
  let state='idle',sourceMutationPossible=false;
  const timely=()=>need(Date.now()<deadline,'Source writer deadline expired');
  const bounded=async call=>{
    timely();let timer;
    try{
      const value=await Promise.race([Promise.resolve().then(call),new Promise((resolve,reject)=>{
        timer=setTimeout(()=>reject(Error('Source writer reply timeout')),Math.max(1,deadline-Date.now()));
      })]);
      timely();return value;
    }finally{clearTimeout(timer);}
  };
  const journal=async(phase,previous,target)=>{
    const event={phase,owner:identity,deadline,previous_source_sha256:previous.source_sha256,
      source_sha256:target.source_sha256,source_utf8_bytes:target.source_utf8_bytes,source_lf_lines:target.source_lf_lines};
    const expected=structuredClone(event),ack=await bounded(()=>record(structuredClone(event)));
    need(Object.keys(expected).every(key=>same(ack?.[key],expected[key])),'Source writer journal ACK differs');
  };
  return {
    get state(){return state;},
    async replace({expected_source_sha256,source_text}){
      need(state==='idle','Source writer is one-shot; inspect the original attempt');
      state='checking';let held,phase='preflight';
      try{
        need(typeof expected_source_sha256==='string'&&/^[a-f0-9]{64}$/.test(expected_source_sha256),
          'Complete expected source digest required');
        const target=javascriptSourceIdentity(source_text);
        const policy=inspectJavascriptModulePolicy(source_text);
        need(policy.status==='ADMITTED'&&policy.source_sha256===target.source_sha256,
          'JavaScript source policy refused');
        held=await bounded(()=>page.evaluateHandle(observeJavascriptSource,{context,owner:identity,epoch,capture:true}));
        const read=options=>bounded(()=>page.evaluate(observeJavascriptSource,{context,owner:identity,epoch,held,...options}));
        const before=await read({}),again=await read({}),previous=javascriptSourceIdentity(before.source);
        need(same(before.owner,identity)&&same(again.owner,identity)&&again.source===before.source
          &&previous.source_sha256===expected_source_sha256,'Source writer baseline changed');
        const location=await read({locate:true});
        need(location.source===before.source&&same(location.owner,identity),'Source writer point baseline changed');
        phase='prepared';await journal('javascript_source_write_prepared',previous,target);
        sourceMutationPossible=true;phase='focusing';
        await bounded(()=>page.mouse.click(location.point.x,location.point.y));
        const focused=await read({requireInputFocus:true});
        need(focused.source===before.source,'Source writer focus changed source');
        phase='selecting';await bounded(()=>page.keyboard.press('Control+A'));
        const selected=await read({requireInputFocus:true,selectionCheck:true});
        need(selected.source===before.source&&selected.selection_full===true,'Source writer full selection unconfirmed');
        phase='mutation_prepared';await journal('javascript_source_write_mutation_dispatch',previous,target);
        phase='mutating';
        await bounded(()=>page.keyboard.press('Backspace'));
        need((await read({requireInputFocus:true})).source==='','Source writer clear unconfirmed');
        await bounded(()=>page.keyboard.insertText(source_text));
        const after=await read({requireInputFocus:true});
        need(after.source===source_text&&same(after.owner,identity)
          &&same(javascriptSourceIdentity(after.source),target),'Source writer exact readback differs');
        phase='settled';await journal('javascript_source_write_draft_verified',previous,target);
        state='draft_verified';
        return {owner:identity,previous_source_sha256:previous.source_sha256,...target,
          draft_exact:true,wizard_commit_verified:false,source_mutation_possible:true};
      }catch{
        state=sourceMutationPossible?'uncertain':'refused';
        const error=Error(sourceMutationPossible?'JavaScript source write effect uncertain':'JavaScript source write refused before document mutation');
        error.code=sourceMutationPossible?'JAVASCRIPT_SOURCE_WRITE_UNCERTAIN':'JAVASCRIPT_SOURCE_WRITE_REFUSED';
        error.phase=phase;error.source_mutation_possible=sourceMutationPossible;
        throw error;
      }finally{if(typeof held?.dispose==='function')try{await held.dispose();}catch{}}
    },
  };
}
