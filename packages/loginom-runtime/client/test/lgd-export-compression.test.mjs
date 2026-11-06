import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLgdExportParameters,validateNativeLgdExport} from '../lib/lgd-parameters.mjs';

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
