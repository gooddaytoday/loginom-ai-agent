import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sameJsonValues} from '../tree-conversion.mjs';
import {matchesExpectedOutput,parseExpectedOutputs} from '../expected-outputs.mjs';
test('JSON AST preserves exact Int64, types, array order and rejects duplicate keys',()=>{
 assert.ok(sameJsonValues('{"x":2.0,"i":9007199254740993,"s":"\\u0410"}','{"s":"А","i":9007199254740993,"x":2}'));
 for(const [a,b] of [['9007199254740993','9007199254740992'],['false','0'],['null','""'],['[1,2]','[2,1]'],['{"x":1,"x":1}','{"x":1}'],['NaN','null']])assert.equal(sameJsonValues(a,b),false);
 const column={name:'JSON',type:'string',label_any:true,comparison:'json_ast'};
 const expected={output_node_type:'trees.to_json',columns:[column],rows:[{JSON:'{"x":2,"y":null}'}],ordered:true};
 parseExpectedOutputs({package_path:'/owned/p.lgp',nodes:[],outputs:[expected]});
 const data={row_count:1,sample_complete:true,precision:{numbers_verified:true},schema:[{name:'JSON',type:'string'}],sample:[[{type:'string',is_null:false,value:'{"y":null,"x":2.0}'}]]};
 assert.ok(matchesExpectedOutput(data,expected));
 assert.equal(matchesExpectedOutput(data,{...expected,columns:[{...column,comparison:undefined}]}),false);
});

test('cold saved conversion settings can inspect mutation receipts on first use',async()=>{
 const source=await readFile(new URL('../cold-check.mjs',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('  const channel={...procedure'),source.indexOf('  let javascriptAdmission;'));
 const run=Object.getPrototypeOf(async function(){}).constructor;
 let inspected=0;
 const values={procedure:{},processObservation:{},node:{node_id:'n'},operation:{},record:async()=>{},
  expected:{tree_settings:{}},target:{type:'trees.to_json'},staticSources:undefined,graph:{},origin:'https://app.loginom.ai',targetBuild:'7.4.2',session:'cold',
  load:async()=>{throw Error('unexpected load');},createNodeExecutionProcedure:()=>({}),withBrowserReceipt:()=>'',
  execute:async()=>{inspected++;return {status:'SUCCEEDED',action_key:'operation.inspect',operation_id:'op',output:{state:'completed',receipt:{operation_id:'op',action_key:'ui.act'}}};},
  observeTreeConversionSavedSettings:async({channel})=>{await channel.perform({});return {};},
  performColdNodeAction:async(_procedure,_options,context)=>context.readReceipt({id:'r',signature:'s',operation_id:'op',action_key:'ui.act'}),
 };
 await new run(...Object.keys(values),body)(...Object.values(values));assert.equal(inspected,1);
});
