import test from 'node:test';import assert from 'node:assert/strict';
import {validateCollapseParameters,resolveCollapseParameters} from '../lib/collapse-parameters.mjs';
import {collapseOutputSources} from '../lib/collapse-output-sources.mjs';
const field=name=>({kind:'input_field',name});
const p=()=>({information:[field('Id'),field('Zone')],transposed:[field('S'),field('I')],ignore_empty:false});
const request=()=>({target:{kind:'new'},inputs:[{input:0}],read:{ports:[0]},mappings:[],finish:'execute'});
test('requires complete ordered disjoint roles and explicit new empty policy',()=>{
 assert.equal(validateCollapseParameters(p(),'unpivot',request()).ignore_empty,false);
 for(const bad of [{},{information:[]},{transposed:[field('I')]},{...p(),transposed:[]},{...p(),ignore_empty:undefined},{...p(),transposed:[field('Id')]},{...p(),transposed:[field('I'),field('i')]},{...p(),information:[{kind:'label',name:'Id'}]}])assert.throws(()=>validateCollapseParameters(bad,'unpivot',request()));
});
test('preserve is existing-only and cancellation cannot commit an input mapping',()=>{
 const r=request();r.target.kind='existing';assert.deepEqual(validateCollapseParameters({},'unpivot',r),{});
 r.finish='close';r.read.ports=[];r.mappings=[{direction:'input',port:0}];assert.throws(()=>validateCollapseParameters({},'unpivot',r),/Close/);
});
test('source resolution distinguishes duplicate labels and input order by exact name',()=>{
 const fields=[{name:'I',label:'Одинаковая метка',type:'integer'},{name:'Id',label:'Код',type:'integer'},{name:'Zone',label:'Зона',type:'string'},{name:'S',label:'Одинаковая метка',type:'string'}];
 const r=resolveCollapseParameters(p(),fields);assert.deepEqual(r.transposed.map(f=>f.name),['S','I']);
 assert.equal(collapseOutputSources(r).find(f=>f.name==='Values').type,'variant');
 assert.throws(()=>resolveCollapseParameters({...p(),transposed:[field('missing')]},fields),/missing/);
 assert.throws(()=>resolveCollapseParameters(p(),fields.map(f=>f.name==='S'?{...f,type:'variant'}:f)),/variant/);
});
test('one input/output only; unique output mapping names',()=>{
 for(const change of [{inputs:[{input:1}]},{read:{ports:[1]}},{mappings:[{direction:'output',port:0,fields:[{source:{kind:'configured_field',name:'Names'},name:'Same'},{source:{kind:'configured_field',name:'Values'},name:'same'}]}]}])assert.throws(()=>validateCollapseParameters(p(),'unpivot',{...request(),...change}));
});

test('homogeneous transposed fields preserve their scalar output schema, mixed fields require variant',()=>{
 const homogeneous={information:[],transposed:[{name:'A',type:'integer'},{name:'B',type:'integer'}]};
 assert.equal(collapseOutputSources(homogeneous).find(f=>f.name==='Values').type,'integer');
 homogeneous.transposed[1].type='string';assert.equal(collapseOutputSources(homogeneous).find(f=>f.name==='Values').type,'variant');
});
