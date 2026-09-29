import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {javascriptBusinessProbes} from './javascript-business-probes.mjs';
import {javascriptDiscoveryOracle,javascriptDiscoveryProbe} from './javascript-discovery-probes.mjs';
import {javascriptDeclaredColumnsMatch} from './javascript-schema-probe.mjs';
import {javascriptBusinessInputVariant,verifyJavascriptFixture,verifyJavascriptTable} from './javascript-execution-evidence.mjs';
import {javascriptInputRequest} from './javascript-execution-runtime.mjs';

const root=new URL('../../../../docs/node-development/nodes/programming-javascript/fixtures/',import.meta.url);
const expected=JSON.parse(readFileSync(new URL('operator-only/expected.json',root),'utf8'));
const digest=createHash('sha256').update(readFileSync(new URL('operator-only/expected.json',root))).digest('hex');

function table(probe){
  return {schema:structuredClone(probe.schema),row_count:6,sample_rows:6,sample_complete:true,
    filter_enabled:false,precision:{numbers_verified:true,limitations:[]},sample:probe.expected.map(row=>row.map((value,i)=>({
      type:probe.schema[i].type,is_null:false,value,precision:probe.schema[i].type==='integer'?'exact_integer':'display_text'})))};
}

test('P1 modes pin separate sources to one preauthored complete 6x4 oracle',()=>{
  const probes=javascriptBusinessProbes();
  assert.deepEqual(probes.map(probe=>probe.id),['code','declared'].flatMap(mode=>
    ['base','changed','reordered'].map(variant=>'p1-business-'+mode+'-'+variant)));
  for(const probe of probes){
    assert.equal(probe.oracle_sha256,digest);
    assert.equal(probe.source_sha256,createHash('sha256').update(probe.source).digest('hex'));
    assert.equal(probe.expected.length,6);assert.equal(probe.schema.length,4);
    assert.deepEqual(probe.expected[0],['1','alpha',probe.input_variant==='changed'?'2700':'1800','продажа']);
    assert.deepEqual(probe.expected[5],['6','delta','500','продажа']);
    assert.equal(probe.source.includes('OutputTable.AssignColumns'),probe.schema_mode==='code');
    assert.equal(probe.source.includes('1800'),false);
    assert.equal(probe.source.includes('2700'),false);
    assert.equal(javascriptDiscoveryOracle(javascriptDiscoveryProbe(probe.id),table(probe)).gate_passed,true);
  }
  assert.deepEqual(expected.ordered_rows.map(row=>row[2]),[1800,0,-750,400,0,500]);
  assert.equal(probes[0].source_sha256,probes[1].source_sha256);
  assert.equal(probes[3].source_sha256,probes[4].source_sha256);
});

test('changed/reordered fixture bytes, import column order and all 6x5 cells stay pinned',()=>{
  const manifest=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8'));
  for(const id of ['base','changed','reordered']){
    const variant=javascriptBusinessInputVariant(id);
    const bytes=readFileSync(new URL(variant.path,root));
    assert.equal(verifyJavascriptFixture(bytes,manifest,id).sha256,variant.sha256);
    const input={schema:variant.columns,row_count:6,sample_rows:6,sample_complete:true,
      sample:variant.rows.map(row=>row.map((value,i)=>({type:variant.columns[i].type,is_null:false,value,
        precision:variant.columns[i].type==='integer'?'exact_integer':'display_text'})))};
    assert.equal(verifyJavascriptTable(input,'input',id).verified,true);
    const request=javascriptInputRequest({prepared:{document_id:'doc',workflow_ref:{workflow_id:'flow'}},
      storage:'/jsteach/js-g2-11111111-1111-4111-8111-111111111111',artifact:{artifact_id:'a',bytes:variant.bytes,sha256:variant.sha256},
      uploadOperationId:'upload',totalMs:600000,inputVariant:id});
    assert.equal(request.parameters.settings.source.source_path.endsWith('/'+variant.name),true);
    assert.deepEqual(request.parameters.settings.columns.map(column=>column.name),variant.columns.map(column=>column.name));
    if(id==='reordered'){
      assert.deepEqual(variant.columns.map(column=>column.name),['DiscountPct','Customer','UnitPriceCents','RowID','Qty']);
      const wrong=structuredClone(input);wrong.schema=[...javascriptBusinessInputVariant('base').columns];
      assert.throws(()=>verifyJavascriptTable(wrong,'input',id));
    }
    if(id==='changed'){
      assert.equal(input.sample[0][2].value,'3');
      assert.throws(()=>verifyJavascriptTable(input,'input','base'));
    }
  }
  assert.throws(()=>javascriptBusinessInputVariant('unknown'));
});

test('P1 fixed oracle rejects every changed cell, order and schema while keeping total irrelevant',()=>{
  const probe=javascriptDiscoveryProbe('p1-business-code-base');
  const exact=table(probe);
  exact.sample[0][2].value='1700';exact.sample[5][2].value='600';
  assert.equal(javascriptDiscoveryOracle(probe,exact).gate_passed,false);
  const rowOrder=table(probe);[rowOrder.sample[0],rowOrder.sample[1]]=[rowOrder.sample[1],rowOrder.sample[0]];
  assert.equal(javascriptDiscoveryOracle(probe,rowOrder).gate_passed,false);
  const schema=table(probe);[schema.schema[1],schema.schema[3]]=[schema.schema[3],schema.schema[1]];
  assert.equal(javascriptDiscoveryOracle(probe,schema).gate_passed,false);
  const type=table(probe);type.schema[2].type='string';type.sample.forEach(row=>{row[2].type='string';row[2].precision='display_text';});
  assert.equal(javascriptDiscoveryOracle(probe,type).gate_passed,false);
  const partial=table(probe);partial.sample_complete=false;
  assert.throws(()=>javascriptDiscoveryOracle(probe,partial),/Complete bounded typed/);
});

test('P1 declared mode requires four ordered native output fields with exact types',()=>{
  const page_tid='owner;JavaScriptColumnsWizard';
  const fields=['RowID','CustomerKey','NetCents','Status'].map((Name,Index)=>({Name,DisplayName:Name,
    DataType:[4,5,4,5][Index],Index,Required:false,Broken:false}));
  const snapshot={verified:true,inventory_complete:true,page_tid,generation:{checked:false},
    grids:[{tid:page_tid+';grdTargetColumns;tbl',fields}]};
  assert.equal(javascriptDeclaredColumnsMatch(snapshot,'business-output'),true);
  snapshot.grids[0].fields[2].DataType=5;
  assert.equal(javascriptDeclaredColumnsMatch(snapshot,'business-output'),false);
});
