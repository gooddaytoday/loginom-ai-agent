import vm from 'node:vm';
import {readJavascriptStage} from '../../lib/javascript-stage-read.mjs';

export function javascriptStageFixture() {
  const prefix='MF;TF-1',base=prefix+';WizrdMCF';
  const element=(id,tid)=>({id,tid,isConnected:true,parentElement:null,style:{display:'block',visibility:'visible'},
    rect:{x:20,y:20,width:300,height:200},getBoundingClientRect(){return this.rect;},getAttribute(key){return key==='data-tid'?this.tid:null;},
    contains(other){return this===other;},querySelectorAll(){return [];}});
  const root=element('wizard',base),code=element('code',base+';JavaScriptCodeWizard'),preview=element('preview',base+';JavaScriptOutputPreviewForm');
  const error=element('error',base+';btnError');error.rect.width=0;error.tip='SyntaxError: Syntax error at code (:4:33)';
  error.getAttribute=key=>key==='data-tid'?error.tid:key==='data-qtip'?error.tip:null;
  root.contains=e=>e===root||e===code||e===error;code.parentElement=root;error.parentElement=root;
  root.querySelectorAll=selector=>selector.includes('bg-error')?[]:selector.includes('btnError')?[error]:[code];
  const model={FView:{el:{dom:root}},FModelNode:{}},codeView={el:{dom:code}},previewView={el:{dom:preview},hidden:false};
  const form={FView:previewView,FLoaded:true},controller={FWizardForm:model,FView:{el:{dom:{}}},FPreviewController:{FPreviewForm:form}};
  const item={FWizard:controller,FPages:[codeView]};model.FWizardItems={FItems:[item]};
  codeView.Controller={};previewView.Controller=form;
  const native={},tab={Controller:{Node:{data:{node:native}},FController:model}},binding={tab,nodeData:model.FModelNode};
  const connection={Connected:true,UserName:'jsteach'},dialogs=[];
  const previews=[preview],masks=[],plainMasks=[],controls={wizard:model.FView,code:codeView,preview:previewView};
  const context=vm.createContext({innerWidth:1000,innerHeight:800,getComputedStyle:e=>e.style,
    document:{querySelectorAll:selector=>selector.includes('bg-mask')?masks:selector==='.x-mask'?plainMasks
      :selector.includes('role=')||selector==='.x-message-box'?dialogs:previews},Ext:{getCmp:id=>controls[id]},
    bg:{app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:connection},Items:{Workspace:{getActiveTab:()=>tab}}}}}}}});
  const read=()=>vm.runInContext('('+readJavascriptStage.toString()+')',context)({root,native,binding,prefix,account:'jsteach',build:'7.4.2'});
  return {read,context,native,binding,connection,dialogs,item,root,code,error,preview,model,codeView,previewView,form,controller,tab,previews,masks,plainMasks,element};
}
