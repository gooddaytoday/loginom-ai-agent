import test from 'node:test';
import assert from 'node:assert/strict';
import {validateExcelParameters} from '../lib/imports-excel-parameters.mjs';
import {verifyExcelFullCount} from '../lib/imports-excel-node.mjs';
import {excelConfigureCapability} from '../lib/imports-excel-procedure.mjs';

const parameters={source:{artifact_id:'book',upload_operation_id:'upload'},excel:{source_path:'/worker/named.xlsx',named_range:'SalesRange',extend_range:false,header_rows:1,
 columns:['Id','Amount'].map(name=>({name,label:name,type:'integer'}))}};
const request={target:{kind:'new'},inputs:[],mappings:[],finish:'execute',read:{ports:[0]}};
test('C3 accepts an exact named range and explicit fixed/extended boundaries',()=>{
 for(const extend_range of [false,true])assert.doesNotThrow(()=>validateExcelParameters({...parameters,excel:{...parameters.excel,extend_range}},'xlsx',request));
 const excel={...parameters.excel};delete excel.extend_range;
 assert.doesNotThrow(()=>validateExcelParameters({...parameters,excel},'xlsx',request));
});
test('C3 rejects conflicting, malformed and partial region settings before mutation',()=>{
 for(const patch of [{sheet_name:'Data'},{named_range:''},{named_range:'Sales\nRange'},{named_range:'x'.repeat(121)},{extend_range:'true'},{named_range:undefined}])
  assert.throws(()=>validateExcelParameters({...parameters,excel:{...parameters.excel,...patch}},'xlsx',request),/Excel import:/);
 const excel={...parameters.excel};delete excel.named_range;
 assert.throws(()=>validateExcelParameters({...parameters,excel},'xlsx',request),/Excel import:/);
 assert.throws(()=>validateExcelParameters({...parameters,source_switch:{profile_id:'p',save_operation_id:'save'}},'xlsx',{...request,target:{kind:'existing'}}),/source_switch/);
});
test('C3 never promotes a whole-sheet backend scan to named-range N proof',()=>{
 const result=verifyExcelFullCount('p',{xlsx:{sheet_name:'Data',sheet_index:1,header_rows:1,blank_rows:'import'}},{},
  {source:{sheet_method:'Именованный диапазон',sheet:'SalesRange',named_range:'SalesRange',extend_range:true,header_rows:1,whole_sheet:true,blank_rows:'Импортировать'}},{row_count:3},{});
 assert.equal(result.status,'not_verified');
});
test('C3 waits for a remounted range control before dispatching its header edit',async()=>{
 let counts=0,fills=0,waits=0,value='1';
 const locator=selector=>({
  locator:()=>locator(selector),isVisible:async()=>true,
  count:async()=>selector.startsWith('.x-mask')?0:selector.includes('edtTitleRowCount')&&++counts===1?0:1,
  inputValue:async()=>selector.includes('edtFileName')?parameters.excel.source_path:selector.includes('cbbTableNamingMethod')?'Именованный диапазон':selector.includes('cbbTableName;')?'SalesRange':selector.includes('cbbActionBlankRow')?'Импортировать':value,
  evaluate:async fn=>fn.toString().includes('classList')?false:{x:1,y:1},
  fill:async v=>{fills++;value=v;},press:async()=>{throw Error('Header dispatched');},
 });
 const page={locator,evaluate:async()=>true,waitForTimeout:async()=>{waits++;}};
 const result=await excelConfigureCapability(page,{deadline:Date.now()+10000,document_id:'doc',workflow_ref:{prefix:'MF;TF'},node:{node_id:'excel'},excel:parameters.excel},async()=>({verified:true,surface:'wizard',node_id:'excel'}));
 assert.equal(waits,1);assert.equal(fills,1);assert.match(result.error,/Header dispatched/);
});
