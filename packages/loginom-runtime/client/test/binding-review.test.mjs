import test from 'node:test';
import assert from 'node:assert/strict';
import {validateFilterParameters} from '../lib/filter-node.mjs';
const binding={parameter:'/groups/0/0/value',variable:{kind:'control',input:0,name:'Limit'}};
const scalar={field:{kind:'input_field',name:'Amount'},type:'integer',operator:'>'};
const request={target:{kind:'new'},variable_inputs:[{kind:'control',input:0}],inputs:[{input:0}],read:{ports:[0,1]},finish:'done',mappings:[],bindings:[binding]};
test('bound scalar plus legacy variable list refuses during validation before target',()=>{
 const p={groups:[[{...scalar},{...scalar,operator:'in',values:{kind:'variable',name:'List'}}]]};
 assert.throws(()=>validateFilterParameters(p,'conditions',request),/BINDING_PARAMETER_UNSUPPORTED/);
});
