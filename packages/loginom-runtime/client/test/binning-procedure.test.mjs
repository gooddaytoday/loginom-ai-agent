import test from 'node:test';
import assert from 'node:assert/strict';
import {configureBinning} from '../lib/binning-procedure.mjs';

test('native method selection commits its still-open owned CellEditor before advancing',async()=>{
 const base='W;MethodSettingsWizard-1',editor=base+';grdColumns;tbl;celleditor',calls=[];
 const field={index:0,record_id:'record-X',label:'X',type:'real',method_code:0,bins_count:0,automatic:false};
 const c={verified:true,binding_ready:true,fields:[field],selected:field,method_editor:null,frame:null,settings:null,intervals:[],state:'settings'};
 const cell=(tid,ref,actions)=>({tid,ref,allowed_actions:actions});
 const s={wizard:{root_tid:'W',stage:'binning'},node_binning:c,ui:{elements:[cell(base+';colMethodType_0','method',['double_click'])]}};
 const channel={
  async observe(o){assert.ok(o.ready(s),'readiness: '+o.condition);return structuredClone(s);},
  async perform(o){assert.ok(o.ready(s));const a=o.resolve(s);calls.push(a);
   if(a.verb==='double_click'){
    c.method_editor={record_id:field.record_id,root_tid:editor};
    s.ui.elements=[cell(editor+';cbx;trg_picker','picker',['click']),{tid:null,ref:'owned-input',identity:{anchor_tid:editor+';cbx'},signature:{tag:'input'},allowed_actions:['press']}];
   }else if(a.ref==='picker')s.ui.elements.push({...cell(editor+';cbx;boundlist;3','count',['click']),label:'Количество'});
   else if(a.ref==='count'){
    field.method_code=3; // Loginom updates the store but keeps the editor open.
    c.frame={record_id:field.record_id,switches:[],controls:{},values:{}};
    c.settings={method:'count',size:2,limits:[0,20],strict_lower:true,strict_upper:true,rounding:false,lower_open:false,upper_open:false};
    Object.assign(c.frame.values,{'cbbCountBins;ValueControl':2,chkStrictLowerLimit:true,chkStrictUpperLimit:true,edtLowerLimit:0,edtUpperLimit:20,chkRoundingLevel:false,'chkLowerLimitOpen;ValueControl':false,'chkUpperLimitOpen;ValueControl':false});
   }else if(a.verb==='press'){
    assert.equal(a.ref,'owned-input');assert.equal(a.key,'Enter');c.method_editor=null;
    s.ui.elements=[cell('W;btnNext','next',['wizard_step'])];
   }else if(a.verb==='wizard_step'){assert.equal(c.method_editor,null);s.wizard.stage=a.expected_stage;}
   else assert.fail('Unexpected action '+JSON.stringify(a));
  },
 };
 const result=await configureBinning(channel,{binning:{field:'X',method:'count',size:2,limits:[0,20]}},{request:{mode:'internal'},inputMapping:{target_fields:[{name:'X',label:'X',type:'real'}]}});
 assert.equal(result.verified,true);assert.deepEqual(calls.filter(a=>a.verb==='press'),[{verb:'press',ref:'owned-input',key:'Enter'}]);
 assert.deepEqual(calls.filter(a=>a.verb==='wizard_step').map(a=>a.expected_stage),['output_mapping','binning_ranges_mapping','done']);
});
