import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyTableNumericFormat} from '../lib/node-output-procedure.mjs';
const integer={index:0,key:'Id',type:'integer'},real={index:2,key:'Amount',type:'real'};
const f=(target,custom=true)=>({source_index:target.index,name_key:target.key,...Object.fromEntries(Object.entries({formatting:true,custom,decimal_digits:'0',currency:'',thousands:false,scientific:false,format_string:target.type==='real'?'0.################E+00':'0'}).map(([k,value])=>[k,{status:'observed',value}]))});
test('numeric format readback accepts the native canonical integer representation',()=>{
 assert.equal(verifyTableNumericFormat(f(integer,false),integer).representation,'standard_integer');
 assert.equal(verifyTableNumericFormat(f(integer),integer).representation,'custom');
 assert.equal(verifyTableNumericFormat(f(real),real).mask,'0.################E+00');
});
for(const [name,change] of Object.entries({wrong_field:s=>s.source_index=4,wrong_key:s=>s.name_key='other',
 rounded:s=>s.format_string.value='0.00',disabled:s=>s.formatting.value=false,
 grouped:s=>s.thousands.value=true,currency:s=>s.currency.value='$',scientific:s=>s.scientific.value=true,
 decimals:s=>s.decimal_digits.value='2',unobserved:s=>s.custom.status='unobserved',
}))test('numeric readback refuses '+name,()=>{const s=f(integer,false);change(s);assert.throws(()=>verifyTableNumericFormat(s,integer));});
test('a standard real format cannot replace the explicit seventeen-digit mask',()=>assert.throws(()=>verifyTableNumericFormat(f(real,false),real)));

test('datetime readback requires its own field and explicit millisecond mask',async()=>{
 const {verifyTableDateTimeFormat}=await import('../lib/node-output-procedure.mjs');
 const target={index:1,key:'Moment',type:'datetime'},state={source_index:1,name_key:'Moment',formatting:{status:'observed',value:true},custom:{status:'observed',value:true},format_string:{status:'observed',value:'yyyy-mm-dd hh:nn:ss.zzz'}};
 assert.equal(verifyTableDateTimeFormat(state,target).precision,'millisecond');
 for(const change of [s=>s.source_index=0,s=>s.name_key='other',s=>s.custom.value=false,s=>s.formatting.value=false,s=>s.format_string.value='YYYY-MM-DD HH:mm:ss.SSS']) {
  const altered=structuredClone(state);change(altered);assert.throws(()=>verifyTableDateTimeFormat(altered,target));
 }
});

test('empty default datetime masks are applied without selecting away and verified in a fresh cancelled dialog',async()=>{
 const {restoreEmptyDateTimeFormats}=await import('../lib/node-output-procedure.mjs');
 const table={table_tid:'table',view_guid:'view',port_guid:'port'},targets=[0,1].map(index=>({index,key:'D'+index,type:'datetime'}));
 const originals=targets.map(t=>({...t,settings:{formatting:true,custom:false,format_string:''}}));
 const stored=['exact','exact'],events=[];let open=false,selected=null,draft,dirty=false,epoch=0;
 const control=(ref,extra={})=>({ref,tid:ref,allowed_actions:['click','set_checked','fill','press'],interaction:{state:'point_observed'},...extra});
 const state=()=>{
  const fields=targets.map(t=>({index:t.index,source_index:t.index,name_key:t.key,type:t.type,record_id:'r'+t.index,status:'observed',label:'Same',format_string:stored[t.index]}));
  const values=draft&&Object.fromEntries(Object.entries(draft).map(([k,value])=>[k,{status:'observed',value,input_ref:k}]));
  return {ui:{dialogs:open?['format']:[],elements:open?[
   ...fields.map(f=>control('f'+f.index,{table_field:f})),...['formatting','custom','format_string'].map(ref=>control(ref)),
   control('table;ModalWindow_BrowseFormat;btnApply'),control('table;ModalWindow_BrowseFormat;btnCancel')]:[control('table;btnDataGridFormat')]},
   node_outputs:{tables:[{active:true,view_guid:'view'}]},table_settings:open?{status:'observed',kind:'format',format:{
    page:{schema_id:'s'+epoch,status:'complete_definition_page',offset:0,limit:8,total_columns:2,next_offset:null},fields,metadata_fields:fields,
    ...(selected===null?{}:{selected_datetime:{name_key:'D'+selected,source_index:selected,...values}})}}:null};
 };
 const channel={observe:async o=>{const s=state();assert.equal(o.ready(s),true,o.condition);return structuredClone(s);},
  perform:async o=>{const s=state();assert.equal(o.ready(s),true,o.condition);const a=o.resolve(s);events.push(a);
   if(a.ref==='table;btnDataGridFormat'){assert.equal(open,false);open=true;selected=null;dirty=false;epoch++;return;}
   if(/^f[01]$/.test(a.ref)){assert.equal(dirty,false,'selecting away would replace the empty default');selected=Number(a.ref.slice(1));draft={formatting:true,custom:stored[selected]!=='',format_string:stored[selected]};return;}
   if(a.verb==='fill'){draft.format_string=a.text;dirty=true;return;}
   if(a.verb==='set_checked'){draft[a.ref]=a.checked;dirty=true;return;}
   if(a.verb==='press'){assert.equal(a.key,'Tab');return;}
   if(a.ref.endsWith('btnApply')){assert.equal(draft.custom,true);assert.equal(draft.format_string,'');stored[selected]='';open=false;dirty=false;return;}
   if(a.ref.endsWith('btnCancel')){assert.equal(dirty,false,'verification must be read-only');open=false;return;}
   assert.fail('Unexpected '+JSON.stringify(a));
  }};
 const result=await restoreEmptyDateTimeFormats(channel,table,targets,originals);
 assert.deepEqual(stored,['','']);assert.equal(result.length,2);assert.ok(result.every(r=>r.verified_after_apply));
 assert.equal(events.filter(a=>a.ref.endsWith('btnApply')).length,2);assert.equal(events.filter(a=>a.ref.endsWith('btnCancel')).length,2);
 await assert.rejects(restoreEmptyDateTimeFormats(channel,table,targets,[{...originals[0],settings:{...originals[0].settings,format_string:'nonempty'}}]),/Only an observed/);
});

test('new output tables reveal offscreen cards within their exact port before adding and entering',async()=>{
 const {openNewOutputTable}=await import('../lib/node-output-procedure.mjs');
 for(const fault of ['none','foreign_port','stalled']){
  let views=false,selected=false,added=false,active=false,top=0;const actions=[];
  const control=(ref,extra={})=>({ref,tid:ref,allowed_actions:['click'],interaction:{state:'point_observed'},bounding_box:{y:100},...extra});
  const card=(ref,kind,guid,outside)=>control(ref,{viewer_card:{kind,port_guid:'port',port_panel_ref:'panel',...(guid?{view_guid:guid}:{})},
   scroll:{ref:'scroll',top,max_top:800},bounding_box:{y:outside?1000:100},interaction:{state:outside?'outside_viewport':'point_observed'},
   allowed_actions:outside?[]:[kind==='enter'?'enter_table':'click','scroll']});
  const snapshot=()=>({prepared_node_context:{verified:true,document_id:'doc',workflow_id:'wf',node_id:'node',surface:views?'views':'graph',tid:'node'},
   ui:{elements:views?[control('vendor',{viewer_vendor:{kind:'table',selected}}),
    {...card('anchor','enter','old',false),...(fault==='foreign_port'?{viewer_card:{kind:'enter',port_guid:'other',port_panel_ref:'foreign',view_guid:'old'}}:{})},
    card('add','add',null,top<400),...(added?[card('new','enter','new',top<800)]:[])]:[
     control('node',{graph_node:{part:'body'}}),control('views',{allowed_actions:['open_node_views']})]},
   node_outputs:{verified:true,surface:views?'views':'graph',ports:[{index:0,port_guid:'port',active:true}],
    tables:[{view_guid:'old',port_guid:'port',active:false},...(added?[{view_guid:'new',port_guid:'port',active,table_tid:active?'table':null}]:[])]}});
  const channel={observe:async o=>{const s=snapshot();assert.equal(o.ready(s),true,o.condition);return s;},perform:async o=>{
   const s=snapshot();assert.equal(o.ready(s),true,o.condition);const a=o.resolve(s);actions.push(a);
   if(a.ref==='views')views=true;if(a.ref==='vendor')selected=true;
   if(a.verb==='scroll'){assert.ok(['anchor','add'].includes(a.ref));if(fault!=='stalled')top+=400;}
   if(a.ref==='add'&&a.verb==='click'){assert.equal(top>=400,true);added=true;}
   if(a.ref==='new'){assert.equal(top>=800,true);active=true;}
  }};
  if(fault==='none'){const r=await openNewOutputTable(channel,0);assert.equal(r.table.view_guid,'new');assert.equal(actions.filter(a=>a.verb==='scroll').length,2);}
  else {await assert.rejects(openNewOutputTable(channel,0),/scroll/);assert.equal(added,false);assert.equal(active,false);}
 }
});
