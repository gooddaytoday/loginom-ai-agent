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
test('manual changes the shared boundary and labels of the saved node without choosing a method',async()=>{
 const field={index:0,record_id:'date',label:'When',type:'datetime',method_code:3,bins_count:2,automatic:false};
 const lo='2026-01-01T00:00:00.000',mid='2026-01-02T12:00:00.000',hi='2026-01-04T00:00:00.000',boundary='2026-01-02T00:00:00.000';
 const intervals=[{number:0,lower:lo,upper:mid,lower_included:true,upper_included:true,label:'first'},
  {number:1,lower:mid,upper:hi,lower_included:false,upper_included:true,label:'last'}];
 const c={verified:true,binding_ready:true,fields:[field],selected:field,state:'materialized',intervals,frame:{record_id:'date',switches:[],controls:{},values:{}},
  settings:{method:'count',size:2,limits:[lo,hi],strict_lower:true,strict_upper:true,rounding:false,lower_open:false,upper_open:false},bin_editor:null};
 const base='W;MethodSettingsWizard-1;',editor=base+'grdBins;celleditor',calls=[];
 const cells=()=>intervals.flatMap((b,i)=>['UpperBoundValue','BinLabel'].map(key=>({tid:base+'col'+key+'_'+i,ref:key+'_'+i,allowed_actions:['double_click']})));
 const s={wizard:{root_tid:'W',stage:'binning'},node_binning:c,ui:{elements:cells()}};
 let text;
 const channel={observe:async o=>{assert.ok(o.ready(s),o.condition);return structuredClone(s);},perform:async o=>{
  assert.ok(o.ready(s));const a=o.resolve(s);calls.push(a);
  if(a.verb==='double_click'){
   const [key,i]=a.ref.split('_');c.bin_editor={number:Number(i),field:key,root_tid:editor};
   s.ui.elements=[{tid:null,ref:'owned-date-input',signature:{tag:'input'},identity:{anchor_tid:editor+';datetimefield'},allowed_actions:['fill','press']}];
  }else if(a.verb==='fill')text=a.text;
  else if(a.verb==='press'){
   const e=c.bin_editor,b=intervals[e.number];
   if(e.field==='UpperBoundValue'){b.upper=text;intervals[e.number+1].lower=text;}else b.label=text;
   c.bin_editor=null;s.ui.elements=cells();
  }else if(a.verb==='wizard_step')s.wizard.stage=a.expected_stage;
  else assert.fail('unexpected manual action');
  if(!c.bin_editor&&!s.ui.elements.some(e=>e.tid==='W;btnNext'))s.ui.elements.push({tid:'W;btnNext',ref:'next',allowed_actions:['wizard_step']});
 }};
 const wanted=[{lower:lo,upper:boundary,lower_included:true,upper_included:true,label:'Early'},
  {lower:boundary,upper:hi,lower_included:false,upper_included:true,label:'Late'}];
 const result=await configureBinning(channel,{binning:{field:'When',method:'manual',intervals:wanted}},
  {request:{mode:'internal'},preconfiguration:{target_fields:[{name:'When',label:'When',type:'datetime'}]}});
 assert.equal(result.configuration.manual_edits,true);assert.equal(result.configuration.state,'materialized');
 assert.deepEqual(result.configuration.intervals.map(({number,...b})=>b),wanted);
 assert.deepEqual(calls.filter(a=>a.verb==='double_click').map(a=>a.ref),['UpperBoundValue_0','BinLabel_0','BinLabel_1']);
});
