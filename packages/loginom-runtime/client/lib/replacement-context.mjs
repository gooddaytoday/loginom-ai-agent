import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
export function makeReplacementContextCode(binding){validatePreparedNodeContext(binding);return `async page=>(${readReplacementContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readReplacementBrowser.toString()})`;}
export async function readReplacementContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readReplacementBrowser){
 const before=await readNode(page,binding);
 if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'replacement_node_surface'};
 const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'replacement_node_changed'};
 return {...result,node_context:after};
}
// Inventory is bound to materialized Ext records. Read only the native value
// properties of those exact pairs; render caches cannot prove NULL semantics.
export async function readReplacementBrowser(prefix){
 const fail=reason=>({verified:false,reason}),base=prefix+';WizrdMCF;ReplaceColumnsWizard;';
 const exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
 const roots=exact(base.slice(0,-1));if(roots.length!==1||!roots[0].checkVisibility({checkVisibilityCSS:true}))return fail('replacement_root');
 const cmp=k=>{const es=exact(base+k);if(es.length!==1||!roots[0].contains(es[0]))return null;const c=globalThis.Ext?.getCmp?.(es[0].id);return c?.el?.dom===es[0]?c:null;};
 const records=(c,proxy,max)=>{const s=c?.getStore?.(),d=s?.getData?.(),rs=d?.items,source=d?.getSource?.()?.items;
  return s?.$className==='Ext.data.Store'&&s.getProxy?.()?.$className===proxy&&s.getProxy().pendingOperations&&Object.keys(s.getProxy().pendingOperations).length===0&&!s.isLoading?.()&&!s.isBufferedStore&&Array.isArray(rs)&&rs.length<=max&&s.getCount()===rs.length&&(!source||source.length===rs.length&&source.every(r=>rs.includes(r)))?rs:null;};
 const grid=cmp('grdDataList'),rs=records(grid,'bg.ext.CollectionProxy',1000);if(!rs)return fail('replacement_input_inventory');
 const types={1:'boolean',2:'datetime',3:'real',4:'integer',5:'string',6:'variant'},fields=[],names=new Set(),ids=new Set();
 for(const r of rs){const d=r?.data,id=String(r?.internalId??'');
  if(!r?.isModel||!id||ids.has(id)||typeof d?.Name!=='string'||!d.Name||d.Name.length>128||names.has(d.Name.toLowerCase())||typeof d.DisplayName!=='string'||!types[d.DataType]||![0,1].includes(d.ReplaceMode))return fail('replacement_input_record');
  names.add(d.Name.toLowerCase());ids.add(id);fields.push({record_id:id,name:d.Name,label:d.DisplayName,type:types[d.DataType],mode:d.ReplaceMode===0?'none':'manual'});
 }
 const selected=grid.getSelectionModel?.().getSelection?.();if(!Array.isArray(selected)||selected.length>1||selected.some(r=>!rs.includes(r)))return fail('replacement_selection');
 const selectedRecord=selected[0],field=selected.length?fields[rs.indexOf(selectedRecord)]:null;
 const disabledGrid=cmp('grdReplaceItems');
 if([...document.querySelectorAll('.x-mask,.x-mask-msg,.bg-mask-message')].some(e=>e.checkVisibility({checkVisibilityCSS:true})&&!(disabledGrid?.disabled===true&&(!field||field.mode==='none')&&e.parentElement===disabledGrid.el.dom&&e.classList.contains('x-mask'))))return fail('replacement_mask');
 if(!field)return {verified:true,inventory_complete:true,input_fields:fields,selected:null,pairs:[],settings_applied:false};
 const materialized=records(cmp('grdReplaceItems'),'bg.ext.CollectionListProxy',512);if(!materialized)return fail('replacement_table_inventory');const rows=[...materialized];
 const typed=(v,type)=>{
  if(v===null)return {type,value:null};
  if(type==='string'&&typeof v==='string'&&v.length<=2048)return {type,value:v};
  if(type==='real'&&typeof v==='number'&&Number.isFinite(v))return {type,value:v};
  if(type==='integer'){
   let n;
   if(typeof v==='bigint'||typeof v==='number'&&Number.isSafeInteger(v))n=BigInt(v);
   else if(v&&typeof v==='object'){
    const d=Object.getOwnPropertyDescriptors(v),lo=d.lo?.value,hi=d.hi?.value;
    if(Object.keys(d).sort().join(',')==='hi,lo'&&Number.isInteger(lo)&&lo>=0&&lo<=4294967295&&Number.isInteger(hi)&&hi>=-2147483648&&hi<=4294967295)n=BigInt.asIntN(64,(BigInt(hi>>>0)<<32n)|BigInt(lo));
   }
   if(n!==undefined&&n>=-9223372036854775808n&&n<=9223372036854775807n)return {type,value:String(n)};
  }
  return null;
 };
 if(rows.some(r=>!r?.isModel||!r.data))return fail('replacement_table_record');
 const inputGrid=grid,tableGrid=cmp('grdReplaceItems'),inputStore=grid.getStore(),tableStore=tableGrid.getStore();
 const inputProxy=inputStore.getProxy(),tableProxy=tableStore.getProxy();
 const snapshot=(r,keys)=>({record:r,data:r.data,id:r.internalId,model:r.isModel,values:keys.map(k=>r.data[k])});
 const inputKeys=['Name','DisplayName','DataType','ReplaceMode','Index','ReplaceTable'];
 const rowKeys=['Index','CollectionID','DataValueType','ReplaceByType','DataValue','ReplaceBy'];
 const inputs=rs.map(r=>snapshot(r,inputKeys)),boundRows=rows.map(r=>({...snapshot(r,rowKeys),from:JSON.stringify(typed(r.data.ValueRender,field.type)),to:JSON.stringify(typed(r.data.ReplaceRender,field.type))}));
 const unchanged=(captured,current,keys)=>Array.isArray(current)&&current.length===captured.length&&captured.every((b,i)=>current[i]===b.record&&b.record.data===b.data&&b.record.internalId===b.id&&b.record.isModel===b.model&&keys.every((k,j)=>b.data[k]===b.values[j]));
 const stable=()=>{
  const currentInputs=records(inputGrid,'bg.ext.CollectionProxy',1000),currentRows=records(tableGrid,'bg.ext.CollectionListProxy',512),selection=inputGrid.getSelectionModel?.().getSelection?.();
  return roots[0].checkVisibility({checkVisibilityCSS:true})&&cmp('grdDataList')===inputGrid&&cmp('grdReplaceItems')===tableGrid&&inputGrid.getStore()===inputStore&&tableGrid.getStore()===tableStore&&inputStore.getProxy()===inputProxy&&tableStore.getProxy()===tableProxy&&selection?.length===1&&selection[0]===selectedRecord&&unchanged(inputs,currentInputs,inputKeys)&&unchanged(boundRows,currentRows,rowKeys)&&boundRows.every(b=>b.from===JSON.stringify(typed(b.data.ValueRender,field.type))&&b.to===JSON.stringify(typed(b.data.ReplaceRender,field.type)));
 };
 const pairs=[],seen=new Set();for(const r of rows){const d=r?.data,id=String(r?.internalId??'');
  if(!r?.isModel||!id||seen.has(id)||![0,1].includes(d?.CollectionID))return fail('replacement_table_record');seen.add(id);
  if(!Object.hasOwn(d,'DataValueType')&&!Object.hasOwn(d,'ReplaceByType'))continue; // Empty group placeholder.
  if(d.CollectionID!==0||types[d.DataValueType]!==field.type||types[d.ReplaceByType]!==field.type)return fail('replacement_unsupported_rule');
  if(!stable())return fail('replacement_native_inventory_changed');
  const binding=boundRows[rows.indexOf(r)],fromProxy=binding.values[4],toProxy=binding.values[5];
  let from,to;
  try{
   const read=async proxy=>{
    if(!proxy)return null;
    const [type,isNull,value]=await Promise.all([proxy.DataType,proxy.IsNull,proxy.Value]);
    if(types[type]!==field.type||typeof isNull!=='boolean'||isNull!==(value===null))return null;
    return typed(value,field.type);
   };
   [from,to]=await Promise.all([read(fromProxy),read(toProxy)]);
  }catch{return fail('replacement_native_value');}
  if(!stable())return fail('replacement_native_inventory_changed');
  if(JSON.stringify(from)!==JSON.stringify(typed(d.ValueRender,field.type))||JSON.stringify(to)!==JSON.stringify(typed(d.ReplaceRender,field.type)))return fail('replacement_native_cache_mismatch');
  if(!from||!to||!Number.isSafeInteger(d.Index)||d.Index<0||pairs.some(p=>p.index===d.Index))return fail('replacement_typed_value');
  pairs.push({record_id:id,index:d.Index,from,to});
 }
 const otherControl=cmp('cbxReplaceOther'),caseControl=cmp('chkCaseSensitivity'),precisionControl=cmp('edPrecision');
 const mode=otherControl?.getValue?.(),caseSensitive=caseControl?.getValue?.(),precision=precisionControl?.getValue?.();
 if(![0,1,2].includes(mode)||typeof caseSensitive!=='boolean'||typeof precision!=='number'||!Number.isFinite(precision))return fail('replacement_options');
 const other={mode:['keep','null','value'][mode]};
 if(mode===2){const c=cmp(field.type==='string'?'edtReplaceOther':field.type==='real'?'edtReplaceOtherFloat':'edtReplaceOtherInt'),v=c?.getValue?.();other.value=typed(v,field.type);if(!other.value)return fail('replacement_other_value');}
 const editors=exact(base+'ReplaceEditor').filter(e=>e.checkVisibility({checkVisibilityCSS:true}));
 let editor_values=null,editor_record_id=null;
 if(editors.length){
  const record=tableGrid.findPlugin?.('rowediting')?.context?.record;
  if(!rows.includes(record))return fail('replacement_editor_binding');
  editor_record_id=String(record.internalId);
  const from=cmp('ReplaceEditor'),to=cmp('ReplaceEditor-1');
  try{editor_values={from:typed(from?.Controller?.getValue?.(),field.type),to:typed(to?.Controller?.getValue?.(),field.type)};}catch{return fail('replacement_editor_value');}
  if(!editor_values.from||!editor_values.to)return fail('replacement_editor_value');
 }
 // Awaited native reads must still belong to the exact inventory and selection.
 if(!stable())return fail('replacement_native_inventory_changed');
 const separator=suffix=>{const c=cmp(suffix);return ['.',','].includes(c?.decimalSeparator)?c.decimalSeparator:null;};
 const real_decimal_separators=field.type==='real'?{
  from:separator('ReplaceEditor;fldVariant;ValueContainer;num'),
  to:separator('ReplaceEditor-1;fldVariant;ValueContainer;num'),
  other:separator('edtReplaceOtherFloat'),
 }:null;
 return {verified:true,inventory_complete:true,state_source:'native_replacement_values',input_fields:fields,selected:field.name,pairs,other,case_sensitive:caseSensitive,precision,editor_open:editors.length>0,editor_values,editor_record_id,real_decimal_separators,settings_applied:false};
}
