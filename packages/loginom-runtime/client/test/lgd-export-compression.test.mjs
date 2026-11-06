import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLgdExportParameters,validateNativeLgdExport} from '../lib/lgd-parameters.mjs';
import {readLgdExportBrowser} from '../lib/lgd-export-context.mjs';
import {LGD_EXPORT_FIELDS} from '../lib/lgd-parameters.mjs';
import {runInNewContext} from 'node:vm';
import {configureLgdExport} from '../lib/lgd-export-procedure.mjs';

const request={target:{kind:'new'},inputs:[{}],mappings:[],read:{ports:[],sample_rows:0,require_exact_numbers:false}};
const combinations=[['none','none',0,0],['lzo','none',1,0],['lz4','none',2,0],['lz4','compressed',2,1],['lz4','all',2,2]];
test('LGD export admits exactly the five compression/checksum combinations',()=>{
 for(const [compression,checksum,nativeCompression,nativeChecksum] of combinations){
  assert.doesNotThrow(()=>validateLgdExportParameters({lgd_export:{destination:'/test-2/result.lgd',compression,checksum,overwrite:'reject'}},'native',request),compression+'/'+checksum);
  assert.doesNotThrow(()=>validateNativeLgdExport({destination:{value:'/test-2/result.lgd'},compression:{value:nativeCompression},checksum:{value:nativeChecksum},string_cache_max_size:{value:131072}}),compression+'/'+checksum);
 }
 for(const [compression,checksum] of [['none','compressed'],['none','all'],['lzo','compressed'],['lzo','all'],['gzip','none'],['lz4','ignore']]){
  assert.throws(()=>validateLgdExportParameters({lgd_export:{destination:'/test-2/result.lgd',compression,checksum,overwrite:'reject'}},'native',request),compression+'/'+checksum);
 }
 for(const [compression,checksum] of [[0,1],[1,2],[3,0],[2,3]])assert.throws(()=>validateNativeLgdExport({destination:{value:'/test-2/result.lgd'},compression:{value:compression},checksum:{value:checksum},string_cache_max_size:{value:131072}}));
});

test('compression transitions preserve the native checksum while its editor availability changes',async()=>{
 for(const [from,to] of [[2,0],[2,1],[0,2],[1,2]])for(const fault of ['none','raw','caption','owner']){
  const field=(key,value,display)=>({value,display,tid:key,variable:false});
  const values={destination:field('destination','/test-2/result.lgd','/test-2/result.lgd'),
   compression:field('compression',from,['Без сжатия','LZO','LZ4'][from]),
   checksum:{...field('checksum',from===2?1:0,'Сжатых данных'),disabled:from!==2,...(from!==2?{native_value:1}:{})},
   string_cache_max_size:field('cache',131072,131072)};
  const labels={compression:['Без сжатия','LZO','LZ4'],checksum:['Нет','Сжатых данных','Сжатых и несжатых данных']};
  const view=()=>({wizard:{stage:'lgd_export'},ui:{elements:Object.entries(labels).flatMap(([key,names])=>[
   {tid:key+';trg_picker',ref:key+'-picker',allowed_actions:['click'],wizard_combo:{field:{value:values[key].display}}},
   ...names.map((label,index)=>({tid:key+';boundlist;'+index,ref:key+':'+index,label,allowed_actions:['select_wizard_option']})),
  ])}});
  const channel={observe:async()=>view(),perform:async task=>{
   const action=task.resolve(view());if(action.verb==='click')return;
   const [key,index]=action.ref.split(':'),value=Number(index);
   values[key].value=value;values[key].display=labels[key][value];
   if(key==='compression'){
    const raw=values.checksum.native_value??values.checksum.value;
    values.checksum.disabled=value!==2;
    if(value!==2){values.checksum.native_value=raw;values.checksum.value=0;}
    else{values.checksum.value=raw;delete values.checksum.native_value;}
    if(fault==='raw'){if(value!==2)values.checksum.native_value=2;else values.checksum.value=2;}
    if(fault==='caption')values.checksum.display='Changed';
    if(fault==='owner')values.checksum.tid='foreign';
   }
  }};
  const ctx={document_id:'doc',node:{document_id:'doc',workflow_id:'workflow',node_id:'sink'},
   workflow_ref:{workflow_id:'workflow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'root',label:''}]},
   deadline:Date.now()+10000,finish:'close'};
  const options={execute:async()=>({verified:true,stage:'lgd_export',values:structuredClone(values)}),onRecord:async()=>{},
   operation:{id:'configure',nodeApply:{request:{target:{kind:'existing'}}}}};
  const call=()=>configureLgdExport(channel,{compression:['none','lzo','lz4'][to],checksum:'none'},ctx,options);
  if(fault==='none'){
   const result=await call();assert.equal(result.verified,true);assert.equal(result.configuration.configured.lgd_export.values.compression.value,to);
   assert.equal(result.configuration.configured.lgd_export.values.checksum.value,0);
  }else await assert.rejects(call,/Unrequested LGD export setting changed: checksum/);
 }
});

test('reopened non-LZ4 export interprets checksum only when its native control is disabled',()=>{
 for(const compression of [0,1,2,3])for(const disabled of [true,false,undefined])for(const checksum of [0,1,2,3,'1']){
  const root={checkVisibility:()=>true,contains:el=>el.owner===root},elements=new Map(),components=new Map();
  const add=(tid,control)=>{const el={id:tid,owner:root};elements.set(tid,el);components.set(tid,{...control,el:{dom:el}});};
  const prefix='MF;TF-1',base=prefix+';WizrdMCF;';
  elements.set(base+'ExportNativeParamsWizard',root);
  for(const [key,[card,id]]of Object.entries(LGD_EXPORT_FIELDS)){
   const value=({destination:'/test-2/result.lgd',compression,checksum,string_cache_max_size:131072})[key];
   add(base+card+';'+id+';ValueControl',{getValue:()=>value,...(key==='checksum'?{isDisabled:()=>disabled}:{})});
   add(base+card+';'+id+';SwitchButton',{pressed:false});
  }
  add(base+'ExportNativeParamsWizard;edtConnection',{getValue:()=>'Локальное'});
  const result=runInNewContext('('+readLgdExportBrowser.toString()+')(args)',{
   args:{prefix,fields:LGD_EXPORT_FIELDS},Ext:{getCmp:id=>components.get(id)},
   document:{querySelectorAll:selector=>{const el=elements.get(JSON.parse(selector.slice(10,-1)));return el?[el]:[];}}});
  assert.equal(result.verified,true);
  const effective=[0,1].includes(compression)&&disabled===true&&[0,1,2].includes(checksum)?0:checksum;
  assert.equal(result.values.checksum.value,effective);
  if(effective!==checksum)assert.equal(result.values.checksum.native_value,checksum);
  const valid=[0,1,2].includes(compression)&&[0,1,2].includes(effective)&&(compression===2||effective===0);
  if(valid)assert.doesNotThrow(()=>validateNativeLgdExport(result.values));
  else assert.throws(()=>validateNativeLgdExport(result.values));
 }
});
