import test from 'node:test';import assert from 'node:assert/strict';
import {validateGroupingParameters,resolveGroupingParameters} from '../lib/grouping-parameters.mjs';
const f=name=>({kind:'input_field',name});
const request={target:{kind:'new'},inputs:[{input:0}],read:{ports:[0]},mappings:[],finish:'execute'};
const valid=()=>({group_by:[f('Group')],measures:[{field:f('Value'),function:'sum',name:'Total',label:'Сумма'},{field:f('Value'),function:'count',name:'Count',label:'Количество'}]});
const fields=[{name:'Group',type:'string',label:'Метка'},{name:'Value',type:'real',label:'Метка'}];
test('grouping resolves exact names despite equal labels and combines functions',()=>{const p=valid();validateGroupingParameters(p,'aggregate',request);const result=resolveGroupingParameters(p,fields);assert.deepEqual(result.functions,[{name:'Value',mask:3}]);assert.equal(result.keys[0].type,'string');});
test('grouping type compatibility uses observed schema',()=>{for(const fn of ['sum','avg']){const p=valid();p.measures[0].function=fn;assert.throws(()=>resolveGroupingParameters(p,[fields[0],{...fields[1],type:'string'}]),/incompatible/);}for(const fn of ['count','min','max']){const p=valid();p.measures=[{...p.measures[0],function:fn}];assert.doesNotThrow(()=>resolveGroupingParameters(p,[fields[0],{...fields[1],type:'string'}]));}});
test('missing field is refused by schema resolution',()=>assert.throws(()=>resolveGroupingParameters(valid(),fields.slice(0,1)),/missing: Value/));
test('invalid complete configurations fail validation',()=>{
 const cases=[p=>p.group_by=[],p=>p.measures=[],p=>p.group_by.push(f('Group')),p=>p.measures.push({...p.measures[0],name:'Another'}),p=>p.measures[0].name='Group',p=>p.measures[0].field=f('Group'),p=>p.measures[0].function='median',p=>delete p.measures[0].label,p=>p.measures[1].name='total'];
 for(const change of cases){const p=valid();change(p);assert.throws(()=>validateGroupingParameters(p,'aggregate',request));}
});
test('existing unchanged configuration is explicit, partial list updates are refused',()=>{assert.doesNotThrow(()=>validateGroupingParameters({},'aggregate',{...request,target:{kind:'existing'}}));assert.throws(()=>validateGroupingParameters({},'aggregate',request));assert.throws(()=>validateGroupingParameters({group_by:[f('Group')]},'aggregate',request));});
test('close rejects separately committed input settings',()=>assert.throws(()=>validateGroupingParameters(valid(),'aggregate',{...request,finish:'close',mappings:[{direction:'input',port:0}]}),/Close/));
