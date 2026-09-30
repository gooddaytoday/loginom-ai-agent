import {managedJavascriptStageFixture} from './javascript-managed-stage-fixture.mjs';

export function managedJavascriptErrorFixture({auto=false,close=true,modal=true,stage='code_next'}={}) {
  const f=managedJavascriptStageFixture(),tid='msgbox-1',events=[],calls=[],sha='a'.repeat(64);
  f.previews.length=0;f.lease.codeNextAttempted=true;f.lease.sourceDraftSha256=sha;
  const input=f.element('input','input'),wrapper=f.element('cm','wrapper');
  wrapper.contains=e=>e===input;const doc={lineCount:()=>1,firstLine:()=>0,lastLine:()=>0,getLine:()=> 'const value=object?.field;'};
  const cm={getDoc:()=>doc,getInputField:()=>input,getWrapperElement:()=>wrapper,getOption:()=>false};wrapper.CodeMirror=cm;
  const rootQuery=f.root.querySelectorAll,rootContains=f.root.contains;
  f.root.querySelectorAll=selector=>selector==='.CodeMirror'?[wrapper]:rootQuery(selector);
  f.root.contains=e=>e===wrapper||rootContains(e);f.code.contains=e=>e===wrapper;
  f.lease.sourceEditorCaptured={document:f.context.document,tab:f.tab,native:f.native,model:f.model,root:f.root,
    page:f.code,wrapper,cm,doc,input};f.lease.sourceDraftText='const value=object?.field;';
  if(stage==='done') {
    f.lease.doneAttempted=true;
    const done=f.element('done','MF;TF-1;WizrdMCF;DoneWizard');
    f.code.rect.width=0;wrapper.rect.width=0;
    const query=f.root.querySelectorAll;
    f.root.querySelectorAll=selector=>selector==='[data-tid]'?[f.code,done]:query(selector);
  }
  const before=f.read();f.error.rect.width=100;f.error.closest=()=>null;
  const ok=f.element('ok',tid+';tlb;ok');ok.innerText='OK';ok.closest=()=>null;
  const dialog=f.element('dialog',tid);dialog.innerText='Loginom 7.4.2\nSyntaxError: Syntax error at code (:4:33)\nТехнические подробности\nOK';
  dialog.querySelectorAll=()=>[ok];dialog.contains=e=>e===ok;
  const get=f.context.Ext.getCmp,query=f.context.document.querySelectorAll;
  const mask=f.element('modal-mask',''),container={},dialogComponent={el:{dom:dialog},modal:true,hidden:false,container};
  dialogComponent.zIndexManager={front:dialogComponent,mask:{dom:mask,maskTarget:container}};
  const controls={[f.error.id]:{el:{dom:f.error}},[dialog.id]:dialogComponent,[ok.id]:{el:{dom:ok}}};
  f.context.Ext.getCmp=id=>controls[id]??get(id);
  f.context.document.querySelectorAll=selector=>selector.includes('.x-message-box')?f.dialogs
    :selector.includes(';tlb;ok')?(f.dialogs.length?[ok]:[]):query(selector);
  f.context.document.elementFromPoint=()=>f.dialogs.length?ok:f.error;
  if(auto){f.dialogs.push(dialog);if(modal)f.plainMasks.push(mask);}
  f.page.mouse={click:async()=>{
    if(f.dialogs.length){calls.push('ok');if(close){f.dialogs.length=0;f.plainMasks.length=0;}return;}
    calls.push('button');f.dialogs.push(dialog);if(modal)f.plainMasks.push(mask);
  }};
  const execute=async code=>Function('return ('+code+')')()(f.page);
  const after={...f.read(),owner:f.task.owner,wizard_error_refusal:true,pending_seen:false};
  const base={...f.task,error_stage:stage,page_tid:after.page_tid,tooltip:after.wizard_error.tooltip,
    tooltip_truncated:false,expected_source_sha256:sha};
  const receiptOptions=(id,key,signature)=>({receipt_namespace:'error-test',receipt_id:id,receipt_signature:signature});
  const options={task:f.task,before,after,error_stage:stage,expected_source_sha256:sha,execute,
    record:async event=>{events.push(structuredClone(event));return event;},receiptOptions,wait:async()=>{}};
  return {...f,sha,dialog,dialogComponent,mask,ok,controls,events,calls,execute,base,before,after,options};
}

