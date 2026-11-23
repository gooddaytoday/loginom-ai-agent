import test from 'node:test';
import assert from 'node:assert/strict';
import {validateActionParameters} from '../lib/action-catalog.mjs';
import {nodeApplyInputSchema} from '../lib/node-api.mjs';
test('mapping names address the full 128-character calculator namespace',()=>{
 const mappingSchema=nodeApplyInputSchema.properties.mappings;
 for(const length of [120,121,128]){
  const name='A'.repeat(length);validateActionParameters(mappingSchema,[{direction:'output',port:0,fields:[{source:{kind:'configured_field',name},name}]}]);
 }
 for(const field of [{source:{kind:'configured_field',name:'A'.repeat(129)}},{source:{kind:'configured_field',name:'A'},name:'A'.repeat(129)}])
  assert.throws(()=>validateActionParameters(mappingSchema,[{direction:'output',port:0,fields:[field]}]),/too long/);
});
test('the full apply schema admits calculator syntax for new and saved nodes and refuses other languages',()=>{
 const expression={target:{kind:'new'},name:'Total',label:'Total',type:'integer',formula:'return Quantity * UnitPrice;',replace:false};
 const check=parameters=>validateActionParameters(nodeApplyInputSchema.properties.parameters,parameters,'parameters');
 for(const syntax of ['expression','javascript'])assert.doesNotThrow(()=>check({expressions:[expression],syntax}));
 assert.throws(()=>check({expressions:[expression],syntax:'python'}),/enum/);
});
