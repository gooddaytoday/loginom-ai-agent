import test from 'node:test';import assert from 'node:assert/strict';
import {preflightReformParameters,validateReformInputParameters} from '../lib/reform-preflight.mjs';
const fields=[{name:'Price',label:'Same',type:'string'},{name:'Comment',label:'Same',type:'string'}];
const change=(name,extra)=>({field:{kind:'input_field',name},...extra});
test('new reform preflight rejects full-schema collisions and unknown fields before target creation',()=>{
 for(const changes of [[change('Missing',{type:'real'})],[change('Price',{name:'Comment'})],[change('Price',{excluded:true}),change('Comment',{excluded:true})]])assert.throws(()=>preflightReformParameters({changes},fields));
 assert.equal(preflightReformParameters({changes:[change('Price',{name:'Amount',type:'real'})]},fields).fields[0].name,'Amount');
});
test('reform input validation uses effective retained or newly mapped input names',()=>{
 const p={changes:[change('Retained',{type:'real'})]},native={target_fields:[{name:'Retained',type:'string'}]};
 assert.doesNotThrow(()=>validateReformInputParameters(p,{},native));
 assert.throws(()=>validateReformInputParameters(p,{fields},native),/Unknown/);
 assert.throws(()=>validateReformInputParameters(p,{fields:[{name:'Retained',type:'variant'}]},native),/Unsupported/);
});

test('preview without data kind defers compatibility to the complete native configuration',()=>{
 assert.doesNotThrow(()=>preflightReformParameters({changes:[{field:{kind:'input_field',name:'Amount'},type:'string'}]},[{name:'Amount',label:'Amount',type:'integer'}]));
});
