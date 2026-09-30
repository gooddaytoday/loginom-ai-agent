import test from 'node:test';
import assert from 'node:assert/strict';
import {javascriptExistingLifecycleBaseline} from '../lib/javascript-existing-lifecycle.mjs';
import {javascriptManagedSourceSettings} from '../lib/javascript-managed-source-adapter.mjs';
import {javascriptSourceSettingsDigest} from '../lib/javascript-source-admission.mjs';

const owner={document_id:'doc',workflow_id:'flow',node_id:'node',operation_id:'edit',ui_epoch:1};
function fixture(declared=false) {
  const schema={verified:true,inventory_complete:true,form:'JavaScriptColumnsWizard',page_tid:'page',
    node_context:{verified:true,surface:'wizard',document_id:'doc',workflow_id:'flow',node_id:'node'},
    generation:{checked:!declared},grids:[{tid:'page;grdSourceColumns;tbl',count:0,total:0,fields:[]},
      {tid:'page;grdTargetColumns;tbl',count:declared?1:0,total:declared?1:0,fields:declared?[
        {record_id:'actual',Index:0,Name:'RowID',DisplayName:'RowID',DataType:4,DataKind:1,
          UsageType:0,DefaultUsageType:4,Required:false,Broken:false}]:[]}]};
  const settings=javascriptManagedSourceSettings(schema);
  return {owner,snapshot:{owner:{...owner},schema,settings},parameters:{expected_source_sha256:'a'.repeat(64)},
    receipt:{phase:'admitted',kind:'existing',intent:'replace',owner:{...owner},
      previous_source:{source_sha256:'a'.repeat(64)},effective_source:{source_sha256:'b'.repeat(64)},
      settings_sha256:javascriptSourceSettingsDigest(settings)}};
}

test('existing baseline uses owned independent admission and complete native declared metadata',()=>{
  for(const declared of [false,true]) {
    const value=fixture(declared),baseline=javascriptExistingLifecycleBaseline(value);
    assert.equal(baseline.schema_mode,declared?'declared':'code');
    assert.equal(baseline.settings_sha256,value.receipt.settings_sha256);
    assert.equal(baseline.columns?.[0].default_usage_type,declared?4:undefined);
    assert.equal(baseline.columns?.[0].usage_type,declared?0:undefined);
    value.receipt.intent='preserve';value.parameters={};
    assert.equal(javascriptExistingLifecycleBaseline(value).schema_mode,baseline.schema_mode);
  }
});

test('existing baseline refuses owner/digest/mode/schema drift rather than authorizing editor mutation',()=>{
  for(const change of [v=>v.receipt.owner.node_id='foreign',v=>v.snapshot.owner.ui_epoch=2,
    v=>v.snapshot.schema.node_context.node_id='foreign',v=>v.snapshot.schema.node_context.surface='graph',
    v=>v.snapshot.schema.verified=false,v=>v.snapshot.settings.generation=true,
    v=>v.snapshot.schema.generation.checked=true,v=>v.receipt.settings_sha256='0'.repeat(64),
    v=>v.parameters.schema_mode='code',v=>v.parameters.columns=[],
    v=>v.parameters.expected_source_sha256='0'.repeat(64),v=>v.receipt.kind='new',
    v=>v.receipt.phase='configured',v=>v.receipt.intent='create',v=>v.receipt.effective_source.source_sha256='bad',
    v=>v.snapshot.schema.grids[1].fields[0].DefaultUsageType=0]) {
    const value=fixture(true);change(value);
    assert.throws(()=>javascriptExistingLifecycleBaseline(value));
  }
});
