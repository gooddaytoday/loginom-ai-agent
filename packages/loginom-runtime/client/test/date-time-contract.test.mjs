import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDateTimeParameters,resolveDateTimeParameters,validateDateTimeInputParameters,DATE_TIME_OPERATIONS} from '../lib/date-time-parameters.mjs';
import {resolveDateTimeOutput} from '../lib/date-time-output.mjs';
const request={target:{kind:'new'},mappings:[]};
const parameters={fields:[{field:{kind:'input_field',name:'A'},transformations:[{operation:'month_start',name:'Month',label:'Месяц'}]}]};
test('calendar contract rejects wrong type, missing exact field and output collisions before target',()=>{
 validateDateTimeParameters(parameters,'calendar',request);
 for(const inputs of [[{name:'A',type:'string'}],[{name:'B',type:'datetime'}],[{name:'A',type:'datetime'},{name:'Month',type:'integer'}]])assert.throws(()=>resolveDateTimeParameters(parameters,inputs));
 assert.equal(resolveDateTimeParameters(parameters,[{name:'A',label:'Дата',type:'datetime'}])[0].input.name,'A');
});
test('existing empty parameters preserve; explicit empty field list clears only that field',()=>{
 validateDateTimeParameters({},'calendar',{...request,target:{kind:'existing'}});
 assert.throws(()=>validateDateTimeParameters({},'calendar',request));
 validateDateTimeParameters({fields:[{field:{kind:'input_field',name:'A'},transformations:[]}]},'calendar',{...request,target:{kind:'existing'}});
 assert.throws(()=>validateDateTimeParameters({fields:[{field:{kind:'input_field',name:'A'},transformations:[]}]},'calendar',request));
 assert.throws(()=>validateDateTimeParameters({},'calendar',{target:{kind:'existing'},mappings:[{direction:'input',fields:[{source:{kind:'configured_field',name:'A'},excluded:true}]}]}));
});
test('explicit date output layout refuses autosync before changing a node',()=>{
 const mappings=[{direction:'output',port:0,autosync:true,fields:[{source:{kind:'configured_field',name:'A'}}]}];
 assert.throws(()=>validateDateTimeParameters({},'calendar',{target:{kind:'existing'},mappings}),/layout requires autosync disabled/);
 mappings[0].autosync=false;validateDateTimeParameters({},'calendar',{target:{kind:'existing'},mappings});
 delete mappings[0].autosync;validateDateTimeParameters({},'calendar',{target:{kind:'existing'},mappings});
});
test('effective input mapping is validated before its Done, preserving retained field names',()=>{
 const native={target_fields:[{name:'A',type:'datetime'}]};
 validateDateTimeInputParameters(parameters,{fields:null},native);
 assert.throws(()=>validateDateTimeInputParameters(parameters,{fields:[{name:'A',type:'string'}]},native));
 assert.throws(()=>validateDateTimeInputParameters(parameters,{fields:[{name:'Renamed',type:'datetime'}]},native));
});
test('unsupported ISO/string operations and repeated assignments are refused',()=>{
 for(const operation of ['iso_year','custom','week','to_string'])assert.throws(()=>validateDateTimeParameters({fields:[{...parameters.fields[0],transformations:[{operation,name:'Out',label:'Out'}]}]},'calendar',request));
 const p=structuredClone(parameters);p.fields[0].transformations.push({...p.fields[0].transformations[0],name:'Other'});assert.throws(()=>validateDateTimeParameters(p,'calendar',request));
 assert.equal(Object.keys(DATE_TIME_OPERATIONS).length,12);
});
const field=(record_id,name,label,type,required)=>({record_id,name,label,type,required});
test('output origin uses exact input prefix/type/boundary with equal labels, never output order',()=>{
 const sources=[field('1','B_YM_1','Дата (Год + Месяц, Первый день)','datetime',true),field('2','A_YM_8','Дата (Год + Месяц, Первый день)','datetime',true)];
 const native={verified:true,inventory_complete:true,source_identity_verified:true,source_fields:sources,target_fields:sources.map(source=>({source,name:source.name,label:source.label,excluded:false}))};
 const result=resolveDateTimeOutput({input_fields:[{name:'A',label:'Дата',type:'datetime'},{name:'B',label:'Дата',type:'datetime'}]},parameters,native);
 assert.deepEqual(result.map(r=>r.name),['B_YM_1','Month']);
 const ambiguous=structuredClone(native);ambiguous.source_fields[0].name='A_YM_9';ambiguous.target_fields[0].source=ambiguous.source_fields[0];
 assert.throws(()=>resolveDateTimeOutput({input_fields:[{name:'A',label:'Дата'}]},parameters,ambiguous));
});

test('output mapping preserves exact origin while reordering and excluding only passthrough fields',()=>{
 const sources=[field('1','A_YM_1','Дата (Год + Месяц, Первый день)','datetime',true),field('2','A','Дата','datetime',false)];
 const native={verified:true,inventory_complete:true,source_identity_verified:true,source_fields:sources,target_fields:sources.map(source=>({source,name:source.name,label:source.label,excluded:false}))};
 const configuration={input_fields:[{name:'A',label:'Дата',type:'datetime'}]};
 const mapping={fields:[{source:{kind:'configured_field',name:'A'},excluded:true},{source:{kind:'configured_field',name:'Month'},name:'Start',label:'Начало'}]};
 const result=resolveDateTimeOutput(configuration,parameters,native,mapping);
 assert.deepEqual(result.map(r=>[r.name,r.source.name,r.excluded]),[['A','A',true],['Start','A_YM_1',false]]);
 for(const override of [{name:'Other'},{label:'Other'}])assert.throws(()=>resolveDateTimeOutput(configuration,parameters,native,{fields:[{...mapping.fields[0],...override},mapping.fields[1]]}),/excluded source cannot be renamed/);
 const invalid=structuredClone(mapping);invalid.fields[1].excluded=true;
 assert.throws(()=>resolveDateTimeOutput(configuration,parameters,native,invalid));
 assert.throws(()=>resolveDateTimeOutput(configuration,parameters,native,{fields:mapping.fields.slice(1)}));
 invalid.fields[1].excluded=false;invalid.fields[1].name='a';
 assert.throws(()=>resolveDateTimeOutput(configuration,parameters,native,invalid));
});
