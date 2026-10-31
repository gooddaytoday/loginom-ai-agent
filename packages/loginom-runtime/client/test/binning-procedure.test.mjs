import test from 'node:test';
import assert from 'node:assert/strict';
import {configureBinning} from '../lib/binning-procedure.mjs';

async function methodSelection({method='count',replaceEditor=false,closeEditor=false}={}){
 const base='W;MethodSettingsWizard-1',editor=base+';grdColumns;tbl;celleditor',calls=[];
 const code=method==='width'?2:3,label=method==='width'?'Ширина':'Количество',sizeKey=method==='width'?'edtBinWidth;ValueControl':'cbbCountBins;ValueControl';
 let replacementTicks=0,replacementPending=false;
 const field={index:0,record_id:'record-X',label:'X',type:'real',method_code:0,bins_count:0,automatic:false};
 const c={verified:true,binding_ready:true,fields:[field],selected:field,method_editor:null,frame:null,settings:null,intervals:[],state:'settings'};
 const cell=(tid,ref,actions)=>({tid,ref,allowed_actions:actions});
 const s={wizard:{root_tid:'W',stage:'binning'},node_binning:c,ui:{elements:[cell(base+';colMethodType_0','method',['double_click'])]}};
 const channel={
  async observe(o){
   while(!o.ready(s)&&replacementPending&&replacementTicks<3){
    await new Promise(resolve=>setImmediate(resolve));
    replacementTicks++;
    if(replacementTicks===1)s.ui.elements=[{tid:null,ref:'foreign-input',identity:{anchor_tid:'foreign;cbx'},signature:{tag:'input'},allowed_actions:['press']}];
    if(replacementTicks===2)c.method_editor={record_id:field.record_id,root_tid:editor+'-replacement'};
    if(replacementTicks===3){
     replacementPending=false;
     if(closeEditor){c.method_editor=null;s.ui.elements=[cell('W;btnNext','next',['wizard_step'])];}
     else s.ui.elements=[{tid:null,ref:'new-owned-input',identity:{anchor_tid:editor+'-replacement;cbx'},signature:{tag:'input'},allowed_actions:['press']}];
    }
   }
   assert.ok(o.ready(s),'readiness: '+o.condition);return structuredClone(s);
  },
  async perform(o){assert.ok(o.ready(s));const a=o.resolve(s);calls.push(a);
   if(a.verb==='double_click'){
    c.method_editor={record_id:field.record_id,root_tid:editor};
    s.ui.elements=[cell(editor+';cbx;trg_picker','picker',['click']),{tid:null,ref:'owned-input',identity:{anchor_tid:editor+';cbx'},signature:{tag:'input'},allowed_actions:['press']}];
   }else if(a.ref==='picker')s.ui.elements.push({...cell(editor+';cbx;boundlist;'+code,'choice',['click']),label});
   else if(a.ref==='choice'){
    field.method_code=code; // Observed Width: method changed, cached editor exists, zero UI inputs.
    c.frame={record_id:field.record_id,switches:[],controls:{},values:{}};
    c.settings={method,size:2,limits:[0,20],strict_lower:true,strict_upper:true,rounding:false,lower_open:false,upper_open:false};
    Object.assign(c.frame.values,{[sizeKey]:2,chkStrictLowerLimit:true,chkStrictUpperLimit:true,edtLowerLimit:0,edtUpperLimit:20,chkRoundingLevel:false,'chkLowerLimitOpen;ValueControl':false,'chkUpperLimitOpen;ValueControl':false});
    if(replaceEditor){s.ui.elements=[];replacementPending=true;}
   }else if(a.verb==='press'){
    assert.equal(a.ref,replaceEditor?'new-owned-input':'owned-input');assert.equal(a.key,'Enter');c.method_editor=null;
    s.ui.elements=[cell('W;btnNext','next',['wizard_step'])];
   }else if(a.verb==='wizard_step'){assert.equal(c.method_editor,null);s.wizard.stage=a.expected_stage;}
   else assert.fail('Unexpected action '+JSON.stringify(a));
  },
 };
 const result=await configureBinning(channel,{binning:{field:'X',method,size:2,limits:[0,20]}},{request:{mode:'internal'},inputMapping:{target_fields:[{name:'X',label:'X',type:'real'}]}});
 return {result,calls,replacementTicks};
}
test('native method selection commits its still-open owned CellEditor before advancing',async()=>{
 const {result,calls}=await methodSelection();
 assert.equal(result.verified,true);assert.deepEqual(calls.filter(a=>a.verb==='press'),[{verb:'press',ref:'owned-input',key:'Enter'}]);
 assert.deepEqual(calls.filter(a=>a.verb==='wizard_step').map(a=>a.expected_stage),['output_mapping','binning_ranges_mapping','done']);
});
test('Width waits through an absent input and delayed DOM replacement, then binds the fresh owned input',async()=>{
 const {result,calls,replacementTicks}=await methodSelection({method:'width',replaceEditor:true});
 assert.equal(result.verified,true);assert.equal(replacementTicks,3);
 assert.deepEqual(calls.filter(a=>a.verb==='press'),[{verb:'press',ref:'new-owned-input',key:'Enter'}]);
});
test('a delayed native editor closure after Width selection needs no cached-input gesture',async()=>{
 const {result,calls,replacementTicks}=await methodSelection({method:'width',replaceEditor:true,closeEditor:true});
 assert.equal(result.verified,true);assert.equal(replacementTicks,3);assert.deepEqual(calls.filter(a=>a.verb==='press'),[]);
});
