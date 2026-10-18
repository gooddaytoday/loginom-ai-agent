import test from 'node:test';
import assert from 'node:assert/strict';
import {clusteringOutputColumns,alignClusteringOutput} from '../lib/clustering-output.mjs';
const configuration={fields:[{name:'RowID',label:'RowID',type:'integer',usage_type:0},...['X','Y'].map(name=>({name,label:name,type:'real',usage_type:3}))]};
test('both clustering outputs are derived from configured roles, including preserved identifiers',()=>{
 assert.deepEqual(clusteringOutputColumns(configuration,0).map(c=>c.name),['Cluster','Distance','RowID','X','Y']);
 assert.deepEqual(clusteringOutputColumns(configuration,1).map(c=>c.name),['Cluster','X','Y']);
});
test('Execute may reorder passthrough fields but cannot change their names, labels or types',()=>{
 const expected=clusteringOutputColumns(configuration,0),actual=[expected[0],expected[1],expected[3],expected[4],expected[2]];
 assert.deepEqual(alignClusteringOutput(actual,expected).map(c=>c.name),['Cluster','Distance','X','Y','RowID']);
 for(const columns of [actual.slice(1),actual.map((c,i)=>i===2?{...c,type:'string'}:c),actual.map((c,i)=>i===2?{...c,label:'Other'}:c),[...actual.slice(0,-1),actual[0]]])
  assert.throws(()=>alignClusteringOutput(columns,expected),/configured input and service fields/);
});
