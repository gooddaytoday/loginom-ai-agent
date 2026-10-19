import test from 'node:test';
import assert from 'node:assert/strict';
import {configureTextImportPatch,ImportInitialSettingsError} from '../lib/text-import-procedure.mjs';

function fixture({samePath=false,emptyPatch=false,control='valid',drift=false,incompleteNewField=false,unconfigured=false}={}) {
 const retained=[{name:'Id',label:'Identifier',type:'integer',data_kind:'Дискретный',used:true},
  {name:'Title',label:'Custom title',type:'string',data_kind:'Дискретный',used:true}];
 const extra={name:'Zone',label:'Zone',type:'string',data_kind:'Дискретный',used:true};
 const owner={status:'observed',node:{tid:'node'},path:[{tid:'path',label:'Scenario'}]};
 const gestures=[];
 let stage='text_import_file',sourcePath=unconfigured?'':'/test/old.csv',columns=structuredClone(retained),refreshes=0,decimal='.';
 const source={source_path:sourcePath,connection:'Server',encoding:'UTF-8 (65001)',rows_to_skip:'0',first_line_as_title:true};
 const parameters=emptyPatch?{}:{source:{source_path:samePath?sourcePath:'/test/new.csv'},...(!samePath?{columns:[{...extra}]}:{})};
 if(unconfigured)Object.assign(parameters,{source:{source_path:'/test/new.csv',encoding:'UTF-8',rows_to_skip:0,first_line_as_title:true},format:{delimiter:';',text_qualifier:'"',null_marker:'NULL',decimal_separator:'.'},columns:structuredClone(retained)});
 if(incompleteNewField)delete parameters.columns[0].data_kind;
 const values=o=>Object.fromEntries(Object.entries(o).map(([k,value])=>[k,{status:'observed',truncated:false,value,input_ref:k,display_ref:k}]));
 const state=(offset=0)=>({wizard:{status:'observed',stage,root_tid:'wizard',root_ref:'wizard-ref',owner_context:owner,
  import_source:{fields:values({...source,source_path:sourcePath})},settings:{fields:values({delimiter:';',text_qualifier:'"',null_marker:'NULL',decimal_separator:decimal})},
  import_columns:{initial_layout:{status:'rendered_definition_layout'},fields:columns.slice(offset,offset+8).map((c,i)=>({...c,index:i+offset,status:'observed',cell_refs:{}})),
   page:{status:'complete_definition_page',schema_id:columns.map(c=>c.name).join(','),offset,limit:8,returned:columns.length,total_columns:columns.length,next_offset:null}}},
  ui:{elements:[{tid:'wizard;btnNext',ref:'next',allowed_actions:['wizard_step']},{tid:'wizard;btnPrev',ref:'prev',allowed_actions:['wizard_step']},
   ...(control==='missing'?[]:Array.from({length:control==='duplicate'?2:1},(_,i)=>({tid:(control==='foreign'?'other':'wizard')+';ImportTextFileParamsWizard;ColumnDefsTuning;btnRefreshAll',ref:'refresh'+i,allowed_actions:['click']})))]}});
 const channel={observe:async options=>{const s=structuredClone(state(options.importColumnPage?.offset??0));if(!options.ready(s))throw Error('Observation refused: '+options.condition);return s;},
  act:async action=>{
   gestures.push(action);
   if(action.verb==='wizard_step'){assert.ok(sourcePath,'Cannot advance without source');stage=action.expected_stage;return;}
   if(action.verb==='fill'&&action.ref==='source_path'){sourcePath=action.text;return;}
   if(action.verb==='press'&&action.ref==='source_path'&&action.key==='Tab')return;
   if(action.verb==='click'&&action.ref==='refresh0'){
    assert.equal(sourcePath,'/test/new.csv');refreshes++;columns=[retained[1],retained[0],extra].map(c=>({...c}));if(drift)decimal=',';return;
   }
   assert.fail('Unexpected gesture '+JSON.stringify(action));
  }};
 return {parameters,owner,channel,retained,extra,gestures,get refreshes(){return refreshes;}};
}

test('changed existing source refreshes stale native definitions and reconciles new order by name',async()=>{
 const f=fixture();const r=await configureTextImportPatch(f.channel,f.parameters,f.owner,'/test/new.csv');
 assert.equal(r.verified,true);assert.equal(f.refreshes,1);assert.equal(r.preservation.source_schema_refreshed,true);
 assert.deepEqual(r.columns.map(({name,label,type,data_kind,used})=>({name,label,type,data_kind,used})),[f.retained[1],f.retained[0],f.extra]);
 assert.deepEqual(r.preservation.columns_before.map(c=>c.name),['Id','Title']);
});
for(const options of [{samePath:true},{emptyPatch:true}])test('same source and empty patch preserve definitions without refresh '+JSON.stringify(options),async()=>{
 const f=fixture(options);const r=await configureTextImportPatch(f.channel,f.parameters,f.owner,'/test/old.csv');
 assert.equal(r.verified,true);assert.equal(f.refreshes,0);assert.equal(r.preservation.source_schema_refreshed,false);
});
for(const control of ['missing','duplicate','foreign'])test('source refresh refuses '+control+' control',async()=>{
 const f=fixture({control});await assert.rejects(configureTextImportPatch(f.channel,f.parameters,f.owner,'/test/new.csv'));assert.equal(f.refreshes,0);
});
test('source refresh cannot silently change parsing options',async()=>{
 const f=fixture({drift:true});await assert.rejects(configureTextImportPatch(f.channel,f.parameters,f.owner,'/test/new.csv'),/changed parsing settings/);
});
test('new source field still requires complete explicit semantics after refresh',async()=>{
 const f=fixture({incompleteNewField:true});await assert.rejects(configureTextImportPatch(f.channel,f.parameters,f.owner,'/test/new.csv'),/New source field requires explicit/);assert.equal(f.refreshes,1);
});

test('discarded initial configuration applies full source before inspecting a retained schema',async()=>{
 const f=fixture({unconfigured:true});const r=await configureTextImportPatch(f.channel,f.parameters,f.owner,'/test/new.csv');
 assert.equal(r.verified,true);assert.equal(f.refreshes,0);
 assert.deepEqual(r.columns.map(c=>c.name),['Id','Title']);
});
test('unconfigured existing import requires complete settings and verified source before mutation',async()=>{
 const f=fixture({unconfigured:true});
 await assert.rejects(configureTextImportPatch(f.channel,{source:f.parameters.source},f.owner,'/test/new.csv'),/Format parameters are incomplete/);
 await assert.rejects(configureTextImportPatch(f.channel,f.parameters,f.owner,'/test/foreign.csv'),/verified upload/);
 assert.equal(f.refreshes,0);
});

 test('unconfigured patch without explicit path refuses before any settings gesture and leaves request intact',async()=>{
  for(const change of [p=>delete p.source.source_path,p=>delete p.source,p=>delete p.format,p=>p.columns=[],p=>p.columns.forEach(c=>c.used=false),p=>p.source.source_path='/test/foreign.csv']) {
   const f=fixture({unconfigured:true});change(f.parameters);const before=structuredClone(f.parameters);
   await assert.rejects(configureTextImportPatch(f.channel,f.parameters,f.owner,'/test/new.csv'),e=>e instanceof ImportInitialSettingsError&&/complete settings.source.*explicit source_path/.test(e.message));
   assert.deepEqual(f.gestures,[]);assert.deepEqual(f.parameters,before);
  }
 });
 test('unconfigured state transport or owner loss is not a local settings refusal',async()=>{
  for(const failure of ['transport','owner']) {
   const f=fixture({unconfigured:true});delete f.parameters.source.source_path;
   const observe=f.channel.observe;
   f.channel.observe=async options=>{if(failure==='transport')throw Error('transport lost');const s=await observe({...options,ready:()=>true});s.wizard.owner_context={status:'observed',node:{tid:'foreign'},path:[]};options.ready(s);return s;};
   await assert.rejects(configureTextImportPatch(f.channel,f.parameters,f.owner,'/test/new.csv'),e=>!(e instanceof ImportInitialSettingsError));
   assert.deepEqual(f.gestures,[]);
  }
 });
