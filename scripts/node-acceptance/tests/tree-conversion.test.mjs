import test from 'node:test';
import assert from 'node:assert/strict';
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
