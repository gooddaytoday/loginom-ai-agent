import test from 'node:test';
import assert from 'node:assert/strict';
import {configureSmoothing} from '../lib/smoothing-procedure.mjs';
import {validateUiAction} from '../lib/workspace-ui.mjs';
function fixture(wavelet=false,transition=false,faults={}){
 let editor=false,list=false,boundaryList=false;
 const fields=[{index:0,record_id:'x',name:'X',label:'X',type:'integer',data_kind:'Непрерывный',used:false,algorithm:0},{index:1,record_id:'r',name:'R',label:'R',type:'real',data_kind:'Непрерывный',used:true,algorithm:0}];
 if(wavelet)for(const f of fields)f.algorithm=1;
 const inputMapping={verified:true,inventory_complete:true,target_fields:[...structuredClone(fields),{name:'Tag',label:'Tag',type:'string',data_kind:'Дискретный'}]};
 const settings=new Map(fields.map(f=>[f.record_id,wavelet?{family:'daubechies',order:1,depth:1,boundary:faults.boundary??'symmetric'}:{lambda:1600,period:39.7,strength:'lambda'}])),actions=[];
 const state={wizard:{status:'observed',stage:'smoothing',root_tid:'W'},node_smoothing:{verified:true,inventory_complete:true,binding_ready:true,fields,selected:null,settings:null,node_context:{verified:true,node_id:'n'}},ui:{elements:[]}};
 const base='W;SmoothingWizard;';
 function refresh(){
  const selected=state.node_smoothing.selected;state.node_smoothing.settings=selected?.used?settings.get(selected.record_id):null;
  state.ui.elements=fields.flatMap(f=>(transition?['field','used','algorithm']:['field','used']).map(part=>({tid:base+(part==='field'?'colDisplayName_':part==='algorithm'?'colAlgorithm_':'colUsable_')+f.name,ref:'ui-'+f.record_id+'-'+part,smoothing_cell:{part,record_id:f.record_id},allowed_actions:part==='algorithm'?['click','double_click']:['click']})));
  if(editor&&!list)state.ui.elements.push({tid:base+'grdColumnsSettings;tbl;celleditor;cbx;trg_picker',ref:'ui-algorithm-picker',allowed_actions:['click']});
  if(list)state.ui.elements.push({tid:base+'grdColumnsSettings;tbl;celleditor;cbx;boundlist;Вейвлет-сглаживание',ref:'ui-wavelet-option',allowed_actions:['click']});
  if(selected?.used&&(wavelet||selected.algorithm===1))for(const key of ['edtWaveletOrder','edtDecompositionLevel'])state.ui.elements.push({tid:base+key+';ValueControl',ref:'ui-'+key,allowed_actions:['fill','press']});
  if(selected?.used&&selected.algorithm===1){
   state.ui.elements.push({tid:base+'edtEdgeExtension;ValueControl;trg_picker',ref:'ui-boundary-picker',allowed_actions:['click']});
   if(boundaryList)for(const [index,label] of ['Антисимметричное','Симметричное без крайней точки','Симметричное'].entries())state.ui.elements.push({tid:base+'edtEdgeExtension;ValueControl;boundlist;'+label.replaceAll(' ','_'),label,ref:'ui-boundary-'+index,allowed_actions:['click']});
  }
  if(selected?.used&&!wavelet&&selected.algorithm===0)for(const title of ['Lambda','Period'])for(const kind of ['rb','edt']){
   const key=kind+title+';ValueControl'+(kind==='rb'?';DisplayEl':'');
   state.ui.elements.push({tid:base+key,identity:{anchor_tid:base+key},ref:'ui-'+key.replaceAll(';','-'),allowed_actions:kind==='rb'?['click']:['fill','press']});
  }
 }
 const channel={async observe(options){refresh();assert.ok(options.ready(state),options.condition);return structuredClone(state);},async perform(options){
  refresh();assert.ok(options.ready(state),options.condition);const action=options.resolve(state);validateUiAction(action,state);actions.push(action);
  const cell=state.ui.elements.find(e=>e.ref===action.ref)?.smoothing_cell;
  if(cell?.part==='algorithm'){editor=true;list=!faults.pickerOnly;}
  else if(action.ref==='ui-algorithm-picker')list=true;
  else if(action.ref==='ui-boundary-picker')boundaryList=true;
  else if(/^ui-boundary-[012]$/.test(action.ref)){settings.get(state.node_smoothing.selected.record_id).boundary=['Антисимметричное','Симметричное без крайней точки','symmetric'][Number(action.ref.at(-1))];boundaryList=false;}
  else if(action.ref==='ui-wavelet-option'){const selected=state.node_smoothing.selected;selected.algorithm=1;settings.set(selected.record_id,{family:'daubechies',order:1,depth:1,boundary:'symmetric'});editor=false;list=false;}
  else if(cell){state.node_smoothing.selected=fields.find(f=>f.record_id===cell.record_id);if(cell.part==='used')state.node_smoothing.selected.used=!state.node_smoothing.selected.used;}
  else {
   const setting=settings.get(state.node_smoothing.selected.record_id),key=(wavelet||state.node_smoothing.selected.algorithm===1)?(action.ref.includes('Order')?'order':'depth'):action.ref.includes('Lambda')?'lambda':'period';
   if(action.verb==='click')setting.strength=key;
   if(action.verb==='fill'&&!(faults.ignoreDepth&&key==='depth')){setting[key]=Number(action.text);if(key==='lambda'&&setting.lambda===1)setting.period=6;}
  }
  refresh();
 }};
 return {channel,inputMapping,actions,settings,state};
}
test('HP production procedure binds each enabled field and verifies lambda or period',async()=>{
 const f=fixture(),result=await configureSmoothing(f.channel,{smoothing:[{field:'X',lambda:1},{field:'R',period:6}]},f);
 assert.deepEqual(result.configuration.fields.map(f=>[f.name,f.used,f.strength,f[f.strength]]),[['X',true,'lambda',1],['R',true,'period',6]]);
 assert.equal(result.configuration.input_fields.at(-1).name,'Tag');
 assert.equal(f.actions.filter(a=>a.ref==='ui-x-used').length,1);
 assert.equal(f.actions.filter(a=>a.verb==='fill').length,2);
});
test('HP production procedure preserves omission and disables all with explicit empty rules',async()=>{
 const f=fixture(),kept=await configureSmoothing(f.channel,{},f);
 assert.equal(kept.configuration.fields[1].lambda,1600);
 assert.equal(f.actions.filter(a=>a.verb==='fill'||a.ref.endsWith('-used')).length,0);
 const cleared=await configureSmoothing(f.channel,{smoothing:[]},f);
 assert.equal(cleared.configuration.fields.some(f=>f.used),false);
});

test('Haar procedure changes depth on the same field and preserves omitted rules',async()=>{
 const f=fixture(true),rule={field:'X',family:'daubechies',order:1,depth:2,boundary:'symmetric'};
 const result=await configureSmoothing(f.channel,{smoothing:[rule]},{...f,mode:'wavelet'});
 assert.equal(result.configuration.mode,'wavelet');
 assert.deepEqual(result.configuration.fields.filter(f=>f.used).map(({name,family,order,depth,boundary})=>({field:name,family,order,depth,boundary})),[rule]);
 assert.equal(f.actions.filter(a=>a.verb==='fill').length,1);
 const kept=await configureSmoothing(f.channel,{}, {...f,mode:'wavelet'});
 assert.equal(kept.configuration.fields[0].depth,2);
 assert.equal(f.actions.filter(a=>a.verb==='fill').length,1);
});

test('native algorithm double click already opens the owned boundlist without a picker gesture',async()=>{
 const f=fixture(false,true),rule={field:'X',family:'daubechies',order:1,depth:2,boundary:'symmetric'};
 const result=await configureSmoothing(f.channel,{smoothing:[rule]},{...f,mode:'wavelet'});
 assert.equal(result.configuration.fields.find(f=>f.name==='X').algorithm,1);
 assert.equal(result.configuration.fields.find(f=>f.name==='X').depth,2);
 assert.equal(f.actions.some(a=>a.ref.includes('trg_picker')),false);
 assert.equal(f.actions.filter(a=>a.ref==='ui-wavelet-option').length,1);
});

test('existing HP settings cannot be silently reused as wavelet when rules are omitted',async()=>{
 const f=fixture(),before=structuredClone([...f.settings]);
 await assert.rejects(configureSmoothing(f.channel,{}, {...f,mode:'wavelet'}),/Smoothing:/);
 assert.deepEqual([...f.settings],before);
 assert.ok(f.actions.every(a=>a.verb==='click'&&a.ref.endsWith('-field')),'only field inspection is permitted before refusal');
});
test('HP refuses a saved Haar algorithm before any UI mutation, including an unused field',async()=>{
 for(const unusedOnly of [false,true]){
  const f=fixture(true,true);
  if(unusedOnly)f.state.node_smoothing.fields[1].algorithm=0;
  await assert.rejects(configureSmoothing(f.channel,{smoothing:[{field:'X',lambda:1}]},{...f,mode:'hodrick_prescott'}),/wavelet settings unsupported/);
  assert.deepEqual(f.actions,[]);
 }
});
test('wavelet refuses a depth editor that did not apply the requested fill',async()=>{
 const f=fixture(true,false,{ignoreDepth:true});
 await assert.rejects(configureSmoothing(f.channel,{smoothing:[{field:'X',family:'daubechies',order:1,depth:2,boundary:'symmetric'}]},{...f,mode:'wavelet'}),/wavelet settings differ/);
 assert.equal(f.settings.get('x').depth,1);
 assert.ok(f.actions.some(a=>a.verb==='fill'&&a.ref==='ui-edtDecompositionLevel'&&a.text==='2'));
});
test('algorithm picker is opened when double click leaves only the editor visible',async()=>{
 const f=fixture(false,true,{pickerOnly:true});
 const result=await configureSmoothing(f.channel,{smoothing:[{field:'X',family:'daubechies',order:1,depth:1,boundary:'symmetric'}]},{...f,mode:'wavelet'});
 assert.equal(result.configuration.fields.find(f=>f.name==='X').algorithm,1);
 assert.deepEqual(f.actions.filter(a=>['ui-x-algorithm','ui-algorithm-picker','ui-wavelet-option'].includes(a.ref)).map(a=>[a.verb,a.ref]),[['double_click','ui-x-algorithm'],['click','ui-algorithm-picker'],['click','ui-wavelet-option']]);
});
for(const boundary of ['Антисимметричное','Симметричное без крайней точки'])test('boundary selection excludes '+boundary,async()=>{
 const f=fixture(true,false,{boundary});
 const result=await configureSmoothing(f.channel,{smoothing:[{field:'X',family:'daubechies',order:1,depth:1,boundary:'symmetric'}]},{...f,mode:'wavelet'});
 assert.equal(result.configuration.fields.find(f=>f.name==='X').boundary,'symmetric');
 assert.deepEqual(f.actions.filter(a=>a.ref.startsWith('ui-boundary-')).map(a=>a.ref),['ui-boundary-picker','ui-boundary-2']);
});
