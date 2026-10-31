import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBinningParameters,resolveBinningField} from '../lib/binning-parameters.mjs';
import {binningOutputColumns,readBinningOutputs} from '../lib/binning-output.mjs';
const parameters={binning:{field:'X',method:'count',size:2,limits:[0,20]}};
const fields=[{name:'RowID',label:'RowID',type:'integer',data_kind:'Непрерывный'},{name:'X',label:'X',type:'real',data_kind:'Непрерывный'},{name:'Note',label:'Note',type:'string',data_kind:'Дискретный'}];
test('binning rejects unsupported combinations before mutation',()=>{
 assert.doesNotThrow(()=>validateBinningParameters(parameters,'internal'));
 for(const patch of [{size:0},{size:2.5},{size:Infinity},{limits:[20,0]},{limits:[0,NaN]},{method:'sd'},{rounding:true},{field:' '}])
  assert.throws(()=>validateBinningParameters({binning:{...parameters.binning,...patch}},'internal'));
 assert.doesNotThrow(()=>validateBinningParameters({binning:{field:'X',method:'width',size:0.25,limits:[0,1]}},'internal'));
 assert.doesNotThrow(()=>validateBinningParameters({binning:{field:'X',method:'frequency',size:3}},'internal'));
 assert.throws(()=>validateBinningParameters({binning:{...parameters.binning,method:'frequency'}},'internal'));
 assert.throws(()=>validateBinningParameters({binning:{field:'X',method:'count',size:2}},'internal'));
 assert.doesNotThrow(()=>validateBinningParameters({},'apply',{target:{kind:'existing'},inputs:[],mappings:[],finish:'execute',read:{ports:[0,1]}}));
 for(const patch of [{target:{kind:'new'}},{inputs:[{}]},{mappings:[{}]},{finish:'done'}])
  assert.throws(()=>validateBinningParameters({},'apply',{target:{kind:'existing'},inputs:[],mappings:[],finish:'execute',read:{ports:[0,1]},...patch}));
 assert.throws(()=>validateBinningParameters(parameters,'apply'));
 for(const ports of [[0],[1],[1,0],[0,0]])assert.throws(()=>validateBinningParameters(parameters,'internal',{target:{kind:'new'},inputs:[{input:0}],mappings:[],finish:'execute',read:{ports}}));
});
test('binning binds exact numeric field and preserves native output placement/types',()=>{
 assert.equal(resolveBinningField(parameters,fields).type,'real');
 for(const name of ['x','missing','Note'])assert.throws(()=>resolveBinningField({binning:{...parameters.binning,field:name}},fields));
 const c={fields,field:'X',type:'real'};
 assert.deepEqual(binningOutputColumns(c,0).map(f=>f.name),['RowID','X','X_BinsID','X_Number','X_Label','X_LowBound','X_UppBound','X_LowBoundIncl','X_UppBoundIncl','X_LowLimOpen','X_UppLimOpen','X_OutOfBins','Note']);
 assert.deepEqual(binningOutputColumns(c,1).map(f=>f.name),['BinsID','BoundsDataType','Number','LowBound','UppBound','Label','LowBoundQuota','UppBoundQuota','BinQuota','LowDev','UppDev','LowLimitOpen','UppLimitOpen']);
 assert.equal(binningOutputColumns(c,1)[3].type,'real');
 assert.equal(binningOutputColumns({...c,type:'integer'},1)[3].type,'integer');
});
test('binning reader preserves NULL/empty and refuses changed field order/type and reused ports',async()=>{
 const c={fields,field:'X',type:'real'},mapped={ports:[0,1].map(port=>({port,schema:binningOutputColumns(c,port)}))};
 const outputs=mapped.ports.map(({port,schema})=>({port,port_guid:'port-'+port,schema,sample:[[null,'']],sample_complete:true}));
 const channel={readOutputPort:async({port})=>({output:structuredClone(outputs[port])})};
 const read={ports:[0,1],sample_rows:100,require_exact_numbers:true},ctx={portExecution:{},execution:{execution_id:'execute'},receipt_id:'read'};
 const result=await readBinningOutputs(channel,read,ctx,mapped);assert.deepEqual(result.ports[0].sample,[[null,'']]);
 outputs[0].schema=[...outputs[0].schema].reverse();await assert.rejects(readBinningOutputs(channel,read,ctx,mapped),/schema|order/);
 outputs[0].schema=mapped.ports[0].schema;outputs[1].port_guid='port-0';await assert.rejects(readBinningOutputs(channel,read,ctx,mapped),/distinct/);
});
