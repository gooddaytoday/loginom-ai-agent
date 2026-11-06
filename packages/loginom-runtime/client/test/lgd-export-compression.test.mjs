import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLgdExportParameters,validateNativeLgdExport} from '../lib/lgd-parameters.mjs';
import {readLgdExportBrowser} from '../lib/lgd-export-context.mjs';
import {LGD_EXPORT_FIELDS} from '../lib/lgd-parameters.mjs';
import {runInNewContext} from 'node:vm';

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
