import test from 'node:test';import assert from 'node:assert/strict';
import {configureUnion,revealUnionChoice,revealUnionField} from '../lib/union-procedure.mjs';
const hit={bounding_box:{x:0,y:0,width:10,height:10},interaction:{state:'point_observed',point:{x:5,y:5}}};
const p={prefixes:{enabled:false,name:'Union',label:'Объединение'},tables:[{port:1,fields:[{source:'Wrong',main:null},{source:'Right',main:'A'}]}]};
function fixture(fault){
 const c={verified:true,input_fields:[[{name:'A',type:'string'}],['Wrong','Right'].map(name=>({name,type:'string'}))],mappings:[{port:1,pairs:[],unmatched:['Wrong','Right']}],prefixes:p.prefixes,node_context:{node_id:'owned'}};
 const base='W;UnionDataWizard;',check=base+'normalHeaderCt;chk1_A',field=base+'normalHeaderCt;col1_A',option=base+'grdUnionData;grd-1;tbl;celleditor;cbx;boundlist;Right';
 const elements=[check,field].map(tid=>({...hit,tid,ref:tid,allowed_actions:['click']}));elements.push({tid:base+'cntUsePrefixes;cnt;chb;InputEl',ref:'prefix-use',allowed_actions:['set_checked']});for(const [key,part] of [['name','pedNamePrefix'],['label','pedDisplayNamePrefix']])elements.push({ref:'prefix-'+key,identity:{anchor_tid:base+part+';ValueControl'},signature:{tag:'input'},allowed_actions:['fill','press'],value:c.prefixes[key]});let pending;const s={wizard:{stage:'union',root_tid:'W'},node_union:c,ui:{elements}},actions=[];
 const channel={observe:async({ready,readUnion})=>{if(readUnion&&pending)throw Error('Uncommitted native value');assert.ok(ready(s));return structuredClone(s);},perform:async({resolve})=>{const a=resolve(s);actions.push(a);if(a.ref==='prefix-use')c.prefixes={...c.prefixes,enabled:a.checked};else if(a.ref.startsWith('prefix-')){const key=a.ref.slice(7);if(a.verb==='fill')pending={key,value:a.text};else {assert.equal(a.key,'Tab');c.prefixes={...c.prefixes,[key]:pending.value};pending=null;}}else if(a.ref===check){const had=c.mappings[0].pairs.length;c.mappings[0]={port:1,pairs:had?[]:[{main:'A',source:'Wrong'}],unmatched:had?['Wrong','Right']:['Right']};}else if(a.ref===field){c.editor={port:1,main:'A',record_id:'row-A',root_tid:base+'grdUnionData;grd-1;tbl;celleditor',choices_tid:option.slice(0,option.lastIndexOf(';'))};elements.push({...hit,tid:option,ref:option,allowed_actions:['click']});}else if(a.ref===option)c.mappings[0]={port:1,pairs:[{main:'A',source:'Right'}],unmatched:['Wrong']};if(fault)throw Error(fault);}};
 return {c,actions,channel};
}
test('union replaces the automatic compatible choice with the explicit source',async()=>{const f=fixture();const r=await configureUnion(f.channel,p,{request:{finish:'execute'}});assert.equal(r.configuration.mappings[0].pairs[0].source,'Right');assert.equal(f.actions.length,3);});
test('union does not repeat a mapping gesture after losing its reply',async()=>{const f=fixture('lost response');await assert.rejects(configureUnion(f.channel,p,{request:{finish:'execute'}}),/lost response/);assert.equal(f.actions.length,1);});
test('union Close leaves the entire draft unchanged',async()=>{const f=fixture(),before=structuredClone(f.c);const r=await configureUnion(f.channel,p,{request:{finish:'close'}});assert.equal(r.effect_possible,false);assert.deepEqual(f.c,before);assert.equal(f.actions.length,0);});
test('union preserves correct mappings with no redundant gestures',async()=>{const f=fixture();f.c.mappings[0]={port:1,pairs:[{main:'A',source:'Right'}],unmatched:['Wrong']};await configureUnion(f.channel,p,{request:{finish:'execute'}});assert.equal(f.actions.length,0);});

test('union sets the native prefix checkbox and commits each untidied textbox before native readback',async()=>{
 const f=fixture();f.c.mappings[0]={port:1,pairs:[{main:'A',source:'Right'}],unmatched:['Wrong']};
 const wanted={...p,prefixes:{enabled:true,name:'T_',label:'T: '}};
 const r=await configureUnion(f.channel,wanted,{request:{finish:'done'}});assert.deepEqual(r.configuration.prefixes,wanted.prefixes);assert.deepEqual(f.actions.map(a=>a.verb),['set_checked','fill','press','fill','press']);
});

test('Union scrolls a clipped source option even when its generic click action is advertised',async()=>{
 const base='W;UnionDataWizard;grdUnionData;grd-1;tbl;celleditor;cbx;boundlist;';
 const s={wizard:{stage:'union',root_tid:'W'},node_union:{verified:true,input_fields:[[{name:'A'}],Array.from({length:40},(_,i)=>({name:'F'+i}))],mappings:[{port:1,pairs:[{main:'A',source:'F0'}]}],prefixes:{enabled:false},node_context:{node_id:'owned'}},ui:{elements:[]}};
 const render=top=>{s.ui.elements=[0,39].map(i=>({tid:base+'F'+i,ref:'f'+i,allowed_actions:i===0?['click','scroll']:['click'],interaction:{state:i===0||top>=600?'point_observed':'outside_viewport',point:{x:5,y:i*24-top+12}},scroll:{ref:'list',top,max_top:613},bounding_box:{x:0,y:i*24-top,width:10,height:24}}));};render(0);let steps=0;
 const channel={perform:async({resolve})=>{const a=resolve(s);assert.equal(a.verb,'scroll');assert.equal(a.ref,'f0');assert.ok(a.delta_y>0);render(Math.min(613,s.ui.elements[0].scroll.top+a.delta_y));steps++;},observe:async({ready})=>{assert.ok(ready(s));return structuredClone(s);}};
 s.node_union.editor={port:1,main:'A',record_id:'row-A',root_tid:'editor',choices_tid:base.slice(0,-1)};const before=structuredClone(s.node_union),result=await revealUnionChoice(channel,structuredClone(s),1,'F39');
 assert.equal(result.ui.elements[1].interaction.state,'point_observed');assert.equal(steps,2);assert.deepEqual(result.node_union,before);
});

for(const [part,visiblePart,delta] of [['field','check',400],['check','field',-400]])test('Union reveals the clipped '+part+' independently of its visible adjacent column',async()=>{
 const tid=p=>'W;UnionDataWizard;normalHeaderCt;'+(p==='field'?'col':'chk')+'3_A';
 const s={wizard:{stage:'union',root_tid:'W'},node_union:{verified:true,input_fields:[[{name:'A'}]],mappings:[],prefixes:{enabled:false},node_context:{node_id:'owned'}},ui:{elements:[{...hit,tid:tid(visiblePart),ref:'anchor',signature:{union_field:{port:3,part:visiblePart,field_key:'A'}},allowed_actions:['click','scroll_horizontal'],horizontal_scroll:{ref:'grid',left:500,max_left:1306}}]}};
 let gestures=0;const before=structuredClone(s.node_union);
 const channel={perform:async({resolve})=>{const a=resolve(s);assert.deepEqual(a,{verb:'scroll_horizontal',ref:'anchor',delta_x:delta});s.ui.elements[0].horizontal_scroll.left+=delta;s.ui.elements.push({...hit,tid:tid(part),ref:'target',signature:{union_field:{port:3,part,field_key:'A'}},allowed_actions:['click']});gestures++;},observe:async({ready})=>{assert.ok(ready(s));return structuredClone(s);}};
 const result=await revealUnionField(channel,structuredClone(s),3,'A',part);assert.equal(gestures,1);assert.deepEqual(result.node_union,before);
});

test('Union does not click or scroll from a clipped quarter-point cell whose centre is covered',async()=>{
 const partial={...hit,tid:'W;UnionDataWizard;normalHeaderCt;col2_A',ref:'partial',interaction:{state:'point_observed',point:{x:8,y:5}},signature:{union_field:{port:2,part:'field',field_key:'A'}},allowed_actions:['click','scroll_horizontal'],horizontal_scroll:{ref:'grid',left:481,max_left:1306}};
 const middle={...hit,ref:'middle',signature:{union_field:{port:3,part:'check',field_key:'A'}},allowed_actions:['click','scroll_horizontal'],horizontal_scroll:{ref:'grid',left:481,max_left:1306}};
 const s={wizard:{stage:'union',root_tid:'W'},node_union:{verified:true,input_fields:[[{name:'A'}]],mappings:[],prefixes:{enabled:false},node_context:{node_id:'owned'}},ui:{elements:[partial,middle]}};let gestures=0;
 const channel={perform:async({resolve})=>{assert.deepEqual(resolve(s),{verb:'scroll_horizontal',ref:'middle',delta_x:-400});partial.interaction=hit.interaction;for(const e of s.ui.elements)e.horizontal_scroll.left=81;gestures++;},observe:async({ready})=>{assert.ok(ready(s));return structuredClone(s);}};
 await revealUnionField(channel,structuredClone(s),2,'A','field');assert.equal(gestures,1);
});
