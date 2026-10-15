import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dragJavascriptPalette} from './javascript-palette-drag.mjs';
import {connectJavascriptInput} from './javascript-link-topology.mjs';

function fixture(fault='none') {
 const events=[],records=[],admission={};let moves=0,alt=false,mouse=false;
 const page={keyboard:{down:async key=>{assert.equal(key,'Alt');events.push('alt-down');alt=true;if(fault==='alt-down')throw Error('Lost Alt down');},
  up:async key=>{assert.equal(key,'Alt');events.push('alt-up');if(fault==='alt-up')throw Error('Lost Alt up');alt=false;}},
  mouse:{move:async()=>{events.push('move');if(moves++)assert.equal(alt,true);if(moves>1&&fault==='move')throw Error('Lost move');},
   down:async()=>{events.push('mouse-down');assert.equal(alt,true);mouse=true;if(fault==='mouse-down')throw Error('Lost mouse down');},
   up:async()=>{events.push('mouse-up');assert.equal(alt,true);if(fault==='mouse-up')throw Error('Lost mouse up');mouse=false;}}};
 const run=()=>dragJavascriptPalette(page,{from:{x:10,y:20},to:{x:200,y:20},deadline:fault==='deadline'?0:Date.now()+5000,
  admission,record:async e=>{records.push(e);if(fault==='journal'&&e.phase==='javascript_palette_drag_prepared')throw Error('Journal unavailable');},
  validate:async()=>{events.push('validate');if(fault==='validate')throw Error('Owner changed');},guard:async()=>{if(fault==='guard')throw Error('Owner lost');}});
 return {run,events,records,admission,get alt(){return alt;},get mouse(){return mouse;}};
}

test('one Alt palette drag holds Alt through all 24 moves and mouse-up, then releases it',async()=>{
 const f=fixture(),proof=await f.run();
 assert.equal(proof.steps,24);assert.equal(proof.cleanup_complete,true);assert.equal(proof.automatic_link_suppression_requested,true);
 assert.deepEqual(f.events.slice(-2),['mouse-up','alt-up']);assert.equal(f.events.filter(e=>e==='mouse-down').length,1);
 assert.equal(f.events.filter(e=>e==='move').length,25);assert.equal(f.mouse,false);assert.equal(f.alt,false);
 await assert.rejects(f.run(),/no replay/);assert.equal(f.events.filter(e=>e==='mouse-down').length,1);
});

test('journal, deadline and owner refusal happen before modifier or mouse effects',async()=>{
 for(const fault of ['journal','deadline','validate']){
  const f=fixture(fault);await assert.rejects(f.run());assert.equal(f.events.some(e=>e==='alt-down'||e==='mouse-down'),false);
  await assert.rejects(f.run(),/no replay/);
 }
});

test('uncertain down, move or guard always releases attempted inputs once without retrying drag',async()=>{
 for(const fault of ['alt-down','mouse-down','move','guard']){
  const f=fixture(fault);await assert.rejects(f.run());
  assert.equal(f.events.filter(e=>e==='alt-up').length,1);assert.equal(f.events.filter(e=>e==='mouse-up').length,fault==='alt-down'?0:1);
  assert.equal(f.alt,false);assert.equal(f.mouse,false);assert.equal(f.admission.inputReleaseConfirmed,true);
  assert.equal(f.records.at(-1).phase,'javascript_palette_drag_refused');await assert.rejects(f.run(),/no replay/);
 }
});

test('mouse-up failure still releases Alt, and any failed release forbids continuation',async()=>{
 for(const fault of ['mouse-up','alt-up']){
  const f=fixture(fault);await assert.rejects(f.run(),/release/);
  assert.deepEqual(f.events.slice(-2),['mouse-up','alt-up']);assert.equal(f.admission.inputReleaseConfirmed,false);
  assert.equal(f.records.at(-1).cleanup_complete,false);assert.equal(f.records.at(-1).effect_possible,true);
  await assert.rejects(f.run(),/no replay/);
 }
});

function topology(){
 const ref=id=>({document_id:'doc',workflow_id:'flow',node_id:id});
 const node=id=>({ref:ref(id),type:id==='input'?'imports.text':'programming.javascript',label:id,
  inputs:id==='input'?[]:[0],outputs:[0],other_ports:[],dom_epoch:1,position:{x:0,y:0},locked:false});
 const before={complete:true,interaction_ready:true,document_id:'doc',workflow_ref:{workflow_id:'flow'},dom_epoch:1,
  nodes:[node('input'),node('previous-js')],links:[{source:'input',output:0,target:'previous-js',input:0}],foreign_links:[]};
 const after=structuredClone(before);after.nodes.push(node('new-js'));
 return {before,after,source:ref('input')};
}

test('Alt delta with two old nodes uses one explicit original-input connect and preserves the old graph',async()=>{
 const f=fixture();await f.run();const g=topology();let connects=0;
 await connectJavascriptInput({source:g.source,id:'new-js',drop:g.before,allowAutoLink:false,
  graph:async()=>structuredClone(g.after),checkNative:async()=>{},record:async()=>{},connect:async effect=>{
   connects++;assert.deepEqual(effect.parameters.edge,{source:'input',output:0,target:'new-js',input:0});
   g.after.links.push(effect.parameters.edge);return {status:'SUCCEEDED'};
  }});
 assert.equal(connects,1);assert.equal(f.events.filter(e=>e==='mouse-down').length,1);
 assert.deepEqual(g.after.nodes.slice(0,2),g.before.nodes);assert.deepEqual(g.after.links[0],g.before.links[0]);
 assert.equal(g.after.links.some(e=>e.source==='previous-js'&&e.target==='new-js'),false);
});

test('Alt path rejects any automatic edge, even the desired one, without adoption or repair',async()=>{
 for(const source of ['input','previous-js']){
  const g=topology();g.after.links.push({source,output:0,target:'new-js',input:0});let connects=0;
  await assert.rejects(connectJavascriptInput({source:g.source,id:'new-js',drop:g.before,allowAutoLink:false,
   graph:async()=>g.after,checkNative:async()=>{},record:async()=>{},connect:async()=>{connects++;}}),/automatic link|unexpected link/);
  assert.equal(connects,0);assert.equal(g.after.links.length,2);
 }
});
