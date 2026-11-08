import test from 'node:test';
import assert from 'node:assert/strict';
import {configureCoarseClasses} from '../lib/coarse-classes-procedure.mjs';
import {configureManualCoarseClasses} from '../lib/coarse-classes-manual.mjs';

const root='MF;TF-1;WizrdMCF';
const settingsRoot=root+';CoarseClassesWizard-1;CoarseClassesSettingsFrame;';
const modelRoot=root+';CoarseClassesWizard-2;CoarseClassesEditor;';
const parameters={coarse_classes:{input_field:'X',target_field:'Target',event_value:'yes',partition:'manual',cut:7,min_class_percent:5,max_classes:2,uniformity_percent:0}};

// A bounded reader of native snapshots. Gestures update only their native
// control; rejected readbacks cannot silently become ready in this fixture.
function manualChannel({stage='coarse_classes',stuckUpperCheckbox=false,postApplyUpper}={}){
 const fields=[
  {name:'X',label:'X',type:'integer',data_kind:'Непрерывный',index:0,record_id:'x',role:'input',frozen:false},
  {name:'Target',label:'Target',type:'string',data_kind:'Дискретный',index:1,record_id:'target',role:'target',frozen:false},
 ];
 let selected='X',includeUpper=false,editing=false,cellOpen=false,pendingCut,selectedClass;
 const model={input_field:'X',locked:false,edited:false,classes:[
  {number:0,lower:null,upper:3},{number:1,lower:3,upper:5},
  {number:2,lower:5,upper:9},{number:3,lower:9,upper:null},
 ]};
 const gestures=[];
 const element=(tid,allowed_actions)=>({tid,ref:tid,allowed_actions});
 const snapshot=()=>{
  const ui=[element(root+';btnNext',['wizard_step'])];
  if(stage==='coarse_classes'){
   ui.push(...fields.map(f=>element(root+';CoarseClassesWizard-1;colColumnDisplayName_'+f.name,['click'])));
   ui.push(element(settingsRoot+'chkIncludeHighBounds;ValueControl;DisplayEl',['set_checked']));
  }
  if(stage==='coarse_classes_model'){
   if(!editing)ui.push(element(modelRoot+'btnAllowClassModifying',['click']));
   if(editing){
    ui.push(element(modelRoot+'colCoarseClassIndex_1',['click']),element(modelRoot+'btnMergeWithRight',['click']),
     element(modelRoot+'colCoarseClassHighBorder_0',['double_click']),element(modelRoot+'btnModifyOk',['click']));
    if(cellOpen)ui.push(element(modelRoot+'grdBinning;tbl;celleditor;num',['fill','press']));
   }
   ui.push(element(modelRoot+'colColumnUsePrevBinning_X',['click']));
  }
  return structuredClone({wizard:{stage,root_tid:root},prepared_node_context:{verified:true,surface:'wizard',node_id:'coarse'},
   node_coarse_classes:{verified:true,fields,selected:fields.find(f=>f.name===selected),model,
    settings:{min_class_percent:5,max_classes:2,uniformity_percent:0,fine_classes:false,prequanting:false,
     include_upper_input:includeUpper,event_value:selected==='Target'?'yes':null}},ui:{elements:ui}});
 };
 const requireReady=(o,s)=>{
  if(o.ready&&!o.ready(s)){
   const error=new Error('Native readback did not settle: '+o.condition);error.condition=o.condition;throw error;
  }
 };
 const channel={
  observe:async o=>{const s=snapshot();requireReady(o,s);return s;},
  perform:async o=>{
   const s=snapshot();requireReady(o,s);const action=o.resolve(s);
   assert.ok(s.ui.elements.some(e=>e.ref===action.ref&&e.allowed_actions.includes(action.verb)),'gesture must address a current control');
   gestures.push(structuredClone(action));
   if(action.verb==='wizard_step'){stage=action.expected_stage;return;}
   if(action.ref.startsWith(root+';CoarseClassesWizard-1;colColumnDisplayName_')){
    selected=action.ref.slice((root+';CoarseClassesWizard-1;colColumnDisplayName_').length);return;
   }
   if(action.ref===settingsRoot+'chkIncludeHighBounds;ValueControl;DisplayEl'){
    assert.equal(selected,'X');assert.equal(action.verb,'set_checked');
    if(!stuckUpperCheckbox)includeUpper=action.checked;return;
   }
   const control=action.ref.slice(modelRoot.length);
   if(control==='btnAllowClassModifying'){editing=true;return;}
   if(control==='colCoarseClassIndex_1'){selectedClass=1;return;}
   if(control==='btnMergeWithRight'){
    assert.equal(selectedClass,1);assert.ok(model.classes.length>2);
    model.classes[1].upper=model.classes[2].upper;model.classes.splice(2,1);
    model.classes.forEach((c,i)=>c.number=i);return;
   }
   if(control==='colCoarseClassHighBorder_0'){cellOpen=true;return;}
   if(control==='grdBinning;tbl;celleditor;num'){
    if(action.verb==='fill')pendingCut=Number(action.text);
    else{assert.equal(action.key,'Enter');assert.ok(Number.isFinite(pendingCut));
     model.classes[0].upper=pendingCut;model.classes[1].lower=pendingCut;cellOpen=false;}
    return;
   }
   if(control==='btnModifyOk'){
    editing=false;model.edited=true;
    if(postApplyUpper!==undefined)model.classes[0].upper=postApplyUpper;
    return;
   }
   if(control==='colColumnUsePrevBinning_X'){model.locked=!model.locked;return;}
   assert.fail('Unexpected manual gesture: '+action.ref);
  },
 };
 return {channel,gestures,fields};
}

test('manual configuration sets the input upper boundary and refuses an unsuccessful readback',async()=>{
 // The checkbox belongs to configureCoarseClasses, before it delegates to
 // configureManualCoarseClasses; exercise that production entry point too.
 const good=manualChannel();
 const result=await configureCoarseClasses(good.channel,parameters,{request:{mode:'internal'},inputMapping:{target_fields:good.fields}});
 const checkbox=good.gestures.filter(a=>a.ref===settingsRoot+'chkIncludeHighBounds;ValueControl;DisplayEl');
 assert.deepEqual(checkbox,[{verb:'set_checked',checked:true,ref:settingsRoot+'chkIncludeHighBounds;ValueControl;DisplayEl'}]);
 assert.equal(result.configuration.settings.include_upper_input,true);
 assert.equal(result.configuration.manual_partition.classes[0].upper,7);

 const bad=manualChannel({stuckUpperCheckbox:true});
 await assert.rejects(configureCoarseClasses(bad.channel,parameters,{request:{mode:'internal'},inputMapping:{target_fields:bad.fields}}),
  /manual partition requires an inclusive upper boundary/);
 assert.equal(bad.gestures.filter(a=>a.verb==='set_checked'&&a.checked===true).length,1);
 assert.equal(bad.gestures.some(a=>a.verb==='wizard_step'),false,'refuse before leaving settings');
});

test('manual editor merges down to two classes and verifies the final upper cut after Apply',async()=>{
 const good=manualChannel({stage:'coarse_classes_model'});
 const result=await configureManualCoarseClasses(good.channel,{input_field:'X',cut:7});
 assert.equal(good.gestures.filter(a=>a.ref===modelRoot+'btnMergeWithRight').length,2);
 assert.deepEqual(result.classes,[{number:0,lower:null,upper:7},{number:1,lower:7,upper:null}]);
 assert.equal(result.locked,true);

 // The edit first reads back correctly. Only Apply changes the upper border;
 // keep the lower border at cut so it cannot mask a missing upper check.
 const bad=manualChannel({stage:'coarse_classes_model',postApplyUpper:8});
 await assert.rejects(configureManualCoarseClasses(bad.channel,{input_field:'X',cut:7}),
  error=>error.condition==='manual partition saved without automatic recomputation');
 assert.ok(bad.gestures.some(a=>a.ref===modelRoot+'btnModifyOk'));
});
