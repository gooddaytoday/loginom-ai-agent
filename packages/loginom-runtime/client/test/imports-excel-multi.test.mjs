import test from 'node:test';
import assert from 'node:assert/strict';
import {validateExcelParameters} from '../lib/imports-excel-parameters.mjs';
import {excelConfigureCapability} from '../lib/imports-excel-procedure.mjs';

const columns=[{name:'Id',label:'Id',type:'integer'},{name:'Amount',label:'Amount',type:'integer'}];
const refs={kind:'verified_sources',sources:[{kind:'storage',server_source_ref:'a'},{kind:'storage',server_source_ref:'b'}]};
const list={source:refs,excel:{source_paths:['/own/in/sales-a.xlsx','/own/in/sales-b.xlsx'],sheet_name:'Data',header_rows:1,columns}};
const mask={source:refs,excel:{source_mask:'/own/in/sales-*.xlsx',sheet_name:'Data',header_rows:1,columns}};
const request={target:{kind:'new',type:'imports.excel'},inputs:[],mappings:[],finish:'execute',read:{ports:[0]}};
const with_=(p,excel)=>({...p,excel:{...p.excel,...excel}});

test('Excel admits an ordered list or one mask with one verified ref per file',()=>{
 for(const p of [list,mask,with_(list,{parallel_processing:false}),with_(mask,{parallel_processing:true,max_threads:2}),with_(mask,{parallel_processing:true,max_threads:'auto'})])
  assert.doesNotThrow(()=>validateExcelParameters(structuredClone(p),'xlsx',request));
 assert.doesNotThrow(()=>validateExcelParameters(structuredClone(list),'xlsx',{...request,target:{kind:'existing',type:'imports.excel'}}));
});
test('lists and masks refuse ambiguous sources, threads without parallel reading and bindings',()=>{
 const refused=[
  [{...list,source:{kind:'storage',server_source_ref:'a'}},/verified_sources/],
  [{source:refs,excel:{source_path:'/own/in/sales-a.xlsx',sheet_name:'Data',header_rows:1,columns}},/verified_sources/],
  [with_(list,{source_path:'/own/in/sales-a.xlsx'}),/choose one/],
  [with_(list,{source_mask:'/own/in/*.xlsx'}),/choose one/],
  [with_(list,{source_paths:['/own/in/sales-a.xlsx']}),/source_paths/],
  [with_(list,{source_paths:['/own/in/sales-a.xlsx','/own/in/sales-a.xlsx']}),/source_paths/],
  [with_(list,{source_paths:['/own/in/sales-a.xlsx','/own/in/sales-b.csv']}),/source_paths/],
  [{...list,source:{...refs,sources:refs.sources.slice(0,1)}},/source_paths/],
  [with_(mask,{source_mask:'/own/*/sales-a.xlsx'}),/source_mask/],
  [with_(mask,{source_mask:'/own/in/sales-a.xlsx'}),/source_mask/],
  [with_(mask,{source_mask:'/own/in/sales-*.csv'}),/source_mask/],
  [with_(mask,{source_mask:'/own/in/sales-?.xlsx'}),/source_mask/],
  [with_(mask,{max_threads:2}),/max_threads/],
  [with_(mask,{parallel_processing:false,max_threads:2}),/max_threads/],
  [with_(mask,{parallel_processing:true,max_threads:3}),/max_threads/],
  [{source:{kind:'storage',server_source_ref:'a'},excel:{source_path:'/own/in/sales-a.xlsx',parallel_processing:true,sheet_name:'Data',header_rows:1,columns}},/parallel_processing/],
 ];
 for(const [p,error] of refused)assert.throws(()=>validateExcelParameters(structuredClone(p),'xlsx',request),error,JSON.stringify(p.excel));
 const bound={...request,variable_inputs:[{kind:'variables',input:0,output:4,source:{node_id:'vars'}}],bindings:[{parameter:'/excel/source_path',variable:{kind:'variables',input:0,name:'ExcelPath'}}]};
 assert.throws(()=>validateExcelParameters(structuredClone({...mask,excel:{...mask.excel,source_mask:undefined}}),'xlsx',bound),/dock_storage_source|verified_sources|binding/);
 assert.throws(()=>validateExcelParameters(structuredClone({...mask,source_switch:{profile_id:'p',save_operation_id:'s'}}),'xlsx',{...request,target:{kind:'existing',type:'imports.excel'}}),/binding or source_switch/);
});

function wizard(excel,{parallel=false,threads='Автоопределение',saved='/own/in/old.xlsx'}={}){
 const root='MF;TF;WizrdMCF',file=root+';ImportExcelFilePreviewWizard;',defs=root+';ImportExcelColumnDefsWizard;',grid=defs+'ColumnDefsTuning;grdSettings;grd-1';
 const check=file+'chkParallelProcessing;ValueControl',combo=file+'cbbMaxThreadCount;ValueControl';
 let stage=0,target,open=null;const clicks=[],fills=[],presses=[];
 const values=new Map([[file+'edtFileName;ValueControl',saved],[file+'cbbTableNamingMethod;ValueControl','По имени'],[file+'cbbTableName;ValueContainer;cbx','Data'],
  [file+'cbbActionBlankRow;ValueControl','Импортировать'],[file+'edtTitleRowCount;ValueControl','1'],[defs+'cbbAutoDetectColumnsMode;ValueControl','Нет'],[combo,threads]]);
 const fields=['Id','Amount'].map(name=>({name,label:name,type:'Целый',data_kind:'Непрерывный',used:true}));
 const locator=tid=>({count:async()=>tid==='masks'?0:1,locator:()=>locator(tid),getByRole:(_,{name})=>locator(combo+';boundlist;'+name),
  // Native filename field: a plain fill keeps a saved U+FF5C list and appends.
  inputValue:async()=>values.get(tid)??'',fill:async v=>{fills.push([tid,String(v)]);values.set(tid,(String(values.get(tid)??'').includes('｜')?values.get(tid):'')+String(v));},
  press:async key=>{presses.push([tid,key]);if(key==='Backspace'&&presses.at(-2)?.[1]==='Control+A')values.set(tid,'');},
  evaluate:async fn=>{const code=fn.toString();if(code.includes('getBoundingClientRect')){target=tid;return{x:1,y:1};}
   if(code.includes('x-form-cb-checked'))return tid===check?parallel:true;return true;},
  isVisible:async()=>tid===root+';btnError'?false:tid===file+'edtFileName;ValueControl'?stage===0:tid===file+'edtFileName;VariableControl'?false
   :tid===combo+';boundlist'?open===combo:tid===grid?stage===1:tid.includes('ColumnsMappingEngineOutputPortWizard')?stage===2:tid===root+';DoneWizard'?stage===3:true});
 const source=()=>({source_path:values.get(file+'edtFileName;ValueControl'),sheet_method:'По имени',sheet:values.get(file+'cbbTableName;ValueContainer;cbx'),
  header_rows:Number(values.get(file+'edtTitleRowCount;ValueControl')),whole_sheet:true,blank_rows:'Импортировать',parallel_processing:parallel,max_threads:values.get(combo)});
 const page={locator:s=>s.startsWith('.x-mask')?locator('masks'):locator(JSON.parse(s.slice('[data-tid='.length,-1))),
  mouse:{click:async()=>{clicks.push(target);if(target===root+';btnNext')stage++;if(target===check+';DisplayEl')parallel=!parallel;
   if(target===combo+';trg_picker')open=combo;if(target?.startsWith(combo+';boundlist;')){values.set(combo,target.slice((combo+';boundlist;').length));open=null;}}},
  evaluate:async(fn,arg)=>arg?.grid?structuredClone(fields):arg?.file?source():arg?.origin?true:stage,waitForTimeout:async()=>{}};
 const t={deadline:Date.now()+10000,document_id:'doc',workflow_ref:{prefix:'MF;TF'},node:{document_id:'doc',workflow_id:'wf',node_id:'excel'},excel,origin:'https://test'};
 return {clicks,fills,file,check,combo,run:()=>excelConfigureCapability(page,t,async()=>({verified:true,surface:'wizard',node_id:'excel'}))};
}
test('the native filename input receives the U+FF5C list and stays sequential by default',async()=>{
 const w=wizard(list.excel,{parallel:true}),r=await w.run();
 assert.equal(r.verified,true,r.error);
 assert.deepEqual(w.fills[0],[w.file+'edtFileName;ValueControl','/own/in/sales-a.xlsx｜/own/in/sales-b.xlsx']);
 assert.ok(w.clicks.includes(w.check+';DisplayEl'),'parallel reading is switched off for a list');
 assert.equal(r.configuration.source.source_path,'/own/in/sales-a.xlsx｜/own/in/sales-b.xlsx');
 assert.equal(r.configuration.source.parallel_processing,false);
});
test('a mask with two threads enables parallel reading before choosing the thread count',async()=>{
 const w=wizard({...mask.excel,parallel_processing:true,max_threads:2}),r=await w.run();
 assert.equal(r.verified,true,r.error);
 assert.deepEqual(w.fills[0],[w.file+'edtFileName;ValueControl','/own/in/sales-*.xlsx']);
 const at=name=>w.clicks.indexOf(name);
 assert.ok(at(w.check+';DisplayEl')>=0&&at(w.check+';DisplayEl')<at(w.combo+';trg_picker')&&at(w.combo+';trg_picker')<at(w.combo+';boundlist;2'));
 assert.equal(r.configuration.source.parallel_processing,true);
 assert.equal(r.configuration.source.max_threads,'2');
});
test('the SAME node replaces its saved list with the mask, not appending it',async()=>{
 const w=wizard(mask.excel,{saved:'/own/in/sales-a.xlsx｜/own/in/sales-b.xlsx'}),r=await w.run();
 assert.equal(r.verified,true,r.error);
 assert.equal(r.configuration.source.source_path,'/own/in/sales-*.xlsx');
});
test('one workbook keeps the saved parallel setting untouched',async()=>{
 const w=wizard({source_path:'/own/in/sales-a.xlsx',sheet_name:'Data',header_rows:1,columns},{parallel:true}),r=await w.run();
 assert.equal(r.verified,true,r.error);
 assert.ok(!w.clicks.some(c=>c?.startsWith(w.check)||c?.startsWith(w.combo)));
});
