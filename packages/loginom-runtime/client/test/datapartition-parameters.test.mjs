import test from 'node:test';
import assert from 'node:assert/strict';
import {DATAPARTITION_MODES,validateDataPartitionParameters,resolveDataPartitionParameters,validateDataPartitionInputParameters} from '../lib/datapartition-parameters.mjs';

const request={target:{kind:'new'},inputs:[{input:0}],read:{ports:[0,1,2]},mappings:[],finish:'execute'};
const settings=()=>({training:{unit:'rows',value:9},test:{unit:'rows',value:9},priority:'training',test_position:'algorithm',seed:{policy:'fixed',value:17}});
const methodSettings={uniform:{training:{unit:'rows',value:3},test:{unit:'rows',value:2}},stratified:{fields:['Group','Subgroup'],complete_unique_values:false},sequential:{order:['training','test','unused']},biased:{field:'Group',adjustments:[{value:{type:'string',is_null:false,value:'A'},factor:2}]}};
const existing={...request,target:{kind:'existing'},inputs:[]};

test('DataPartition admits all 80 method/unit/priority combinations and native residual allocation',()=>{
 DATAPARTITION_MODES.forEach(mode=>['rows','percent'].forEach(training=>['rows','percent'].forEach(testUnit=>['training','algorithm','start','end'].forEach(strategy=>{
  const parameters={...settings(),training:{unit:training,value:training==='rows'?9:50},test:{unit:testUnit,value:testUnit==='rows'?9:25},priority:strategy==='training'?'training':'test',test_position:strategy==='training'?'algorithm':strategy,...(mode==='random'?{}:{[mode]:methodSettings[mode]})};
  assert.equal(validateDataPartitionParameters(parameters,mode,request),parameters);
 }))));
});

test('DataPartition rejects invalid sizes, seed policies, modes and inactive blocks before effects',()=>{
 const failures=[{training:{unit:'rows',value:-1}},{training:{unit:'rows',value:1.5}},{test:{unit:'percent',value:101}},{test:{unit:'percent',value:NaN}},{test:{unit:'percent',value:Infinity}},{training:{unit:'rows',value:Number.MAX_SAFE_INTEGER+1}},{seed:{policy:'fixed',value:0}},{seed:{policy:'fixed',value:1.5}},{seed:{policy:'always_random',value:17}},{test_position:'start'},{uniform:{training:{unit:'rows',value:3},test:{unit:'rows',value:2}}},{unknown:true}];
 failures.forEach(patch=>assert.throws(()=>validateDataPartitionParameters({...settings(),...patch},'random',request)));
 assert.throws(()=>validateDataPartitionParameters(settings(),'missing',request));
 assert.throws(()=>validateDataPartitionParameters({},'random',request));
 assert.doesNotThrow(()=>validateDataPartitionParameters({...settings(),seed:{policy:'always_random'}},'random',request));
});

test('DataPartition existing patches preserve unrequested settings and require complete changed method',()=>{
 const observed={verified:true,mode:'sequential',parameters:{...settings(),sequential:{order:['training','test','unused']}}};
 const original=structuredClone(observed);
 validateDataPartitionParameters({training:{unit:'percent',value:25}},'sequential',existing);
 const resolved=resolveDataPartitionParameters({training:{unit:'percent',value:25}},'sequential',observed);
 assert.deepEqual(resolved,{...observed.parameters,training:{unit:'percent',value:25}});
 assert.deepEqual(observed,original);
 assert.throws(()=>resolveDataPartitionParameters({},'uniform',observed));
 assert.deepEqual(resolveDataPartitionParameters({uniform:{training:{unit:'rows',value:3},test:{unit:'rows',value:2}}},'uniform',observed),{...settings(),uniform:{training:{unit:'rows',value:3},test:{unit:'rows',value:2}}});
 assert.deepEqual(resolveDataPartitionParameters({},'random',observed),settings());
 assert.throws(()=>resolveDataPartitionParameters({},'sequential',{...observed,verified:false}));
 const inactive={...observed,parameters:{...observed.parameters,test_position:'end'}};
 assert.equal(resolveDataPartitionParameters({test_position:'algorithm'},'sequential',inactive).test_position,'end');
});

test('DataPartition requires every output from one execution and exact input/mapping ports',()=>{
 [[0],[0,1],[1,2],[0,0,2],[0,1,2,3]].forEach(ports=>assert.throws(()=>validateDataPartitionParameters(settings(),'random',{...request,read:{ports}})));
 assert.throws(()=>validateDataPartitionParameters(settings(),'random',{...request,inputs:[]}));
 assert.throws(()=>validateDataPartitionParameters(settings(),'random',{...request,inputs:[{input:1}]}));
 assert.throws(()=>validateDataPartitionParameters(settings(),'random',{...request,mappings:[{direction:'output',port:3}]}));
 assert.throws(()=>validateDataPartitionParameters(settings(),'random',{...request,finish:'done'}));
 assert.doesNotThrow(()=>validateDataPartitionParameters(settings(),'random',{...request,finish:'done',read:{ports:[]}}));
});

test('DataPartition validates full method settings and resolves only technical input names',()=>{
 const failures={uniform:[{training:{unit:'rows',value:0},test:{unit:'rows',value:1}},{training:{unit:'rows',value:1.5},test:{unit:'rows',value:1}},{training:{unit:'percent',value:101},test:{unit:'rows',value:1}}],sequential:[{order:['training','test','test']},{order:['training','test']},{take:2,skip:1}],stratified:[{fields:[],complete_unique_values:false},{fields:['Group','Group'],complete_unique_values:false},{fields:['Group'],complete_unique_values:1}],biased:[{field:'Group',adjustments:[]},{field:'Group',adjustments:[{value:{type:'string',is_null:false,value:'A'},factor:2,count:3}]}]};
 Object.entries(failures).forEach(([mode,cases])=>cases.forEach(block=>assert.throws(()=>validateDataPartitionParameters({...settings(),[mode]:block},mode,request))));
 const fields=[{name:'Group',label:'same',type:'string'},{name:'Subgroup',label:'same',type:'string'}];
 assert.doesNotThrow(()=>validateDataPartitionInputParameters({stratified:methodSettings.stratified},{fields},{}));
 assert.throws(()=>validateDataPartitionInputParameters({stratified:{fields:['same']}},{fields},{}));
 assert.throws(()=>validateDataPartitionInputParameters({biased:{...methodSettings.biased,adjustments:[{value:{type:'integer',is_null:false,value:'1'},count:1}]}},{fields},{}));
});

test('DataPartition distinguishes typed NULL, literal NULL, empty string and exact int64; forbids duplicate occurrences in adjustments',()=>{
 const bias=adjustments=>({...settings(),biased:{field:'Group',adjustments}});
 const adjustment=value=>({value,factor:0});
 const values=[{type:'string',is_null:true,value:null},{type:'string',is_null:false,value:'NULL'},{type:'string',is_null:false,value:''},{type:'integer',is_null:false,value:'9007199254740993'}];
 assert.doesNotThrow(()=>validateDataPartitionParameters(bias(values.map(adjustment)),'biased',request));
 assert.throws(()=>validateDataPartitionParameters(bias([adjustment(values[0]),adjustment(values[0])]),'biased',request));
 [{type:'integer',is_null:false,value:9007199254740992},{type:'integer',is_null:false,value:'9223372036854775808'},{type:'real',is_null:false,value:Infinity},{type:'boolean',is_null:false,value:'true'},{type:'string',is_null:true,value:'NULL'},{type:'datetime',is_null:false,value:'2026-02-30T00:00:00'}].forEach(value=>assert.throws(()=>validateDataPartitionParameters(bias([adjustment(value)]),'biased',request)));
 assert.doesNotThrow(()=>validateDataPartitionParameters(bias([adjustment({type:'datetime',is_null:false,value:'2026-10-01T00:00:00'})]),'biased',request));
});

test('bias preview validates name/type while native mapping requires an observed discrete data kind',()=>{
 const parameters={biased:{field:'Group',adjustments:[{value:{type:'string',is_null:false,value:'A'},factor:2}]}};
 const fields=[{name:'Group',label:'Group',type:'string'}];
 assert.doesNotThrow(()=>validateDataPartitionInputParameters(parameters,{fields},{},{preview:true}));
 assert.throws(()=>validateDataPartitionInputParameters(parameters,{fields},{}));
 assert.throws(()=>validateDataPartitionInputParameters(parameters,{fields:[{...fields[0],data_kind:'Непрерывный'}]},{}));
 assert.doesNotThrow(()=>validateDataPartitionInputParameters(parameters,{fields:[{...fields[0],data_kind:'Дискретный'}]},{}));
 assert.throws(()=>validateDataPartitionInputParameters(parameters,{fields:[]},{},{preview:true}));
 assert.throws(()=>validateDataPartitionInputParameters(parameters,{fields:[{...fields[0],type:'integer'}]},{},{preview:true}));
})


test('DataPartition rejects native-unrepresentable bias factors without rounding valid decimals',()=>{
 const parameters=factor=>({...settings(),biased:{field:'Group',adjustments:[{value:{type:'string',is_null:false,value:'A'},factor}]}});
 for(const factor of [0,0.01,0.25,0.29,0.74,0.75,1.5,2])assert.doesNotThrow(()=>validateDataPartitionParameters(parameters(factor),'biased',request));
 for(const factor of [0.125,0.375,0.001,1.999])assert.throws(()=>validateDataPartitionParameters(parameters(factor),'biased',request),/two decimal places/);
});
