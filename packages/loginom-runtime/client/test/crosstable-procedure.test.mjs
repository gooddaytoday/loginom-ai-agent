import assert from 'node:assert/strict';
import test from 'node:test';
import {configureCrossTable} from '../lib/crosstable-procedure.mjs';

// A paged channel fixture preserves the native distinction between field cells
// and their shared scroll owner. Exercise the exported configuration procedure.
function fixture({mode='sliding',up=false,stuck=false,foreign=false}={}){
 const names=up?['Category','Region','Amount',...Array.from({length:32},(_,i)=>'Unused'+i)]
  :[...Array.from({length:32},(_,i)=>'Unused'+i),'Category','Region','Amount'];
 const fields=names.map((name,index)=>({name,label:name,record_id:'record-'+index,source_index:index,index,
  type:name==='Amount'?'real':'string',data_kind:name==='Amount'?'Непрерывный':'Дискретный',
  disposition:0,order:0,functions:1,is_count_case:false,null_group:true,other_group:true}));
 const selected={available:[],used:[]},actions=[];
 const options={pedSlidingUniqueValues:false,pedSlidingUniqueValuesLimit:0,pedUniqueValueNames:false,pedDisplayNameSeparator:'|'};
 let offset=up?32:0,editor=false;
 const snapshot=()=>{
  const cells=fields.filter(f=>f.disposition!==0||f.source_index>=offset&&f.source_index<offset+3).map(f=>({
   ref:'cell-'+f.record_id,grouping_field:{record_id:f.record_id,role:['available','column','row','fact'][f.disposition]},
   allowed_actions:['click','double_click','press','scroll'],
   scroll:{ref:f.disposition===0?'available-container':'used-container',top:offset*20},
  }));
  if(foreign&&cells[1])cells[1].scroll.ref='foreign-container';
  const button=(suffix,verb='click')=>({ref:suffix,tid:'wizard'+suffix,allowed_actions:[verb]});
  const state={wizard:{stage:'cross_table',root_tid:'wizard'},ui:{elements:[...cells,
   ...[0,1,2].map(i=>button(';CrossTabWizard;frmMoveButtons;btnMove'+i)),
   button(';CrossTabWizard;pedSlidingUniqueValues;ValueControl;DisplayEl','set_checked'),
   button(';ColumnEditDialog;btnApply'),
   ...['cbNullGroup','cbOtherGroup'].map(key=>({...button(';ColumnEditDialog;'+key+';DisplayEl'),check_state:{checked:true}})),
  ]},node_cross_table:{verified:true,options:{...options},input_fields:structuredClone(fields),
   selected_available_records:[...selected.available],selected_records:[...selected.used],
   columns:structuredClone(fields.filter(f=>f.disposition===1)),rows:structuredClone(fields.filter(f=>f.disposition===2)),
   facts:structuredClone(fields.filter(f=>f.disposition===3))}};
  if(editor)state.wizard.column_editor={status:'rendered_column_options',selected_field:{record_id:selected.used[0]}};
  return state;
 };
 return {actions,parameters:{rows:[{kind:'input_field',name:'Region'}],column:{kind:'input_field',name:'Category'},
  facts:[{field:{kind:'input_field',name:'Amount'},functions:['sum']}],
  columns:mode==='sliding'?{mode,min_values:0}:{mode,include_null:true,include_other:true}},
  inputMapping:{verified:true,inventory_complete:true,target_fields:fields.map(f=>({...f}))},
  channel:{async observe({ready}){const state=snapshot();assert(ready(state));return state;},
   async perform({initialObservation,ready,resolve,identity}){
    assert(ready(initialObservation));const action=resolve(initialObservation);actions.push({...action,identity:identity()});
    const element=initialObservation.ui.elements.find(e=>e.ref===action.ref);
    assert(element?.allowed_actions.includes(action.verb));
    if(action.verb==='scroll'){
     assert(element.grouping_field);assert.notEqual(element.ref,element.scroll.ref);
     if(!stuck)offset=action.delta_y>0?32:0;
     return;
    }
    if(action.verb==='double_click'){editor=true;return;}
    if(action.verb==='set_checked'){options.pedSlidingUniqueValues=action.checked;return;}
    if(action.ref.endsWith('btnApply')){editor=false;return;}
    if(element.grouping_field){selected[element.grouping_field.role==='available'?'available':'used']=[element.grouping_field.record_id];return;}
    const match=/btnMove([0-2])$/.exec(action.ref);assert(match);
    const field=fields.find(f=>f.record_id===selected.available[0]);assert(field);
    field.disposition=Number(match[1])+1;selected.available=[];selected.used=[field.record_id];
   }}};
}

for(const mode of ['fixed','sliding'])for(const up of [false,true])test(`real CrossTable procedure reveals ${mode} fields ${up?'above':'below'} the viewport`,async()=>{
 const f=fixture({mode,up});
 const result=await configureCrossTable(f.channel,f.parameters,{inputMapping:f.inputMapping});
 assert.equal(result.verified,true);assert.equal(result.cleanup_complete,true);
 const scroll=f.actions.filter(a=>a.verb==='scroll');assert.equal(scroll.length,1);
 assert.equal(scroll[0].delta_y,up?-400:400);assert.equal(scroll[0].identity.scroll,'available-container');
 assert.deepEqual(result.configuration.columns.map(f=>f.label),['Category']);
 assert.deepEqual(result.configuration.rows.map(f=>f.label),['Region']);
 assert.deepEqual(result.configuration.facts.map(f=>f.label),['Amount']);
});

test('CrossTable stops when its list does not advance',async()=>{
 const f=fixture({stuck:true});
 await assert.rejects(configureCrossTable(f.channel,f.parameters,{inputMapping:f.inputMapping}),/list did not scroll/);
 assert.equal(f.actions.length,1);
});

test('CrossTable refuses ambiguous scroll owners before a gesture',async()=>{
 const f=fixture({foreign:true});
 await assert.rejects(configureCrossTable(f.channel,f.parameters,{inputMapping:f.inputMapping}),/cannot be revealed/);
 assert.equal(f.actions.length,0);
});
