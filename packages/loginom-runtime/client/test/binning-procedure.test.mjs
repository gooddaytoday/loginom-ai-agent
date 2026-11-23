import test from 'node:test';
import assert from 'node:assert/strict';
import {configureBinning} from '../lib/binning-procedure.mjs';
import {validateBinningParameters} from '../lib/binning-parameters.mjs';

async function methodSelection({method='count',replaceEditor=false,closeEditor=false}={}){
 const base='W;MethodSettingsWizard-1',editor=base+';grdColumns;tbl;celleditor',calls=[];
 const code={width:2,count:3,sd:5}[method],label={width:'Ширина',count:'Количество',sd:'Коэффициенты СКО'}[method],sizeKey=method==='width'?'edtBinWidth;ValueControl':'cbbCountBins;ValueControl';
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
    if(method==='sd'){
     Object.assign(c.settings,{size:null,limits:null,sd_coefficient:1,lower_open:true,upper_open:true});
     Object.assign(c.frame.values,{'chkLowerLimitOpen;ValueControl':true,'chkUpperLimitOpen;ValueControl':true});
    }
    if(replaceEditor){s.ui.elements=[];replacementPending=true;}
   }else if(a.verb==='press'){
    assert.equal(a.ref,replaceEditor?'new-owned-input':'owned-input');assert.equal(a.key,'Enter');c.method_editor=null;
    s.ui.elements=[cell('W;btnNext','next',['wizard_step'])];
   }else if(a.verb==='wizard_step'){assert.equal(c.method_editor,null);s.wizard.stage=a.expected_stage;}
   else assert.fail('Unexpected action '+JSON.stringify(a));
  },
 };
 const result=await configureBinning(channel,{binning:{field:'X',method,...(method==='sd'?{sd_coefficient:1}:{size:2,limits:[0,20]})}},{request:{mode:'internal'},inputMapping:{target_fields:[{name:'X',label:'X',type:'real'}]}});
 return {result,calls,replacementTicks};
}
test('native method selection commits its still-open owned CellEditor before advancing',async()=>{
 const {result,calls}=await methodSelection();
 assert.equal(result.verified,true);assert.deepEqual(calls.filter(a=>a.verb==='press'),[{verb:'press',ref:'owned-input',key:'Enter'}]);
 assert.deepEqual(calls.filter(a=>a.verb==='wizard_step').map(a=>a.expected_stage),['output_mapping','binning_ranges_mapping','done']);
});
test('SD chooses its native method and returns its observed coefficient and both open tails',async()=>{
 const {result}=await methodSelection({method:'sd'});
 assert.equal(result.configuration.method,'sd');assert.equal(result.configuration.sd_coefficient,1);
 assert.equal(result.configuration.size,null);assert.equal(result.configuration.open_ends,true);
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

function manualPreflight(count=3){
 const field={index:0,record_id:'X',label:'X',type:'real',method_code:3,bins_count:count,automatic:false};
 const intervals=Array.from({length:count},(_,i)=>({number:i,lower:i*10,upper:(i+1)*10,lower_included:i===0,upper_included:true,label:'bin '+i}));
 const c={verified:true,binding_ready:true,fields:[field],selected:field,state:'materialized',intervals,
  frame:{record_id:'X',switches:[],controls:{},values:{}},settings:{method:'count',size:count,limits:[0,count*10],strict_lower:true,strict_upper:true,rounding:false,lower_open:false,upper_open:false},bin_editor:null};
 const s={wizard:{root_tid:'W',stage:'binning'},node_binning:c,ui:{elements:[]}},calls=[];
 const cells=()=>intervals.flatMap((_,i)=>['LowerBoundValue','UpperBoundValue','BinLabel'].map(key=>({tid:'W;MethodSettingsWizard-1;col'+key+'_'+i,ref:key+'_'+i,allowed_actions:['double_click']})));
 s.ui.elements=cells();let text;
 const channel={observe:async o=>{assert.ok(o.ready(s),o.condition);return structuredClone(s);},perform:async o=>{
  assert.ok(o.ready(s));const a=o.resolve(s);calls.push(a);
  if(a.verb==='double_click'){
   const [key,i]=a.ref.split('_');c.bin_editor={number:Number(i),field:key,root_tid:'editor'};
   s.ui.elements=[{ref:'input',signature:{tag:'input'},identity:{anchor_tid:'editor;num'},allowed_actions:['fill','press']}];
  }else if(a.verb==='fill')text=a.text;
  else if(a.verb==='press'){
   const {number:i,field:key}=c.bin_editor;
   if(key==='UpperBoundValue'){intervals[i].upper=Number(text);if(intervals[i+1])intervals[i+1].lower=Number(text);}
   else if(key==='LowerBoundValue'){intervals[i].lower=Number(text);if(intervals[i-1])intervals[i-1].upper=Number(text);}
   else intervals[i].label=text;
   c.verified=intervals.every(b=>b.lower<b.upper);c.bin_editor=null;s.ui.elements=cells();
  }
 }};
 const wanted=intervals.map(({number,...b})=>({...b})),before=structuredClone(intervals);
 return {wanted,calls,intervals,before,run:async()=>{
  const parameters={binning:{field:'X',method:'manual',intervals:wanted}};
  validateBinningParameters(parameters,'internal');
  return configureBinning(channel,parameters,{request:{mode:'internal'},preconfiguration:{target_fields:[{name:'X',label:'X',type:'real'}]}});
 }};
}
test('manual checks inclusion flags of every interval before any edit',async()=>{
 const f=manualPreflight(2);f.wanted[0].label='changed';f.wanted[1].upper_included=false;
 await assert.rejects(f.run(),/preserve observed inclusion flags/);
 assert.deepEqual(f.calls,[]);assert.deepEqual(f.intervals,f.before);
});
test('manual refuses a boundary crossing the next observed interval before any edit',async()=>{
 const f=manualPreflight();Object.assign(f.wanted[0],{upper:25});Object.assign(f.wanted[1],{lower:25,upper:28});f.wanted[2].lower=28;
 await assert.rejects(f.run(),/manual boundary would invalidate an observed interval.*smaller steps/);
 assert.deepEqual(f.calls,[]);assert.deepEqual(f.intervals,f.before);
});

async function frequencyCurrent({stale=false,initial='next',requested='current'}={}){
 const field={index:0,record_id:'X',label:'X',type:'real',method_code:4,bins_count:0,automatic:false};
 const key='cbbMatchingObservationsMode;ValueControl',owner='MethodSettingFrame;'+key,calls=[];
 const c={verified:true,binding_ready:true,fields:[field],selected:field,state:'settings',intervals:[],
  frame:{record_id:'X',switches:[],controls:{[key]:owner},values:{'cbbTileCount;ValueControl':2,chkRoundingLevel:false,'chkLowerLimitOpen;ValueControl':false,'chkUpperLimitOpen;ValueControl':false,'chkSummTile;ValueControl':false}},
  settings:{method:'frequency',size:2,limits:null,ties:initial,sums:false,rounding:false,lower_open:false,upper_open:false}};
 const s={wizard:{root_tid:'W',stage:'binning'},node_binning:c,ui:{elements:[{tid:owner+';trg_picker',ref:'picker',allowed_actions:['click']},{tid:'W;btnNext',ref:'advance',allowed_actions:['wizard_step']}]}};
 const channel={observe:async o=>{assert.ok(o.ready(s),o.condition);return structuredClone(s);},perform:async o=>{
  assert.ok(o.ready(s));const a=o.resolve(s);calls.push(a);
  if(a.ref==='picker')s.ui.elements=[{tid:owner+';boundlist;1',label:'Сохранять в текущем',ref:'current',allowed_actions:['click']},
   {tid:'foreign;boundlist;1',label:'Сохранять в текущем',ref:'foreign',allowed_actions:['click']},
   {tid:owner+';boundlist;0',label:'Добавлять в следующий',ref:'next',allowed_actions:['click']}];
  else if(['current','next'].includes(a.ref)){if(!stale)c.settings.ties=a.ref;s.ui.elements=[{tid:'W;btnNext',ref:'advance',allowed_actions:['wizard_step']}];}
  else if(a.verb==='wizard_step')s.wizard.stage=a.expected_stage;
  else assert.fail('unexpected tie choice '+JSON.stringify(a));
 }};
 const run=()=>configureBinning(channel,{binning:{field:'X',method:'frequency',size:2,...(requested===null?{}:{ties:requested})}},
  {request:{mode:'internal'},inputMapping:{target_fields:[{name:'X',label:'X',type:'real'}]}});
 return {run,calls};
}
test('frequency current selects the owned native option and returns observed current policy',async()=>{
 const f=await frequencyCurrent(),r=await f.run();assert.equal(r.configuration.ties,'current');
 assert.deepEqual(f.calls.filter(a=>a.verb==='click').map(a=>a.ref),['picker','current']);
});
test('frequency current refuses stale next readback before accepting the wizard',async()=>{
 const f=await frequencyCurrent({stale:true});await assert.rejects(f.run(),/final settings differ/);
 assert.equal(f.calls.some(a=>a.verb==='wizard_step'),false);
});
test('frequency default next resets saved current via the owned picker',async()=>{
 const f=await frequencyCurrent({initial:'current',requested:null});
 const r=await f.run();assert.equal(r.configuration.ties,'next');
 assert.deepEqual(f.calls.filter(a=>a.verb==='click').map(a=>a.ref),['picker','next']);
});
test('frequency current already selected does not replay the picker',async()=>{
 const f=await frequencyCurrent({initial:'current'}),r=await f.run();
 assert.equal(r.configuration.ties,'current');assert.equal(f.calls.some(a=>a.verb==='click'),false);
});

async function automaticMode(method,{stale=false,manual=false}={}){
 const sd=method==='sd',field={index:0,record_id:'X',label:'X',type:'real',method_code:sd?5:3,bins_count:manual?2:0,automatic:false},calls=[];
 const values={chkStrictLowerLimit:true,chkStrictUpperLimit:true,edtLowerLimit:0,edtUpperLimit:20,'cbbCountBins;ValueControl':2,
  'cbbSDBinsMode;ValueControl':1,chkRoundingLevel:false,'chkLowerLimitOpen;ValueControl':false,'chkUpperLimitOpen;ValueControl':false};
 const c={verified:true,binding_ready:true,fields:[field],selected:field,state:manual?'materialized':'settings',
  intervals:manual?[{lower:-3,upper:1,lower_included:false,upper_included:false,label:'Low'},{lower:1,upper:15,lower_included:true,upper_included:false,label:'High'}]:[],
  frame:{record_id:'X',switches:[],values,controls:Object.fromEntries(Object.keys(values).map(k=>[k,'MethodSettingFrame;'+k]))},
  settings:{method,size:sd?null:2,limits:sd?null:[0,20],sd_coefficient:2,strict_lower:true,strict_upper:true,rounding:false,lower_open:false,upper_open:false}};
 if(manual)Object.assign(c.settings,{sd_coefficient:1,lower_open:true,upper_open:true});
 const elements=()=>[{tid:'W;btnNext',ref:'next',allowed_actions:['wizard_step']},
  {tid:'MethodSettingFrame;cbbSDBinsMode;ValueControl;trg_picker',ref:'sd-picker',allowed_actions:['click']},
  ...Object.keys(values).map(k=>({tid:'MethodSettingFrame;'+k+(typeof values[k]==='boolean'?';DisplayEl':''),ref:k,allowed_actions:[typeof values[k]==='boolean'?'set_checked':'click']}))];
 const s={wizard:{root_tid:'W',stage:'binning'},node_binning:c,ui:{elements:elements()}};
 const channel={observe:async o=>{assert.ok(o.ready(s),o.condition);return structuredClone(s);},perform:async o=>{
  assert.ok(o.ready(s));const a=o.resolve(s);calls.push(a);
  if(a.verb==='set_checked'){
   values[a.ref]=a.checked;
   const k={chkStrictLowerLimit:'strict_lower',chkStrictUpperLimit:'strict_upper','chkLowerLimitOpen;ValueControl':'lower_open','chkUpperLimitOpen;ValueControl':'upper_open'}[a.ref];
   c.settings[k]=a.checked;
   if(!sd&&!c.settings.strict_lower&&!c.settings.strict_upper)c.settings.limits=null;
  }else if(a.ref==='cbbSDBinsMode;ValueControl'){} // A focus-only input is modeled here; external portal visibility needs the node-procedure test.
  else if(a.ref==='sd-picker')s.ui.elements=[{tid:'MethodSettingFrame;cbbSDBinsMode;ValueControl;boundlist;one',ref:'sd-one',label:'+/- 1 СКО',allowed_actions:['click']},
   {tid:'foreign;boundlist;one',ref:'foreign',label:'+/- 1 СКО',allowed_actions:['click']}];
  else if(a.ref==='sd-one'){if(!stale){c.settings.sd_coefficient=1;values['cbbSDBinsMode;ValueControl']=0;}s.ui.elements=elements();}
  else if(a.verb==='wizard_step')s.wizard.stage=a.expected_stage;
  else assert.fail('unexpected automatic mode action '+JSON.stringify(a));
 }};
 const wanted=manual?{field:'X',method:'manual',intervals:c.intervals.map(b=>({...b}))}:{field:'X',method,...(sd?{sd_coefficient:1}:{size:2})};
 return {calls,run:()=>configureBinning(channel,{binning:wanted},{request:{mode:'internal'},[manual?'preconfiguration':'inputMapping']:{target_fields:[{name:'X',label:'X',type:'real'}]}})};
}
test('auto turns off both previously explicit limits without writing disabled boundary inputs',async()=>{
 const f=await automaticMode('count'),r=await f.run();assert.equal(r.configuration.limits,null);
 assert.deepEqual(f.calls.filter(a=>a.verb==='set_checked').map(a=>[a.ref,a.checked]),[['chkStrictLowerLimit',false],['chkStrictUpperLimit',false]]);
});
test('SD selects the owned ±1 option from native default ±2 and opens both tails',async()=>{
 const f=await automaticMode('sd'),r=await f.run();assert.equal(r.configuration.sd_coefficient,1);
 assert.deepEqual(f.calls.filter(a=>a.verb==='click').map(a=>a.ref),['sd-picker','sd-one']);
 assert.equal(r.configuration.open_ends,true);
});
test('SD refuses a stale coefficient before accepting settings',async()=>{
 const f=await automaticMode('sd',{stale:true});await assert.rejects(f.run(),/final settings differ/);
 assert.equal(f.calls.some(a=>a.verb==='wizard_step'),false);
});
test('manual preserves saved SD open tails and false outer inclusion without selecting a method',async()=>{
 const f=await automaticMode('sd',{manual:true}),r=await f.run();
 assert.equal(r.configuration.manual_edits,true);assert.equal(r.configuration.state,'materialized');
 assert.equal(r.configuration.intervals[0].lower_included,false);assert.equal(r.configuration.intervals.at(-1).upper_included,false);
 assert.deepEqual(f.calls.map(a=>a.verb),['wizard_step','wizard_step','wizard_step']);
});
